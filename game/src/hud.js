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
  const medalsEl = document.getElementById('hud-medals');
  const skillsEl = document.getElementById('hud-skills');
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
    // v9 iteration 5 (§5): the weekday leads the clock ("FRI · DAY 1 · 18:24").
    const weekday = state.weekday ? `${state.weekday} · ` : '';
    clockEl.textContent = `${weekday}${clockText(state.clockHour, state.day)}${season}`;
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
    // under it, package count below that. v9 iteration 5 (§3/§5): the
    // street underfoot leads the district ("Fuego Ave · DOWNTOWN"),
    // the REP bar fills toward the NEXT rank, the rank name shows, and
    // the medals + skill levels get their own lines.
    districtEl.textContent = state.street ? `${state.street} · ${state.district || ''}` : (state.district || '');
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
      repFill.style.width = `${Math.round((state.repProgress ?? 0) * 100)}%`;
      repFill.style.background = '#c98ae0';
    }
    if (repText) repText.textContent = state.repRank ? `REP ${rep} · ${state.repRank}` : `REP ${rep}`;
    if (packagesEl) {
      packagesEl.textContent = `◆ PACKAGES ${state.packages || 0}/${state.packagesTotal || 10}`;
    }
    if (medalsEl) {
      medalsEl.textContent = `● MEDALS ${state.medals || 0}/${state.medalsTotal || 24}`;
    }
    if (skillsEl && state.skills) {
      const s = state.skills;
      // v9 iteration 6: six stats on one line clipped past the 200 px
      // minimap column. Two lines of three, with the <br> rendered by
      // the pre-line style on #hud-skills (see index.html).
      skillsEl.textContent = `DRV ${s.driving} · STA ${s.stamina} · AIM ${s.aim}\nSTL ${s.stealth} · INF ${s.influence} · STR ${s.street}`;
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
  // `half` is the map's half-range in metres: the minimap covers ±190
  // (reaches the sea), the big map ±300 (reaches Fuego Island).
  function drawMapBase(ctx, size, world, half) {
    const toMap = (x, z) => [((x + half) / (half * 2)) * size, ((z + half) / (half * 2)) * size];
    ctx.fillStyle = 'rgba(10, 18, 26, 0.92)';
    ctx.fillRect(0, 0, size, size);
    // Sea east of the beach (x > 172) and the sand strip (x 142–172),
    // positioned in world coords so the shoreline never drifts when the
    // map range grows.
    const [seaX] = toMap(172, 0);
    ctx.fillStyle = '#1c4a6b';
    ctx.fillRect(Math.max(0, seaX), 0, size - Math.max(0, seaX), size);
    const [sandX] = toMap(142, 0);
    ctx.fillStyle = '#e6d3a3';
    ctx.fillRect(Math.max(0, sandX), 0, Math.max(0, seaX - sandX), size);
    // Fuego Pier (x 168–209, z 98–102) + causeway (x 209–222) as one
    // sand-coloured line, and Fuego Island (x 222–272, z 72–128) as a
    // grass island with a sand rim. On the minimap the island is
    // off-canvas and the canvas clips it; the big map shows it whole.
    const [pier0x, pierZ] = toMap(168, 100);
    const [pier1x] = toMap(222, 100);
    ctx.strokeStyle = '#d8c9a0';
    ctx.lineWidth = Math.max(2, size / 160);
    ctx.beginPath();
    ctx.moveTo(pier0x, pierZ);
    ctx.lineTo(pier1x, pierZ);
    ctx.stroke();
    const [isl0x, isl0z] = toMap(222, 72);
    const [isl1x, isl1z] = toMap(272, 128);
    ctx.fillStyle = '#3a6a3a';
    ctx.fillRect(isl0x, isl0z, isl1x - isl0x, isl1z - isl0z);
    ctx.strokeStyle = '#e6d3a3';
    ctx.lineWidth = 2;
    ctx.strokeRect(isl0x, isl0z, isl1x - isl0x, isl1z - isl0z);
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
  function drawVisionCones(ctx, toMap, world, size, half) {
    const scale = size / (half * 2);
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
  // for Pay 'n' Spray. The big map labels them too. v9 iteration 5: the
  // spray label hangs BELOW its marker — on the old right-hand side it
  // printed on top of the East Docks venue label (same z row).
  // v9 iteration 6: returns the label + diamond rects (when label is
  // true) so the big map's greedy placer can register them before it
  // places district/venue labels — the iter6 map shot showed PAY 'N'
  // SPRAY printed over Fuego Island because the placer could not see
  // this fixed label.
  function drawShops(ctx, toMap, world, label) {
    if (!world.shops) return [];
    const defs = [
      { s: world.shops.gun, color: '#8aff5a', name: 'AMMU-NATION', lx: 8, ly: 4, align: 'left' },
      { s: world.shops.spray, color: '#ff5aff', name: "PAY 'N' SPRAY", lx: 8, ly: 22, align: 'left' },
    ];
    const rects = [];
    for (const def of defs) {
      const { s, color, name } = def;
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
        ctx.textAlign = def.align;
        ctx.fillText(name, mx + def.lx, mz + def.ly);
        ctx.textAlign = 'left';
        // Collision rects: the label text (baseline at mz+ly, 13px font)
        // and the diamond itself, so no greedy label covers either.
        const w = ctx.measureText(name).width;
        rects.push({ x: mx + def.lx - 2, y: mz + def.ly - 11, w: w + 4, h: 18 });
        rects.push({ x: mx - 6, y: mz - 6, w: 12, h: 12 });
      }
    }
    return rects;
  }

  function drawMinimap(world) {
    const size = 200;
    const half = world.half + 40; // ±190: reaches the sea (x 172) and the pier start.
    const ctx = mapCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const toMap = drawMapBase(ctx, size, world, half);
    // Police search zone: the circle the heat cools outside of.
    if (world.searchZone) {
      const [zx, zy] = toMap(world.searchZone.x, world.searchZone.z);
      const zr = (world.searchZone.r / (half * 2)) * size;
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
    drawVisionCones(ctx, toMap, world, size, half);
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
    const half = world.half + 150; // ±300: reaches Fuego Island (x 272).
    const ctx = bigCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const toMap = drawMapBase(ctx, size, world, half);
    // The search-zone header's rect, captured so the greedy label placer
    // below can register it — the iter6 map shot showed PALM GARDENS
    // printed over this header because the placer could not see it.
    let searchHeaderRect = null;
    if (world.searchZone) {
      const [zx, zy] = toMap(world.searchZone.x, world.searchZone.z);
      const zr = (world.searchZone.r / (half * 2)) * size;
      ctx.strokeStyle = 'rgba(255, 90, 74, 0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(zx, zy, zr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 90, 74, 0.12)';
      ctx.fill();
      ctx.fillStyle = '#ff8a7a';
      ctx.font = 'bold 15px system-ui, sans-serif';
      // Centred inside the top of the circle: the old header sat above
      // the circle and clipped against the canvas edge on a big zone.
      const header = 'SEARCH ZONE — leave it to lose the cops';
      const hw = ctx.measureText(header).width;
      const hx = Math.max(8, Math.min(zx - hw / 2, size - hw - 8));
      const hy = Math.max(24, zy - zr + 22);
      ctx.fillText(header, hx, hy);
      searchHeaderRect = { x: hx - 2, y: hy - 14, w: hw + 4, h: 20 };
    }
    drawGpsRoute(ctx, toMap, world);
    // v9 iteration 6 — label placement is greedy and collision-free:
    // every label is a job with a priority (districts first, venues
    // second) and a preferred spot; the placer tries the preferred spot,
    // then nudges up / down / sideways in steps, and DROPS the label if
    // no free spot exists — a dropped venue label beats two labels
    // printed on top of each other. Markers stay at their landmarks;
    // only the text moves.
    const placed = [];
    // Fixed labels register FIRST, before any greedy label is placed:
    // the search-zone header (drawn above) and the shop labels (drawn
    // here, moved up from the end of the function) — both are fixed
    // spots the placer must route around. Without this the iter6 map
    // shot showed PALM GARDENS over the search header and PAY 'N'
    // SPRAY over Fuego Island.
    if (searchHeaderRect) placed.push(searchHeaderRect);
    for (const r of drawShops(ctx, toMap, world, true)) placed.push(r);
    // fillText draws with the BASELINE at y, so the collision rect is
    // [px, py - 14, w, 20] (14 px above the baseline, 6 below).
    function placeLabel(text, font, mx, mz, ox, oy) {
      ctx.font = font;
      const w = ctx.measureText(text).width;
      const h = 20;
      // Candidate baselines, preferred first, then nudges. The left-side
      // nudges (for edge labels like Fuego Island, whose preferred spot
      // runs off the canvas) also try up/down, and the long vertical
      // nudges clear a neighbour's whole label height.
      const cands = [
        [mx + ox, mz + oy],
        [mx + ox, mz + oy - 20],
        [mx + ox, mz + oy + 20],
        [mx + ox - w - 10, mz + oy],
        [mx + ox + 10, mz + oy],
        [mx + ox, mz + oy - 40],
        [mx + ox, mz + oy + 40],
        [mx + ox - w - 10, mz + oy - 20],
        [mx + ox - w - 10, mz + oy + 20],
        [mx + ox, mz + oy - 60],
        [mx + ox, mz + oy + 60],
      ];
      for (const [px, py] of cands) {
        const top = py - 14;
        if (px < 4 || px + w > size - 4 || top < 4 || py > size - 4) continue;
        let hit = false;
        for (const r of placed) {
          if (px < r.x + r.w + 4 && px + w + 4 > r.x && top < r.y + r.h + 4 && top + h + 4 > r.y) { hit = true; break; }
        }
        if (hit) continue;
        placed.push({ x: px, y: top, w, h });
        ctx.fillText(text, px, py);
        return true;
      }
      return false;
    }
    // District names, from the config table. Three labels are moved off
    // their centre because a named venue sits there: BEACHFRONT goes to
    // the north end of the strip (short name, clear of the boardwalk),
    // PALM GARDENS goes to the park's far corner (clear of the safehouse),
    // and DOWNTOWN drops below the hospital label.
    const LABEL_POS = {
      beachfront: { x: 179, z: -100, name: 'BEACHFRONT' },
      'palm-gardens': { x: -135, z: -135 },
    };
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    for (const d of DISTRICTS) {
      if (d.id === 'downtown') continue; // the fallback has no centre worth labelling
      const pos = LABEL_POS[d.id] || d;
      const cx = (pos.x0 !== undefined ? (pos.x0 + pos.x1) / 2 : pos.x);
      const cz = (pos.z0 !== undefined ? (pos.z0 + pos.z1) / 2 : pos.z);
      const name = pos.name || d.name;
      const [mx, mz] = toMap(cx, cz);
      // Centre the text on the district centre: measure first, then
      // offset by half the width (placeLabel takes a top-left offset).
      ctx.font = 'bold 17px system-ui, sans-serif';
      const w = ctx.measureText(name).width;
      placeLabel(name, 'bold 17px system-ui, sans-serif', mx, mz, -w / 2, 0);
    }
    // DOWNTOWN label, placed by hand in the south-centre, below the
    // hospital venue label so the two never print on top of each other.
    {
      const [mx, mz] = toMap(14, 135);
      placeLabel('DOWNTOWN', 'bold 17px system-ui, sans-serif', mx, mz, -40, 0);
    }
    // Named venues. Labels near the east edge are right-aligned so they
    // do not run off the canvas; the tower label drops below the TOWER
    // PLAZA district name instead of printing on top of it.
    for (const key of Object.keys(world.landmarks)) {
      const lm = world.landmarks[key];
      const [mx, mz] = toMap(lm.x, lm.z);
      ctx.fillStyle = '#8ec9ee';
      ctx.fillRect(mx - 3, mz - 3, 6, 6);
      ctx.fillStyle = '#eaf4ff';
      ctx.font = 'bold 15px system-ui, sans-serif';
      const w = ctx.measureText(lm.name).width;
      if (key === 'tower') {
        placeLabel(lm.name, 'bold 15px system-ui, sans-serif', mx, mz, 8, 34);
      } else if (key === 'garage') {
        // Below the marker: the GPS route's last leg runs into the garage
        // from the side, and the label used to sit on the dashed line.
        placeLabel(lm.name, 'bold 15px system-ui, sans-serif', mx, mz, 8, 22);
      } else if (mx > size * 0.72) {
        placeLabel(lm.name, 'bold 15px system-ui, sans-serif', mx, mz, -w - 8, 5);
      } else {
        placeLabel(lm.name, 'bold 15px system-ui, sans-serif', mx, mz, 8, 5);
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
    drawVisionCones(ctx, toMap, world, size, half);
    // (drawShops moved up: its labels register before the greedy labels
    // are placed, so they cannot be printed over.)
    // v9 iteration 5 (§2/§3): courier pickups (gold rings — the active
    // job's drop is a green ring), race starts (white squares) and
    // medals (gold dots, once Street Sense is 2+). Finished jobs and
    // taken medals are not drawn; REP-locked jobs draw dimmed so the
    // player can see what is coming.
    if (world.deliveries) {
      for (const d of world.deliveries) {
        if (d.done) continue;
        const [mx, mz] = toMap(d.pickup.x, d.pickup.z);
        ctx.strokeStyle = d.locked ? 'rgba(255, 210, 62, 0.35)' : '#ffd23e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mx, mz, 6, 0, Math.PI * 2);
        ctx.stroke();
        if (d.active) {
          const [dx, dz] = toMap(d.drop.x, d.drop.z);
          ctx.strokeStyle = '#7dff8a';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(dx, dz, 8, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
    if (world.races) {
      for (const r of world.races) {
        if (r.won) continue;
        const [mx, mz] = toMap(r.start.x, r.start.z);
        ctx.fillStyle = r.locked ? 'rgba(255, 255, 255, 0.35)' : '#ffffff';
        ctx.fillRect(mx - 5, mz - 5, 10, 10);
        ctx.strokeStyle = '#111111';
        ctx.lineWidth = 1;
        ctx.strokeRect(mx - 5, mz - 5, 10, 10);
      }
    }
    if (world.showMedals && world.medals) {
      ctx.fillStyle = '#ffd23e';
      for (const m of world.medals) {
        if (m.taken) continue;
        const [mx, mz] = toMap(m.x, m.z);
        ctx.beginPath();
        ctx.arc(mx, mz, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
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
    ctx.fillStyle = '#ffd23e';
    ctx.fillText('○ delivery pickup', 410, size - 26);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('□ race start', 410, size - 46);
    ctx.fillStyle = '#ffd23e';
    ctx.fillText('● medal', 540, size - 46);
  }

  return { update, drawMinimap, drawBigMap, showMessage, showAutosave, clockText };
}
