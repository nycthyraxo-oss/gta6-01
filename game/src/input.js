// Keyboard and mouse input. Held keys are read every frame; one-shot presses
// (enter car, shoot, pause, mute, restart) are queued as flags and taken once,
// so a press between two frames is never lost and never counted twice.
export const ACTION_ENTER = 1;
export const ACTION_SHOOT = 2;
export const ACTION_PAUSE = 4;
export const ACTION_MUTE = 8;
export const ACTION_RESTART = 16;
export const ACTION_CONFIRM = 32;

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let dragX = 0;
  let dragY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  window.addEventListener('keydown', (event) => {
    if (MOVE_KEYS.has(event.code)) held.add(event.code);
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') held.add('Shift');
    if (event.code === 'Space') held.add('Space');
    if (!event.repeat) {
      if (event.code === 'KeyE') actions |= ACTION_ENTER;
      else if (event.code === 'KeyF') actions |= ACTION_SHOOT;
      else if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
      else if (event.code === 'KeyM') actions |= ACTION_MUTE;
      else if (event.code === 'KeyR') actions |= ACTION_RESTART;
      else if (event.code === 'Enter' || event.code === 'Space') actions |= ACTION_CONFIRM;
    }
    if (MOVE_KEYS.has(event.code) || event.code === 'Space') event.preventDefault();
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
    if (event.button === 0) actions |= ACTION_SHOOT;
  });
  window.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    dragX += event.clientX - lastX;
    dragY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  });
  window.addEventListener('pointerup', () => {
    dragging = false;
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
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
