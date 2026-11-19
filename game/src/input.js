// Keyboard and mouse input. Held keys are read every frame; one-shot presses
// (enter car, shoot, pause, mute, restart, map, radio) are queued as flags
// and taken once, so a press between two frames is never lost and never
// counted twice. Enter / Space is the confirm key: it starts the game from
// the title screen, so a keyboard-only player never needs the mouse.
//
// v9 iteration 4: Pointer Lock. A left click on the canvas locks the
// pointer (canvas.requestPointerLock) and the mouse turns the camera
// directly (movementX/Y) — over-the-shoulder third person. Left click is
// purely shooting; right click held is ADS (aim down sights, camera
// zooms in). Mouse drag stays as the fallback: when the lock is
// unavailable (headless, permission denied, Esc cooldown) the drag
// deltas still turn the camera, so the headless probe keeps working.
export const ACTION_ENTER = 1;
export const ACTION_SHOOT = 2;
export const ACTION_PAUSE = 4;
export const ACTION_MUTE = 8;
export const ACTION_RESTART = 16;
export const ACTION_CONFIRM = 32;
export const ACTION_MAP = 64;
export const ACTION_RADIO = 128;
export const ACTION_NIGHT = 256;
export const ACTION_SPAWN_CAR = 512;
// v9 iteration 7: Q toggles the quest panel (the radio moved to B) —
// the HUD declutter put the objective in a minimizable left-corner
// panel, and Q is the key the player reaches for first.
export const ACTION_QUEST = 65536;
// v9 iteration 3: number keys switch weapon (1 pistol, 2 knife, 3 bazooka).
export const ACTION_WEAPON_1 = 1024;
export const ACTION_WEAPON_2 = 2048;
export const ACTION_WEAPON_3 = 4096;
// v9 iteration 4: 4 SMG, 5 shotgun, 6 rifle (shop weapons, REP-gated).
export const ACTION_WEAPON_4 = 8192;
export const ACTION_WEAPON_5 = 16384;
export const ACTION_WEAPON_6 = 32768;

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
// Control keys whose browser default is suppressed while the canvas has
// focus: Space/arrows scroll the page, the rest have no default but are
// listed so the set is explicit. Tab and Escape are NOT here — Tab keeps
// keyboard navigation of the title buttons, Escape exits Pointer Lock
// (the browser owns that one).
const CONTROL_KEYS = new Set([
  ...MOVE_KEYS, 'Space', 'KeyE', 'KeyF', 'KeyQ', 'KeyB', 'KeyM', 'KeyL', 'KeyV',
  'KeyR', 'KeyN', 'KeyP', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5',
  'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Enter',
]);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let dragX = 0;
  let dragY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  // Pointer Lock state (v9 iteration 4).
  let locked = false;
  // Lock suppression (v9 iteration 7, §2 overlay gate): requestPointerLock
  // completes ASYNCHRONOUSLY, so a click can leave a lock request in
  // flight that engages AFTER the game has left PLAY — the pause / shop
  // / over handler's releaseLock() runs while the lock is not yet held
  // and is a no-op, and the pointer ends up locked on a menu screen
  // (the play-test caught this on pause: locked=true on the pause
  // screen, the request having completed 800 ms after the click under
  // a saturated headless renderer). releaseLock() therefore sets this
  // flag, and the change handler exits any lock that engages while it
  // is set. A fresh canvas click (the user is playing again) clears it
  // before requesting, so the lock still works in play.
  let lockSuppressed = false;
  let pointerX = 0;
  let pointerY = 0;
  let aiming = false;
  let lastAimAt = 0;
  // Last number key pressed (1-9), for the shop menu. Taken once per
  // frame by the game; drained every frame so a stale digit never fires
  // a purchase later.
  let digit = 0;

  window.addEventListener('keydown', (event) => {
    if (MOVE_KEYS.has(event.code)) held.add(event.code);
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') held.add('Shift');
    if (event.code === 'Space') held.add('Space');
    if (!event.repeat) {
      if (event.code === 'KeyE') actions |= ACTION_ENTER;
      else if (event.code === 'KeyF') actions |= ACTION_SHOOT;
      else if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
      else if (event.code === 'KeyN') actions |= ACTION_MUTE;
      else if (event.code === 'KeyM') actions |= ACTION_MAP;
      else if (event.code === 'KeyQ') actions |= ACTION_QUEST;
      else if (event.code === 'KeyB') actions |= ACTION_RADIO;
      else if (event.code === 'KeyL') actions |= ACTION_NIGHT;
      else if (event.code === 'KeyV') actions |= ACTION_SPAWN_CAR;
      else if (event.code === 'KeyR') actions |= ACTION_RESTART;
      else if (event.code === 'Digit1') { actions |= ACTION_WEAPON_1; digit = 1; }
      else if (event.code === 'Digit2') { actions |= ACTION_WEAPON_2; digit = 2; }
      else if (event.code === 'Digit3') { actions |= ACTION_WEAPON_3; digit = 3; }
      else if (event.code === 'Digit4') { actions |= ACTION_WEAPON_4; digit = 4; }
      else if (event.code === 'Digit5') { actions |= ACTION_WEAPON_5; digit = 5; }
      else if (event.code === 'Digit6') { actions |= ACTION_WEAPON_6; digit = 6; }
      else if (event.code === 'Digit7') digit = 7;
      else if (event.code === 'Digit8') digit = 8;
      else if (event.code === 'Digit9') digit = 9;
      else if (event.code === 'Enter' || event.code === 'Space') actions |= ACTION_CONFIRM;
    }
    if (CONTROL_KEYS.has(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') held.delete('Shift');
    if (event.code === 'Space') held.delete('Space');
  });
  window.addEventListener('blur', () => held.clear());

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    if (event.button === 0) {
      actions |= ACTION_SHOOT;
      // Pointer Lock on left click: the mouse now turns the camera.
      // Guarded — a rejected lock (headless, cooldown after Esc, no
      // permission) falls through silently to the drag fallback.
      // v9 iteration 7 (§2): the user is actively playing again, so a
      // suppression set by an earlier overlay release is lifted here.
      lockSuppressed = false;
      try {
        const p = canvas.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {
        // Drag fallback stays live.
      }
    }
    if (event.button === 2) aiming = true;
  });
  // Right click is ADS, never a context menu.
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    // v9 iteration 7 (§2): a lock request that was in flight when an
    // overlay released the lock engages here — exit it at once, so the
    // pointer is never held on a menu screen. The flag stays set until
    // the next canvas click, so a second late engagement is caught too.
    if (locked && lockSuppressed && document.exitPointerLock) {
      try { document.exitPointerLock(); } catch { /* already out */ }
    }
  });
  window.addEventListener('pointermove', (event) => {
    if (locked) {
      pointerX += event.movementX || 0;
      pointerY += event.movementY || 0;
      lastAimAt = performance.now();
    } else if (dragging) {
      dragX += event.clientX - lastX;
      dragY += event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      lastAimAt = performance.now();
    }
  });
  window.addEventListener('pointerup', (event) => {
    dragging = false;
    if (event.button === 2) aiming = false;
  });

  return {
    forward() {
      return held.has('KeyW') || held.has('ArrowUp');
    },
    back() {
      return held.has('KeyS') || held.has('ArrowDown');
    },
    left() {
      return held.has('KeyA') || held.has('ArrowLeft');
    },
    right() {
      return held.has('KeyD') || held.has('ArrowRight');
    },
    run() {
      return held.has('Shift');
    },
    brake() {
      return held.has('Space');
    },
    takeDrag() {
      const d = { x: dragX, y: dragY };
      dragX = 0;
      dragY = 0;
      return d;
    },
    // Pointer Lock deltas since the last take (v9 iteration 4). Zero when
    // the pointer is not locked — the drag fallback carries those frames.
    takePointer() {
      const d = { x: pointerX, y: pointerY };
      pointerX = 0;
      pointerY = 0;
      return d;
    },
    isLocked() {
      return locked;
    },
    // Right mouse held: aim down sights.
    aiming() {
      return aiming;
    },
    // Wall time of the last camera input (lock or drag), for the drive-by
    // override: while the player is actively aiming, the car camera does
    // not auto-trail back to the car heading.
    lastAimAt() {
      return lastAimAt;
    },
    // v9 iteration 7 (§2): suppress the lock as well as exiting it —
    // a request already in flight engages after this call, and the
    // change handler exits it on arrival (see above). Cleared by the
    // next canvas click, when the user is playing again.
    releaseLock() {
      lockSuppressed = true;
      if (locked && document.exitPointerLock) {
        try { document.exitPointerLock(); } catch { /* already out */ }
      }
    },
    takeDigit() {
      const d = digit;
      digit = 0;
      return d;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
