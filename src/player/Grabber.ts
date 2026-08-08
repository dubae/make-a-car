import * as THREE from 'three';
import { World, Ray, RigidBody } from '@dimforge/rapier3d-compat';
import type { Input } from '../core/Input';
import type { ToyPart } from '../world/ToyParts';

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

  update(dt: number, input: Input): void {
    this.updateHover();

    const grabPressed = input.clicked(0) || input.justPressed('KeyE');
    const throwPressed = input.clicked(2) || input.justPressed('KeyQ');

    if (this.held) {
      if (throwPressed) this.throwHeld();
      else if (grabPressed) this.release();
      else this.moveHeld(dt);
    } else if (grabPressed && this.hovered) {
      this.grab(this.hovered);
    }
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

  private grab(part: ToyPart): void {
    this.held = part;
    this.hovered = null;
    part.setHighlight('held');
    part.body.setGravityScale(0, true);
    part.body.wakeUp();
    // 큰 파츠는 좀 더 멀리 들어서 시야를 가리지 않게
    this.holdDistance = Math.min(2.1 + part.boundingRadius, 4);
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

    const vel = delta.multiplyScalar(HOLD_STIFFNESS);
    if (vel.length() > HOLD_MAX_SPEED) vel.setLength(HOLD_MAX_SPEED);
    part.body.setLinvel({ x: vel.x, y: vel.y, z: vel.z }, true);

    // 회전은 서서히 감쇠
    const av = part.body.angvel();
    part.body.setAngvel({ x: av.x * 0.9, y: av.y * 0.9, z: av.z * 0.9 }, true);
  }

  private release(): void {
    const part = this.held;
    if (!part) return;
    this.held = null;
    part.setHighlight('none');
    part.body.setGravityScale(1, true);
    // 들고 있던 관성이 너무 크지 않게 절반으로
    const v = part.body.linvel();
    part.body.setLinvel({ x: v.x * 0.5, y: v.y * 0.5, z: v.z * 0.5 }, true);
  }

  private throwHeld(): void {
    const part = this.held;
    if (!part) return;
    this.held = null;
    part.setHighlight('none');
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
