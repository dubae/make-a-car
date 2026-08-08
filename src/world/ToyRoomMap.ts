import * as THREE from 'three';
import { World, RigidBodyDesc, ColliderDesc } from '@dimforge/rapier3d-compat';
import { plastic, painted, woodMat, floorMat, wallMat, fabricMat, plaidMat, TOY_COLORS } from './materials';

/**
 * "작아진 사람" 스케일의 실제 아이 방.
 * 플레이어 키 1.9유닛 ≈ 10cm 라고 가정 → 실제 1m ≈ 19유닛.
 * 방: 4.7m × 3.7m × 천장 2.6m → 90 × 70 × 50 유닛.
 * 침대/책상/책장/옷장 등 실제 가구가 거대하게 보인다.
 */
export const ROOM_HALF_X = 45;
export const ROOM_HALF_Z = 35;
export const WALL_HEIGHT = 50;

export function buildToyRoom(scene: THREE.Scene, world: World): void {
  buildFloor(scene, world);
  buildWallsAndCeiling(scene, world);
  buildWindowsAndCurtains(scene);
  buildDoor(scene);
  buildRug(scene);
  buildBed(scene, world);
  buildDeskAndChair(scene, world);
  buildBookshelf(scene, world);
  buildWardrobe(scene, world);
  buildToyBoxOnSide(scene, world);
  buildFloorClutter(scene, world);
  buildPosters(scene);
  buildOutletAndSwitch(scene);
  buildCeilingLamp(scene);
}

// ---------------------------------------------------------------- 헬퍼

function addStaticBox(
  scene: THREE.Scene,
  world: World,
  size: [number, number, number],
  pos: [number, number, number],
  color: number | THREE.Material,
  rotY = 0,
  shadows = true,
): THREE.Mesh {
  const mat = typeof color === 'number' ? painted(color) : color;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...pos);
  mesh.rotation.y = rotY;
  if (shadows) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  scene.add(mesh);

  const body = world.createRigidBody(
    RigidBodyDesc.fixed().setTranslation(...pos).setRotation(
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)),
    ),
  );
  world.createCollider(ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2).setFriction(0.8), body);
  return mesh;
}

/** 장식 전용 박스 (콜라이더 없음) */
function decoBox(
  scene: THREE.Scene,
  size: [number, number, number],
  pos: [number, number, number],
  color: number | THREE.Material,
  rotY = 0,
): THREE.Mesh {
  const mat = typeof color === 'number' ? painted(color) : color;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...pos);
  mesh.rotation.y = rotY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function makeCanvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d')!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------- 방 구조

function buildFloor(scene: THREE.Scene, world: World): void {
  // 실사 라미네이트 마루 (Poly Haven laminate_floor_02, 실측 스케일 반복)
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(ROOM_HALF_X * 2, 0.2, ROOM_HALF_Z * 2),
    floorMat(2.4, 1.9),
  );
  floor.position.set(0, -0.1, 0);
  floor.receiveShadow = true;
  scene.add(floor);
  const floorBody = world.createRigidBody(RigidBodyDesc.fixed().setTranslation(0, -0.25, 0));
  world.createCollider(ColliderDesc.cuboid(ROOM_HALF_X, 0.25, ROOM_HALF_Z).setFriction(0.9), floorBody);
}

function buildWallsAndCeiling(scene: THREE.Scene, world: World): void {
  const lowerMat = wallMat(0xaccfe2, 4, 1.6); // 하단: 파스텔 블루
  const upperMat = wallMat(0xf3ead7, 4, 2.6); // 상단: 크림
  const trimMat = painted(0xffffff, 0.5);

  const walls: { size: [number, number, number]; pos: [number, number, number] }[] = [
    { size: [ROOM_HALF_X * 2, WALL_HEIGHT, 1], pos: [0, WALL_HEIGHT / 2, -ROOM_HALF_Z] },
    { size: [ROOM_HALF_X * 2, WALL_HEIGHT, 1], pos: [0, WALL_HEIGHT / 2, ROOM_HALF_Z] },
    { size: [1, WALL_HEIGHT, ROOM_HALF_Z * 2], pos: [-ROOM_HALF_X, WALL_HEIGHT / 2, 0] },
    { size: [1, WALL_HEIGHT, ROOM_HALF_Z * 2], pos: [ROOM_HALF_X, WALL_HEIGHT / 2, 0] },
  ];
  const LOWER_H = 18;
  for (const w of walls) {
    const alongX = w.size[0] > w.size[2];
    // 하단 웨인스코트
    const lower = new THREE.Mesh(
      new THREE.BoxGeometry(alongX ? w.size[0] : 1, LOWER_H, alongX ? 1 : w.size[2]),
      lowerMat,
    );
    lower.position.set(w.pos[0], LOWER_H / 2, w.pos[2]);
    lower.receiveShadow = true;
    scene.add(lower);
    // 상단 벽지
    const upper = new THREE.Mesh(
      new THREE.BoxGeometry(alongX ? w.size[0] : 1, WALL_HEIGHT - LOWER_H, alongX ? 1 : w.size[2]),
      upperMat,
    );
    upper.position.set(w.pos[0], LOWER_H + (WALL_HEIGHT - LOWER_H) / 2, w.pos[2]);
    upper.receiveShadow = true;
    scene.add(upper);
    // 경계 몰딩 + 걸레받이
    const molding = new THREE.Mesh(
      new THREE.BoxGeometry(alongX ? w.size[0] : 1.3, 1, alongX ? 1.3 : w.size[2]),
      trimMat,
    );
    molding.position.set(w.pos[0], LOWER_H, w.pos[2]);
    scene.add(molding);
    const skirt = new THREE.Mesh(
      new THREE.BoxGeometry(alongX ? w.size[0] : 1.6, 1.6, alongX ? 1.6 : w.size[2]),
      trimMat,
    );
    skirt.position.set(w.pos[0], 0.8, w.pos[2]);
    scene.add(skirt);

    const body = world.createRigidBody(RigidBodyDesc.fixed().setTranslation(...w.pos));
    world.createCollider(ColliderDesc.cuboid(w.size[0] / 2, w.size[1] / 2, w.size[2] / 2), body);
  }

  // 천장 — 그림자를 만들지 않아 "창문 햇살"이 방 안까지 들어온다
  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(ROOM_HALF_X * 2, 0.5, ROOM_HALF_Z * 2),
    painted(0xfaf5ea, 0.9),
  );
  ceiling.position.set(0, WALL_HEIGHT + 0.25, 0);
  scene.add(ceiling);
}

function buildWindowsAndCurtains(scene: THREE.Scene): void {
  const makeWindow = (x: number, z: number, rotY: number, withCurtain: boolean) => {
    const g = new THREE.Group();
    // 하늘이 비치는 창 (자체발광 느낌)
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(20, 15), new THREE.MeshBasicMaterial({ color: 0xd8f0ff }));
    g.add(glass);
    const hill = new THREE.Mesh(new THREE.CircleGeometry(9, 24), new THREE.MeshBasicMaterial({ color: 0xa5dba0 }));
    hill.position.set(-4, -6.2, 0.05);
    g.add(hill);
    const sun = new THREE.Mesh(new THREE.CircleGeometry(2.2, 20), new THREE.MeshBasicMaterial({ color: 0xffe98a }));
    sun.position.set(6, 4.5, 0.05);
    g.add(sun);

    const frameMat = painted(0xffffff, 0.45);
    const bars: [number, number, number, number][] = [
      [21.6, 1.2, 0, 7.9],
      [21.6, 1.2, 0, -7.9],
      [1.2, 16.8, -10.2, 0],
      [1.2, 16.8, 10.2, 0],
      [0.8, 15, 0, 0],
      [20, 0.8, 0, 0],
    ];
    for (const [w, h, bx, by] of bars) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.8), frameMat);
      bar.position.set(bx, by, 0.3);
      g.add(bar);
    }
    // 창턱
    const sill = new THREE.Mesh(new THREE.BoxGeometry(23, 1, 2), frameMat);
    sill.position.set(0, -8.8, 0.8);
    g.add(sill);

    if (withCurtain) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 27, 10), woodMat(TOY_COLORS.wood));
      rod.rotation.z = Math.PI / 2;
      rod.position.set(0, 9.6, 0.9);
      g.add(rod);
      for (const side of [-1, 1]) {
        const curtain = new THREE.Mesh(new THREE.BoxGeometry(3.4, 21, 1), plaidMat(0xffffff, 1.5));
        curtain.position.set(side * 12.2, -1, 0.8);
        g.add(curtain);
      }
    }

    g.position.set(x, 30, z);
    g.rotation.y = rotY;
    scene.add(g);
  };

  // 뒷벽(햇빛 방향) 창문 2개 + 왼쪽 벽 창문 1개
  makeWindow(-22, -ROOM_HALF_Z + 0.6, 0, true);
  makeWindow(8, -ROOM_HALF_Z + 0.6, 0, true);
  makeWindow(-ROOM_HALF_X + 0.6, 8, Math.PI / 2, false);
}

function buildDoor(scene: THREE.Scene): void {
  // 앞벽의 거대한 방문 (장식 — 벽에 밀착)
  const g = new THREE.Group();
  const door = new THREE.Mesh(new THREE.BoxGeometry(17, 38, 0.8), painted(0xffffff, 0.5));
  door.position.set(0, 19, 0);
  g.add(door);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(19, 39.5, 0.6), painted(0xe8dcc8));
  frame.position.set(0, 19.5, -0.2);
  g.add(frame);
  // 문 패널 홈
  for (const [py, ph] of [[27, 12], [12, 14]] as const) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(11, ph, 0.5), painted(0xf2ece0));
    panel.position.set(0, py, 0.3);
    g.add(panel);
  }
  // 문고리 — 작아진 사람에겐 아득히 높다
  const knob = new THREE.Mesh(new THREE.SphereGeometry(1.1, 14, 10), new THREE.MeshStandardMaterial({ color: 0xd8b64a, metalness: 0.85, roughness: 0.35 }));
  knob.position.set(-6.5, 18, 0.9);
  g.add(knob);

  g.position.set(-18, 0, ROOM_HALF_Z - 1);
  g.rotation.y = Math.PI;
  scene.add(g);
}

function buildRug(scene: THREE.Scene): void {
  const rings: [number, number][] = [
    [17, 0x6fb7e0],
    [13, 0xf3d55f],
    [9, 0xef8d5d],
    [5, 0xf6f0e4],
  ];
  rings.forEach(([r, c], i) => {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.06 + i * 0.015, 48), fabricMat(c, 7));
    ring.position.set(2, 0.04 + i * 0.008, 8);
    ring.receiveShadow = true;
    scene.add(ring);
  });
}

// ---------------------------------------------------------------- 가구

function buildBed(scene: THREE.Scene, world: World): void {
  // 실제 1인용 침대 (1.0m × 2.0m) — 밑으로 걸어 들어갈 수 있다
  const cx = -27;
  const W = 19; // x
  const L = 38; // z
  const cz = -16;
  const legH = 6;

  // 다리 4개
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    addStaticBox(scene, world, [2.4, legH, 2.4], [cx + sx * (W / 2 - 1.5), legH / 2, cz + sz * (L / 2 - 1.5)], woodMat(0xcfa878, 1.5));
  }
  // 프레임 + 매트리스 (콜라이더는 하나로 합침)
  decoBox(scene, [W, 3, L], [cx, legH + 1.5, cz], woodMat(0xcfa878, 3));
  decoBox(scene, [W - 0.6, 3, L - 0.8], [cx, legH + 4.2, cz], fabricMat(0xf7f3ea, 4));
  const bedBody = world.createRigidBody(RigidBodyDesc.fixed().setTranslation(cx, legH + 2.9, cz));
  world.createCollider(ColliderDesc.cuboid(W / 2, 2.9, L / 2).setFriction(0.8), bedBody);

  // 이불 (발치 쪽 절반)
  decoBox(scene, [W + 0.8, 1.6, 20], [cx, legH + 5.9, cz + 8.5], fabricMat(TOY_COLORS.teal, 3));
  decoBox(scene, [W + 0.8, 6, 1.6], [cx, legH + 3.4, cz + 18.5], fabricMat(TOY_COLORS.teal, 3)); // 늘어진 자락
  // 베개
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(10, 2.4, 6), fabricMat(0xfef9ee, 2));
  pillow.position.set(cx, legH + 6.4, cz - 14);
  pillow.rotation.y = 0.08;
  pillow.castShadow = true;
  scene.add(pillow);
  // 헤드보드
  decoBox(scene, [W, 12, 1.6], [cx, legH + 7, cz - L / 2 + 0.4], woodMat(0xcfa878, 3));
}

function buildDeskAndChair(scene: THREE.Scene, world: World): void {
  // 책상 (오른쪽 벽에 붙음, 상판 높이 실제 75cm ≈ 14유닛)
  const cx = 38.5;
  const cz = -14;
  const topY = 14;
  addStaticBox(scene, world, [12.5, 1.2, 25], [cx, topY + 0.6, cz], woodMat(0xe2b586, 3));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    addStaticBox(scene, world, [1.4, topY, 1.4], [cx + sx * 5, topY / 2, cz + sz * 11.3], woodMat(0xb98e62, 1.5));
  }
  // 책상 위 소품 (장식): 책 더미 + 연필꽂이
  decoBox(scene, [7, 1, 5], [cx - 1, topY + 1.7, cz - 6], TOY_COLORS.red);
  decoBox(scene, [6, 1, 4.4], [cx - 0.6, topY + 2.7, cz - 5.7], TOY_COLORS.blue, 0.15);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.3, 3, 14), plastic(TOY_COLORS.purple));
  cup.position.set(cx + 2, topY + 2.7, cz + 6);
  cup.castShadow = true;
  scene.add(cup);
  for (let i = 0; i < 3; i++) {
    const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 4.5, 8), plastic([TOY_COLORS.red, TOY_COLORS.green, TOY_COLORS.yellow][i]));
    pen.position.set(cx + 1.4 + i * 0.6, topY + 4.2, cz + 5.6 + (i % 2) * 0.7);
    pen.rotation.z = 0.12 * (i - 1);
    scene.add(pen);
  }

  // 의자 (실제 의자 좌면 32cm ≈ 6유닛 — 작아진 사람은 올라갈 수 없는 높이)
  const chX = 29;
  const seatY = 6.5;
  addStaticBox(scene, world, [9, 1.2, 9], [chX, seatY, cz], TOY_COLORS.teal, -0.15);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    addStaticBox(scene, world, [1, seatY, 1], [chX + sx * 3.6, seatY / 2, cz + sz * 3.6], TOY_COLORS.woodDark, -0.15);
  }
  addStaticBox(scene, world, [9, 11, 1.2], [chX + 4.2, seatY + 6, cz], TOY_COLORS.teal, -0.15);
}

function buildBookshelf(scene: THREE.Scene, world: World): void {
  // 앞벽의 큰 책장 (실제 1.8m ≈ 34유닛) — 뒷벽 창문을 가리지 않는 위치
  const cx = 2;
  const cz = 32;
  const W = 20;
  const H = 34;
  const D = 5;

  // 측판/뒤판/선반 — 비주얼
  decoBox(scene, [1.2, H, D], [cx - W / 2, H / 2, cz], woodMat(0xdcb587, 2));
  decoBox(scene, [1.2, H, D], [cx + W / 2, H / 2, cz], woodMat(0xdcb587, 2));
  decoBox(scene, [W, 1.2, D], [cx, H - 0.6, cz], woodMat(0xdcb587, 2));
  for (const shelfY of [0.6, 11, 21.5]) {
    decoBox(scene, [W - 1, 1.2, D], [cx, shelfY, cz], woodMat(0xdcb587, 2));
  }
  // 꽂힌 책들 (선반 위 색색 박스)
  const bookColors = [TOY_COLORS.red, TOY_COLORS.blue, TOY_COLORS.green, TOY_COLORS.orange, TOY_COLORS.purple, TOY_COLORS.teal];
  let seedIdx = 0;
  for (const shelfY of [1.2, 11.6, 22.1]) {
    let bx = cx - W / 2 + 1.6;
    while (bx < cx + W / 2 - 2) {
      const bw = 1 + ((seedIdx * 37) % 10) / 10;
      const bh = 7.2 + ((seedIdx * 53) % 20) / 10;
      const lean = seedIdx % 7 === 3 ? 0.12 : 0;
      const book = decoBox(scene, [bw, bh, 3.6], [bx + bw / 2, shelfY + bh / 2, cz], bookColors[seedIdx % bookColors.length]);
      book.rotation.z = lean;
      bx += bw + 0.25;
      seedIdx++;
    }
  }
  // 맨 위 곰인형 (구체 조합)
  const bearMat = fabricMat(0xb98a5a, 4);
  const bear = new THREE.Group();
  const bodyS = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 12), bearMat);
  const headS = new THREE.Mesh(new THREE.SphereGeometry(1.8, 16, 12), bearMat);
  headS.position.y = 3.4;
  const earL = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), bearMat);
  earL.position.set(-1.3, 4.8, 0);
  const earR = earL.clone();
  earR.position.x = 1.3;
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), fabricMat(0xdec098, 4));
  snout.position.set(0, 3.1, 1.5);
  bear.add(bodyS, headS, earL, earR, snout);
  bear.position.set(cx - 5, H + 2.4, cz);
  bear.traverse((o) => (o.castShadow = true));
  scene.add(bear);

  // 콜라이더는 책장 전체를 하나의 박스로
  const body = world.createRigidBody(RigidBodyDesc.fixed().setTranslation(cx, H / 2, cz));
  world.createCollider(ColliderDesc.cuboid(W / 2 + 0.6, H / 2, D / 2), body);
}

function buildWardrobe(scene: THREE.Scene, world: World): void {
  // 오른쪽 벽의 옷장 (실제 2.1m ≈ 40유닛)
  const cx = 40;
  const cz = 16;
  addStaticBox(scene, world, [10, 40, 18], [cx, 20, cz], 0xf1e9d9);
  // 문 2짝 + 손잡이
  decoBox(scene, [0.6, 37, 8.2], [cx - 5.1, 19.5, cz - 4.4], 0xe7dcc6);
  decoBox(scene, [0.6, 37, 8.2], [cx - 5.1, 19.5, cz + 4.4], 0xe7dcc6);
  for (const s of [-1, 1]) {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd8b64a, metalness: 0.85, roughness: 0.35 }));
    knob.position.set(cx - 5.6, 19, cz + s * 1.2);
    scene.add(knob);
  }
  // 위에 얹힌 모자 상자
  decoBox(scene, [7, 3.5, 7], [cx - 0.5, 41.8, cz - 3], TOY_COLORS.pink);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 1.2, 20), painted(TOY_COLORS.purple));
  lid.position.set(cx - 0.5, 44, cz - 3);
  lid.castShadow = true;
  scene.add(lid);
}

function buildToyBoxOnSide(scene: THREE.Scene, world: World): void {
  // 옆으로 넘어져 내용물이 쏟아진 장난감 상자 — 안으로 걸어 들어갈 수 있다
  const cx = -32;
  const cz = 18;
  const W = 14; // 개구부 폭
  const H = 12; // 개구부 높이
  const D = 11; // 깊이
  const T = 1.2;
  const mat = painted(0xe8b04b, 0.6);

  // 바닥판(수직, 뒤쪽) / 좌우 측판 / 위판
  addStaticBox(scene, world, [W, H, T], [cx, H / 2, cz + D / 2], mat);
  addStaticBox(scene, world, [T, H, D], [cx - W / 2, H / 2, cz], mat);
  addStaticBox(scene, world, [T, H, D], [cx + W / 2, H / 2, cz], mat);
  addStaticBox(scene, world, [W + T * 2, T, D], [cx, H + T / 2, cz], mat);
  // 상자 정면 "TOYS" 간판 느낌 스티커
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 3.2),
    new THREE.MeshBasicMaterial({
      map: makeCanvasTexture(256, 104, (ctx) => {
        ctx.fillStyle = '#fdf6e8';
        ctx.fillRect(0, 0, 256, 104);
        ctx.fillStyle = '#e94f4f';
        ctx.font = 'bold 64px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TOYS', 128, 56);
      }),
    }),
  );
  label.position.set(cx, H + T + 1.8, cz);
  label.rotation.x = -Math.PI / 2;
  scene.add(label);
}

function buildFloorClutter(scene: THREE.Scene, world: World): void {
  // 알파벳 블록 (실제 어린이 블록 7cm ≈ 1.4유닛은 작아서, 점보 블록 3유닛으로)
  const letters = ['A', 'B', 'C', 'D', 'E'];
  const blockColors = [TOY_COLORS.red, TOY_COLORS.yellow, TOY_COLORS.blue, TOY_COLORS.green, TOY_COLORS.orange];
  const positions: [number, number, number, number][] = [
    // [x, y, z, rotY]
    [-10, 1.5, -12, 0.3],
    [-10.2, 4.5, -12.2, -0.2],
    [-6.5, 1.5, -10, 0.9],
    [16, 1.5, -4, -0.5],
    [27, 1.5, 4, 0.2],
  ];
  positions.forEach(([x, y, z, rotY], i) => {
    const tex = makeCanvasTexture(128, 128, (ctx) => {
      ctx.fillStyle = '#fdf6e8';
      ctx.fillRect(0, 0, 128, 128);
      ctx.strokeStyle = '#00000022';
      ctx.lineWidth = 10;
      ctx.strokeRect(8, 8, 112, 112);
      ctx.fillStyle = '#' + blockColors[i].toString(16).padStart(6, '0');
      ctx.font = 'bold 84px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letters[i], 64, 70);
    });
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
    addStaticBox(scene, world, [3, 3, 3], [x, y, z], mat, rotY);
  });

  // 거대 연필 (실제 18cm ≈ 3.4유닛 — 플레이어보다 크다)
  buildPencil(scene, world, 24, 2, 0.7);
  // 점보 크레용들
  const crayonColors = [TOY_COLORS.red, TOY_COLORS.green, TOY_COLORS.blue];
  crayonColors.forEach((c, i) => {
    const len = 3.2;
    const r = 0.34;
    const g = new THREE.Group();
    const bodyMesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), plastic(c));
    g.add(bodyMesh);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(r, 0.8, 12), plastic(c));
    tip.position.y = len / 2 + 0.4;
    g.add(tip);
    const angle = i * 0.8 - 0.6;
    g.rotation.z = Math.PI / 2;
    g.rotation.y = angle;
    g.position.set(-12 + i * 1.4, r, 26 + (i % 2) * 1.8);
    g.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    scene.add(g);
    const body = world.createRigidBody(
      RigidBodyDesc.fixed()
        .setTranslation(-12 + i * 1.4, r, 26 + (i % 2) * 1.8)
        .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, Math.PI / 2, 'YXZ'))),
    );
    world.createCollider(ColliderDesc.cylinder(len / 2 + 0.4, r), body);
  });

  // 바닥에 펼쳐진 그림책
  const openBook = new THREE.Group();
  for (const s of [-1, 1]) {
    const page = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.5, 7.5), painted(0xfdfbf4, 0.85));
    page.position.set(s * 2.7, 0.45, 0);
    page.rotation.z = s * -0.12;
    page.castShadow = true;
    openBook.add(page);
  }
  const cover = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.35, 8), painted(TOY_COLORS.green, 0.7));
  cover.position.y = 0.18;
  openBook.add(cover);
  openBook.position.set(-2, 0, -24);
  openBook.rotation.y = -0.4;
  scene.add(openBook);
  const bookBody = world.createRigidBody(
    RigidBodyDesc.fixed()
      .setTranslation(-2, 0.5, -24)
      .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.4, 0))),
  );
  world.createCollider(ColliderDesc.cuboid(5.8, 0.5, 4), bookBody);
}

function buildPencil(scene: THREE.Scene, world: World, x: number, z: number, rotY: number): void {
  const len = 3.6;
  const r = 0.2;
  const g = new THREE.Group();
  const bodyMesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), plastic(TOY_COLORS.yellow));
  g.add(bodyMesh);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, r, 0.5, 6), woodMat(TOY_COLORS.wood));
  tip.position.y = -len / 2 - 0.25;
  g.add(tip);
  const eraser = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.05, 0.3, 10), painted(TOY_COLORS.pink, 0.9));
  eraser.position.y = len / 2 + 0.15;
  g.add(eraser);
  g.rotation.z = Math.PI / 2;
  g.rotation.y = rotY;
  g.position.set(x, r, z);
  g.traverse((o) => {
    o.castShadow = true;
  });
  scene.add(g);
  const body = world.createRigidBody(
    RigidBodyDesc.fixed()
      .setTranslation(x, r, z)
      .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, Math.PI / 2, 'YXZ'))),
  );
  world.createCollider(ColliderDesc.cylinder(len / 2 + 0.3, r), body);
}

function buildPosters(scene: THREE.Scene): void {
  // 크레용 그림 포스터 (아이가 그린 해/집/구름)
  const drawing = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 12),
    new THREE.MeshBasicMaterial({
      map: makeCanvasTexture(512, 384, (ctx) => {
        ctx.fillStyle = '#fffdf5';
        ctx.fillRect(0, 0, 512, 384);
        // 해
        ctx.strokeStyle = '#f7d13e';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.arc(420, 80, 40, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(420 + Math.cos(a) * 55, 80 + Math.sin(a) * 55);
          ctx.lineTo(420 + Math.cos(a) * 80, 80 + Math.sin(a) * 80);
          ctx.stroke();
        }
        // 땅
        ctx.strokeStyle = '#5cc95c';
        ctx.beginPath();
        ctx.moveTo(10, 340);
        ctx.bezierCurveTo(150, 320, 350, 350, 500, 330);
        ctx.stroke();
        // 집
        ctx.strokeStyle = '#e94f4f';
        ctx.strokeRect(120, 200, 140, 120);
        ctx.beginPath();
        ctx.moveTo(100, 200);
        ctx.lineTo(190, 120);
        ctx.lineTo(280, 200);
        ctx.closePath();
        ctx.stroke();
        // 자동차 낙서 (게임 주제!)
        ctx.strokeStyle = '#4a8fe7';
        ctx.strokeRect(330, 270, 110, 40);
        ctx.beginPath();
        ctx.arc(355, 320, 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(415, 320, 16, 0, Math.PI * 2);
        ctx.stroke();
      }),
    }),
  );
  // 책상 위쪽 오른벽에 붙임
  drawing.position.set(ROOM_HALF_X - 1.2, 30, -14);
  drawing.rotation.y = -Math.PI / 2;
  scene.add(drawing);
  // 테이프 조각
  for (const [dz, dy] of [[-7.2, 5.4], [7.2, 5.4], [-7.2, -5.4], [7.2, -5.4]] as const) {
    const tape = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
    tape.position.set(ROOM_HALF_X - 1.3, 30 + dy, -14 + dz);
    tape.rotation.y = -Math.PI / 2;
    tape.rotation.z = 0.6;
    scene.add(tape);
  }

  // ABC 포스터 (왼쪽 벽)
  const abc = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 15),
    new THREE.MeshBasicMaterial({
      map: makeCanvasTexture(384, 480, (ctx) => {
        ctx.fillStyle = '#fef8ea';
        ctx.fillRect(0, 0, 384, 480);
        ctx.strokeStyle = '#3fc1b0';
        ctx.lineWidth = 12;
        ctx.strokeRect(10, 10, 364, 460);
        const items: [string, string, number][] = [
          ['A', '#e94f4f', 110],
          ['B', '#4a8fe7', 250],
          ['C', '#f29b3a', 390],
        ];
        ctx.font = 'bold 110px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const [ch, color, y] of items) {
          ctx.fillStyle = color;
          ctx.fillText(ch, 192, y);
        }
      }),
    }),
  );
  abc.position.set(-ROOM_HALF_X + 1.2, 28, -18);
  abc.rotation.y = Math.PI / 2;
  scene.add(abc);
}

function buildOutletAndSwitch(scene: THREE.Scene): void {
  // 콘센트 — 작아진 사람 눈높이 근처에 있는 스케일 단서
  const outlet = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(3.4, 5, 0.5), plastic(0xffffff));
  outlet.add(plate);
  for (const dy of [1.1, -1.1]) {
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.75, 14), new THREE.MeshBasicMaterial({ color: 0x3a3a40 }));
    hole.position.set(0, dy, 0.3);
    outlet.add(hole);
  }
  outlet.position.set(ROOM_HALF_X - 0.8, 4, 2);
  outlet.rotation.y = -Math.PI / 2;
  scene.add(outlet);

  // 전등 스위치 (문 옆, 실제 1.2m 높이 ≈ 23유닛)
  const sw = new THREE.Group();
  const swPlate = new THREE.Mesh(new THREE.BoxGeometry(3, 4.4, 0.5), plastic(0xffffff));
  sw.add(swPlate);
  const toggle = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 0.8), plastic(0xe8e2d4));
  toggle.position.z = 0.4;
  sw.add(toggle);
  sw.position.set(-31, 23, ROOM_HALF_Z - 1.2);
  sw.rotation.y = Math.PI;
  scene.add(sw);
}

function buildCeilingLamp(scene: THREE.Scene): void {
  const g = new THREE.Group();
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 9, 8), painted(0x4a4a52, 0.6));
  cord.position.y = -4.5;
  g.add(cord);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(6, 5, 24, 1, true), new THREE.MeshStandardMaterial({ color: TOY_COLORS.red, roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide }));
  shade.position.y = -11;
  g.add(shade);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xfff3cf }),
  );
  bulb.position.y = -13;
  g.add(bulb);
  g.position.set(0, WALL_HEIGHT, 4);
  scene.add(g);

  // 램프의 따뜻한 보조광
  const light = new THREE.PointLight(0xffe6b8, 1200, 0, 1.9);
  light.position.set(0, WALL_HEIGHT - 14, 4);
  scene.add(light);
}
