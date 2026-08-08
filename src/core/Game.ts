import * as THREE from 'three';
import { World } from '@dimforge/rapier3d-compat';
import { Input } from './Input';
import { Hud } from '../ui/Hud';
import { PhaseManager } from '../game/PhaseManager';
import { buildToyRoom } from '../world/ToyRoomMap';
import { spawnToyParts, ToyPart } from '../world/ToyParts';
import { Garage } from '../world/Garage';
import { PlayerController } from '../player/PlayerController';
import { Grabber } from '../player/Grabber';

const GARAGE_POS = new THREE.Vector3(0, 0, 19);
const SPAWN_POS = new THREE.Vector3(0, 1.6, 14);

/** 렌더링 + 물리 + 게임 로직을 묶는 메인 클래스 */
export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private world: World;

  private input: Input;
  private hud = new Hud();
  private phase = new PhaseManager();

  private parts: ToyPart[];
  private partsByCollider = new Map<number, ToyPart>();
  private garage: Garage;
  private player: PlayerController;
  private grabber: Grabber;

  private lastTime = 0;

  constructor() {
    // --- 렌더러 / 카메라 ---
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
    this.scene.background = new THREE.Color(0xbfe3f2);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // --- 조명 ---
    this.setupLights();

    // --- 물리 월드 + 맵 ---
    this.world = new World({ x: 0, y: -9.81, z: 0 });
    buildToyRoom(this.scene, this.world);

    this.garage = new Garage(this.scene, GARAGE_POS);
    this.parts = spawnToyParts(this.scene, this.world, {
      radius: 21,
      exclude: [
        { x: GARAGE_POS.x, z: GARAGE_POS.z, radius: 6.5 },
        { x: SPAWN_POS.x, z: SPAWN_POS.z, radius: 3 },
      ],
    });
    for (const p of this.parts) this.partsByCollider.set(p.colliderHandle, p);

    // --- 플레이어 ---
    this.input = new Input(this.renderer.domElement);
    this.player = new PlayerController(this.world, SPAWN_POS);
    this.grabber = new Grabber(this.world, this.camera, this.player.body, this.partsByCollider);

    // 시작 전에도 방이 보이도록 카메라 초기 위치 설정
    this.player.syncCamera(this.camera);

    this.wireUi();
  }

  private setupLights(): void {
    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0xffe0b8, 0.9);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
    sun.position.set(18, 30, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    sun.shadow.camera.far = 80;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    const fill = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(fill);
  }

  private wireUi(): void {
    this.hud.onStart = () => {
      this.hud.hideStart();
      this.phase.start();
      this.input.requestLock();
    };
    this.hud.onResume = () => this.input.requestLock();

    // 포인터락 해제(ESC) → 일시정지, 재획득 → 재개
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      if (!locked && this.phase.state === 'playing') {
        this.phase.pause();
        this.hud.showPause(true);
      } else if (locked && this.phase.state === 'paused') {
        this.phase.resume();
        this.hud.showPause(false);
      }
    });
    // 일시정지 화면 아무 곳이나 클릭해도 재개
    document.getElementById('pause-screen')!.addEventListener('click', () => {
      if (this.phase.state === 'paused') this.input.requestLock();
    });

    this.phase.onEnded = () => this.endPhase1();
  }

  private endPhase1(): void {
    this.grabber.forceRelease();
    document.exitPointerLock();
    this.hud.showPause(false);

    const collected = this.garage.collect(this.parts);
    const breakdown = new Map<string, number>();
    for (const p of collected) breakdown.set(p.name, (breakdown.get(p.name) ?? 0) + 1);
    this.hud.showResult(collected.length, breakdown);
  }

  start(): void {
    this.hud.hideLoading();
    this.hud.showStart();
    this.lastTime = performance.now();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  private tick(): void {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 1 / 30);
    this.lastTime = now;

    if (this.phase.state === 'playing') {
      this.phase.update(dt);

      this.player.update(dt, this.input);
      this.grabber.update(dt, this.input);

      this.world.timestep = dt;
      this.world.step();

      this.player.syncCamera(this.camera);
      for (const p of this.parts) p.syncMesh();
      this.garage.update(dt);

      this.updateHud();
    }

    this.input.consumeFrame();
    this.renderer.render(this.scene, this.camera);
  }

  private updateHud(): void {
    this.hud.setTimer(this.phase.remaining);
    this.hud.setGarageCount(this.garage.collect(this.parts).length);
    this.hud.setCrosshairTarget(this.grabber.hoveredPart !== null);

    if (this.grabber.heldPart) {
      this.hud.setHint(
        `<b>${this.grabber.heldPart.name}</b> 들고 있음 — <kbd>클릭</kbd> 놓기 · <kbd>우클릭</kbd> 던지기`,
      );
    } else if (this.grabber.hoveredPart) {
      this.hud.setHint(`<kbd>클릭</kbd> 또는 <kbd>E</kbd> — <b>${this.grabber.hoveredPart.name}</b> 줍기`);
    } else {
      this.hud.setHint('재료를 주워서 <b style="color:#ffd93d">노란 차고지</b>에 모으세요!');
    }
  }
}
