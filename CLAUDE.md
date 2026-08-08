# Make A Car — 개발 가이드

파밍→조립→레이싱 3페이즈 웹 게임. 기획: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md), 구조: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), 진행 상황: [docs/ROADMAP.md](docs/ROADMAP.md)

## 명령어

```bash
npm run dev        # 개발 서버
npm run build      # tsc --noEmit + vite build (커밋 전 필수 통과)
npm run typecheck  # 타입체크만
```

## 컨벤션

- 스택: Three.js(PBR + ACES 톤매핑 + HDRI 환경광) + Rapier WASM(`@dimforge/rapier3d-compat`) + Vite/TS. 지오메트리는 프리미티브, 재질은 Poly Haven CC0 텍스처(`public/textures/`, `public/hdri/`). 머티리얼은 `src/world/materials.ts` 팩토리만 사용.
- Rapier는 `main.ts`에서 `await RAPIER.init()` 후 어디서든 named import로 사용 (`import { World } from '@dimforge/rapier3d-compat'`).
- 물리 강체가 소스 오브 트루스 — Three 메시는 `syncMesh()`로 따라감.
- UI 텍스트는 한국어. HUD는 DOM 오버레이 (index.html에 마크업, `src/ui/Hud.ts`에서 제어).
- GitHub Pages 배포라 `vite.config.ts`의 `base: './'` 유지 필수.
