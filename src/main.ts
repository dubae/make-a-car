import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from './core/Game';

async function main(): Promise<void> {
  await RAPIER.init(); // WASM 물리엔진 초기화
  const game = new Game();
  await game.init(); // PBR 텍스처 + HDRI 로드 후 월드 구축
  game.start();
}

main().catch((err) => {
  console.error(err);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = '게임 로드에 실패했어요 😢 새로고침 해주세요.';
});
