import * as THREE from 'three';
import { World, RigidBody, RigidBodyDesc, ColliderDesc } from '@dimforge/rapier3d-compat';
import { createRng, pick, range } from '../core/rng';
import { toonMaterial, TOY_COLORS } from './materials';

export type ToyShape = 'box' | 'cylinder' | 'ball';

export interface ToyPartSpec {
  /** 결과 화면에 표시되는 이름 */
  name: string;
  shape: ToyShape;
  /** box: [가로, 높이, 세로] / cylinder: [반지름, 높이] / ball: [반지름] */
  size: [number, number, number];
  colors: readonly number[];
  /** 밀도 — 파츠 무게 차이는 Phase 3 주행 성능에 영향 */
  density: number;
  restitution: number;
  count: number;
}

// 데모 맵에서 파밍 가능한 파츠 카탈로그
export const PART_CATALOG: ToyPartSpec[] = [
  {
    name: '대형 차체 블록',
    shape: 'box',
    size: [1.7, 0.7, 2.6],
    colors: [TOY_COLORS.red, TOY_COLORS.blue, TOY_COLORS.green],
    density: 0.25,
    restitution: 0.1,
    count: 3,
  },
  {
    name: '나무 블록',
    shape: 'box',
    size: [0.62, 0.62, 0.62],
    colors: [TOY_COLORS.wood, TOY_COLORS.woodDark, TOY_COLORS.yellow, TOY_COLORS.orange],
    density: 0.55,
    restitution: 0.15,
    count: 10,
  },
  {
    name: '나무 판자',
    shape: 'box',
    size: [1.3, 0.16, 0.55],
    colors: [TOY_COLORS.wood, TOY_COLORS.woodDark],
    density: 0.5,
    restitution: 0.1,
    count: 7,
  },
  {
    name: '장난감 바퀴',
    shape: 'cylinder',
    size: [0.42, 0.3, 0],
    colors: [TOY_COLORS.dark],
    density: 0.9,
    restitution: 0.3,
    count: 10,
  },
  {
    name: '실패(스풀)',
    shape: 'cylinder',
    size: [0.36, 0.55, 0],
    colors: [TOY_COLORS.purple, TOY_COLORS.teal, TOY_COLORS.pink],
    density: 0.4,
    restitution: 0.2,
    count: 6,
  },
  {
    name: '고무공',
    shape: 'ball',
    size: [0.36, 0, 0],
    colors: [TOY_COLORS.red, TOY_COLORS.yellow, TOY_COLORS.blue, TOY_COLORS.pink],
    density: 0.35,
    restitution: 0.65,
    count: 6,
  },
  {
    name: '블록 브릭',
    shape: 'box',
    size: [0.85, 0.36, 0.42],
    colors: [TOY_COLORS.red, TOY_COLORS.yellow, TOY_COLORS.green, TOY_COLORS.blue, TOY_COLORS.orange],
    density: 0.3,
    restitution: 0.2,
    count: 10,
  },
  {
    name: '도미노 조각',
    shape: 'box',
    size: [0.28, 0.56, 0.13],
    colors: [TOY_COLORS.white, TOY_COLORS.teal, TOY_COLORS.purple],
    density: 0.45,
    restitution: 0.15,
    count: 8,
  },
];

/** 파밍 가능한 낱개 파츠 하나 (Three 메시 + Rapier 강체) */
export class ToyPart {
  /** 들고 다닐 때 카메라와의 거리 계산에 쓰는 대략적 반지름 */
  readonly boundingRadius: number;
  private baseEmissive = 0x000000;

  constructor(
    public readonly name: string,
    public readonly mesh: THREE.Mesh,
    public readonly body: RigidBody,
    public readonly colliderHandle: number,
  ) {
    const s = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
    this.boundingRadius = Math.max(s.x, s.y, s.z) / 2;
  }

  setHighlight(mode: 'none' | 'hover' | 'held'): void {
    const mat = this.mesh.material as THREE.MeshToonMaterial;
    const e = mode === 'none' ? this.baseEmissive : mode === 'hover' ? 0x554400 : 0x114411;
    mat.emissive.setHex(e);
  }

  syncMesh(): void {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.mesh.position.set(t.x, t.y, t.z);
    this.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }
}

function buildGeometry(spec: ToyPartSpec): THREE.BufferGeometry {
  switch (spec.shape) {
    case 'box':
      return new THREE.BoxGeometry(spec.size[0], spec.size[1], spec.size[2]);
    case 'cylinder':
      return new THREE.CylinderGeometry(spec.size[0], spec.size[0], spec.size[1], 24);
    case 'ball':
      return new THREE.SphereGeometry(spec.size[0], 20, 14);
  }
}

function buildCollider(spec: ToyPartSpec): ColliderDesc {
  switch (spec.shape) {
    case 'box':
      return ColliderDesc.cuboid(spec.size[0] / 2, spec.size[1] / 2, spec.size[2] / 2);
    case 'cylinder':
      return ColliderDesc.cylinder(spec.size[1] / 2, spec.size[0]);
    case 'ball':
      return ColliderDesc.ball(spec.size[0]);
  }
}

export interface SpawnArea {
  /** 이 영역 안에는 파츠를 배치하지 않음 (차고지/스폰 주변) */
  exclude: { x: number; z: number; radius: number }[];
  /** 배치 반경 (방 중심 기준) */
  radius: number;
}

/** 방 곳곳에 파츠를 흩뿌린다. 반환: 전체 파츠 목록 */
export function spawnToyParts(scene: THREE.Scene, world: World, area: SpawnArea, seed = 20260808): ToyPart[] {
  const rng = createRng(seed);
  const parts: ToyPart[] = [];

  for (const spec of PART_CATALOG) {
    for (let i = 0; i < spec.count; i++) {
      // 제외 구역을 피해서 위치 선정
      let x = 0;
      let z = 0;
      for (let attempt = 0; attempt < 40; attempt++) {
        const angle = rng() * Math.PI * 2;
        const dist = range(rng, 3, area.radius);
        x = Math.cos(angle) * dist;
        z = Math.sin(angle) * dist;
        const blocked = area.exclude.some((e) => Math.hypot(x - e.x, z - e.z) < e.radius);
        if (!blocked) break;
      }

      const color = pick(rng, spec.colors);
      const mesh = new THREE.Mesh(buildGeometry(spec), toonMaterial(color));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);

      const y = range(rng, 1.2, 2.2); // 살짝 위에서 떨어뜨려 자연스럽게 흩어지게
      const body = world.createRigidBody(
        RigidBodyDesc.dynamic()
          .setTranslation(x, y, z)
          .setLinearDamping(0.25)
          .setAngularDamping(0.4),
      );
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI),
      );
      body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);

      const collider = world.createCollider(
        buildCollider(spec).setDensity(spec.density).setFriction(0.7).setRestitution(spec.restitution),
        body,
      );

      parts.push(new ToyPart(spec.name, mesh, body, collider.handle));
    }
  }

  return parts;
}
