// The HUD: a dense, readable layout — mission banner top-center (chapter,
// stage, objective, target distance, clock), mode + wanted stars + cash +
// weapon slots + the pursuer panel top-right, district name + live minimap
// + health / armour / rep bars + package count bottom-left, big speedo with
// car name, gear, vehicle condition and radio bottom-right, and a mission
// dialogue bar (portrait + speaker + line) bottom-center. Big,
// high-contrast text so it stays readable when a screenshot is shrunk.
//
// v6: the banner carries a stage-progress bar and a NEXT line (the job
// after this one), the clock shows the day as well as the time, the
// top-right grows a pursuer panel (name, distance, status per chaser) and
// a second weapon slot, the bottom-left grows armour and reputation bars
// and a package counter, the speedo shows the car's condition, and the
// helicopter's spotlight gets its own flashing banner when it is on you.
// The minimap and the full city map share one base, so they can never
// drift apart.
import { DISTRICTS } from './config.js';

export function createHud() {
  const root = document.getElementById('hud');
  const chapterEl = document.getElementById('hud-chapter');
  const stageEl = document.getElementById('hud-stage');
  const objectiveEl = document.getElementById('hud-objective');
  const distEl = document.getElementById('hud-target-dist');
  const clockEl = document.getElementById('hud-clock');
  const progressEl = document.getElementById('hud-stagebar-fill');
  const nextEl = document.getElementById('hud-next');
  const modeEl = document.getElementById('hud-mode');
  const starsEl = document.getElementById('hud-stars');
  const cashEl = document.getElementById('hud-cash');
  const weaponEl = document.getElementById('hud-weapon');
  const weapon2El = document.getElementById('hud-weapon2');
  const weapon3El = document.getElementById('hud-weapon3');
  const weapon4El = document.getElementById('hud-weapon4');
  const weapon5El = document.getElementById('hud-weapon5');
  const weapon6El = document.getElementById('hud-weapon6');
  const autosaveEl = document.getElementById('hud-autosave');
  const pursuersEl = document.getElementById('hud-pursuers');
  const districtEl = document.getElementById('hud-district-name');
  const healthFill = document.getElementById('hud-healthfill');
  const healthText = document.getElementById('hud-healthtext');
  const armourFill = document.getElementById('hud-armourfill');
  const armourText = document.getElementById('hud-armourtext');
  const repFill = document.getElementById('hud-repfill');
  const repText = document.getElementById('hud-reptext');
  const packagesEl = document.getElementById('hud-packages');
  const speedEl = document.getElementById('hud-speed');
  const carEl = document.getElementById('hud-car');
  const conditionEl = document.getElementById('hud-condition');
  const radioEl = document.getElementById('hud-radio');
  const messageEl = document.getElementById('hud-message');
  const dialogueEl = document.getElementById('hud-dialogue');
  const portraitEl = document.getElementById('hud-portrait');
  const speakerEl = document.getElementById('hud-speaker');
  const dialogueTextEl = document.getElementById('hud-dialogue-text');
  const spotlightEl = document.getElementById('hud-spotlight');
  const crosshairEl = document.getElementById('crosshair');
  const minimap = document.getElementById('minimap');
  const mapCtx = minimap.getContext('2d');
  const bigmap = document.getElementById('bigmap');
  const bigCtx = bigmap ? bigmap.getContext('2d') : null;
  // v9 iteration 4: DPR calibration. The canvases are backed at
  // devicePixelRatio (capped at 2) so the minimap and the big map stay
  // sharp on hidpi screens; the CSS display sizes stay 200 and 640, and
  // the draw code works in those logical sizes with a dpr transform.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  minimap.width = 200 * dpr;
  minimap.height = 200 * dpr;
  if (bigmap) {
    bigmap.width = 640 * dpr;
    bigmap.height = 640 * dpr;
  }
  let messageTimer = 0;
  let autosaveTimer = 0;

  // "DAY 1 · 18:24" for the HUD clock and for time-skip messages — one
  // formatter, so the two can never drift apart.
  function clockText(hour, day) {
    const h = Math.floor(hour);
    const m = Math.floor((hour - h) * 60);
    return `DAY ${day || 1} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Autosave indicator (v9 iteration 4): a brief "SAVED" under the
  // clock after every autosave, so the player sees the save land.
  function showAutosave(text) {
    if (!autosaveEl) return;
    autosaveEl.textContent = text;
    autosaveEl.style.opacity = '1';
    autosaveTimer = 2;
  }

  function showMessage(text, seconds) {
    messageEl.textContent = text;
    messageEl.style.opacity = '1';
    messageTimer = seconds || 5;
  }

  function barColor(v) {
    return v < 30 ? '#ff5a4a' : v < 60 ? '#ffb13e' : '#58d85a';
  }

  function update(state) {
    // Mission banner: chapter chip, stage, objective, target distance,
    // day + clock, stage progress bar, next job.
    chapterEl.textContent = state.chapter || '';
    if (stageEl) stageEl.textContent = state.stage || '';
    objectiveEl.textContent = state.objective;
    distEl.textContent = state.targetDist != null ? `${Math.round(state.targetDist)} m` : '';
    const season = state.season ? ` · ${state.season}` : '';
    clockEl.textContent = `${clockText(state.clockHour, state.day)}${season}`;
    if (progressEl) progressEl.style.width = `${Math.round((state.progress || 0) * 100)}%`;
    if (nextEl) {
      nextEl.textContent = state.nextMission ? `NEXT: ${state.nextMission}` : '';
      nextEl.style.display = state.nextMission ? 'block' : 'none';
    }

    // Top-right: heat label, wanted stars, cash, weapon slots, pursuers.
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
    // Weapon slots (v9 iteration 4): the pistol is limited ammo now
    // (bought at Ammu-Nation), the knife never runs dry, the bazooka is
    // limited rockets, and slots 4-6 are the shop weapons — their ammo
    // when owned, the REP lock when not. The active slot carries the ◄
    // marker so the player always knows what is in hand.
    const w = state.weapon || 0;
    const rockets = state.rockets != null ? state.rockets : 8;
    const owned = state.owned || {};
    weaponEl.textContent = `1 · PISTOL ${state.ammo != null ? state.ammo : 24}${w === 0 ? ' ◄' : ''}`;
    if (weapon2El) weapon2El.textContent = `2 · KNIFE ∞${w === 1 ? ' ◄' : ''}`;
    if (weapon3El) weapon3El.textContent = `3 · BAZOOKA ${rockets}${w === 2 ? ' ◄' : ''}`;
    if (weapon4El) weapon4El.textContent = owned.smg ? `4 · SMG ${state.smgAmmo != null ? state.smgAmmo : 0}${w === 3 ? ' ◄' : ''}` : '4 · SMG — LOCKED (REP 20)';
    if (weapon5El) weapon5El.textContent = owned.shotgun ? `5 · SHOTGUN ${state.shotgunAmmo != null ? state.shotgunAmmo : 0}${w === 4 ? ' ◄' : ''}` : '5 · SHOTGUN — LOCKED (REP 40)';
    if (weapon6El) weapon6El.textContent = owned.rifle ? `6 · RIFLE ${state.rifleAmmo != null ? state.rifleAmmo : 0}${w === 5 ? ' ◄' : ''}` : '6 · RIFLE — LOCKED (REP 60)';
    if (pursuersEl) {
      const list = state.pursuers || [];
      if (list.length > 0) {
        pursuersEl.innerHTML = list.map((p) => {
          const d = p.kind === 'heli' ? '' : ` · ${p.dist}m`;
          const hot = p.status === 'RAMMING' || p.status === 'SPOTLIGHT ON YOU' || p.status === 'ARRESTING';
          return `<div class="${hot ? 'hot' : ''}">${p.name}${d} — ${p.status}</div>`;
        }).join('');
        pursuersEl.style.display = 'block';
      } else {
        pursuersEl.style.display = 'none';
      }
    }

    // Bottom-left: district over the minimap, health / armour / rep bars
    // under it, package count below that.
    districtEl.textContent = state.district || '';
    const hp = Math.max(0, Math.round(state.health));
    healthFill.style.width = `${hp}%`;
    healthFill.style.background = barColor(hp);
    healthText.textContent = `♥ ${hp}`;
    const ar = Math.max(0, Math.round(state.armour || 0));
    if (armourFill) {
      armourFill.style.width = `${ar}%`;
      armourFill.style.background = ar > 0 ? '#7fb3d8' : '#3a4550';
    }
    if (armourText) armourText.textContent = `⛨ ${ar}`;
    const rep = Math.max(0, Math.round(state.rep || 0));
    if (repFill) {
      repFill.style.width = `${Math.min(100, rep)}%`;
      repFill.style.background = '#c98ae0';
    }
    if (repText) repText.textContent = `REP ${rep}`;
    if (packagesEl) {
      packagesEl.textContent = `◆ PACKAGES ${state.packages || 0}/${state.packagesTotal || 10}`;
    }

    // Bottom-right speedo: big speed, car name + gear, vehicle condition,
    // radio station.
    if (state.inCar) {
      speedEl.textContent = String(Math.round(state.speed * 3.6));
      carEl.textContent = state.carName ? `${state.carName} • ${state.gear}` : 'ON FOOT';
      if (conditionEl) {
        const cond = Math.max(0, Math.round(state.condition ?? 100));
        conditionEl.textContent = `CONDITION ${cond}%`;
        conditionEl.style.color = cond < 30 ? '#ff5a4a' : cond < 60 ? '#ffb13e' : '#7dff8a';
      }
    } else {
      speedEl.textContent = '0';
      carEl.textContent = 'ON FOOT';
      if (conditionEl) conditionEl.textContent = '';
    }
    if (radioEl && state.radio) radioEl.textContent = `♪ ${state.radio}`;

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

    // Spotlight banner: the heli has its beam on you — break line of
    // sight, because the heat will not cool while it does. v9 iteration
    // 4: standing in a police vision cone shows the same banner.
    if (spotlightEl) {
      spotlightEl.style.display = state.spotlight || state.inVisionCone ? 'block' : 'none';
    }

    // Crosshair on foot: the player aims with the mouse, so the aim point
    // is always visible. v9 iteration 4: it also shows in a car while
    // the player is aiming (drive-by).
    if (crosshairEl) crosshairEl.style.display = state.crosshair ? 'block' : 'none';

    if (messageTimer > 0) {
      messageTimer -= state.dt;
      if (messageTimer <= 0) messageEl.style.opacity = '0';
    }
    if (!messageEl.textContent.trim()) messageEl.style.opacity = '0';
    // Autosave indicator fades 2 s after the save lands.
    if (autosaveTimer > 0) {
      autosaveTimer -= state.dt;
      if (autosaveTimer <= 0 && autosaveEl) autosaveEl.style.opacity = '0';
    }
    root.style.display = state.visible ? 'block' : 'none';
  }

  // The shared map base: sea, sand, roads, blocks, parks, landmarks. Both
  // the minimap and the full city map draw from it, so they can never drift.
  function drawMapBase(ctx, size, world) {
    const half = world.half + 20;
    const toMap = (x, z) => [((x + half) / (half * 2)) * size, ((z + half) / (half * 2)) * size];
    ctx.fillStyle = 'rgba(10, 18, 26, 0.92)';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#1c4a6b';
    ctx.fillRect(size * 0.86, 0, size * 0.14, size);
    ctx.fillStyle = '#e6d3a3';
    ctx.fillRect(size * 0.82, 0, size * 0.04, size);
    // Parks read green on the map, so the player can find them.
    ctx.fillStyle = '#3a6a3a';
    for (const [px, pz] of [[-112, -112], [56, 112]]) {
      const [mx, mz] = toMap(px - 21, pz - 21);
      const [mx2, mz2] = toMap(px + 21, pz + 21);
      ctx.fillRect(mx, mz, mx2 - mx, mz2 - mz);
    }
    ctx.strokeStyle = '#5a6068';
    ctx.lineWidth = Math.max(3, size / 40);
    for (const c of world.roadLines) {
      const [mx] = toMap(c, 0);
      const [, mz] = toMap(0, c);
      ctx.beginPath();
      ctx.moveTo(mx, 0);
      ctx.lineTo(mx, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, mz);
      ctx.lineTo(size, mz);
      ctx.stroke();
    }
    return toMap;
  }

  function drawGpsRoute(ctx, toMap, world) {
    if (!world.gpsRoute || world.gpsRoute.length < 2) return;
    ctx.strokeStyle = '#ffd23e';
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    world.gpsRoute.forEach((pt, i) => {
      const [mx, mz] = toMap(pt.x, pt.z);
      if (i === 0) ctx.moveTo(mx, mz);
      else ctx.lineTo(mx, mz);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Police vision cones (v9 iteration 4): a translucent triangle 20 m
  // ahead of each cruiser, widening to 6 m at the far end — the same
  // geometry the 3D cones use, so the map and the world agree.
  function drawVisionCones(ctx, toMap, world, size) {
    const scale = size / ((world.half + 20) * 2);
    for (const car of world.policeCars || []) {
      const [mx, mz] = toMap(car.group.position.x, car.group.position.z);
      ctx.save();
      ctx.translate(mx, mz);
      ctx.rotate(car.heading);
      ctx.fillStyle = 'rgba(255, 210, 62, 0.18)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-6 * scale, 20 * scale);
      ctx.lineTo(6 * scale, 20 * scale);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // Shops (v9 iteration 4): diamonds — lime for Ammu-Nation, magenta
  // for Pay 'n' Spray. The big map labels them too.
  function drawShops(ctx, toMap, world, label) {
    if (!world.shops) return;
    const defs = [
      { s: world.shops.gun, color: '#8aff5a', name: 'AMMU-NATION' },
      { s: world.shops.spray, color: '#ff5aff', name: "PAY 'N' SPRAY" },
    ];
    for (const { s, color, name } of defs) {
      const [mx, mz] = toMap(s.x, s.z);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(mx, mz - 5);
      ctx.lineTo(mx + 5, mz);
      ctx.lineTo(mx, mz + 5);
      ctx.lineTo(mx - 5, mz);
      ctx.closePath();
      ctx.fill();
      if (label) {
        ctx.fillStyle = color;
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillText(name, mx + 8, mz + 4);
      }
    }
  }

  function drawMinimap(world) {
    const size = 200;
    const ctx = mapCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const toMap = drawMapBase(ctx, size, world);
    // Police search zone: the circle the heat cools outside of.
    if (world.searchZone) {
      const [zx, zy] = toMap(world.searchZone.x, world.searchZone.z);
      const zr = (world.searchZone.r / ((world.half + 20) * 2)) * size;
      ctx.strokeStyle = 'rgba(255, 90, 74, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(zx, zy, zr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 90, 74, 0.12)';
      ctx.fill();
    }
    drawGpsRoute(ctx, toMap, world);
    // Landmarks.
    ctx.fillStyle = '#8ec9ee';
    for (const key of Object.keys(world.landmarks)) {
      const lm = world.landmarks[key];
      const [mx, mz] = toMap(lm.x, lm.z);
      ctx.fillRect(mx - 2, mz - 2, 4, 4);
    }
    // Mission marker: pulsing yellow diamond.
    if (world.missionTarget) {
      const [mx, mz] = toMap(world.missionTarget.x, world.missionTarget.z);
      const pulse = 5 + 2 * Math.sin(world.time * 4);
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.moveTo(mx, mz - pulse);
      ctx.lineTo(mx + pulse, mz);
      ctx.lineTo(mx, mz + pulse);
      ctx.lineTo(mx - pulse, mz);
      ctx.closePath();
      ctx.fill();
    }
    // Enemies red, police blue (roadblocks included), officers light blue.
    for (const e of world.enemies) {
      if (!e.alive) continue;
      const [mx, mz] = toMap(e.group.position.x, e.group.position.z);
      ctx.fillStyle = '#ff3a2e';
      ctx.beginPath();
      ctx.arc(mx, mz, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const car of world.policeCars) {
      const [mx, mz] = toMap(car.group.position.x, car.group.position.z);
      ctx.fillStyle = '#4a90ff';
      ctx.beginPath();
      ctx.arc(mx, mz, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const car of world.roadblocks || []) {
      const [mx, mz] = toMap(car.group.position.x, car.group.position.z);
      ctx.fillStyle = '#ff9a3e';
      ctx.beginPath();
      ctx.arc(mx, mz, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    drawVisionCones(ctx, toMap, world, size);
    drawShops(ctx, toMap, world, false);
    // Player arrow.
    const [px, pz] = toMap(world.playerX, world.playerZ);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(world.playerHeading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // North.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText('N', 6, 16);
  }

  // The full city map (M): same base as the minimap, bigger, with district
  // names, named venues, the GPS route, the current job and a legend.
  function drawBigMap(world) {
    if (!bigCtx) return;
    const size = 640;
    const ctx = bigCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const toMap = drawMapBase(ctx, size, world);
    if (world.searchZone) {
      const [zx, zy] = toMap(world.searchZone.x, world.searchZone.z);
      const zr = (world.searchZone.r / ((world.half + 20) * 2)) * size;
      ctx.strokeStyle = 'rgba(255, 90, 74, 0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(zx, zy, zr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 90, 74, 0.12)';
      ctx.fill();
      ctx.fillStyle = '#ff8a7a';
      ctx.font = 'bold 15px system-ui, sans-serif';
      // Clamped off the top edge: on a big search zone the header used to
      // touch the frame.
      ctx.fillText('SEARCH ZONE — leave it to lose the cops', zx + 8, Math.max(24, zy - zr - 6));
    }
    drawGpsRoute(ctx, toMap, world);
    // District names, from the config table: label at each district's
    // centre, clamped inside the canvas so long names near the east edge
    // (FUEGO BEACHFRONT) do not run off it. Three labels are moved off
    // their centre because a named venue sits there: BEACHFRONT goes to
    // the north end of the strip (short name, clear of the boardwalk),
    // PALM GARDENS goes to the park's far corner (clear of the safehouse),
    // and DOWNTOWN drops below the hospital label.
    const LABEL_POS = {
      beachfront: { x: 179, z: -100, name: 'BEACHFRONT' },
      'palm-gardens': { x: -135, z: -135 },
    };
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.font = 'bold 17px system-ui, sans-serif';
    for (const d of DISTRICTS) {
      if (d.id === 'downtown') continue; // the fallback has no centre worth labelling
      const pos = LABEL_POS[d.id] || d;
      const cx = (pos.x0 !== undefined ? (pos.x0 + pos.x1) / 2 : pos.x);
      const cz = (pos.z0 !== undefined ? (pos.z0 + pos.z1) / 2 : pos.z);
      const name = pos.name || d.name;
      const [mx, mz] = toMap(cx, cz);
      const w = ctx.measureText(name).width;
      const tx = Math.max(8, Math.min(mx - w / 2, size - w - 8));
      ctx.fillText(name, tx, mz);
    }
    // DOWNTOWN label, placed by hand in the south-centre, below the
    // hospital venue label so the two never print on top of each other.
    {
      const [mx, mz] = toMap(14, 135);
      ctx.fillText('DOWNTOWN', mx - 40, mz);
    }
    // Named venues. Labels near the east edge are right-aligned so they
    // do not run off the canvas; the tower label drops below the TOWER
    // PLAZA district name instead of printing on top of it.
    ctx.font = 'bold 15px system-ui, sans-serif';
    for (const key of Object.keys(world.landmarks)) {
      const lm = world.landmarks[key];
      const [mx, mz] = toMap(lm.x, lm.z);
      ctx.fillStyle = '#8ec9ee';
      ctx.fillRect(mx - 3, mz - 3, 6, 6);
      ctx.fillStyle = '#eaf4ff';
      if (key === 'tower') {
        ctx.fillText(lm.name, mx + 8, mz + 34);
      } else if (key === 'garage') {
        // Below the marker: the GPS route's last leg runs into the garage
        // from the side, and the label used to sit on the dashed line.
        ctx.fillText(lm.name, mx + 8, mz + 22);
      } else if (mx > size * 0.72) {
        ctx.textAlign = 'right';
        ctx.fillText(lm.name, mx - 8, mz + 5);
        ctx.textAlign = 'left';
      } else {
        ctx.fillText(lm.name, mx + 8, mz + 5);
      }
    }
    // Mission marker.
    if (world.missionTarget) {
      const [mx, mz] = toMap(world.missionTarget.x, world.missionTarget.z);
      const pulse = 8 + 3 * Math.sin(world.time * 4);
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.moveTo(mx, mz - pulse);
      ctx.lineTo(mx + pulse, mz);
      ctx.lineTo(mx, mz + pulse);
      ctx.lineTo(mx - pulse, mz);
      ctx.closePath();
      ctx.fill();
    }
    drawVisionCones(ctx, toMap, world, size);
    drawShops(ctx, toMap, world, true);
    // Player arrow.
    const [px, pz] = toMap(world.playerX, world.playerZ);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(world.playerHeading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // Legend.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText('N', 10, 22);
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillStyle = '#ffd23e';
    ctx.fillText('◆ mission target', 10, size - 46);
    ctx.fillStyle = '#ff8a7a';
    ctx.fillText('○ search zone', 10, size - 26);
    ctx.fillStyle = '#8ec9ee';
    ctx.fillText('■ named venue', 150, size - 26);
    ctx.fillStyle = '#eaf4ff';
    ctx.fillText('— GPS route', 290, size - 26);
  }

  return { update, drawMinimap, drawBigMap, showMessage, showAutosave, clockText };
}
