# 🚗 Make A Car

> **주변의 장난감을 파밍해서 나만의 자동차를 만들고, 그 차로 레이싱하는 웹 게임**

토이스토리 같은 장난감 방에서 재료를 모으고(Phase 1), 모은 재료로 자동차를 조립하고(Phase 2), 완성한 차로 레이싱(Phase 3)합니다. 바퀴가 꼭 동그랄 필요는 없습니다 — 네모난 블록도 바퀴가 될 수 있어요. **유저의 상상력이 핵심**입니다.

## 🎮 플레이

- **웹에서 바로 플레이**: https://<GITHUB_USERNAME>.github.io/makeacar/
  - `main` 브랜치에 푸시하면 GitHub Actions가 자동으로 GitHub Pages에 배포합니다.
  - 저장소 설정에서 **Settings → Pages → Source: GitHub Actions** 를 한 번 선택해 주세요.
- 별도 설치/라이선스 없이 브라우저(데스크톱 Chrome/Edge/Safari/Firefox)에서 실행됩니다.

### 조작법

| 입력 | 동작 |
| --- | --- |
| `W` `A` `S` `D` | 이동 |
| 마우스 | 시점 (1인칭) |
| `Shift` | 달리기 |
| `Space` | 점프 |
| 좌클릭 / `E` | 재료 줍기 · 놓기 |
| 우클릭 | (파밍) 던지기 · (조립) **부착** |
| `Q` | 던지기 |
| `Z` `X` `C` | (조립) 든 파츠를 시점 기준 90° 회전 |
| `R` | (조립) 파츠 분해 — 조준하거나 든 상태 |
| `W`/`S` + `A`/`D` | (레이싱) 가속·후진 + 조향 |
| `Enter` | (레이싱) 중도 포기 |
| `ESC` | 일시정지 |

### 현재 구현 상태 (Phase 1 · 2 · 3 전체 루프)

**Phase 1 — 파밍 (150초)**: 당신은 10cm로 작아졌습니다. 거대해진 아이 방(침대, 책상, 책장, 옷장…)을 돌아다니며 재료(블록, 판자, 바퀴, 스풀, 공…)를 주워 **셔터 달린 차고 건물**로 옮기세요. 시간이 끝나면 차고 안의 재료만 내 것이 됩니다.

**Phase 2 — 조립 (2분)**: 차고로 순간이동되고 셔터가 닫힙니다. **개별 모터 4개 + 얇은 차축 모터 2개(양 끝에 바퀴 장착, 앞/뒤 차축용) 기본 지급**! 파츠를 들고 다른 파츠에 가까이 대면 초록색 부착 후보가 표시되고, 우클릭으로 붙입니다(`R`로 분해, `Z`/`X`/`C`로 90° 회전). 몸체에 모터를 달고 **모터의 빨간 축에 바퀴 역할 파츠**를 다세요.

**Phase 3 — 레이싱**: 셔터가 열리고 차가 방 중앙 출발점에 놓입니다. 3인칭 시점으로 `W`/`S` 가속, `A`/`D` 조향 — 모터에 붙인 파츠가 **실제 물리로 회전하며** 차를 밉니다. 모터 출력은 모두 동일하므로 차의 무게와 바퀴 모양이 기록을 가릅니다. 방을 한 바퀴 도는 게이트 4개를 순서대로 통과하면 완주!

자세한 로드맵은 [docs/ROADMAP.md](docs/ROADMAP.md) 참고.

## 🛠 개발

```bash
npm install
npm run dev       # 개발 서버 (http://localhost:5173)
npm run build     # 타입체크 + 프로덕션 빌드 (dist/)
npm run preview   # 빌드 결과 로컬 확인
```

페이즈별 바로 테스트: `?p1=초&p2=초`(타이머 단축), `?phase=2`(재료가 준비된 조립부터), `?phase=3`(표준 4륜차로 바로 레이싱).

### 기술 스택

- **렌더링**: [Three.js](https://threejs.org/) — PBR(물리 기반 렌더링) + ACES 톤매핑 + HDRI 환경광. 바닥/벽/직물/콘크리트/원목은 [Poly Haven](https://polyhaven.com/)의 CC0 실사 텍스처 사용
- **물리**: [Rapier](https://rapier.rs/) (WASM) — 파츠 강체 시뮬레이션, 캐릭터 컨트롤러, 이후 차량 물리까지 동일 엔진 사용
- **빌드**: Vite + TypeScript

구조와 설계 결정은 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), 게임 기획은 [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) 참고.

## 📁 프로젝트 구조

```
src/
├── main.ts              # 진입점 (Rapier WASM 초기화)
├── core/                # Game 루프, 입력(포인터락)
├── world/               # 장난감 방 맵, 파밍 파츠, 차고지
├── player/              # 1인칭 컨트롤러, 물건 줍기(Grabber)
├── game/                # 페이즈 상태 머신
└── ui/                  # DOM 기반 HUD
docs/                    # 기획/설계/로드맵 문서
.github/workflows/       # GitHub Pages 자동 배포
```

## 📦 배포 (GitHub Pages)

1. GitHub에 저장소를 만들고 push
2. **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정
3. `main`에 푸시할 때마다 [deploy.yml](.github/workflows/deploy.yml)이 빌드 후 자동 배포

빌드 산출물은 상대 경로(`base: './'`)를 사용하므로 어떤 하위 경로에서도 동작합니다.
