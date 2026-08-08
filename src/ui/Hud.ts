// DOM 기반 HUD — index.html에 선언된 요소들을 제어한다.
export class Hud {
  private timerEl = document.getElementById('timer')!;
  private countEl = document.querySelector('#garage-count b')!;
  private hintEl = document.getElementById('hint')!;
  private crosshairEl = document.getElementById('crosshair')!;
  private startScreen = document.getElementById('start-screen')!;
  private pauseScreen = document.getElementById('pause-screen')!;
  private resultScreen = document.getElementById('result-screen')!;
  private resultCountEl = document.getElementById('result-count')!;
  private resultPartsEl = document.getElementById('result-parts')!;
  private loadingEl = document.getElementById('loading')!;

  onStart: () => void = () => {};
  onResume: () => void = () => {};

  constructor() {
    document.getElementById('start-btn')!.addEventListener('click', () => this.onStart());
    document.getElementById('resume-btn')!.addEventListener('click', () => this.onResume());
    document.getElementById('restart-btn')!.addEventListener('click', () => location.reload());
  }

  hideLoading(): void {
    this.loadingEl.style.display = 'none';
  }

  setTimer(seconds: number): void {
    const s = Math.max(0, Math.ceil(seconds));
    const mm = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    this.timerEl.textContent = `${mm}:${ss}`;
    this.timerEl.classList.toggle('urgent', s <= 10);
  }

  setGarageCount(n: number): void {
    this.countEl.textContent = String(n);
  }

  setHint(html: string): void {
    if (this.hintEl.innerHTML !== html) this.hintEl.innerHTML = html;
  }

  setCrosshairTarget(active: boolean): void {
    this.crosshairEl.classList.toggle('target', active);
  }

  showStart(): void {
    this.startScreen.classList.remove('hidden');
  }

  hideStart(): void {
    this.startScreen.classList.add('hidden');
  }

  showPause(show: boolean): void {
    this.pauseScreen.classList.toggle('hidden', !show);
  }

  showResult(count: number, breakdown: Map<string, number>): void {
    this.resultCountEl.textContent = String(count);
    this.resultPartsEl.textContent =
      count > 0
        ? [...breakdown.entries()].map(([name, n]) => `${name} ×${n}`).join(' · ')
        : '모은 재료가 없어요 😢';
    this.resultScreen.classList.remove('hidden');
  }
}
