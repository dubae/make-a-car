import * as THREE from 'three';
import { World, RigidBodyDesc, ColliderDesc } from '@dimforge/rapier3d-compat';
import { plastic } from './materials';
import { ToyPart } from './ToyParts';

/**
 * Phase 2에서 기본 지급되는 모터 파츠.
 * 하우징(파란 박스) + 은색 캡 + 빨간 축(로컬 +X 방향).
 * Phase 3에서 축에 붙은 파츠가 바퀴로 회전한다 — 회전축은 모터 로컬 +X.
 */
export function spawnMotors(scene: THREE.Scene, world: World, positions: THREE.Vector3[]): ToyPart[] {
  return positions.map((pos) => {
    const group = new THREE.Group();

    const housing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.1), plastic(0x51678f));
    group.add(housing);
    // 상단 볼트 장식
    for (const [dx, dz] of [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]] as const) {
      const bolt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.12, 8),
        new THREE.MeshStandardMaterial({ color: 0xb9bcc4, metalness: 0.8, roughness: 0.4 }),
      );
      bolt.position.set(dx, 0.6, dz);
      group.add(bolt);
    }
    // 은색 캡 (+X)
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.44, 0.44, 0.18, 18),
      new THREE.MeshStandardMaterial({ color: 0xcfd2d8, metalness: 0.85, roughness: 0.3 }),
    );
    cap.rotation.z = Math.PI / 2;
    cap.position.set(0.78, 0, 0);
    group.add(cap);
    // 빨간 축 (+X) — 여기에 바퀴 역할 파츠를 붙인다
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.9, 12), plastic(0xd8493f));
    axle.rotation.z = Math.PI / 2;
    axle.position.set(1.28, 0, 0);
    group.add(axle);

    group.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    scene.add(group);

    const body = world.createRigidBody(
      RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setLinearDamping(0.3)
        .setAngularDamping(0.5),
    );
    const housingCol = world.createCollider(
      ColliderDesc.cuboid(0.7, 0.55, 0.55).setDensity(1.2).setFriction(0.7),
      body,
    );
    const axleRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
    const axleCol = world.createCollider(
      ColliderDesc.cylinder(0.53, 0.17)
        .setTranslation(1.23, 0, 0)
        .setRotation({ x: axleRot.x, y: axleRot.y, z: axleRot.z, w: axleRot.w })
        .setDensity(1.0)
        .setFriction(0.7),
      body,
    );

    return new ToyPart('모터', group, body, [housingCol.handle, axleCol.handle], {
      shape: 'motor',
      size: [1.4, 1.1, 1.1],
      color: 0x51678f,
      isMotor: true,
    });
  });
}
