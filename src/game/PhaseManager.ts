/** Phase 1 파밍 제한 시간 (초) */
export const PHASE1_DURATION = 150;
/** Phase 2 조립 제한 시간 (초) */
export const PHASE2_DURATION = 120;

export type GamePhase =
  | 'ready'
  | 'phase1'
  | 'interlude'
  | 'phase2'
  | 'interlude2'
  | 'phase3'
  | 'ended';

/**
 * 게임 페이즈 상태 머신.
 * ready → phase1(파밍) → interlude → phase2(조립) → interlude2 → phase3(레이싱) → ended
 * phase1/phase2는 카운트다운, phase3은 경과 시간 카운트업.
 * 포인터락이 필요한 phase1/phase2에서만 락 해제 시 일시정지된다.
 */
export class PhaseManager {
  phase: GamePhase = 'ready';
  paused = false;
  remaining = 0;

  /** URL 파라미터(?p1=초&p2=초)로 오버라이드 가능 — 개발/시연용 */
  phase1Duration = PHASE1_DURATION;
  phase2Duration = PHASE2_DURATION;

  onPhase1End: () => void = () => {};
  onPhase2End: () => void = () => {};

  /** 시뮬레이션이 돌아야 하는 상태인지 */
  get running(): boolean {
    return (
      (this.phase === 'phase1' || this.phase === 'phase2' || this.phase === 'phase3') &&
      !this.paused
    );
  }

  /** 포인터락 기반 조작 페이즈 (락 해제 → 일시정지) */
  get inTimedPhase(): boolean {
    return this.phase === 'phase1' || this.phase === 'phase2';
  }

  startPhase1(): void {
    this.phase = 'phase1';
    this.remaining = this.phase1Duration;
    this.paused = false;
  }

  startPhase2(): void {
    this.phase = 'phase2';
    this.remaining = this.phase2Duration;
    this.paused = false;
  }

  startPhase3(): void {
    this.phase = 'phase3';
    this.remaining = 0; // 카운트업
    this.paused = false;
  }

  pause(): void {
    if (this.inTimedPhase) this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  update(dt: number): void {
    if (!this.running) return;
    if (this.phase === 'phase3') {
      this.remaining += dt;
      return;
    }
    this.remaining -= dt;
    if (this.remaining > 0) return;
    this.remaining = 0;
    if (this.phase === 'phase1') {
      this.phase = 'interlude';
      this.onPhase1End();
    } else if (this.phase === 'phase2') {
      this.phase = 'interlude2';
      this.onPhase2End();
    }
  }
}
