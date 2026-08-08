// DOM 기반 HUD — index.html에 선언된 요소들을 제어한다.
export class Hud {
  private timerEl = document.getElementById('timer')!;
  private countWrapEl = document.getElementById('garage-count') as HTMLElement;
  private countEl = document.querySelector('#garage-count b')!;
  private hintEl = document.getElementById('hint')!;
  private crosshairEl = document.getElementById('crosshair')!;
  private phaseLabelEl = document.getElementById('phase-label')!;
  private startScreen = document.getElementById('start-screen')!;
  private interludeScreen = document.getElementById('interlude-screen')!;
  private pauseScreen = document.getElementById('pause-screen')!;
  private resultScreen = document.getElementById('result-screen')!;
  private interludeCountEl = document.getElementById('interlude-count')!;
  private interludeTimeEl = document.getElementById('interlude-time')!;
  private resultCountEl = document.getElementById('result-count')!;
  private resultPartsEl = document.getElementById('result-parts')!;
  private loadingEl = document.getElementById('loading')!;

  onStart: () => void = () => {};
  onAssembleStart: () => void = () => {};
  onResume: () => void = () => {};

  constructor() {
    document.getElementById('start-btn')!.addEventListener('click', () => this.onStart());
    document.getElementById('assemble-btn')!.addEventListener('click', () => this.onAssembleStart());
    document.getElementById('resume-btn')!.addEventListener('click', () => this.onResume());
    document.getElementById('restart-btn')!.addEventListener('click', () => location.reload());
  }

  hideLoading(): void {
    this.loadingEl.style.display = 'none';
  }

  setPhaseLabel(text: string): void {
    this.phaseLabelEl.textContent = text;
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

  showGarageCounter(show: boolean): void {
    this.countWrapEl.style.display = show ? '' : 'none';
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

  showInterlude(collectedCount: number, assembleSeconds: number): void {
    this.interludeCountEl.textContent = String(collectedCount);
    this.interludeTimeEl.textContent = String(assembleSeconds);
    this.interludeScreen.classList.remove('hidden');
  }

  hideInterlude(): void {
    this.interludeScreen.classList.add('hidden');
  }

  showPause(show: boolean): void {
    this.pauseScreen.classList.toggle('hidden', !show);
  }

  /** Phase 2 종료 — 조립 결과 */
  showFinal(partsInCar: number, motorsUsed: number, wheelsOnMotors: number): void {
    this.resultCountEl.textContent = String(partsInCar);
    this.resultPartsEl.textContent =
      partsInCar > 0
        ? `장착한 모터 ${motorsUsed}개 · 모터에 붙인 바퀴 파츠 ${wheelsOnMotors}개`
        : '결합된 파츠가 없어요 😢 다음엔 파츠를 서로 붙여보세요!';
    this.resultScreen.classList.remove('hidden');
  }
}
