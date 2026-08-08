import * as THREE from 'three';
import { World, RigidBodyDesc, ColliderDesc } from '@dimforge/rapier3d-compat';
import { toonMaterial, TOY_COLORS } from './materials';

/** 방의 절반 크기 (전체 48m x 48m) */
export const ROOM_HALF = 24;
const WALL_HEIGHT = 9;

/**
 * 토이스토리 느낌의 "아이 방" 맵.
 * 바닥/벽 정적 콜라이더 + 장식용 대형 소품(테이블, 책 더미, 연필, 블록 아치, 러그, 창문)
 */
export function buildToyRoom(scene: THREE.Scene, world: World): void {
  buildFloorAndWalls(scene, world);
  buildRug(scene);
  buildWindows(scene);
  buildTable(scene, world, -15, -15);
  buildBookStack(scene, world, 14, -16);
  buildPencil(scene, world, -10, 12);
  buildBlockArch(scene, world, 16, 10);
  buildCrayons(scene, world, 5, -18);
}

function addStaticBox(
  scene: THREE.Scene,
  world: World,
  size: [number, number, number],
  pos: [number, number, number],
  color: number,
  rotY = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), toonMaterial(color));
  mesh.position.set(...pos);
  mesh.rotation.y = rotY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const body = world.createRigidBody(
    RigidBodyDesc.fixed().setTranslation(...pos).setRotation(
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)),
    ),
  );
  world.createCollider(ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2).setFriction(0.9), body);
  return mesh;
}

function buildFloorAndWalls(scene: THREE.Scene, world: World): void {
  const S = ROOM_HALF;

  // 바닥 — 나무 마루판 느낌으로 두 톤 줄무늬
  const floorGroup = new THREE.Group();
  const plankWidth = 3;
  for (let i = 0; i < (S * 2) / plankWidth; i++) {
    const color = i % 2 === 0 ? 0xdfae72 : 0xd4a161;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(plankWidth, 0.2, S * 2), toonMaterial(color));
    plank.position.set(-S + plankWidth / 2 + i * plankWidth, -0.1, 0);
    plank.receiveShadow = true;
    floorGroup.add(plank);
  }
  scene.add(floorGroup);
  const floorBody = world.createRigidBody(RigidBodyDesc.fixed().setTranslation(0, -0.25, 0));
  world.createCollider(ColliderDesc.cuboid(S, 0.25, S).setFriction(0.9), floorBody);

  // 벽 4면 — 파스텔 벽지 + 걸레받이
  const wallMat = toonMaterial(0xf3e3c2);
  const stripeMat = toonMaterial(0xeacfa0);
  const skirtMat = toonMaterial(0xffffff);
  const walls: { size: [number, number, number]; pos: [number, number, number] }[] = [
    { size: [S * 2, WALL_HEIGHT, 0.5], pos: [0, WALL_HEIGHT / 2, -S] },
    { size: [S * 2, WALL_HEIGHT, 0.5], pos: [0, WALL_HEIGHT / 2, S] },
    { size: [0.5, WALL_HEIGHT, S * 2], pos: [-S, WALL_HEIGHT / 2, 0] },
    { size: [0.5, WALL_HEIGHT, S * 2], pos: [S, WALL_HEIGHT / 2, 0] },
  ];
  for (const w of walls) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...w.size), wallMat);
    mesh.position.set(...w.pos);
    mesh.receiveShadow = true;
    scene.add(mesh);

    // 벽 중단 스트라이프 (장식)
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(w.size[0] === 0.5 ? 0.52 : w.size[0], 0.8, w.size[2] === 0.5 ? 0.52 : w.size[2]),
      stripeMat,
    );
    stripe.position.set(w.pos[0], 4.2, w.pos[2]);
    scene.add(stripe);

    // 걸레받이
    const skirt = new THREE.Mesh(
      new THREE.BoxGeometry(w.size[0] === 0.5 ? 0.6 : w.size[0], 0.5, w.size[2] === 0.5 ? 0.6 : w.size[2]),
      skirtMat,
    );
    skirt.position.set(w.pos[0], 0.25, w.pos[2]);
    scene.add(skirt);

    const body = world.createRigidBody(RigidBodyDesc.fixed().setTranslation(...w.pos));
    world.createCollider(ColliderDesc.cuboid(w.size[0] / 2, w.size[1] / 2, w.size[2] / 2), body);
  }
}

function buildRug(scene: THREE.Scene): void {
  // 중앙의 동그란 러그 (장식 전용, 콜라이더 없음)
  const rug = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.06, 40), toonMaterial(0x6fb7e0));
  rug.position.set(-4, 0.03, 2);
  rug.receiveShadow = true;
  scene.add(rug);
  const rugInner = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 0.07, 36), toonMaterial(0x9fd0ec));
  rugInner.position.set(-4, 0.035, 2);
  rugInner.receiveShadow = true;
  scene.add(rugInner);
}

function buildWindows(scene: THREE.Scene): void {
  // 벽에 붙는 밝은 "창문" — 낮 햇살 느낌 (장식 전용)
  const make = (x: number, z: number, rotY: number) => {
    const g = new THREE.Group();
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 4),
      new THREE.MeshBasicMaterial({ color: 0xcfeaff }),
    );
    g.add(glass);
    const frameMat = toonMaterial(TOY_COLORS.white);
    const frameSpecs: [number, number, number, number][] = [
      // [w, h, x, y]
      [6.4, 0.3, 0, 2.05],
      [6.4, 0.3, 0, -2.05],
      [0.3, 4.4, -3.05, 0],
      [0.3, 4.4, 3.05, 0],
      [0.2, 4.0, 0, 0],
      [6.0, 0.2, 0, 0],
    ];
    for (const [w, h, fx, fy] of frameSpecs) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.15), frameMat);
      bar.position.set(fx, fy, 0.05);
      g.add(bar);
    }
    g.position.set(x, 5, z);
    g.rotation.y = rotY;
    scene.add(g);
  };
  make(-8, -ROOM_HALF + 0.3, 0);
  make(10, -ROOM_HALF + 0.3, 0);
  make(ROOM_HALF - 0.3, -4, -Math.PI / 2);
}

function buildTable(scene: THREE.Scene, world: World, x: number, z: number): void {
  // 아이 방의 낮은 놀이 테이블 — 위로 점프해서 올라갈 수도 있음
  addStaticBox(scene, world, [7, 0.5, 4.5], [x, 2.5, z], TOY_COLORS.teal);
  for (const [dx, dz] of [[-3, -1.8], [3, -1.8], [-3, 1.8], [3, 1.8]] as const) {
    addStaticBox(scene, world, [0.5, 2.5, 0.5], [x + dx, 1.25, z + dz], TOY_COLORS.white);
  }
}

function buildBookStack(scene: THREE.Scene, world: World, x: number, z: number): void {
  // 거대한 그림책 더미 — 계단처럼 쌓임
  const books: [number, number, number, number, number][] = [
    // [w, h, d, y, rotY]
    [6, 0.8, 4.5, 0.4, 0.1],
    [5.4, 0.7, 4.2, 1.15, -0.15],
    [4.8, 0.7, 3.8, 1.85, 0.3],
  ];
  const colors = [TOY_COLORS.red, TOY_COLORS.green, TOY_COLORS.purple];
  books.forEach(([w, h, d, y, rotY], i) => {
    addStaticBox(scene, world, [w, h, d], [x, y, z], colors[i], rotY);
    // 책 페이지 (흰 옆면)
    const pages = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, h * 0.6, d * 0.94), toonMaterial(0xfdfbf4));
    pages.position.set(x, y + h * 0.05, z);
    pages.rotation.y = rotY;
    scene.add(pages);
  });
}

function buildPencil(scene: THREE.Scene, world: World, x: number, z: number): void {
  // 바닥에 굴러다니는 거대 연필 (장식 + 콜라이더)
  const len = 9;
  const r = 0.45;
  const group = new THREE.Group();
  const bodyMesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), toonMaterial(TOY_COLORS.yellow));
  group.add(bodyMesh);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, r, 1.2, 6), toonMaterial(TOY_COLORS.wood));
  tip.position.y = -len / 2 - 0.6;
  group.add(tip);
  const lead = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 6), toonMaterial(0x333333));
  lead.position.y = -len / 2 - 1.35;
  lead.rotation.x = Math.PI;
  group.add(lead);
  const eraser = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.05, 0.7, 12), toonMaterial(TOY_COLORS.pink));
  eraser.position.y = len / 2 + 0.35;
  group.add(eraser);

  group.rotation.z = Math.PI / 2;
  group.rotation.y = 0.4;
  group.position.set(x, r, z);
  group.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  scene.add(group);

  const body = world.createRigidBody(
    RigidBodyDesc.fixed()
      .setTranslation(x, r, z)
      .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.4, Math.PI / 2, 'YXZ'))),
  );
  world.createCollider(ColliderDesc.cylinder(len / 2 + 1, r), body);
}

function buildBlockArch(scene: THREE.Scene, world: World, x: number, z: number): void {
  // 알파벳 블록으로 만든 아치문
  addStaticBox(scene, world, [1.4, 1.4, 1.4], [x - 2, 0.7, z], TOY_COLORS.red);
  addStaticBox(scene, world, [1.4, 1.4, 1.4], [x - 2, 2.1, z], TOY_COLORS.yellow);
  addStaticBox(scene, world, [1.4, 1.4, 1.4], [x + 2, 0.7, z], TOY_COLORS.blue);
  addStaticBox(scene, world, [1.4, 1.4, 1.4], [x + 2, 2.1, z], TOY_COLORS.green);
  addStaticBox(scene, world, [5.6, 1.2, 1.5], [x, 3.4, z], TOY_COLORS.purple);
}

function buildCrayons(scene: THREE.Scene, world: World, x: number, z: number): void {
  // 흩어진 대형 크레용들
  const colors = [TOY_COLORS.red, TOY_COLORS.green, TOY_COLORS.blue, TOY_COLORS.orange];
  colors.forEach((c, i) => {
    const len = 3.2;
    const r = 0.28;
    const g = new THREE.Group();
    const bodyMesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), toonMaterial(c));
    g.add(bodyMesh);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(r, 0.7, 12), toonMaterial(c));
    tip.position.y = len / 2 + 0.35;
    g.add(tip);
    const angle = i * 0.55 - 0.8;
    g.rotation.z = Math.PI / 2;
    g.rotation.y = angle;
    g.position.set(x + i * 1.1, r, z + (i % 2) * 1.6);
    g.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    scene.add(g);

    const body = world.createRigidBody(
      RigidBodyDesc.fixed()
        .setTranslation(x + i * 1.1, r, z + (i % 2) * 1.6)
        .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, Math.PI / 2, 'YXZ'))),
    );
    world.createCollider(ColliderDesc.cylinder(len / 2 + 0.35, r), body);
  });
}
