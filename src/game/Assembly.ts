import * as THREE from 'three';
import RAPIER, { World, ImpulseJoint } from '@dimforge/rapier3d-compat';
import type { ToyPart } from '../world/ToyParts';

/** 들고 있는 파츠와 다른 파츠 표면 간격이 이 값 이하면 부착 후보 */
const SNAP_GAP = 0.32;

export interface Bond {
  a: ToyPart;
  b: ToyPart;
  joint: ImpulseJoint;
}

/**
 * ToTK 스타일 접착 조립 시스템.
 * - weld: 들고 있는 파츠를 대상 방향으로 셰이프캐스트해 표면까지 스냅한 뒤
 *   현재 상대 자세를 유지하는 고정 조인트로 용접
 * - detach: 파츠에 연결된 모든 본드 제거
 * - serialize: Phase 3에서 차를 재구성할 수 있도록 파츠/본드 그래프 저장
 */
export class Assembly {
  readonly bonds: Bond[] = [];

  constructor(private world: World) {}

  /** 본드 그래프에서 part와 연결된 파츠 집합 (자신 포함) */
  clusterOf(part: ToyPart): Set<ToyPart> {
    const cluster = new Set<ToyPart>([part]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const b of this.bonds) {
        if (cluster.has(b.a) !== cluster.has(b.b)) {
          cluster.add(b.a);
          cluster.add(b.b);
          grew = true;
        }
      }
    }
    return cluster;
  }

  isBonded(part: ToyPart): boolean {
    return this.bonds.some((b) => b.a === part || b.b === part);
  }

  /** 들고 있는 파츠 근처의 부착 후보 (같은 클러스터 제외) */
  findCandidate(held: ToyPart, parts: ToyPart[]): ToyPart | null {
    const cluster = this.clusterOf(held);
    const th = held.body.translation();
    let best: ToyPart | null = null;
    let bestGap = SNAP_GAP;
    for (const p of parts) {
      if (cluster.has(p)) continue;
      const tp = p.body.translation();
      const gap =
        Math.hypot(tp.x - th.x, tp.y - th.y, tp.z - th.z) - p.boundingRadius - held.boundingRadius;
      if (gap < bestGap) {
        bestGap = gap;
        best = p;
      }
    }
    return best;
  }

  /** held를 target 표면까지 스냅한 뒤 고정 조인트로 용접 */
  weld(held: ToyPart, target: ToyPart): void {
    const th = held.body.translation();
    const tt = target.body.translation();
    const dir = new THREE.Vector3(tt.x - th.x, tt.y - th.y, tt.z - th.z);
    const maxDist = dir.length();
    const anchor = new THREE.Vector3((th.x + tt.x) / 2, (th.y + tt.y) / 2, (th.z + tt.z) / 2);

    if (maxDist > 1e-3) {
      dir.normalize();
      const shape = held.body.collider(0).shape;
      const hit = this.world.castShape(
        th,
        held.body.rotation(),
        { x: dir.x, y: dir.y, z: dir.z },
        shape,
        0,
        maxDist,
        true,
        undefined,
        undefined,
        undefined,
        held.body,
        (collider) => collider.parent()?.handle === target.body.handle,
      );
      if (hit) {
        const h = hit as unknown as {
          toi?: number;
          timeOfImpact?: number;
          witness2?: { x: number; y: number; z: number };
        };
        const toi = h.timeOfImpact ?? h.toi ?? 0;
        const move = Math.max(0, toi - 0.02);
        held.body.setTranslation(
          { x: th.x + dir.x * move, y: th.y + dir.y * move, z: th.z + dir.z * move },
          true,
        );
        if (h.witness2) anchor.set(h.witness2.x, h.witness2.y, h.witness2.z);
      }
    }

    // 현재 상대 자세를 유지하는 고정 조인트
    const t1 = held.body.translation();
    const q1 = new THREE.Quaternion().copy(held.body.rotation() as THREE.Quaternion);
    const t2 = target.body.translation();
    const q2 = new THREE.Quaternion().copy(target.body.rotation() as THREE.Quaternion);
    const q1i = q1.clone().invert();
    const q2i = q2.clone().invert();
    const la1 = anchor.clone().sub(new THREE.Vector3(t1.x, t1.y, t1.z)).applyQuaternion(q1i);
    const la2 = anchor.clone().sub(new THREE.Vector3(t2.x, t2.y, t2.z)).applyQuaternion(q2i);

    const data = RAPIER.JointData.fixed(
      { x: la1.x, y: la1.y, z: la1.z },
      { x: q1i.x, y: q1i.y, z: q1i.z, w: q1i.w },
      { x: la2.x, y: la2.y, z: la2.z },
      { x: q2i.x, y: q2i.y, z: q2i.z, w: q2i.w },
    );
    const joint = this.world.createImpulseJoint(data, held.body, target.body, true);

    held.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    held.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.bonds.push({ a: held, b: target, joint });
  }

  /** 파츠에 연결된 모든 본드 제거. 반환: 제거 개수 */
  detach(part: ToyPart): number {
    const removed = this.bonds.filter((b) => b.a === part || b.b === part);
    for (const b of removed) {
      this.world.removeImpulseJoint(b.joint, true);
      this.bonds.splice(this.bonds.indexOf(b), 1);
    }
    part.body.wakeUp();
    return removed.length;
  }

  /** 조립 결과 통계 — 가장 큰 클러스터 크기와 장착된 모터 수 */
  stats(parts: ToyPart[]): { partsInCar: number; motorsUsed: number; wheelsOnMotors: number } {
    let partsInCar = 0;
    const visited = new Set<ToyPart>();
    for (const p of parts) {
      if (visited.has(p)) continue;
      const cluster = this.clusterOf(p);
      for (const c of cluster) visited.add(c);
      if (cluster.size >= 2 && cluster.size > partsInCar) partsInCar = cluster.size;
    }
    const motorsUsed = parts.filter((p) => p.info.isMotor && this.isBonded(p)).length;
    // 모터에 직접 붙은 비모터 파츠 수 (Phase 3에서 바퀴 후보)
    const wheelSet = new Set<ToyPart>();
    for (const b of this.bonds) {
      if (b.a.info.isMotor && !b.b.info.isMotor) wheelSet.add(b.b);
      if (b.b.info.isMotor && !b.a.info.isMotor) wheelSet.add(b.a);
    }
    return { partsInCar, motorsUsed, wheelsOnMotors: wheelSet.size };
  }

  /** Phase 3 재구성용 직렬화 (localStorage 저장) */
  serialize(parts: ToyPart[]): object {
    const ids = new Map<ToyPart, number>();
    parts.forEach((p, i) => ids.set(p, i));
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      parts: parts.map((p, i) => {
        const t = p.body.translation();
        const r = p.body.rotation();
        return {
          id: i,
          name: p.name,
          shape: p.info.shape,
          size: p.info.size,
          color: p.info.color,
          isMotor: p.info.isMotor,
          pos: [t.x, t.y, t.z],
          rot: [r.x, r.y, r.z, r.w],
        };
      }),
      bonds: this.bonds.map((b) => ({ a: ids.get(b.a), b: ids.get(b.b) })),
    };
  }
}
