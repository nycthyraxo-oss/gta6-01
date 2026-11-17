// The HUD: a dense, readable layout — mission banner top-center (chapter,
// objective, target distance, clock), mode + wanted stars + cash + weapon
// top-right, district name + minimap + health bar bottom-left, big speedo
// with car name, gear and radio bottom-right, and a mission dialogue bar
// (portrait + speaker + line) bottom-center. Big, high-contrast text so it
// stays readable when a screenshot is shrunk.
export function createHud() {
  const root = document.getElementById('hud');
  const chapterEl = document.getElementById('hud-chapter');
  const objectiveEl = document.getElementById('hud-objective');
  const distEl = document.getElementById('hud-target-dist');
  const clockEl = document.getElementById('hud-clock');
  const modeEl = document.getElementById('hud-mode');
  const starsEl = document.getElementById('hud-stars');
  const cashEl = document.getElementById('hud-cash');
  const weaponEl = document.getElementById('hud-weapon');
  const districtEl = document.getElementById('hud-district-name');
  const healthFill = document.getElementById('hud-healthfill');
  const healthText = document.getElementById('hud-healthtext');
  const speedEl = document.getElementById('hud-speed');
  const carEl = document.getElementById('hud-car');
  const messageEl = document.getElementById('hud-message');
  const dialogueEl = document.getElementById('hud-dialogue');
  const portraitEl = document.getElementById('hud-portrait');
  const speakerEl = document.getElementById('hud-speaker');
  const dialogueTextEl = document.getElementById('hud-dialogue-text');
  const minimap = document.getElementById('minimap');
  const mapCtx = minimap.getContext('2d');
  let messageTimer = 0;

  function showMessage(text, seconds) {
    messageEl.textContent = text;
    messageEl.style.opacity = '1';
    messageTimer = seconds || 5;
  }

  function update(state) {
    // Mission banner: chapter chip, objective, target distance, clock.
    chapterEl.textContent = state.chapter || '';
    objectiveEl.textContent = state.objective;
    distEl.textContent = state.targetDist != null ? `${Math.round(state.targetDist)} m` : '';
    const h = Math.floor(state.clockHour);
    const m = Math.floor((state.clockHour - h) * 60);
    clockEl.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    // Top-right: heat label, wanted stars, cash, weapon (pistol, no ammo
    // system — the ∞ is honest: the pistol never runs dry).
    if (state.stars <= 0) modeEl.textContent = 'FREE ROAM';
    else if (state.stars <= 2) modeEl.textContent = `${state.stars}★ HEAT RISING`;
    else if (state.stars <= 4) modeEl.textContent = `${state.stars}★ MANHUNT`;
    else modeEl.textContent = '5★ MAXIMUM HEAT';
    modeEl.style.color = state.stars > 0 ? '#ffb13e' : '#7dff8a';
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < state.stars ? '★' : '☆';
    starsEl.textContent = stars;
    starsEl.style.color = state.stars > 0 ? '#ffd23e' : '#9aa0aa';
    cashEl.textContent = `$${Math.round(state.cash).toLocaleString('en-US')}`;
    weaponEl.textContent = 'PISTOL ∞';

    // Bottom-left: district over the minimap, health bar under it.
    districtEl.textContent = state.district || '';
    const hp = Math.max(0, Math.round(state.health));
    healthFill.style.width = `${hp}%`;
    healthFill.style.background = hp < 30 ? '#ff5a4a' : hp < 60 ? '#ffb13e' : '#58d85a';
    healthText.textContent = `♥ ${hp}`;

    // Bottom-right speedo: big speed, car name + gear, radio station.
    if (state.inCar) {
      speedEl.textContent = String(Math.round(state.speed * 3.6));
      carEl.textContent = state.carName ? `${state.carName} • ${state.gear}` : 'ON FOOT';
    } else {
      speedEl.textContent = '0';
      carEl.textContent = 'ON FOOT';
    }

    // Bottom-center dialogue: portrait initials + speaker + current line.
    if (state.dialogueText) {
      dialogueEl.style.opacity = '1';
      const initials = (state.dialogueSpeaker || 'M Q')
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .slice(0, 2);
      portraitEl.textContent = initials;
      speakerEl.textContent = state.dialogueSpeaker || '';
      dialogueTextEl.textContent = state.dialogueText;
    } else {
      dialogueEl.style.opacity = '0';
    }

    if (messageTimer > 0) {
      messageTimer -= state.dt;
      if (messageTimer <= 0) messageEl.style.opacity = '0';
    }
    if (!messageEl.textContent.trim()) messageEl.style.opacity = '0';
    root.style.display = state.visible ? 'block' : 'none';
  }

  function drawMinimap(world) {
    const size = minimap.width;
    const half = world.half + 20;
    const toMap = (x, z) => [((x + half) / (half * 2)) * size, ((z + half) / (half * 2)) * size];
    mapCtx.fillStyle = 'rgba(10, 18, 26, 0.88)';
    mapCtx.fillRect(0, 0, size, size);
    // Sea and sand on the east edge.
    mapCtx.fillStyle = '#1c4a6b';
    mapCtx.fillRect(size * 0.86, 0, size * 0.14, size);
    mapCtx.fillStyle = '#e6d3a3';
    mapCtx.fillRect(size * 0.82, 0, size * 0.04, size);
    // Roads.
    mapCtx.strokeStyle = '#5a6068';
    mapCtx.lineWidth = 5;
    for (const c of world.roadLines) {
      const [mx] = toMap(c, 0);
      const [, mz] = toMap(0, c);
      mapCtx.beginPath();
      mapCtx.moveTo(mx, 0);
      mapCtx.lineTo(mx, size);
      mapCtx.stroke();
      mapCtx.beginPath();
      mapCtx.moveTo(0, mz);
      mapCtx.lineTo(size, mz);
      mapCtx.stroke();
    }
    // Landmarks.
    mapCtx.fillStyle = '#8ec9ee';
    for (const key of Object.keys(world.landmarks)) {
      const lm = world.landmarks[key];
      const [mx, mz] = toMap(lm.x, lm.z);
      mapCtx.fillRect(mx - 2, mz - 2, 4, 4);
    }
    // Mission marker: pulsing yellow diamond.
    if (world.missionTarget) {
      const [mx, mz] = toMap(world.missionTarget.x, world.missionTarget.z);
      const pulse = 5 + 2 * Math.sin(world.time * 4);
      mapCtx.fillStyle = '#ffd23e';
      mapCtx.beginPath();
      mapCtx.moveTo(mx, mz - pulse);
      mapCtx.lineTo(mx + pulse, mz);
      mapCtx.lineTo(mx, mz + pulse);
      mapCtx.lineTo(mx - pulse, mz);
      mapCtx.closePath();
      mapCtx.fill();
    }
    // Enemies red, police blue.
    for (const e of world.enemies) {
      if (!e.alive) continue;
      const [mx, mz] = toMap(e.group.position.x, e.group.position.z);
      mapCtx.fillStyle = '#ff3a2e';
      mapCtx.beginPath();
      mapCtx.arc(mx, mz, 3, 0, Math.PI * 2);
      mapCtx.fill();
    }
    for (const car of world.policeCars) {
      const [mx, mz] = toMap(car.group.position.x, car.group.position.z);
      mapCtx.fillStyle = '#4a90ff';
      mapCtx.beginPath();
      mapCtx.arc(mx, mz, 3.5, 0, Math.PI * 2);
      mapCtx.fill();
    }
    // Player arrow.
    const [px, pz] = toMap(world.playerX, world.playerZ);
    mapCtx.save();
    mapCtx.translate(px, pz);
    mapCtx.rotate(world.playerHeading);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.strokeStyle = '#111111';
    mapCtx.lineWidth = 1.5;
    mapCtx.beginPath();
    mapCtx.moveTo(0, -8);
    mapCtx.lineTo(5, 6);
    mapCtx.lineTo(0, 3);
    mapCtx.lineTo(-5, 6);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.stroke();
    mapCtx.restore();
    // North.
    mapCtx.fillStyle = '#ffffff';
    mapCtx.font = 'bold 13px system-ui, sans-serif';
    mapCtx.fillText('N', 6, 16);
  }

  return { update, drawMinimap, showMessage };
}
