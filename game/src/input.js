// input.js — keyboard and mouse for Costa Fuego.
// Held keys are read directly; one-shot presses are queued so a tap between
// two frames is never lost. The mouse steers the camera through pointer lock
// when available and through click-drag otherwise.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressedQueue = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.clicked = false;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.lockWanted = false;
    this.locked = false;
    this.anyKeyPressed = false;

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (!this.down.has(k)) this.pressedQueue.add(k);
      this.down.add(k);
      this.anyKeyPressed = true;
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.down.clear(); this.mouseDown = false; this.dragging = false; });

    canvas.addEventListener('mousedown', (e) => {
      // only the left button fires / clicks; any button can drag the camera
      if (e.button === 0) { this.mouseDown = true; this.clicked = true; }
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      // pointer lock is a left-button affair; right-drag stays a plain
      // click-drag so synthetic drags keep honest clientX deltas
      if (e.button === 0 && this.lockWanted && !this.locked && canvas.requestPointerLock) {
        try { canvas.requestPointerLock(); } catch (_) { /* drag fallback stays */ }
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      this.dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      } else if (this.dragging) {
        this.mouseDX += e.clientX - this.lastX;
        this.mouseDY += e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
  }

  held(key) { return this.down.has(key); }

  // Consume a one-shot press; returns true once per physical press.
  take(key) {
    if (this.pressedQueue.has(key)) { this.pressedQueue.delete(key); return true; }
    return false;
  }

  takeClick() {
    if (this.clicked) { this.clicked = false; return true; }
    return false;
  }

  takeAnyKey() {
    if (this.anyKeyPressed) { this.anyKeyPressed = false; this.pressedQueue.clear(); return true; }
    return false;
  }

  // Read and clear accumulated mouse movement for this frame.
  takeMouse() {
    const m = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return m;
  }

  wantLock(on) {
    this.lockWanted = on;
    if (!on && this.locked && document.exitPointerLock) document.exitPointerLock();
  }

  releaseLock() {
    this.lockWanted = false;
    if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock();
    this.locked = false;
  }

  clearFrame() {
    this.pressedQueue.clear();
    this.clicked = false;
    this.anyKeyPressed = false;
  }
}
