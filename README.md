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
| 우클릭 / `Q` | 들고 있는 재료 던지기 |
| `ESC` | 일시정지 |

### 현재 구현 상태 (Phase 1)

당신은 10cm로 작아졌습니다. 거대해진 아이 방(침대, 책상, 책장, 옷장…)을 제한 시간 **2분 30초** 동안 돌아다니며 재료(블록, 판자, 바퀴, 스풀, 공…)를 주워 **셔터 달린 차고 건물**로 옮기세요. 시간이 끝나면 차고 안의 재료만 내 것이 됩니다. Phase 2(조립), Phase 3(레이싱)는 순차 업데이트 예정입니다. 자세한 로드맵은 [docs/ROADMAP.md](docs/ROADMAP.md) 참고.

## 🛠 개발

```bash
npm install
npm run dev       # 개발 서버 (http://localhost:5173)
npm run build     # 타입체크 + 프로덕션 빌드 (dist/)
npm run preview   # 빌드 결과 로컬 확인
```

### 기술 스택

- **렌더링**: [Three.js](https://threejs.org/) — 토온 셰이딩으로 토이스토리 느낌의 그래픽
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
