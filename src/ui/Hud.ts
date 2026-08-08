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
  private raceScreen = document.getElementById('race-screen')!;
  private pauseScreen = document.getElementById('pause-screen')!;
  private resultScreen = document.getElementById('result-screen')!;
  private interludeCountEl = document.getElementById('interlude-count')!;
  private interludeTimeEl = document.getElementById('interlude-time')!;
  private racePartsEl = document.getElementById('race-parts')!;
  private raceStatsEl = document.getElementById('race-stats')!;
  private resultTitleEl = document.getElementById('result-title')!;
  private resultHeadlineEl = document.getElementById('result-headline')!;
  private resultPartsEl = document.getElementById('result-parts')!;
  private resultNoteEl = document.getElementById('result-note')!;
  private loadingEl = document.getElementById('loading')!;

  onStart: () => void = () => {};
  onAssembleStart: () => void = () => {};
  onRaceStart: () => void = () => {};
  onResume: () => void = () => {};

  constructor() {
    document.getElementById('start-btn')!.addEventListener('click', () => this.onStart());
    document.getElementById('assemble-btn')!.addEventListener('click', () => this.onAssembleStart());
    document.getElementById('race-btn')!.addEventListener('click', () => this.onRaceStart());
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

  /** Phase 2 종료 — 조립 결과 + 레이싱 시작 안내 */
  showRaceScreen(partsInCar: number, motorsUsed: number, wheelsOnMotors: number): void {
    this.racePartsEl.textContent = String(partsInCar);
    let stats =
      partsInCar > 0
        ? `장착한 모터 ${motorsUsed}개 · 모터에 붙인 바퀴 파츠 ${wheelsOnMotors}개`
        : '결합된 파츠가 없어요 😢';
    if (wheelsOnMotors === 0) {
      stats += '<br /><b style="color:#ff8c8c">⚠ 모터에 바퀴가 없어 차가 움직이지 않을 수 있어요!</b>';
    }
    this.raceStatsEl.innerHTML = stats;
    this.raceScreen.classList.remove('hidden');
  }

  hideRaceScreen(): void {
    this.raceScreen.classList.add('hidden');
  }

  /** Phase 3 종료 — 레이스 결과 */
  showRaceResult(finished: boolean, timeSec: number, gates: number, totalGates: number): void {
    const mm = Math.floor(timeSec / 60);
    const ss = (timeSec % 60).toFixed(1).padStart(4, '0');
    this.resultTitleEl.textContent = finished ? '🏁 완주!' : '🏳 레이스 종료';
    this.resultHeadlineEl.innerHTML = finished
      ? `<span class="accent">${mm}:${ss}</span>`
      : `게이트 <span class="accent">${gates}/${totalGates}</span> 통과`;
    this.resultPartsEl.textContent = finished ? `기록 ${mm}분 ${ss}초` : '';
    this.resultNoteEl.textContent = finished
      ? '더 가볍고 둥근 바퀴로 기록에 도전해보세요!'
      : '다시 도전해보세요! 차가 안 굴러갔다면 모터의 빨간 축에 바퀴 파츠를 달아야 합니다.';
    this.resultScreen.classList.remove('hidden');
  }
}
