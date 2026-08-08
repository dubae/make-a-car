import * as THREE from 'three';

// 토이스토리 느낌의 셀 셰이딩용 3단계 그라디언트 램프 (모든 토온 머티리얼이 공유)
let gradientMap: THREE.DataTexture | null = null;

export function getToonGradient(): THREE.DataTexture {
  if (!gradientMap) {
    const colors = new Uint8Array([110, 180, 255]);
    gradientMap = new THREE.DataTexture(colors, colors.length, 1, THREE.RedFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
}

export function toonMaterial(color: number): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: getToonGradient() });
}

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
