import * as THREE from 'three';
import { World, RigidBodyDesc, ColliderDesc } from '@dimforge/rapier3d-compat';
import { plastic, painted, concreteMat, wallMat, TOY_COLORS } from './materials';
import type { ToyPart } from './ToyParts';

const WALL_H = 9; // 벽 높이
const HALF_X = 7.5; // 건물 절반 폭 (x)
const HALF_Z = 6.5; // 건물 절반 깊이 (z)
const ROOF_RISE = 4.5;

/**
 * 플레이어의 차고지 — 셔터가 반쯤 열린 진짜 차고 건물.
 * 개구부는 -z 방향(방 중앙)을 향한다.
 * Phase 1 종료 시 건물 내부의 파츠만 소유하게 된다.
 */
export class Garage {
  private arrow!: THREE.Mesh;
  private elapsed = 0;

  constructor(
    scene: THREE.Scene,
    private world: World,
    public readonly center: THREE.Vector3,
  ) {
    this.buildBuilding(scene);
    this.buildFloorMarkings(scene);
    this.buildSignAndBeacon(scene);
  }

  private wall(
    scene: THREE.Scene,
    size: [number, number, number],
    pos: [number, number, number],
    color: number,
    rotZ = 0,
  ): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), wallMat(color, 1.5, 0.9));
    mesh.position.set(...pos);
    mesh.rotation.z = rotZ;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const body = this.world.createRigidBody(
      RigidBodyDesc.fixed().setTranslation(...pos).setRotation(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rotZ)),
      ),
    );
    this.world.createCollider(ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2), body);
  }

  private buildBuilding(scene: THREE.Scene): void {
    const { x: cx, z: cz } = this.center;
    const wallColor = 0xece1cb;
    const trim = 0xffffff;

    // 뒷벽 + 좌우 측벽
    this.wall(scene, [HALF_X * 2, WALL_H, 0.8], [cx, WALL_H / 2, cz + HALF_Z - 0.4], wallColor);
    this.wall(scene, [0.8, WALL_H, HALF_Z * 2], [cx - HALF_X + 0.4, WALL_H / 2, cz], wallColor);
    this.wall(scene, [0.8, WALL_H, HALF_Z * 2], [cx + HALF_X - 0.4, WALL_H / 2, cz], wallColor);
    // 개구부 위 헤더 보
    this.wall(scene, [HALF_X * 2, 2.6, 0.8], [cx, WALL_H - 1.3, cz - HALF_Z + 0.4], wallColor);

    // 모서리 흰 트림 기둥
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(1.3, WALL_H + 0.2, 1.3), painted(trim, 0.5));
      post.position.set(cx + sx * (HALF_X - 0.55), (WALL_H + 0.2) / 2, cz + sz * (HALF_Z - 0.55));
      post.castShadow = true;
      scene.add(post);
    }

    // 반쯤 말려 올라간 셔터 (개구부 안쪽 상단의 롤 + 슬랫 두 줄)
    const rollMat = new THREE.MeshStandardMaterial({ color: 0xc9c9cf, metalness: 0.75, roughness: 0.42 });
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, HALF_X * 2 - 2, 16), rollMat);
    roll.rotation.z = Math.PI / 2;
    roll.position.set(cx, WALL_H - 2.4, cz - HALF_Z + 1.4);
    roll.castShadow = true;
    scene.add(roll);
    for (let i = 0; i < 2; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(HALF_X * 2 - 2.2, 0.55, 0.3), rollMat);
      slat.position.set(cx, WALL_H - 3.6 - i * 0.62, cz - HALF_Z + 0.6);
      scene.add(slat);
    }
    // 셔터 레일
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.5, WALL_H - 1, 0.42), new THREE.MeshStandardMaterial({ color: 0xb9b9bf, metalness: 0.7, roughness: 0.45 }));
      rail.position.set(cx + s * (HALF_X - 1.15), (WALL_H - 1) / 2, cz - HALF_Z + 0.55);
      scene.add(rail);
    }

    // 박공 지붕 (빨간 경사 슬래브 2장 + 앞뒤 삼각 게이블)
    const slope = Math.atan2(ROOF_RISE, HALF_X);
    const slabLen = Math.hypot(HALF_X + 0.9, ROOF_RISE + 0.55);
    for (const s of [-1, 1]) {
      const size: [number, number, number] = [slabLen, 0.6, HALF_Z * 2 + 2];
      const pos: [number, number, number] = [
        cx + (s * (HALF_X + 0.9)) / 2 - (s * 0.2),
        WALL_H + ROOF_RISE / 2 + 0.35,
        cz,
      ];
      this.wall(scene, size, pos, TOY_COLORS.red, -s * slope);
    }
    // 용마루
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, HALF_Z * 2 + 2.2), painted(0xc23d3d, 0.5));
    ridge.position.set(cx, WALL_H + ROOF_RISE + 0.55, cz);
    ridge.castShadow = true;
    scene.add(ridge);

    // 앞뒤 게이블 (삼각형)
    const tri = new THREE.Shape();
    tri.moveTo(-HALF_X, 0);
    tri.lineTo(HALF_X, 0);
    tri.lineTo(0, ROOF_RISE);
    tri.closePath();
    const gableGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.8, bevelEnabled: false });
    for (const s of [-1, 1]) {
      const gable = new THREE.Mesh(gableGeo, painted(0xe3d5ba, 0.65));
      gable.position.set(cx, WALL_H, cz + s * (HALF_Z - 0.4) - 0.4);
      gable.castShadow = true;
      scene.add(gable);
    }

    // 측벽의 작은 창
    const winFrame = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 3.8), painted(0xffffff, 0.45));
    winFrame.position.set(cx + HALF_X + 0.02, 5.2, cz + 1);
    scene.add(winFrame);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.4), new THREE.MeshBasicMaterial({ color: 0xfff3cf }));
    win.position.set(cx + HALF_X + 0.24, 5.2, cz + 1);
    win.rotation.y = Math.PI / 2;
    scene.add(win);

    // 내부 조명
    const light = new THREE.PointLight(0xffe2ae, 180, 0, 1.8);
    light.position.set(cx, WALL_H - 2, cz + 1.5);
    scene.add(light);
  }

  private buildFloorMarkings(scene: THREE.Scene): void {
    const { x: cx, z: cz } = this.center;

    // 콘크리트 바닥 슬래브 (얇은 장식)
    const slab = new THREE.Mesh(new THREE.BoxGeometry(HALF_X * 2 - 1, 0.1, HALF_Z * 2 - 1), concreteMat(2, 1.8));
    slab.position.set(cx, 0.07, cz);
    slab.receiveShadow = true;
    scene.add(slab);

    // 주차 라인 (노란 ㄷ자)
    const lineMat = painted(TOY_COLORS.yellow, 0.55);
    const lines: [number, number, number, number][] = [
      // [w, d, dx, dz]
      [0.5, 9, -4.5, 0.5],
      [0.5, 9, 4.5, 0.5],
      [9.5, 0.5, 0, 4.75],
    ];
    for (const [w, d, dx, dz] of lines) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), lineMat);
      line.position.set(cx + dx, 0.16, cz + dz);
      scene.add(line);
    }
    // 기름 얼룩
    const stain = new THREE.Mesh(new THREE.CircleGeometry(1.8, 20), new THREE.MeshBasicMaterial({ color: 0x5a5a60, transparent: true, opacity: 0.5 }));
    stain.rotation.x = -Math.PI / 2;
    stain.position.set(cx - 2, 0.145, cz + 1.5);
    scene.add(stain);

    // 입구 위험 스트라이프 (노랑/검정)
    for (let i = 0; i < 8; i++) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(1.62, 0.08, 1.4),
        painted(i % 2 === 0 ? TOY_COLORS.yellow : 0x3c3c42, 0.55),
      );
      stripe.position.set(cx - HALF_X + 1.3 + i * 1.66, 0.055, cz - HALF_Z - 0.9);
      stripe.receiveShadow = true;
      scene.add(stripe);
    }
  }

  private buildSignAndBeacon(scene: THREE.Scene): void {
    const { x: cx, z: cz } = this.center;

    // 앞 게이블의 간판
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 144;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(4, 4, 504, 136, 22);
    ctx.fill();
    ctx.strokeStyle = '#e94f4f';
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.fillStyle = '#222222';
    ctx.font = 'bold 72px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🚗 내 차고지', 256, 78);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 2.6),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
    );
    sign.position.set(cx, WALL_H + 1.7, cz - HALF_Z - 0.65);
    sign.rotation.y = Math.PI; // 개구부(-z, 방 중앙) 쪽을 향하도록
    scene.add(sign);

    // 지붕 위 회전 화살표 비콘 (멀리서도 차고지가 보이게)
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.6, 4), plastic(TOY_COLORS.yellow));
    this.arrow.rotation.x = Math.PI;
    this.arrow.position.set(cx, WALL_H + ROOF_RISE + 5, cz);
    scene.add(this.arrow);
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.arrow.position.y = WALL_H + ROOF_RISE + 4.6 + Math.sin(this.elapsed * 3) * 0.7;
    this.arrow.rotation.y += dt * 1.5;
  }

  /** 건물 내부 판정 */
  contains(pos: { x: number; y: number; z: number }): boolean {
    return (
      Math.abs(pos.x - this.center.x) <= HALF_X - 0.8 &&
      pos.z >= this.center.z - HALF_Z &&
      pos.z <= this.center.z + HALF_Z - 0.8 &&
      pos.y >= -1 &&
      pos.y <= WALL_H
    );
  }

  /** 차고지 안에 있는 파츠 목록 */
  collect(parts: ToyPart[]): ToyPart[] {
    return parts.filter((p) => this.contains(p.body.translation()));
  }
}
