import * as THREE from 'three';
import {
  World,
  RigidBody,
  RigidBodyDesc,
  Collider,
  ColliderDesc,
  KinematicCharacterController,
} from '@dimforge/rapier3d-compat';
import type { Input } from '../core/Input';

const WALK_SPEED = 5.2;
const RUN_SPEED = 8.5;
const JUMP_SPEED = 8;
const GRAVITY = -22;
const MOUSE_SENSITIVITY = 0.0021;
const EYE_OFFSET = 0.62; // 캡슐 중심 → 눈높이
const CAPSULE_HALF = 0.6;
const CAPSULE_RADIUS = 0.35;

/**
 * 1인칭 플레이어 — Rapier 키네마틱 캐릭터 컨트롤러 기반.
 * 걷기/달리기/점프, 마우스 시점, 동적 파츠 밀치기 지원.
 */
export class PlayerController {
  readonly body: RigidBody;
  readonly collider: Collider;
  private controller: KinematicCharacterController;

  yaw = 0;
  pitch = 0;
  private verticalVel = 0;

  constructor(private world: World, spawn: THREE.Vector3) {
    this.body = world.createRigidBody(
      RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y, spawn.z),
    );
    this.collider = world.createCollider(
      ColliderDesc.capsule(CAPSULE_HALF, CAPSULE_RADIUS).setFriction(0.0),
      this.body,
    );

    this.controller = world.createCharacterController(0.05);
    this.controller.enableAutostep(0.45, 0.2, true);
    this.controller.enableSnapToGround(0.35);
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.controller.setMaxSlopeClimbAngle((55 * Math.PI) / 180);
  }

  update(dt: number, input: Input): void {
    // 시점 회전
    const { dx, dy } = input.mouseDelta;
    this.yaw -= dx * MOUSE_SENSITIVITY;
    this.pitch -= dy * MOUSE_SENSITIVITY;
    const maxPitch = Math.PI / 2 - 0.05;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));

    // 이동 방향 (yaw 기준)
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = new THREE.Vector3();
    if (input.isDown('KeyW')) move.add(forward);
    if (input.isDown('KeyS')) move.sub(forward);
    if (input.isDown('KeyD')) move.add(right);
    if (input.isDown('KeyA')) move.sub(right);

    const speed = input.isDown('ShiftLeft') || input.isDown('ShiftRight') ? RUN_SPEED : WALK_SPEED;
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed * dt);

    // 중력 + 점프
    const grounded = this.controller.computedGrounded();
    if (grounded) {
      this.verticalVel = Math.max(this.verticalVel, -1);
      if (input.justPressed('Space')) this.verticalVel = JUMP_SPEED;
    }
    this.verticalVel += GRAVITY * dt;
    move.y = this.verticalVel * dt;

    // 충돌 보정 이동
    this.controller.computeColliderMovement(this.collider, { x: move.x, y: move.y, z: move.z });
    const corrected = this.controller.computedMovement();
    const pos = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: pos.x + corrected.x,
      y: pos.y + corrected.y,
      z: pos.z + corrected.z,
    });

    // 천장에 부딪히면 상승 중단
    if (this.verticalVel > 0 && corrected.y < move.y * 0.5) this.verticalVel = 0;
  }

  /** 물리 스텝 후 카메라를 눈높이에 배치 */
  syncCamera(camera: THREE.PerspectiveCamera): void {
    const pos = this.body.translation();
    camera.position.set(pos.x, pos.y + EYE_OFFSET, pos.z);
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  dispose(): void {
    this.world.removeCharacterController(this.controller);
  }
}
