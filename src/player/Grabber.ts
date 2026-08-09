import * as THREE from 'three';
import { World, Ray, RigidBody } from '@dimforge/rapier3d-compat';
import type { Input } from '../core/Input';
import type { ToyPart } from '../world/ToyParts';
import type { Assembly } from '../game/Assembly';

const GRAB_DISTANCE = 5.5; // 이 거리 안의 파츠만 잡을 수 있음
const HOLD_STIFFNESS = 14; // 잡은 물체가 목표 지점을 따라오는 속도 계수
const HOLD_MAX_SPEED = 24;
const BREAK_DISTANCE = 8.5; // 벽에 끼는 등 너무 멀어지면 자동으로 놓침
const THROW_SPEED = 13;

/**
 * 시선 끝의 파츠를 잡아서 들고 다니는 시스템 (하프라이프 그래비티건 방식).
 * 잡은 동안 중력을 끄고 목표 지점으로 속도를 걸어준다 — 벽을 뚫지 않는다.
 */
export class Grabber {
  private hovered: ToyPart | null = null;
  private held: ToyPart | null = null;
  private holdDistance = 2.5;

  // Phase 2 조립 모드
  private assembly: Assembly | null = null;
  private partsProvider: (() => ToyPart[]) | null = null;
  private candidate: ToyPart | null = null;
  /** 조립 모드에서 들고 있는 파츠의 목표 회전 (90° 그리드) */
  private holdRotation: THREE.Quaternion | null = null;

  constructor(
    private world: World,
    private camera: THREE.PerspectiveCamera,
    private playerBody: RigidBody,
    private partsByCollider: Map<number, ToyPart>,
  ) {}

  get heldPart(): ToyPart | null {
    return this.held;
  }

  get hoveredPart(): ToyPart | null {
    return this.hovered;
  }

  /** 현재 부착 후보 (조립 모드에서 파츠를 들고 다른 파츠에 가까이 댔을 때) */
  get attachCandidate(): ToyPart | null {
    return this.candidate;
  }

  /** Phase 2 진입 시 조립 모드 활성화 */
  enableAssembly(assembly: Assembly, partsProvider: () => ToyPart[]): void {
    this.assembly = assembly;
    this.partsProvider = partsProvider;
  }

  update(dt: number, input: Input): void {
    this.updateHover();

    const grabPressed = input.clicked(0) || input.justPressed('KeyE');
    const rmb = input.clicked(2);
    // 조립 모드에서 우클릭은 부착, 던지기는 Q. 파밍 모드에서는 우클릭=던지기 유지
    const attachPressed = this.assembly ? rmb : false;
    const throwPressed = input.justPressed('KeyQ') || (!this.assembly && rmb);

    if (this.held) {
      this.updateCandidate();
      if (this.assembly) this.handleRotationKeys(input);
      if (throwPressed) {
        this.clearCandidate();
        this.throwHeld();
      } else if (attachPressed && this.candidate) {
        this.weldHeld();
      } else if (grabPressed) {
        this.release();
      } else {
        // 들고 있는 파츠도 R로 분해 (클러스터에서 떼어내 단독으로 든다)
        if (this.assembly && input.justPressed('KeyR') && this.assembly.isBonded(this.held)) {
          this.setClusterGhost(this.held, false); // 떨어져 나갈 결합체의 고스트 상태 복원
          this.assembly.detach(this.held);
          this.setClusterGhost(this.held, true); // 이제 단독이 된 파츠만 다시 고스트
          this.holdRotation = snapQuaternionTo90(
            new THREE.Quaternion().copy(this.held.body.rotation() as THREE.Quaternion),
          );
        }
        this.moveHeld(dt);
      }
    } else if (grabPressed && this.hovered) {
      this.grab(this.hovered);
    } else if (
      this.assembly &&
      input.justPressed('KeyR') &&
      this.hovered &&
      this.assembly.isBonded(this.hovered)
    ) {
      this.assembly.detach(this.hovered);
    }
  }

  private updateCandidate(): void {
    if (!this.assembly || !this.partsProvider || !this.held) return;
    const next = this.assembly.findCandidate(this.held, this.partsProvider());
    if (next === this.candidate) return;
    if (this.candidate) this.candidate.setHighlight('none');
    this.candidate = next;
    if (this.candidate) this.candidate.setHighlight('target');
  }

  private clearCandidate(): void {
    if (this.candidate) this.candidate.setHighlight('none');
    this.candidate = null;
  }

  /** 들고 있는 파츠를 부착 후보에 용접 */
  private weldHeld(): void {
    const part = this.held!;
    const target = this.candidate!;
    this.clearCandidate();
    this.held = null;
    this.holdRotation = null;
    part.setHighlight('none');
    this.setClusterGhost(part, false);
    part.body.setGravityScale(1, true);
    this.assembly!.weld(part, target);
  }

  private cameraForward(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
  }

  private updateHover(): void {
    const prev = this.hovered;
    this.hovered = null;

    if (!this.held) {
      const dir = this.cameraForward();
      const origin = this.camera.position;
      const ray = new Ray(
        { x: origin.x, y: origin.y, z: origin.z },
        { x: dir.x, y: dir.y, z: dir.z },
      );
      const hit = this.world.castRay(ray, GRAB_DISTANCE, true, undefined, undefined, undefined, this.playerBody);
      if (hit) {
        this.hovered = this.partsByCollider.get(hit.collider.handle) ?? null;
      }
    }

    if (prev && prev !== this.hovered && prev !== this.held) prev.setHighlight('none');
    if (this.hovered && this.hovered !== prev) this.hovered.setHighlight('hover');
  }

  /**
   * 조립 모드에서 들고 있는 파츠(및 그 결합체)를 "고스트"로 전환:
   * 센서 콜라이더가 되어 다른 물체를 밀거나 부딪히지 않는다.
   */
  private setClusterGhost(part: ToyPart, ghost: boolean): void {
    if (!this.assembly) return;
    const members = this.assembly.clusterOf(part);
    for (const p of members) {
      for (const h of p.colliderHandles) {
        this.world.getCollider(h)?.setSensor(ghost);
      }
      p.body.setGravityScale(ghost ? 0 : 1, true);
      p.body.wakeUp();
    }
  }

  private grab(part: ToyPart): void {
    this.held = part;
    this.hovered = null;
    part.setHighlight('held');
    part.body.setGravityScale(0, true);
    part.body.wakeUp();
    this.setClusterGhost(part, true);
    // 큰 파츠는 좀 더 멀리 들어서 시야를 가리지 않게
    this.holdDistance = Math.min(2.1 + part.boundingRadius, 4);
    // 조립 모드: 잡는 순간 가장 가까운 90° 정렬로 스냅 → 반듯하게 붙이기 쉬움
    // (이미 용접된 파츠는 클러스터째 끌기만 하므로 회전 구동 없음)
    this.holdRotation =
      this.assembly && !this.assembly.isBonded(part)
        ? snapQuaternionTo90(new THREE.Quaternion().copy(part.body.rotation() as THREE.Quaternion))
        : null;
  }

  /** 바라보는 시점 기준 90° 회전: Z=가로 스핀, X=앞뒤로 눕히기, C=시계방향 굴리기 */
  private handleRotationKeys(input: Input): void {
    if (!this.held) return;
    let camAxis: THREE.Vector3 | null = null;
    if (input.justPressed('KeyZ')) camAxis = new THREE.Vector3(0, 1, 0);
    else if (input.justPressed('KeyX')) camAxis = new THREE.Vector3(1, 0, 0);
    else if (input.justPressed('KeyC')) camAxis = new THREE.Vector3(0, 0, -1);
    if (!camAxis) return;
    // 카메라 축을 가장 가까운 월드축으로 스냅해 예측 가능한 회전을 만든다
    const axis = dominantAxis(camAxis.applyQuaternion(this.camera.quaternion));
    if (this.holdRotation) {
      this.holdRotation.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, Math.PI / 2));
    } else if (this.assembly && this.assembly.isBonded(this.held)) {
      // 결합체는 든 파츠를 피벗으로 통째로 90° 회전 (고스트 상태라 안전)
      this.rotateClusterAround(this.held, axis);
    }
  }

  /** 결합체 전체를 pivotPart 위치 기준으로 90° 회전 — 상대 자세가 유지되어 조인트도 그대로 */
  private rotateClusterAround(pivotPart: ToyPart, axis: THREE.Vector3): void {
    const q = new THREE.Quaternion().setFromAxisAngle(axis, Math.PI / 2);
    const pv = pivotPart.body.translation();
    const pivot = new THREE.Vector3(pv.x, pv.y, pv.z);
    for (const p of this.assembly!.clusterOf(pivotPart)) {
      const t = p.body.translation();
      const pos = new THREE.Vector3(t.x, t.y, t.z).sub(pivot).applyQuaternion(q).add(pivot);
      const rot = new THREE.Quaternion().copy(p.body.rotation() as THREE.Quaternion).premultiply(q);
      p.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
      p.body.setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w }, true);
      p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  private moveHeld(_dt: number): void {
    const part = this.held!;
    const target = this.camera.position
      .clone()
      .add(this.cameraForward().multiplyScalar(this.holdDistance));

    const pos = part.body.translation();
    const delta = new THREE.Vector3(target.x - pos.x, target.y - pos.y, target.z - pos.z);

    // 벽 반대편 등으로 너무 멀어지면 놓친다
    if (delta.length() > BREAK_DISTANCE) {
      this.release();
      return;
    }

    // 용접된 클러스터를 들었을 때: 한 몸체에만 속도를 강제하면 조인트가 요동치며
    // 발작하듯 회전/튕김이 발생한다 → 클러스터 전체에 같은 속도를 걸어 강체처럼 이동
    const cluster =
      this.assembly && this.assembly.isBonded(part) ? this.assembly.clusterOf(part) : null;
    if (cluster) {
      const vel = delta.multiplyScalar(7);
      if (vel.length() > 9) vel.setLength(9);
      for (const p of cluster) {
        p.body.setLinvel({ x: vel.x, y: vel.y, z: vel.z }, true);
        const av = p.body.angvel();
        p.body.setAngvel({ x: av.x * 0.7, y: av.y * 0.7, z: av.z * 0.7 }, true);
      }
      return;
    }

    const vel = delta.multiplyScalar(HOLD_STIFFNESS);
    if (vel.length() > HOLD_MAX_SPEED) vel.setLength(HOLD_MAX_SPEED);
    part.body.setLinvel({ x: vel.x, y: vel.y, z: vel.z }, true);

    if (this.holdRotation) {
      // 목표 회전(90° 그리드)을 향해 각속도를 걸어준다
      const qCur = new THREE.Quaternion().copy(part.body.rotation() as THREE.Quaternion);
      const qErr = this.holdRotation.clone().multiply(qCur.invert());
      if (qErr.w < 0) {
        qErr.set(-qErr.x, -qErr.y, -qErr.z, -qErr.w);
      }
      const s = Math.sqrt(Math.max(0, 1 - qErr.w * qErr.w));
      const angle = 2 * Math.acos(Math.min(1, qErr.w));
      if (s > 1e-4 && angle > 0.01) {
        const speed = Math.min(angle * 9, 13);
        part.body.setAngvel(
          { x: (qErr.x / s) * speed, y: (qErr.y / s) * speed, z: (qErr.z / s) * speed },
          true,
        );
      } else {
        part.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    } else {
      // 회전은 서서히 감쇠
      const av = part.body.angvel();
      part.body.setAngvel({ x: av.x * 0.9, y: av.y * 0.9, z: av.z * 0.9 }, true);
    }
  }

  private release(): void {
    const part = this.held;
    if (!part) return;
    this.clearCandidate();
    this.held = null;
    this.holdRotation = null;
    part.setHighlight('none');
    this.setClusterGhost(part, false);
    part.body.setGravityScale(1, true);
    // 들고 있던 관성이 너무 크지 않게 절반으로
    const v = part.body.linvel();
    part.body.setLinvel({ x: v.x * 0.5, y: v.y * 0.5, z: v.z * 0.5 }, true);
  }

  private throwHeld(): void {
    const part = this.held;
    if (!part) return;
    this.held = null;
    this.holdRotation = null;
    part.setHighlight('none');
    this.setClusterGhost(part, false);
    part.body.setGravityScale(1, true);
    const dir = this.cameraForward();
    part.body.setLinvel(
      { x: dir.x * THROW_SPEED, y: dir.y * THROW_SPEED + 2.5, z: dir.z * THROW_SPEED },
      true,
    );
  }

  /** 페이즈 종료 시 들고 있던 것 내려놓기 */
  forceRelease(): void {
    this.release();
  }
}

/** 벡터를 가장 가까운 월드축(±X/±Y/±Z) 단위벡터로 스냅 */
function dominantAxis(v: THREE.Vector3): THREE.Vector3 {
  const ax = Math.abs(v.x);
  const ay = Math.abs(v.y);
  const az = Math.abs(v.z);
  if (ax >= ay && ax >= az) return new THREE.Vector3(Math.sign(v.x) || 1, 0, 0);
  if (ay >= az) return new THREE.Vector3(0, Math.sign(v.y) || 1, 0);
  return new THREE.Vector3(0, 0, Math.sign(v.z) || 1);
}

/** 회전을 가장 가까운 90° 그리드 방향으로 스냅 */
function snapQuaternionTo90(q: THREE.Quaternion): THREE.Quaternion {
  const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
  const bx = new THREE.Vector3();
  const by = new THREE.Vector3();
  const bz = new THREE.Vector3();
  m.extractBasis(bx, by, bz);
  const sx = dominantAxis(bx);
  let sy = dominantAxis(by);
  if (Math.abs(sx.dot(sy)) > 0.5) {
    // 두 축이 같은 월드축으로 스냅되면 y는 남은 축 중 원래 방향과 가장 가까운 것
    const candidates = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
    ].filter((c) => Math.abs(c.dot(sx)) < 0.5);
    sy = candidates.reduce((best, c) => (c.dot(by) > best.dot(by) ? c : best));
  }
  const sz = new THREE.Vector3().crossVectors(sx, sy);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(sx, sy, sz));
}
