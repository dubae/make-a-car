import { defineConfig } from 'vite';

// base: './' — GitHub Pages 하위 경로(https://<user>.github.io/makeacar/)에서도
// 에셋이 상대 경로로 로드되도록 한다.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
  },
});
