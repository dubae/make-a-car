import * as THREE from 'three';
import {
  World,
  Ray,
  RigidBody,
  RigidBodyDesc,
  ColliderDesc,
  DynamicRayCastVehicleController,
} from '@dimforge/rapier3d-compat';
import type { Input } from '../core/Input';
import { Assembly } from './Assembly';
import type { ToyPart } from '../world/ToyParts';

/** 모든 모터 동일 출력 — 차 무게와 바퀴 크기가 성능을 가른다 */
const FORCE_PER_MOTOR = 55;
const MAX_SPEED = 26; // 이 속도에 가까울수록 엔진 출력이 줄어 자연스러운 최고 속도가 된다
const THROTTLE_RAMP = 2.4; // 초당 스로틀 증가량 (0→1에 약 0.4초)
const MAX_STEER = 0.48; // rad
const STEER_SPEED = 3.4; // rad/s
const SUSPENSION_REST = 0.5;
/** 조립 자세보다 아래로 서스펜션이 더 뻗을 수 있는 여유 — 접지 보장 핵심 */
const SUSPENSION_DROOP = 0.18;
/** 출발점(러그) 지면 높이 */
const GROUND_Y = 0.15;
const CAM_DIST = 14;

/** 출발 지점 (러그 중앙 — 어떤 크기의 차도 놓을 수 있는 공터) */
export const RACE_START = new THREE.Vector3(2, 0.3, 8);

/** 게이트 코스: 방을 한 바퀴 도는 루프 */
const GATE_POSITIONS: [number, number][] = [
  [0, -20], // 뒷벽 창문 아래
  [-30, 10], // 침대 옆
  [-6, 24], // 책장 앞
  [14, 16], // 차고 앞 (결승)
];

const UP = new THREE.Vector3(0, 1, 0);

/** 섀시/바퀴에 병합된 파츠의 메시를 되돌려 놓기 위한 상대 자세 */
interface VisualBinding {
  part: ToyPart;
  offsetPos: THREE.Vector3;
  offsetRot: THREE.Quaternion;
}

interface Wheel {
  /** 섀시 로컬 연결점 (서스펜션 상단) */
  connection: THREE.Vector3;
  /** 섀시 로컬 차축 방향 (전진 방향이 통일되도록 부호 정규화됨) */
  axle: THREE.Vector3;
  radius: number;
  steered: boolean;
  parts: VisualBinding[];
}

/**
 * Phase 3 레이싱 — Rapier 내장 DynamicRayCastVehicleController(Bullet raycast
 * vehicle 포팅) 기반의 안정적인 차량 물리.
 * - 조립 결합체의 비바퀴 파츠 콜라이더를 하나의 섀시 강체로 병합하고,
 *   모터에 붙은 바퀴 파츠들은 서스펜션 레이캐스트 바퀴로 변환한다.
 * - 바퀴 반지름·차 무게가 그대로 성능에 반영되고, 회전 조인트가 없어
 *   공중 부양/발작 회전이 원천적으로 없다.
 * - W/S 스로틀, A/D 조향(앞바퀴 스티어), 벽을 뚫지 않는 3인칭 궤도 카메라.
 */
export class RaceManager {
  readonly gates: { pos: THREE.Vector3; mesh: THREE.Mesh }[] = [];
  currentGate = 0;
  time = 0;
  finished = false;
  onFinish: () => void = () => {};

  motorsUsed = 0;
  wheelCount = 0;

  carParts: ToyPart[] = [];
  root: ToyPart | null = null;
  private chassis: RigidBody | null = null;
  private controller: DynamicRayCastVehicleController | null = null;
  private chassisVisuals: VisualBinding[] = [];
  private wheelInfos: Wheel[] = [];

  /** 스로틀/조향 스무딩 상태 */
  private throttleInput = 0;
  private drive = 0;
  private steer = 0;
  /** 출발 전 안정화 시간 — 차가 자리잡기 전 조작으로 튀는 것 방지 */
  private startDelay = 0.8;
  // 마우스 궤도 카메라 (차 회전과 독립)
  private camYaw = 0;
  private camPitch = 0.36;
  private camPos = new THREE.Vector3();
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

    // 2) 루트(차체 기준): 모터가 아닌 파츠 중 본드가 가장 많은 것 (동률이면 무거운 것).
    //    모터는 무거워서 질량 기준으로 뽑으면 차체가 모터가 되어버린다.
    const bondCount = (p: ToyPart) =>
      this.assembly.bonds.filter((b) => b.a === p || b.b === p).length;
    const nonMotor = this.carParts.filter((p) => !p.info.isMotor && bondCount(p) > 0);
    const pool = nonMotor.length > 0 ? nonMotor : this.carParts;
    this.root = pool.reduce((r, p) => {
      const bp = bondCount(p);
      const br = bondCount(r);
      if (bp !== br) return bp > br ? p : r;
      return p.body.mass() > r.body.mass() ? p : r;
    });

    // 3) 출발선으로 평행이동 — 메시 AABB로 정확한 바닥 높이를 재서
    //    낙하 없이 바퀴가 바로 지면(러그 카펫 위)에 닿게 놓는다
    for (const p of this.carParts) p.syncMesh();
    const bbox = new THREE.Box3();
    for (const p of this.carParts) bbox.union(new THREE.Box3().setFromObject(p.mesh));
    const offset = new THREE.Vector3(
      RACE_START.x - (bbox.min.x + bbox.max.x) / 2,
      GROUND_Y + 0.02 - bbox.min.y,
      RACE_START.z - (bbox.min.z + bbox.max.z) / 2,
    );
    for (const p of this.carParts) {
      const t = p.body.translation();
      p.body.setTranslation({ x: t.x + offset.x, y: t.y + offset.y, z: t.z + offset.z }, true);
      p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      p.syncMesh();
    }
    // 텔레포트 직후엔 콜라이더 월드 자세/쿼리가 스텝 전 상태로 낡아 있다 —
    // 아래에서 콜라이더 자세를 읽어 섀시에 병합하므로 반드시 먼저 전파
    this.world.propagateModifiedBodyPositionsToColliders();
    this.world.updateSceneQueries();

    // 4) 모터→바퀴 본드 분류 — 루트(차체) 쪽 성분을 제외한 가지가 바퀴가 된다
    const wheelGroups: { motor: ToyPart; wheelRoot: ToyPart; subtree: Set<ToyPart> }[] = [];
    for (const motor of this.carParts.filter((p) => p.info.isMotor)) {
      const mBonds = this.assembly.bonds.filter((b) => b.a === motor || b.b === motor);
      if (mBonds.length === 0) continue;
      this.motorsUsed++;
      const entries = [...mBonds].map((bond) => {
        const other = bond.a === motor ? bond.b : bond.a;
        return { other, comp: this.componentWithout(other, motor) };
      });
      // 차체 쪽 = 루트가 속한 성분. 모터 자신이 루트라면 가장 큰 성분을 차체로 본다.
      let chassisEntry: (typeof entries)[number] | null = null;
      if (motor === this.root) {
        chassisEntry = entries.reduce((a, b) => (b.comp.size > a.comp.size ? b : a));
      }
      for (const e of entries) {
        if (e === chassisEntry) continue;
        if (e.other === this.root || e.comp.has(this.root)) continue;
        wheelGroups.push({ motor, wheelRoot: e.other, subtree: e.comp });
      }
    }

    // 5) 섀시 강체 생성 — 바퀴를 제외한 모든 파츠의 콜라이더를 한 몸체로 병합
    //    (질량 분포는 파츠별 콜라이더 밀도가 그대로 유지된다)
    const wheelPartSet = new Set<ToyPart>();
    for (const g of wheelGroups) for (const p of g.subtree) wheelPartSet.add(p);
    const chassisParts = this.carParts.filter((p) => !wheelPartSet.has(p));

    const center = new THREE.Vector3(
      (bbox.min.x + bbox.max.x) / 2 + offset.x,
      (bbox.min.y + bbox.max.y) / 2 + offset.y,
      (bbox.min.z + bbox.max.z) / 2 + offset.z,
    );
    this.chassis = this.world.createRigidBody(
      RigidBodyDesc.dynamic()
        .setTranslation(center.x, center.y, center.z)
        .setLinearDamping(0.12)
        .setAngularDamping(1.6)
        .setCcdEnabled(true),
    );
    for (const p of chassisParts) {
      const t = p.body.translation();
      const q = new THREE.Quaternion().copy(p.body.rotation() as THREE.Quaternion);
      this.chassisVisuals.push({
        part: p,
        offsetPos: new THREE.Vector3(t.x, t.y, t.z).sub(center),
        offsetRot: q,
      });
      for (const h of p.colliderHandles) {
        const col = this.world.getCollider(h);
        if (!col) continue;
        const ct = col.translation();
        const cq = col.rotation();
        this.world.createCollider(
          new ColliderDesc(col.shape)
            .setTranslation(ct.x - center.x, ct.y - center.y, ct.z - center.z)
            .setRotation(cq)
            .setDensity(col.density())
            .setFriction(col.friction()),
          this.chassis,
        );
      }
    }

    // 6) 레이캐스트 바퀴 등록 — 원래 파츠 강체는 모두 비활성화하고
    //    이후 메시 동기화를 위해 비활성 강체의 자세만 따라 움직인다
    this.controller = this.world.createVehicleController(this.chassis);
    for (const g of wheelGroups) {
      // 바퀴 중심/반지름은 서브트리 실제 지오메트리(AABB)로 계산 —
      // 차가 기울어진 채 측정돼도 일관된 값이 나온다
      const wheelBox = new THREE.Box3();
      for (const p of g.subtree) wheelBox.union(new THREE.Box3().setFromObject(p.mesh));
      const wheelCenter = wheelBox.getCenter(new THREE.Vector3());
      const radius = Math.max(0.25, (wheelBox.max.y - wheelBox.min.y) / 2);

      // 차축 방향: 모터 로컬 +X → 월드. Bullet 관례상 전진 = up × axle 이므로
      // 전진(-Z)과 일치하도록 부호를 통일해 모든 바퀴가 같은 방향으로 민다.
      const mq = new THREE.Quaternion().copy(g.motor.body.rotation() as THREE.Quaternion);
      const axle = new THREE.Vector3(1, 0, 0).applyQuaternion(mq);
      axle.y = 0;
      if (axle.lengthSq() < 0.01) axle.set(1, 0, 0);
      else axle.normalize();
      const forward = new THREE.Vector3().crossVectors(UP, axle);
      if (forward.z > 0) axle.negate();

      // 서스펜션 길이가 (REST - DROOP)일 때 바퀴가 조립 높이에 오도록 연결점을 올린다
      // → 조립 자세보다 DROOP만큼 아래까지 뻗을 수 있어 접지가 보장된다
      const connection = wheelCenter.clone().sub(center);
      connection.y += SUSPENSION_REST - SUSPENSION_DROOP;

      const wheelParts: VisualBinding[] = [];
      for (const p of g.subtree) {
        const t = p.body.translation();
        wheelParts.push({
          part: p,
          offsetPos: new THREE.Vector3(t.x, t.y, t.z).sub(wheelCenter),
          offsetRot: new THREE.Quaternion().copy(p.body.rotation() as THREE.Quaternion),
        });
      }

      this.controller.addWheel(connection, { x: 0, y: -1, z: 0 }, axle, SUSPENSION_REST, radius);
      const i = this.controller.numWheels() - 1;
      // 감쇠는 임계감쇠(2√k≈10)의 45~60% — 출렁이며 접지를 잃지 않게
      this.controller.setWheelSuspensionStiffness(i, 26);
      this.controller.setWheelSuspensionCompression(i, 4.5);
      this.controller.setWheelSuspensionRelaxation(i, 6.0);
      this.controller.setWheelMaxSuspensionTravel(i, 0.7);
      this.controller.setWheelFrictionSlip(i, 2.4);
      this.controller.setWheelSideFrictionStiffness(i, 0.9);

      this.wheelInfos.push({ connection, axle, radius, steered: false, parts: wheelParts });
      this.wheelCount++;
    }
    // 조향 바퀴 = 전진 방향(-Z) 앞쪽 절반. 축이 하나뿐이면 전부 조향.
    if (this.wheelInfos.length > 0) {
      const meanZ = this.wheelInfos.reduce((s, w) => s + w.connection.z, 0) / this.wheelInfos.length;
      let any = false;
      for (const w of this.wheelInfos) {
        w.steered = w.connection.z < meanZ - 0.1;
        any = any || w.steered;
      }
      if (!any) for (const w of this.wheelInfos) w.steered = true;
    }

    // 원래 파츠 강체/콜라이더 비활성화 — 시뮬레이션에서 완전히 빠지고
    // 메시 동기화용 자세만 남는다 (콜라이더가 남으면 섀시가 자기 복제와 충돌한다)
    for (const p of this.carParts) {
      p.body.setEnabled(false);
      for (const h of p.colliderHandles) this.world.getCollider(h)?.setEnabled(false);
    }

    this.syncCarVisuals();
    const ct = this.chassis.translation();
    this.camPos.set(ct.x, ct.y + 6, ct.z + CAM_DIST);

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

  /** 종료 시 엔진 정지 + 브레이크 */
  stop(): void {
    this.throttleInput = 0;
    this.drive = 0;
    if (!this.controller) return;
    for (let i = 0; i < this.controller.numWheels(); i++) {
      this.controller.setWheelEngineForce(i, 0);
      this.controller.setWheelBrake(i, 1.2);
    }
  }

  /**
   * 물리 고정 스텝과 동기 — world.step() 직전에 호출해야 서스펜션이 안정된다.
   * 엔진 힘/브레이크/조향을 적용하고 차량 컨트롤러를 갱신한다.
   */
  physicsStep(dt: number): void {
    if (!this.controller || !this.chassis) return;
    const n = this.controller.numWheels();
    if (!this.finished) {
      const speed = this.controller.currentVehicleSpeed();
      // 속도가 붙을수록 출력 감소 → 최고 속도 수렴. 후진은 절반 출력.
      const cap = Math.max(0, 1 - Math.abs(speed) / MAX_SPEED);
      const total = this.drive * this.motorsUsed * FORCE_PER_MOTOR * cap;
      const perWheel = n > 0 ? total / n : 0;
      for (let i = 0; i < n; i++) {
        // 땅에 닿지 않은 바퀴는 추진 금지 (직전 스텝의 접지 판정 사용)
        const grounded = this.controller.wheelIsInContact(i);
        this.controller.setWheelEngineForce(i, grounded ? perWheel * (this.drive < 0 ? 0.55 : 1) : 0);
        this.controller.setWheelBrake(i, this.throttleInput === 0 ? 0.5 : 0);
        if (this.wheelInfos[i].steered) this.controller.setWheelSteering(i, this.steer);
      }
    }
    // 서스펜션 레이가 섀시 자신을 지면으로 오인하지 않게 제외
    this.controller.updateVehicle(
      dt,
      undefined,
      undefined,
      (c) => c.parent()?.handle !== this.chassis!.handle,
    );
  }

  update(dt: number, input: Input, camera: THREE.PerspectiveCamera): void {
    if (!this.chassis) return;
    this.elapsed += dt;
    if (this.startDelay > 0) this.startDelay -= dt;
    else this.time += dt;

    // --- 주행 입력 (출발 딜레이 동안은 무시) ---
    const ready = this.startDelay <= 0 && !this.finished;
    this.throttleInput = !ready
      ? 0
      : input.isDown('KeyW') || input.isDown('ArrowUp')
        ? 1
        : input.isDown('KeyS') || input.isDown('ArrowDown')
          ? -1
          : 0;
    const steerInput =
      (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0) -
      (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0);

    // 스로틀/조향 스무딩 — 급격한 힘 변화로 차체가 튀는 것 방지
    const dTarget = this.throttleInput - this.drive;
    const maxD = THROTTLE_RAMP * dt * (Math.abs(this.throttleInput) < Math.abs(this.drive) ? 2.4 : 1);
    this.drive += THREE.MathUtils.clamp(dTarget, -maxD, maxD);
    const steerTarget = (ready ? steerInput : 0) * MAX_STEER;
    this.steer += THREE.MathUtils.clamp(steerTarget - this.steer, -STEER_SPEED * dt, STEER_SPEED * dt);

    this.syncCarVisuals();

    // --- 게이트 통과 판정 + 하이라이트 ---
    const t = this.chassis.translation();
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

    this.updateCamera(dt, input, camera);
  }

  /** 섀시/바퀴 자세를 원래 파츠들의 (비활성) 강체에 되돌려 메시 동기화가 그대로 동작하게 한다 */
  private syncCarVisuals(): void {
    if (!this.chassis || !this.controller) return;
    const ct = this.chassis.translation();
    const cq = new THREE.Quaternion().copy(this.chassis.rotation() as THREE.Quaternion);
    const cPos = new THREE.Vector3(ct.x, ct.y, ct.z);

    for (const v of this.chassisVisuals) {
      const pos = v.offsetPos.clone().applyQuaternion(cq).add(cPos);
      const rot = cq.clone().multiply(v.offsetRot);
      v.part.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, false);
      v.part.body.setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w }, false);
    }

    this.wheelInfos.forEach((w, i) => {
      // 시각적 서스펜션은 조립 자세 근처로 클램프 — 풀 드룹 시 바퀴가
      // 축에서 떨어져 보이는 것 방지 (물리에는 영향 없음)
      const sus = Math.min(
        this.controller!.wheelSuspensionLength(i) ?? SUSPENSION_REST,
        SUSPENSION_REST - SUSPENSION_DROOP + 0.1,
      );
      const steer = this.controller!.wheelSteering(i) ?? 0;
      const spin = this.controller!.wheelRotation(i) ?? 0;
      // 조향(수직축) 후 스핀(조향된 차축) — 섀시 로컬 프레임에서 합성
      const localRot = new THREE.Quaternion()
        .setFromAxisAngle(UP, steer)
        .multiply(new THREE.Quaternion().setFromAxisAngle(w.axle, -spin));
      const wheelQuat = cq.clone().multiply(localRot);
      const centerLocal = w.connection.clone().add(new THREE.Vector3(0, -sus, 0));
      const wheelPos = centerLocal.applyQuaternion(cq).add(cPos);
      for (const v of w.parts) {
        const pos = v.offsetPos.clone().applyQuaternion(wheelQuat).add(wheelPos);
        const rot = wheelQuat.clone().multiply(v.offsetRot);
        v.part.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, false);
        v.part.body.setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w }, false);
      }
    });
  }

  /** 3인칭 궤도 카메라 — 차 회전과 독립. 정적 지형 레이캐스트로 벽 뒤로 나가지 않는다 */
  private updateCamera(dt: number, input: Input, camera: THREE.PerspectiveCamera): void {
    const t = this.chassis!.translation();
    const { dx, dy } = input.mouseDelta;
    this.camYaw -= dx * 0.0022;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * 0.0022, 0.12, 1.25);

    const lookTarget = new THREE.Vector3(t.x, t.y + 1.6, t.z);
    const cosP = Math.cos(this.camPitch);
    const dir = new THREE.Vector3(
      Math.sin(this.camYaw) * cosP,
      Math.sin(this.camPitch),
      Math.cos(this.camYaw) * cosP,
    );
    const dist = Math.min(CAM_DIST, this.cameraClearance(lookTarget, dir, CAM_DIST));
    const desired = lookTarget.clone().addScaledVector(dir, dist);
    this.camPos.lerp(desired, 1 - Math.exp(-9 * dt));

    // 보간 중에도 벽을 넘지 않도록 최종 위치 재클램프
    const toCam = this.camPos.clone().sub(lookTarget);
    const len = toCam.length();
    if (len > 1e-3) {
      const clearance = this.cameraClearance(lookTarget, toCam.clone().divideScalar(len), len);
      if (clearance < len) this.camPos.copy(lookTarget).addScaledVector(toCam.divideScalar(len), clearance);
    }
    camera.position.copy(this.camPos);
    camera.lookAt(lookTarget);
  }

  /** lookTarget에서 dir 방향으로 정적 지형까지의 여유 거리 (최소 2.2 유지) */
  private cameraClearance(from: THREE.Vector3, dir: THREE.Vector3, maxDist: number): number {
    const ray = new Ray({ x: from.x, y: from.y, z: from.z }, { x: dir.x, y: dir.y, z: dir.z });
    const hit = this.world.castRay(
      ray,
      maxDist + 0.6,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      (collider) => {
        const parent = collider.parent();
        return !parent || parent.isFixed();
      },
    );
    return hit ? Math.max(2.2, hit.timeOfImpact - 0.55) : maxDist;
  }
}
