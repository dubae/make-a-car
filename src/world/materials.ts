import * as THREE from 'three';
import { tex, PbrMaps, TexName } from './assets';

// 장난감 파츠에 쓰는 밝은 원색 팔레트
export const TOY_COLORS = {
  red: 0xe94f4f,
  orange: 0xf29b3a,
  yellow: 0xf7d13e,
  green: 0x5cc95c,
  teal: 0x3fc1b0,
  blue: 0x4a8fe7,
  purple: 0xa06ae0,
  pink: 0xef7fb2,
  wood: 0xd9a066,
  woodDark: 0xb5793f,
  white: 0xf5f0e8,
  dark: 0x4a4a52,
} as const;

/** 타일 반복 수를 지정한 텍스처 세트 복제본 */
function tiled(name: TexName, rx: number, ry: number): PbrMaps {
  const src = tex(name);
  const c: PbrMaps = {
    map: src.map.clone(),
    normalMap: src.normalMap.clone(),
    roughnessMap: src.roughnessMap.clone(),
  };
  for (const t of [c.map, c.normalMap, c.roughnessMap]) {
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
  }
  return c;
}

/** 광택 있는 사출 플라스틱 (장난감 기본) */
export function plastic(color: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.34,
    metalness: 0,
    clearcoat: 0.45,
    clearcoatRoughness: 0.3,
  });
}

/** 무광 페인트 표면 (문/몰딩/가구 도장면) */
export function painted(color: number, roughness = 0.65): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

/** 결이 살아있는 원목 (가구/나무 파츠) */
export function woodMat(tint = 0xffffff, repeat = 1): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: tint, ...tiled('wood', repeat, repeat) });
}

/** 마루 라미네이트 바닥 */
export function floorMat(rx: number, ry: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ ...tiled('floor', rx, ry) });
}

/** 페인트 벽 — 색은 단색으로 제어하고 요철(노멀)만 텍스처 사용 */
export function wallMat(tint: number, rx: number, ry: number): THREE.MeshStandardMaterial {
  const t = tiled('wall', rx, ry);
  return new THREE.MeshStandardMaterial({
    color: tint,
    normalMap: t.normalMap,
    roughnessMap: t.roughnessMap,
    roughness: 1,
  });
}

/** 직물 (러그/침구/인형) — 짜임 요철만 살리고 색은 단색 */
export function fabricMat(tint: number, repeat = 2): THREE.MeshStandardMaterial {
  const t = tiled('fabric', repeat, repeat);
  return new THREE.MeshStandardMaterial({
    color: tint,
    normalMap: t.normalMap,
    roughnessMap: t.roughnessMap,
    roughness: 1,
  });
}

/** 체크무늬 직물 (커튼 등 포인트 소품) — 패턴 diffuse 포함 */
export function plaidMat(tint: number, repeat = 2): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: tint, ...tiled('fabric', repeat, repeat) });
  m.roughness = 1;
  return m;
}

/** 콘크리트 (차고 바닥) */
export function concreteMat(rx: number, ry: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ ...tiled('concrete', rx, ry) });
}

/** 고무 (바퀴) */
export function rubber(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 });
}
