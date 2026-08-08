import * as THREE from 'three';
import RAPIER, { World, RigidBodyDesc, RevoluteImpulseJoint } from '@dimforge/rapier3d-compat';
import type { Input } from '../core/Input';
import { Assembly, createFixedJoint } from './Assembly';
import type { ToyPart } from '../world/ToyParts';

/** 모든 모터 동일 출력 — 파츠 무게·바퀴 모양이 성능을 가른다 */
const WHEEL_SPEED = 38; // rad/s
const WHEEL_TORQUE_FACTOR = 800;
const STEER_TORQUE = 26; // 차체 질량 비례 조향 토크 계수

/** 출발 지점 (러그 중앙 — 어떤 크기의 차도 놓을 수 있는 공터) */
export const RACE_START = new THREE.Vector3(2, 0.3, 8);

/** 게이트 코스: 방을 한 바퀴 도는 루프 */
const GATE_POSITIONS: [number, number][] = [
  [0, -20], // 뒷벽 창문 아래
  [-30, 10], // 침대 옆
  [-6, 24], // 책장 앞
  [14, 16], // 차고 앞 (결승)
];

interface WheelDrive {
  joint: RevoluteImpulseJoint;
  sign: number;
}

/**
 * Phase 3 레이싱.
 * - 조립 그래프에서 모터→바퀴 본드를 "허브" 강체 + 회전 조인트로 변환해
 *   모터 축(로컬 +X) 기준으로 바퀴가 실제로 굴러가게 한다.
 * - W/S 스로틀(바퀴 구동), A/D 조향(차체 요 토크), 3인칭 추적 카메라.
 * - 게이트를 순서대로 통과하면 완주.
 */
export class RaceManager {
  readonly gates: { pos: THREE.Vector3; mesh: THREE.Mesh }[] = [];
  currentGate = 0;
  time = 0;
  finished = false;
  onFinish: () => void = () => {};

  motorsUsed = 0;
  wheelCount = 0;

  private carParts: ToyPart[] = [];
  private root: ToyPart | null = null;
  private wheels: WheelDrive[] = [];
  private q0 = new THREE.Quaternion();
  private lastForward = new THREE.Vector3(0, 0, -1);
  private camPos = new THREE.Vector3();
  private totalMass = 1;
  private elapsed = 0;

  constructor(
    private scene: THREE.Scene,
    private world: World,
    private assembly: Assembly,
    private parts: ToyPart[],
  ) {}

  /** 조립 그래프에서 차를 구성해 출발선으로 옮긴다 */
  buildCar(): void {
    // 1) 메인 클러스터: 모터를 포함한 가장 큰 결합체 (없으면 그냥 가장 큰 것)
    const visited = new Set<ToyPart>();
    let best: ToyPart[] = [];
    for (const p of this.parts) {
      if (visited.has(p)) continue;
      const cluster = [...this.assembly.clusterOf(p)];
      for (const c of cluster) visited.add(c);
      const hasMotor = cluster.some((c) => c.info.isMotor);
      const bestHasMotor = best.some((c) => c.info.isMotor);
      if (
        best.length === 0 ||
        (hasMotor && !bestHasMotor) ||
        (hasMotor === bestHasMotor && cluster.length > best.length)
      ) {
        best = cluster;
      }
    }
    this.carParts = best;
    if (this.carParts.length === 0) return;

    // 2) 루트(차체 기준): 본드가 가장 많은 파츠, 동률이면 무거운 것
    const bondCount = (p: ToyPart) =>
      this.assembly.bonds.filter((b) => b.a === p || b.b === p).length;
    this.root = this.carParts.reduce((r, p) => {
      const bp = bondCount(p);
      const br = bondCount(r);
      if (bp !== br) return bp > br ? p : r;
      return p.body.mass() > r.body.mass() ? p : r;
    });

    // 3) 출발선으로 평행이동 (클러스터 바닥이 살짝 뜨게)
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const p of this.carParts) {
      const t = p.body.translation();
      min.min(new THREE.Vector3(t.x - p.boundingRadius, t.y - p.boundingRadius, t.z - p.boundingRadius));
      max.max(new THREE.Vector3(t.x + p.boundingRadius, t.y + p.boundingRadius, t.z + p.boundingRadius));
    }
    const offset = new THREE.Vector3(
      RACE_START.x - (min.x + max.x) / 2,
      RACE_START.y - min.y + 0.2,
      RACE_START.z - (min.z + max.z) / 2,
    );
    for (const p of this.carParts) {
      const t = p.body.translation();
      p.body.setTranslation({ x: t.x + offset.x, y: t.y + offset.y, z: t.z + offset.z }, true);
      p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }

    // 4) 모터→바퀴 본드를 허브 + 회전 조인트로 변환
    for (const motor of this.carParts.filter((p) => p.info.isMotor)) {
      const mBonds = this.assembly.bonds.filter((b) => b.a === motor || b.b === motor);
      if (mBonds.length === 0) continue;
      this.motorsUsed++;
      // 모터를 제외했을 때 루트가 속한 성분이 차체 쪽 — 나머지 본드가 바퀴
      for (const bond of [...mBonds]) {
        const other = bond.a === motor ? bond.b : bond.a;
        if (other === this.root) continue;
        const comp = this.componentWithout(other, motor);
        if (comp.has(this.root)) continue;
        this.convertToWheel(motor, other, comp);
      }
    }

    this.q0.copy(this.root.body.rotation() as THREE.Quaternion);
    const t = this.root.body.translation();
    this.camPos.set(t.x, t.y + 6, t.z + 14);
    this.totalMass = this.carParts.reduce((s, p) => s + p.body.mass(), 0);

    this.buildGates();
  }

  /** excluded를 제외한 본드 그래프에서 start와 연결된 성분 */
  private componentWithout(start: ToyPart, excluded: ToyPart): Set<ToyPart> {
    const comp = new Set<ToyPart>([start]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const b of this.assembly.bonds) {
        if (b.a === excluded || b.b === excluded) continue;
        if (comp.has(b.a) !== comp.has(b.b)) {
          comp.add(b.a);
          comp.add(b.b);
          grew = true;
        }
      }
    }
    return comp;
  }

  /** motor↔wheelRoot 고정 본드를 회전 조인트로 교체 (wheelRoot 하위 트리는 함께 돈다) */
  private convertToWheel(motor: ToyPart, wheelRoot: ToyPart, subtree: Set<ToyPart>): void {
    this.assembly.removeBondBetween(motor, wheelRoot);

    const mq = new THREE.Quaternion().copy(motor.body.rotation() as THREE.Quaternion);
    const mt = motor.body.translation();
    const axisWorld = new THREE.Vector3(1, 0, 0).applyQuaternion(mq);

    // 바퀴 트리를 축 방향으로 살짝 밀어 회전 시 접촉 마찰이 없게 틈을 만든다
    for (const p of subtree) {
      const t = p.body.translation();
      p.body.setTranslation(
        { x: t.x + axisWorld.x * 0.08, y: t.y + axisWorld.y * 0.08, z: t.z + axisWorld.z * 0.08 },
        true,
      );
    }

    // 허브: 축 지점에 모터와 같은 회전으로 생성 → 두 로컬 프레임이 일치하므로
    // 회전 조인트 축 (1,0,0)을 양쪽에서 그대로 공유할 수 있다
    const hubWorld = new THREE.Vector3(1.28, 0, 0)
      .applyQuaternion(mq)
      .add(new THREE.Vector3(mt.x, mt.y, mt.z));
    const hub = this.world.createRigidBody(
      RigidBodyDesc.dynamic()
        .setTranslation(hubWorld.x, hubWorld.y, hubWorld.z)
        .setRotation({ x: mq.x, y: mq.y, z: mq.z, w: mq.w })
        .setAdditionalMass(0.08)
        .setAngularDamping(0.05),
    );

    const revData = RAPIER.JointData.revolute(
      { x: 1.28, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    );
    const rev = this.world.createImpulseJoint(revData, motor.body, hub, true) as RevoluteImpulseJoint;
    rev.setContactsEnabled(false);

    // 허브 ↔ 바퀴 루트: 현재 상대 자세 유지 고정 조인트
    createFixedJoint(this.world, hub, wheelRoot.body, hubWorld);

    // 구동 부호: 바퀴 회전이 차를 전방(-Z)으로 밀도록
    // (rapier 모터의 상대 각속도 부호는 body1 기준이라 이론 유도와 반대 — 음수 적용)
    const driveDir = new THREE.Vector3().crossVectors(axisWorld, new THREE.Vector3(0, 1, 0));
    const d = driveDir.dot(new THREE.Vector3(0, 0, -1));
    const sign = Math.abs(d) < 0.2 ? 1 : -Math.sign(d);

    this.wheels.push({ joint: rev, sign });
    this.wheelCount++;
  }

  private buildGates(): void {
    const routePoints = [new THREE.Vector2(RACE_START.x, RACE_START.z), ...GATE_POSITIONS.map(([x, z]) => new THREE.Vector2(x, z))];
    GATE_POSITIONS.forEach(([x, z], i) => {
      const prev = routePoints[i];
      const facing = Math.atan2(x - prev.x, z - prev.y);
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(4, 0.38, 12, 36),
        new THREE.MeshStandardMaterial({ color: 0x9a9aa2, roughness: 0.5, emissive: 0x000000 }),
      );
      mesh.position.set(x, 4, z);
      mesh.rotation.y = facing;
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.gates.push({ pos: new THREE.Vector3(x, 4, z), mesh });
    });
  }

  /** 종료 시 모터 정지 */
  stop(): void {
    for (const w of this.wheels) w.joint.configureMotorVelocity(0, WHEEL_TORQUE_FACTOR);
  }

  update(dt: number, input: Input, camera: THREE.PerspectiveCamera): void {
    if (!this.root) return;
    this.time += dt;
    this.elapsed += dt;

    // --- 주행 입력 ---
    const throttle =
      input.isDown('KeyW') || input.isDown('ArrowUp')
        ? 1
        : input.isDown('KeyS') || input.isDown('ArrowDown')
          ? -1
          : 0;
    const steer =
      (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0) -
      (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0);

    for (const w of this.wheels) {
      w.joint.configureMotorVelocity(throttle * WHEEL_SPEED * w.sign, WHEEL_TORQUE_FACTOR);
    }
    if (steer !== 0) {
      this.root.body.applyTorqueImpulse(
        { x: 0, y: steer * this.totalMass * STEER_TORQUE * dt, z: 0 },
        true,
      );
    }
    // 조향하지 않을 때 요 관성 감쇠
    const av = this.root.body.angvel();
    this.root.body.setAngvel({ x: av.x, y: av.y * 0.97, z: av.z }, true);

    // --- 게이트 통과 판정 + 하이라이트 ---
    const t = this.root.body.translation();
    if (!this.finished && this.currentGate < this.gates.length) {
      const g = this.gates[this.currentGate];
      const mat = g.mesh.material as THREE.MeshStandardMaterial;
      mat.color.setHex(0xf7d13e);
      mat.emissive.setHex(0x806600);
      mat.emissiveIntensity = 0.7 + Math.sin(this.elapsed * 5) * 0.4;
      if (Math.hypot(t.x - g.pos.x, t.z - g.pos.z) < 4.6) {
        mat.color.setHex(0x3fc95c);
        mat.emissive.setHex(0x0a4a0a);
        mat.emissiveIntensity = 0.8;
        this.currentGate++;
        if (this.currentGate >= this.gates.length) {
          this.finished = true;
          this.stop();
          this.onFinish();
        }
      }
    }

    // --- 3인칭 추적 카메라 ---
    const qNow = new THREE.Quaternion().copy(this.root.body.rotation() as THREE.Quaternion);
    const delta = qNow.clone().multiply(this.q0.clone().invert());
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(delta);
    fwd.y = 0;
    if (fwd.lengthSq() > 0.01) {
      fwd.normalize();
      this.lastForward.copy(fwd);
    }
    const carPos = new THREE.Vector3(t.x, t.y, t.z);
    const desired = carPos
      .clone()
      .addScaledVector(this.lastForward, -13)
      .add(new THREE.Vector3(0, 6, 0));
    this.camPos.lerp(desired, 1 - Math.exp(-5 * dt));
    camera.position.copy(this.camPos);
    camera.lookAt(carPos.x, carPos.y + 1.5, carPos.z);
  }
}
