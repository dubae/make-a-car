import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

/**
 * Poly Haven(CC0)에서 받은 PBR 텍스처와 HDRI 환경맵 로더.
 * public/textures/<name>/{diff,nor,rough}.jpg, public/hdri/lebombo_1k.hdr
 */
export interface PbrMaps {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

export type TexName = 'floor' | 'wood' | 'fabric' | 'wall' | 'concrete';

const sets = {} as Record<TexName, PbrMaps>;
let envMap: THREE.Texture | null = null;

export function tex(name: TexName): PbrMaps {
  return sets[name];
}

export function environment(): THREE.Texture {
  return envMap!;
}

export async function loadAssets(renderer: THREE.WebGLRenderer): Promise<void> {
  const base = import.meta.env.BASE_URL;
  const loader = new THREE.TextureLoader();
  const names: TexName[] = ['floor', 'wood', 'fabric', 'wall', 'concrete'];

  const jobs: Promise<void>[] = names.map(async (n) => {
    const [map, normalMap, roughnessMap] = await Promise.all([
      loader.loadAsync(`${base}textures/${n}/diff.jpg`),
      loader.loadAsync(`${base}textures/${n}/nor.jpg`),
      loader.loadAsync(`${base}textures/${n}/rough.jpg`),
    ]);
    map.colorSpace = THREE.SRGBColorSpace;
    for (const t of [map, normalMap, roughnessMap]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }
    sets[n] = { map, normalMap, roughnessMap };
  });

  // HDRI → PMREM 환경맵 (부드러운 실내 간접광 + 반사)
  jobs.push(
    (async () => {
      const hdr = await new RGBELoader().loadAsync(`${base}hdri/lebombo_1k.hdr`);
      const pmrem = new THREE.PMREMGenerator(renderer);
      envMap = pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose();
      pmrem.dispose();
    })(),
  );

  await Promise.all(jobs);
}
