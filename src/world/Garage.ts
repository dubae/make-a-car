import * as THREE from 'three';
import { toonMaterial, TOY_COLORS } from './materials';
import type { ToyPart } from './ToyParts';

/**
 * 플레이어의 차고지 — 노란 매트 영역.
 * Phase 1 종료 시 이 영역 안의 파츠만 소유하게 된다.
 */
export class Garage {
  private arrow!: THREE.Mesh;
  private elapsed = 0;

  constructor(
    scene: THREE.Scene,
    public readonly center: THREE.Vector3,
    public readonly halfSize = 4,
  ) {
    this.buildVisuals(scene);
  }

  private buildVisuals(scene: THREE.Scene): void {
    const { center, halfSize } = this;

    // 매트
    const mat = new THREE.Mesh(
      new THREE.BoxGeometry(halfSize * 2, 0.08, halfSize * 2),
      new THREE.MeshToonMaterial({ color: 0xffe27a, transparent: true, opacity: 0.85 }),
    );
    mat.position.set(center.x, 0.04, center.z);
    mat.receiveShadow = true;
    scene.add(mat);

    // 테두리 스트라이프
    const borderMat = toonMaterial(TOY_COLORS.orange);
    const b = halfSize;
    const strips: [number, number, number, number][] = [
      // [w, d, x, z]
      [b * 2 + 0.3, 0.3, 0, -b],
      [b * 2 + 0.3, 0.3, 0, b],
      [0.3, b * 2 + 0.3, -b, 0],
      [0.3, b * 2 + 0.3, b, 0],
    ];
    for (const [w, d, x, z] of strips) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), borderMat);
      strip.position.set(center.x + x, 0.06, center.z + z);
      scene.add(strip);
    }

    // 코너 기둥
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.6, 10), borderMat);
      post.position.set(center.x + sx * b, 0.8, center.z + sz * b);
      post.castShadow = true;
      scene.add(post);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), toonMaterial(TOY_COLORS.yellow));
      cap.position.set(center.x + sx * b, 1.68, center.z + sz * b);
      scene.add(cap);
    }

    // "차고지" 간판
    const sign = this.makeSign('🚗 차고지');
    sign.position.set(center.x, 3.2, center.z);
    scene.add(sign);

    // 위에서 통통 튀는 안내 화살표
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 4), toonMaterial(TOY_COLORS.yellow));
    this.arrow.rotation.x = Math.PI;
    this.arrow.position.set(center.x, 5, center.z);
    scene.add(this.arrow);
  }

  private makeSign(text: string): THREE.Object3D {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(6, 6, 500, 148, 28);
    ctx.fill();
    ctx.strokeStyle = '#f29b3a';
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.fillStyle = '#222222';
    ctx.font = 'bold 76px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 86);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 1.1),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide }),
    );
    return plane;
  }

  /** 화살표 애니메이션 */
  update(dt: number): void {
    this.elapsed += dt;
    this.arrow.position.y = 4.6 + Math.sin(this.elapsed * 3) * 0.35;
    this.arrow.rotation.y += dt * 1.5;
  }

  contains(pos: { x: number; y: number; z: number }): boolean {
    return (
      Math.abs(pos.x - this.center.x) <= this.halfSize &&
      Math.abs(pos.z - this.center.z) <= this.halfSize &&
      pos.y >= -1 &&
      pos.y <= 4
    );
  }

  /** 차고지 안에 있는 파츠 목록 */
  collect(parts: ToyPart[]): ToyPart[] {
    return parts.filter((p) => this.contains(p.body.translation()));
  }
}
