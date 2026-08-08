// 키보드 + 마우스(포인터락) 입력을 프레임 단위로 수집한다.
export class Input {
  private keys = new Set<string>();
  private justPressedKeys = new Set<string>();
  private clickQueue: number[] = [];
  private mouseDX = 0;
  private mouseDY = 0;

  locked = false;

  constructor(private element: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.justPressedKeys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) this.keys.clear();
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });

    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.clickQueue.push(e.button);
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  requestLock(): void {
    try {
      this.element.requestPointerLock();
    } catch {
      // 브라우저가 잠금 재요청을 잠시 막는 경우가 있어 무시 (다시 클릭하면 됨)
    }
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** 이번 프레임에 눌린 키인지 (consumeFrame 호출 전까지 유효) */
  justPressed(code: string): boolean {
    return this.justPressedKeys.has(code);
  }

  /** 이번 프레임에 클릭된 마우스 버튼인지 (0=좌, 2=우) */
  clicked(button: number): boolean {
    return this.clickQueue.includes(button);
  }

  /** 누적된 마우스 이동량을 반환 (consumeFrame에서 초기화) */
  get mouseDelta(): { dx: number; dy: number } {
    return { dx: this.mouseDX, dy: this.mouseDY };
  }

  /** 매 프레임 끝에 호출 — 일회성 입력 초기화 */
  consumeFrame(): void {
    this.justPressedKeys.clear();
    this.clickQueue.length = 0;
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
