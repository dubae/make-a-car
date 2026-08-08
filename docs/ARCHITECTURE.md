# 아키텍처 — Make A Car

## 기술 스택과 선택 이유

| 영역 | 선택 | 이유 |
| --- | --- | --- |
| 렌더링 | **Three.js** | 웹 표준 WebGL 렌더러. PBR(Standard/Physical 머티리얼) + ACES 톤매핑 + HDRI 환경광으로 사실적인 룩 구현 |
| 물리 | **Rapier** (`@dimforge/rapier3d-compat`) | Rust→WASM 고성능 물리. Phase 1(강체 파밍)부터 Phase 3(차량/조인트)까지 하나의 엔진으로 커버. `-compat` 패키지는 WASM을 base64 인라인하여 GitHub Pages 정적 호스팅에 별도 설정이 필요 없음 |
| 빌드 | **Vite + TypeScript** | 즉시 시작되는 개발 서버, 정적 빌드. `base: './'`로 어느 하위 경로에서든 동작 |
| UI | **DOM 오버레이** | HUD/메뉴는 캔버스 위 HTML로 처리 — 한글 텍스트, 접근성, 스타일링이 쉬움 |

지오메트리는 프리미티브 + 코드 생성이지만, 재질은 [Poly Haven](https://polyhaven.com/)의 **CC0 실사 PBR 텍스처**(라미네이트 마루, 페인트 벽, 직물, 콘크리트, 오크 원목)와 **HDRI 환경맵**(lebombo)을 사용한다. CC0라 상업적 이용·재배포에 제한이 없고 출처 표기 의무도 없다. 텍스처는 `public/textures/`, HDRI는 `public/hdri/`에 저장되어 저장소에 포함된다.

머티리얼 팩토리(`materials.ts`): `plastic`(광택 사출 플라스틱 — clearcoat), `woodMat`(오크 결), `fabricMat`(직물 요철, 단색), `plaidMat`(체크무늬 직물), `wallMat`(페인트 요철, 단색), `floorMat`, `concreteMat`, `rubber`, `painted`. 벽/직물은 diffuse 곱셈으로 색이 탁해지지 않도록 **노멀/러프니스맵만 쓰고 색은 단색으로 제어**한다.

## 모듈 구조

```
src/
├── main.ts                  # RAPIER.init() 후 Game 기동
├── core/
│   ├── Game.ts              # 씬/카메라/조명/물리월드 생성, 메인 루프, HUD 연결
│   ├── Input.ts             # 키보드 + 포인터락 마우스 입력 (프레임 단위 수집)
│   └── rng.ts               # 시드 난수 (맵 배치 재현 가능)
├── world/
│   ├── assets.ts            # PBR 텍스처 + HDRI 로더 (Poly Haven CC0)
│   ├── materials.ts         # PBR 머티리얼 팩토리, 장난감 색 팔레트
│   ├── ToyRoomMap.ts        # 정적 맵: "작아진 사람" 스케일의 실제 아이 방 (1m ≈ 19유닛)
│   ├── ToyParts.ts          # 파츠 카탈로그 + 스포너. ToyPart = Three 메시 + Rapier 강체
│   └── Garage.ts            # 차고지 영역(비주얼 + 포함 판정 + 수집 집계)
├── player/
│   ├── PlayerController.ts  # 키네마틱 캐릭터 컨트롤러 (걷기/달리기/점프/시점)
│   └── Grabber.ts           # 시선 레이캐스트 → 잡기/들기/놓기/던지기
├── game/
│   └── PhaseManager.ts      # ready→playing→paused→ended 상태 머신 + 타이머
└── ui/
    └── Hud.ts               # 타이머/카운트/힌트/오버레이 DOM 제어
```

## 핵심 설계 결정

### 물리-렌더 동기화
- 매 프레임: `입력 → 플레이어 이동 계산 → world.step() → 메시/카메라를 물리 위치로 동기화 → 렌더`
- 파츠는 Rapier 강체가 **소스 오브 트루스**이고 Three 메시는 그것을 따라간다 (`ToyPart.syncMesh`).

### 플레이어 = 키네마틱 캐릭터 컨트롤러
- `KinematicCharacterController` 사용: 계단 오르기(autostep), 경사면, 지면 스냅 지원.
- `setApplyImpulsesToDynamicBodies(true)` — 걸어가며 장난감을 밀치는 상호작용이 공짜로 생긴다.
- 중력/점프는 수직 속도를 직접 적분(다이내믹 강체로 만들면 시점 조작감이 나빠짐).

### 줍기 = 속도 기반 홀드 (그래비티건 방식)
- 잡은 물체를 키네마틱으로 바꾸지 않는다. **중력만 끄고, 매 프레임 목표 지점(카메라 앞)으로 향하는 속도를 세팅**한다.
- 장점: 들고 있는 물체가 **벽/다른 물체를 뚫지 않고** 자연스럽게 부딪힌다. 벽 뒤로 끼면 일정 거리 이상에서 자동으로 놓친다.

### 차고지 판정
- 차고지는 센서 콜라이더 대신 **AABB 포함 판정**(`Garage.contains`)으로 처리 — 종료 시점 스냅샷 판정이라는 게임 규칙과 정확히 일치하고, 멀티플레이 "훔치기"도 같은 규칙으로 성립한다.

### 결정적 맵 배치
- 파츠 배치는 시드 난수(`mulberry32`) 기반 — 모든 플레이어(그리고 디버깅)가 같은 배치를 본다. 멀티플레이 전환 시 서버가 시드만 공유하면 된다.

## Phase 2/3 확장 계획

- **Phase 2 (조립)**: 잡은 파츠를 차체의 **소켓(스냅 포인트)** 근처로 가져가면 하이라이트 → 놓으면 `FixedJoint`/`RevoluteJoint`로 부착. 모터 4개는 차체에 고정, 바퀴 파츠는 모터 축에 `RevoluteJoint`로 연결.
- **Phase 3 (레이싱)**: 모터 = 조인트 `configureMotorVelocity` (전 차량 동일 토크). 차량 성능 차이는 물리엔진이 파츠 질량/형상에서 자동으로 만들어낸다. 카메라는 3인칭 추적으로 전환.
- **멀티플레이**: 시드 공유 + 상태 스냅샷 동기화(WebSocket). 물리는 서버 권위 또는 락스텝 검토.

## 맵 스케일

플레이어 키 1.9유닛 ≈ **10cm**로 가정한다 (실제 1m ≈ 19유닛). 방은 4.7m × 3.7m × 천장 2.6m → 90 × 70 × 50유닛. 침대 밑으로 걸어 들어가고, 의자에는 점프해도 못 올라가는 "작아진 사람" 스케일감이 나온다. 침대/책상+의자/책장/옷장/쏟아진 장난감 상자/방문/창문/천장 조명 등 실제 가구를 배치했고, 차고지는 셔터·박공지붕·간판이 있는 차고 건물이다.

## 성능 노트

- 동적 강체 ~90개 + 정적 콜라이더 ~50개 — 데스크톱 브라우저에서 충분히 가벼움.
- 그림자 맵 4096² 1장(태양광), `setPixelRatio ≤ 2` 제한.
- 번들 약 2.5MB (Rapier WASM base64 포함), gzip 전송 시 약 890KB.
