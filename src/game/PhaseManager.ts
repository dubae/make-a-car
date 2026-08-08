export type PhaseState = 'ready' | 'playing' | 'paused' | 'ended';

/** Phase 1 파밍 제한 시간 (초) — 방이 커진 만큼 여유 있게 */
export const PHASE1_DURATION = 150;

/**
 * 게임 페이즈 상태 머신.
 * 지금은 Phase 1(파밍)만 존재하며, Phase 2(조립)/Phase 3(레이싱)이 이어질 예정.
 */
export class PhaseManager {
  state: PhaseState = 'ready';
  remaining = PHASE1_DURATION;

  onEnded: () => void = () => {};

  start(): void {
    this.state = 'playing';
    this.remaining = PHASE1_DURATION;
  }

  pause(): void {
    if (this.state === 'playing') this.state = 'paused';
  }

  resume(): void {
    if (this.state === 'paused') this.state = 'playing';
  }

  update(dt: number): void {
    if (this.state !== 'playing') return;
    this.remaining -= dt;
    if (this.remaining <= 0) {
      this.remaining = 0;
      this.state = 'ended';
      this.onEnded();
    }
  }
}
