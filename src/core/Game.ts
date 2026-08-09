import * as THREE from 'three';
import { World } from '@dimforge/rapier3d-compat';
import { Input } from './Input';
import { Hud } from '../ui/Hud';
import { PhaseManager } from '../game/PhaseManager';
import { Assembly } from '../game/Assembly';
import { RaceManager } from '../game/RaceManager';
import { spawnMotors, spawnAxleMotors } from '../world/Motor';
import { buildToyRoom } from '../world/ToyRoomMap';
import { spawnToyParts, ToyPart } from '../world/ToyParts';
import { Garage } from '../world/Garage';
import { loadAssets, environment } from '../world/assets';
import { PlayerController } from '../player/PlayerController';
import { Grabber } from '../player/Grabber';

const GARAGE_POS = new THREE.Vector3(24, 0, 24);
const SPAWN_POS = new THREE.Vector3(8, 1.6, 16);

/** 렌더링 + 물리 + 게임 로직을 묶는 메인 클래스 */
export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private world!: World;

  private input!: Input;
  private hud = new Hud();
  private phase = new PhaseManager();

  private parts!: ToyPart[];
  private partsByCollider = new Map<number, ToyPart>();
  private garage!: Garage;
  private player!: PlayerController;
  private grabber!: Grabber;
  private assembly!: Assembly;
  private race: RaceManager | null = null;

  private lastTime = 0;
  private accumulator = 0;
  /** URL ?phase=2|3 — 해당 페이즈로 바로 진입 (테스트용) */
  private debugPhase = 0;

  constructor() {
    // --- 렌더러 / 카메라 ---
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    document.body.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 300);
    this.scene.background = new THREE.Color(0xbfe3f2);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // --- 조명 ---
    this.setupLights();
  }

  /** PBR 텍스처/HDRI 로드 후 월드를 구축한다 (렌더링 시작 전 1회) */
  async init(): Promise<void> {
    await loadAssets(this.renderer);
    // HDRI 환경맵 — 부드러운 실내 간접광과 재질 반사
    this.scene.environment = environment();
    this.scene.environmentIntensity = 0.55;

    // --- 물리 월드 + 맵 ---
    this.world = new World({ x: 0, y: -9.81, z: 0 });
    this.world.numSolverIterations = 8; // 용접 조인트 안정화
    buildToyRoom(this.scene, this.world);

    this.garage = new Garage(this.scene, this.world, GARAGE_POS);
    this.parts = spawnToyParts(this.scene, this.world, {
      bounds: { minX: -41, maxX: 41, minZ: -31, maxZ: 31 },
      exclude: [
        { x: GARAGE_POS.x, z: GARAGE_POS.z, radius: 13.5 }, // 차고지 건물
        { x: SPAWN_POS.x, z: SPAWN_POS.z, radius: 4 }, // 플레이어 스폰
        { x: 2, z: 32, radius: 13 }, // 책장
        { x: 40, z: 16, radius: 12 }, // 옷장
      ],
      clusters: [
        { x: -32, z: 16, radius: 3.5, count: 10 }, // 쏟아진 장난감 상자 안
      ],
    });
    this.registerParts(this.parts);
    this.assembly = new Assembly(this.world);

    // 개발/시연용 타이머 오버라이드 (예: ?p1=5&p2=30) + 페이즈 직행 (?phase=2|3)
    const qp = new URLSearchParams(location.search);
    const p1 = Number(qp.get('p1'));
    const p2 = Number(qp.get('p2'));
    if (p1 > 0) this.phase.phase1Duration = p1;
    if (p2 > 0) this.phase.phase2Duration = p2;
    this.debugPhase = Number(qp.get('phase')) || 0;

    // --- 플레이어 ---
    this.input = new Input(this.renderer.domElement);
    this.player = new PlayerController(this.world, SPAWN_POS);
    this.grabber = new Grabber(this.world, this.camera, this.player.body, this.partsByCollider);

    // 시작 전에도 방이 보이도록 카메라 초기 위치 설정
    this.player.syncCamera(this.camera);

    this.wireUi();

    // 개발자 콘솔/E2E 테스트용 훅
    (window as unknown as Record<string, unknown>).__game = this;
  }

  private setupLights(): void {
    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0xffe0b8, 0.15);
    this.scene.add(hemi);

    // 창문(뒷벽) 쪽에서 들어오는 오후 햇살
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.7);
    sun.position.set(-25, 65, -50);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    sun.shadow.camera.far = 200;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);

    const fill = new THREE.AmbientLight(0xffffff, 0.06);
    this.scene.add(fill);
  }

  private registerParts(parts: ToyPart[]): void {
    for (const p of parts) {
      for (const h of p.colliderHandles) this.partsByCollider.set(h, p);
    }
  }

  private removePart(p: ToyPart): void {
    this.scene.remove(p.mesh);
    this.world.removeRigidBody(p.body);
    for (const h of p.colliderHandles) this.partsByCollider.delete(h);
  }

  private wireUi(): void {
    this.hud.onStart = () => {
      this.hud.hideStart();
      if (this.debugPhase >= 2) {
        // 페이즈 직행: 대표 파츠들을 차고에 넣고 바로 조립/레이싱으로
        this.stockGarageForDebug();
        this.startPhase2();
        if (this.debugPhase >= 3) {
          this.buildDebugCar();
          this.startPhase3();
        }
        return;
      }
      this.phase.startPhase1();
      this.input.requestLock();
    };
    this.hud.onAssembleStart = () => {
      this.hud.hideInterlude();
      this.startPhase2();
    };
    this.hud.onRaceStart = () => {
      this.hud.hideRaceScreen();
      this.startPhase3();
    };
    this.hud.onResume = () => this.input.requestLock();

    // 포인터락 해제(ESC) → 일시정지, 재획득 → 재개
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      if (!locked && this.phase.inTimedPhase && !this.phase.paused) {
        this.phase.pause();
        this.hud.showPause(true);
      } else if (locked && this.phase.paused) {
        this.phase.resume();
        this.hud.showPause(false);
      }
    });
    // 일시정지 화면 아무 곳이나 클릭해도 재개
    document.getElementById('pause-screen')!.addEventListener('click', () => {
      if (this.phase.paused) this.input.requestLock();
    });
    // 레이싱 중 화면 클릭 → 마우스 시점 조절 활성화 (포인터락)
    this.renderer.domElement.addEventListener('click', () => {
      if (this.phase.phase === 'phase3') this.input.requestLock();
    });

    this.phase.onPhase1End = () => this.endPhase1();
    this.phase.onPhase2End = () => this.endPhase2();
  }

  /** Phase 1 종료 — 결과 요약을 보여주고 조립 시작을 기다린다 */
  private endPhase1(): void {
    this.grabber.forceRelease();
    document.exitPointerLock();
    this.hud.showPause(false);
    const collected = this.garage.collect(this.parts);
    this.hud.showInterlude(collected.length, this.phase.phase2Duration);
  }

  /** (?phase=2|3) 대표 파츠 셋을 차고 안으로 옮겨 조립 테스트를 바로 시작할 수 있게 */
  private stockGarageForDebug(): void {
    const picks: [string, number][] = [
      ['대형 차체 블록', 1],
      ['장난감 바퀴', 6],
      ['나무 판자', 2],
      ['나무 블록', 2],
      ['고무공', 2],
      ['실패(스풀)', 2],
    ];
    const { x: cx, z: cz } = this.garage.center;
    let i = 0;
    for (const [name, count] of picks) {
      for (const p of this.parts.filter((q) => q.name === name).slice(0, count)) {
        // 차고 내부 판정 범위(|dx|≤6.7, z≤cz+4.9) 안에 들어오는 그리드
        p.body.setTranslation(
          { x: cx - 5 + (i % 5) * 2.5, y: 1.5, z: cz + 0.5 + Math.floor(i / 5) * 1.9 },
          true,
        );
        p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        i++;
      }
    }
  }

  /** (?phase=3) 표준 4륜차를 자동 조립 — 차체 블록 + 개별 모터 4 + 바퀴 4 */
  private buildDebugCar(): void {
    const block = this.parts.find((p) => p.name === '대형 차체 블록');
    const motors = this.parts.filter((p) => p.name === '모터').slice(0, 4);
    const wheels = this.parts.filter((p) => p.name === '장난감 바퀴').slice(0, 4);
    if (!block || motors.length < 4 || wheels.length < 4) return;

    const { x: cx, z: cz } = this.garage.center;
    const identity = { x: 0, y: 0, z: 0, w: 1 };
    const yawPi = { x: 0, y: 1, z: 0, w: 0 };
    const zRot90 = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };

    const place = (p: ToyPart, x: number, z: number, rot: { x: number; y: number; z: number; w: number }) => {
      p.body.setRotation(rot, true);
      p.body.setTranslation({ x, y: 3, z }, true);
      p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    };
    place(block, cx, cz, identity);
    const mx = [cx + 1.8, cx + 1.8, cx - 1.8, cx - 1.8];
    const mz = [cz - 1, cz + 1, cz - 1, cz + 1];
    motors.forEach((m, i) => place(m, mx[i], mz[i], i < 2 ? identity : yawPi));
    const wx = [cx + 3.75, cx + 3.75, cx - 3.75, cx - 3.75];
    wheels.forEach((w, i) => place(w, wx[i], mz[i], zRot90));

    for (const m of motors) this.assembly.weld(m, block);
    wheels.forEach((w, i) => this.assembly.weld(w, motors[i]));
  }

  /** Phase 2 시작 — 차고로 이동, 셔터 닫기, 밖의 파츠 제거, 모터 4개 지급 */
  private startPhase2(): void {
    const collected = new Set(this.garage.collect(this.parts));
    for (const p of this.parts) {
      if (!collected.has(p)) this.removePart(p);
    }
    this.parts = [...collected];

    // 기본 지급: 개별 모터 4개 + 차축 모터 2개 (앞/뒤 차축용 — 원하는 쪽을 쓰면 된다)
    const { x: gx, z: gz } = this.garage.center;
    const motors = [
      ...spawnMotors(this.scene, this.world, this.garage.motorSpawnPoints()),
      ...spawnAxleMotors(this.scene, this.world, [
        new THREE.Vector3(gx, 1.0, gz + 2.4),
        new THREE.Vector3(gx, 1.0, gz + 5.0),
      ]),
    ];
    this.parts.push(...motors);
    this.registerParts(motors);

    this.player.teleport(this.garage.interiorSpawnPoint(), Math.PI);
    this.garage.closeShutter();
    this.grabber.enableAssembly(this.assembly, () => this.parts);

    this.phase.startPhase2();
    this.hud.setPhaseLabel('PHASE 2 · 자동차 조립');
    this.hud.showGarageCounter(false);
    this.input.requestLock();
  }

  /** Phase 2 종료 — 조립 결과 저장 + 레이싱 안내 화면 */
  private endPhase2(): void {
    this.grabber.forceRelease();
    document.exitPointerLock();
    this.hud.showPause(false);

    const stats = this.assembly.stats(this.parts);
    try {
      localStorage.setItem('makeacar.car', JSON.stringify(this.assembly.serialize(this.parts)));
    } catch {
      // 저장 실패해도 게임 진행에는 지장 없음
    }
    this.hud.showRaceScreen(stats.partsInCar, stats.motorsUsed, stats.wheelsOnMotors);
  }

  /** Phase 3 시작 — 차 재구성, 출발선 이동, 3인칭 레이싱 */
  private startPhase3(): void {
    this.garage.openShutter();
    this.race = new RaceManager(this.scene, this.world, this.assembly, this.parts);
    this.race.buildCar();
    this.race.onFinish = () => this.endPhase3(true);

    this.phase.startPhase3();
    this.hud.setPhaseLabel('PHASE 3 · 레이싱');
    this.hud.showGarageCounter(false);
    // 3인칭 주행은 포인터락이 필요 없다 (키보드 전용)
  }

  /** Phase 3 종료 — 완주 또는 포기 */
  private endPhase3(finished: boolean): void {
    if (!this.race) return;
    this.race.stop();
    this.phase.phase = 'ended';
    this.hud.showRaceResult(
      finished,
      this.race.time,
      this.race.currentGate,
      this.race.gates.length,
    );
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

    if (this.phase.running) {
      this.phase.update(dt);

      if (this.phase.phase === 'phase3' && this.race) {
        this.race.update(dt, this.input, this.camera);
        if (this.input.justPressed('Enter') && !this.race.finished) this.endPhase3(false);
      } else {
        this.player.update(dt, this.input);
        this.grabber.update(dt, this.input);
      }

      // 고정 타임스텝 — 가변 스텝은 접촉 잔진동(바닥 침투 떨림)의 원인
      const FIXED = 1 / 60;
      this.world.timestep = FIXED;
      this.accumulator = Math.min(this.accumulator + dt, FIXED * 3);
      while (this.accumulator >= FIXED) {
        this.world.step();
        this.accumulator -= FIXED;
      }

      if (this.phase.phase !== 'phase3') this.player.syncCamera(this.camera);
      for (const p of this.parts) p.syncMesh();
      this.garage.update(dt);

      this.updateHud();
    }

    this.input.consumeFrame();
    this.renderer.render(this.scene, this.camera);
  }

  private updateHud(): void {
    this.hud.setTimer(this.phase.remaining);

    if (this.phase.phase === 'phase3' && this.race) {
      this.hud.setCrosshairTarget(false);
      this.hud.setHint(
        `게이트 <b style="color:#ffd93d">${this.race.currentGate}/${this.race.gates.length}</b> · <kbd>W</kbd>/<kbd>S</kbd> 가속 · <kbd>A</kbd>/<kbd>D</kbd> 조향 · <kbd>클릭</kbd> 마우스 시점 · <kbd>Enter</kbd> 포기`,
      );
      return;
    }

    this.hud.setCrosshairTarget(this.grabber.hoveredPart !== null || this.grabber.attachCandidate !== null);

    if (this.phase.phase === 'phase2') {
      this.updateAssemblyHint();
      return;
    }

    this.hud.setGarageCount(this.garage.collect(this.parts).length);
    if (this.grabber.heldPart) {
      this.hud.setHint(
        `<b>${this.grabber.heldPart.name}</b> 들고 있음 — <kbd>클릭</kbd> 놓기 · <kbd>우클릭</kbd> 던지기`,
      );
    } else if (this.grabber.hoveredPart) {
      this.hud.setHint(`<kbd>클릭</kbd> 또는 <kbd>E</kbd> — <b>${this.grabber.hoveredPart.name}</b> 줍기`);
    } else {
      this.hud.setHint('재료를 주워서 <b style="color:#ffd93d">차고지 건물</b>에 모으세요!');
    }
  }

  private updateAssemblyHint(): void {
    const held = this.grabber.heldPart;
    const candidate = this.grabber.attachCandidate;
    const hovered = this.grabber.hoveredPart;

    if (held && candidate) {
      this.hud.setHint(
        `<kbd>우클릭</kbd> — <b style="color:#6ee76e">${candidate.name}</b>에 부착! · <kbd>Z</kbd>/<kbd>X</kbd>/<kbd>C</kbd> 회전`,
      );
    } else if (held && this.assembly.isBonded(held)) {
      this.hud.setHint(
        `<b>${held.name}</b> (결합체 끌기) — <kbd>R</kbd> 이 파츠만 분해 · <kbd>클릭</kbd> 내려놓기`,
      );
    } else if (held) {
      this.hud.setHint(
        `<b>${held.name}</b> — <kbd>우클릭</kbd> 부착 · <kbd>Z</kbd>/<kbd>X</kbd>/<kbd>C</kbd> 90° 회전 · <kbd>클릭</kbd> 놓기`,
      );
    } else if (hovered && this.assembly.isBonded(hovered)) {
      this.hud.setHint(`<kbd>클릭</kbd>/<kbd>E</kbd> 들기 · <kbd>R</kbd> <b>${hovered.name}</b> 분해`);
    } else if (hovered) {
      this.hud.setHint(`<kbd>클릭</kbd> 또는 <kbd>E</kbd> — <b>${hovered.name}</b> 들기`);
    } else {
      this.hud.setHint('파츠를 붙여 차를 만드세요! <b>모터의 빨간 축</b>에 바퀴 파츠를 달아야 굴러갑니다');
    }
  }
}
