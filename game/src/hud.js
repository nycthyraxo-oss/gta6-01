// hud.js — every DOM overlay for Costa Fuego: the in-game HUD, minimap,
// fullscreen city map, quest panel, dialogue box and the menu screens.
// game.js owns the state; this module only paints it.

import { cfg, AVENUES, STREETS, DISTRICTS, LANDMARKS, SHOPS, REP_RANKS, repRank, WEAPONS, weekdayOf } from './config.js';

function el(id) { return document.getElementById(id); }

const MAP = { scale: 0.98, ox: 180, oy: 155 };
const MAP_COLORS = { grass: '#3a6a3a', sea: '#1c4a6b', road: '#5a6068', sand: '#e8d29a', land: '#8fae7a' };

export class Hud {
  constructor() {
    this.questCollapsed = false;
    this.toastTimer = 0;
    this.bannerTimer = 0;
    this.dialogueQueue = [];
    this.dialogueOpen = false;
    this.dialogueTimer = 0;
    this.questLogLines = [];
    this.minimap = el('minimap');
    this.minictx = this.minimap ? this.minimap.getContext('2d') : null;
    this.bigmap = el('bigmap');
    this.bigctx = this.bigmap ? this.bigmap.getContext('2d') : null;
    this.mapOpen = false;
    const toggle = el('hud-quest-toggle');
    if (toggle) toggle.addEventListener('click', () => this.toggleQuest());
  }

  toggleQuest() {
    this.questCollapsed = !this.questCollapsed;
    const panel = el('hud-quest');
    const toggle = el('hud-quest-toggle');
    if (panel) panel.classList.toggle('collapsed', this.questCollapsed);
    if (toggle) toggle.textContent = this.questCollapsed ? '+' : '—';
  }

  toast(text, seconds = 3.5) {
    const m = el('hud-message');
    if (!m) return;
    m.textContent = text;
    m.style.opacity = '1';
    this.toastTimer = seconds;
  }

  banner(text, seconds = 3) {
    const b = el('hud-bigbanner');
    if (!b) return;
    b.textContent = text;
    b.style.opacity = '1';
    this.bannerTimer = seconds;
  }

  showDialogue(lines) {
    this.dialogueQueue = lines.slice();
    this.dialogueOpen = this.dialogueQueue.length > 0;
    this.dialogueTimer = 4.5;
    for (const line of lines) this.questLogLines.push(line.who + ': ' + line.line);
    this.paintDialogue();
    this.paintQuestLog();
  }

  advanceDialogue() {
    if (!this.dialogueOpen) return false;
    this.dialogueQueue.shift();
    this.dialogueOpen = this.dialogueQueue.length > 0;
    this.dialogueTimer = 4.5;
    this.paintDialogue();
    return true;
  }

  paintDialogue() {
    const box = el('hud-dialogue');
    const speaker = el('hud-speaker');
    const text = el('hud-dialogue-text');
    if (!box) return;
    if (!this.dialogueOpen) { box.style.opacity = '0'; return; }
    const line = this.dialogueQueue[0];
    if (speaker) speaker.textContent = line.who;
    if (text) text.textContent = line.line;
    box.style.opacity = '1';
  }

  paintQuestLog() {
    const log = el('hud-quest-log');
    if (log) log.textContent = this.questLogLines.slice(-4).join('  ·  ');
  }

  showScreen(id) {
    for (const s of ['screen-title', 'screen-job', 'screen-over', 'screen-pause', 'screen-controls', 'screen-shop', 'screen-map']) {
      const node = el(s);
      if (node) node.style.display = s === id ? 'flex' : 'none';
    }
    const hud = el('hud');
    if (hud) hud.style.display = id ? 'none' : 'block';
  }

  hideScreens() { this.showScreen(null); }

  setSaveStatus(text) {
    const s = el('save-status-text');
    if (s) s.textContent = text;
  }

  update(dt, state) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) { const m = el('hud-message'); if (m) m.style.opacity = '0'; }
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) { const b = el('hud-bigbanner'); if (b) b.style.opacity = '0'; }
    }
    if (this.dialogueOpen) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0) this.advanceDialogue();
    }
    const p = state.player;
    const cash = el('hud-cash');
    if (cash) cash.textContent = '$' + Math.floor(p.cash);
    const stars = el('hud-stars');
    if (stars) stars.textContent = '★'.repeat(state.wanted.stars) + '☆'.repeat(5 - state.wanted.stars);
    const health = el('hud-healthtext');
    if (health) health.textContent = 'HP ' + Math.max(0, Math.ceil(p.health));
    const hfill = el('hud-healthfill');
    if (hfill) hfill.style.width = Math.max(0, p.health) + '%';
    const clock = el('hud-clock');
    if (clock) {
      const h = Math.floor(state.hour) % 24;
      const m = Math.floor((state.hour % 1) * 60);
      clock.textContent = weekdayOf(state.day) + ' · DAY ' + state.day + ' · ' +
        String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    }
    const district = el('hud-district-name');
    if (district) district.textContent = state.streetLabel;
    const speed = el('hud-speed');
    if (speed) speed.textContent = state.inCar ? Math.abs(Math.round(state.carSpeed * 3.6)) + ' km/h' : '';
    const carName = el('hud-car');
    if (carName) carName.textContent = state.inCar ? state.carName : 'ON FOOT';
    const weapon = el('hud-weapon');
    if (weapon) weapon.textContent = state.weaponText;
    for (let i = 2; i <= 4; i++) {
      const wEl = el('hud-weapon' + i);
      if (wEl) wEl.textContent = state.weaponSlots[i - 1] || '';
    }
    const repText = el('hud-reptext');
    if (repText) repText.textContent = 'REP ' + state.rep + ' · ' + repRank(state.rep).name;
    const repFill = el('hud-repfill');
    if (repFill) {
      const rank = repRank(state.rep);
      const next = REP_RANKS[REP_RANKS.indexOf(rank) + 1];
      const pct = next ? Math.min(100, ((state.rep - rank.rep) / (next.rep - rank.rep)) * 100) : 100;
      repFill.style.width = pct + '%';
    }
    const skills = el('hud-skills');
    if (skills) skills.textContent = 'DRV ' + state.skills.driving + ' · STR ' + state.skills.street;
    const medals = el('hud-medals');
    if (medals) medals.textContent = '🏅 ' + state.medalsEarned + '/' + state.medalsTotal;
    const chapter = el('hud-chapter');
    if (chapter) chapter.textContent = state.chapter;
    const next = el('hud-next');
    if (next) next.textContent = state.nextChapter;
    const objective = el('hud-objective');
    if (objective) objective.textContent = state.objective;
    const targetDist = el('hud-target-dist');
    if (targetDist) targetDist.textContent = state.targetDist === null ? '' : Math.round(state.targetDist) + ' m';
    const cross = el('crosshair');
    if (cross) cross.style.display = state.inCar ? 'none' : 'block';
    const radio = el('hud-radio');
    if (radio) radio.textContent = state.radioName;
    const spot = el('hud-spotlight');
    if (spot) spot.style.display = state.spotlight ? 'block' : 'none';
    this.paintMinimap(state);
    if (this.mapOpen) this.paintBigMap(state);
  }

  worldToMap(x, z, w, h) {
    const wx = cfg.world;
    const px = ((x - wx.minX) / (wx.maxX - wx.minX)) * w;
    const pz = ((z - wx.minZ) / (wx.maxZ - wx.minZ)) * h;
    return [px, pz];
  }

  bigToMap(x, z) {
    return [MAP.ox + (x + 150) * MAP.scale, MAP.oy + (z + 150) * MAP.scale];
  }

  paintMapBase(ctx, w, h, detailed) {
    ctx.fillStyle = '#7fae6a';
    ctx.fillRect(0, 0, w, h);
    // sea
    ctx.fillStyle = '#2b7fb8';
    const [seaX] = this.worldToMap(196, 0, w, h);
    ctx.fillRect(seaX, 0, w - seaX, h);
    // sand
    ctx.fillStyle = '#e8d29a';
    const [sandX] = this.worldToMap(176, 0, w, h);
    ctx.fillRect(sandX, 0, seaX - sandX, h);
    if (detailed) {
      const tints = { glass: '#a8c8dc', brick: '#c89878', deco: '#f2e3c2', stucco: '#e8cfa8', residential: '#d8c8b0', mercado: '#e8b878', marina: '#bcd8e4', park: '#a8d498', commercial: '#d8d0c0' };
      for (const d of DISTRICTS) {
        if (d.name === 'DOWNTOWN') continue;
        const [x0, z0] = this.worldToMap(d.x0, d.z0, w, h);
        const [x1, z1] = this.worldToMap(d.x1, d.z1, w, h);
        ctx.fillStyle = tints[d.style] || '#cccccc';
        ctx.fillRect(x0, z0, x1 - x0, z1 - z0);
      }
    }
    // roads
    ctx.strokeStyle = '#4a5058';
    ctx.lineWidth = Math.max(2, w / 90);
    for (const a of AVENUES) {
      const [x, z0] = this.worldToMap(a.x, cfg.world.minZ, w, h);
      const [, z1] = this.worldToMap(a.x, cfg.world.maxZ, w, h);
      ctx.beginPath(); ctx.moveTo(x, z0); ctx.lineTo(x, z1); ctx.stroke();
    }
    for (const s of STREETS) {
      const [x0, z] = this.worldToMap(cfg.world.minX, s.z, w, h);
      const [x1] = this.worldToMap(cfg.world.maxX, s.z, w, h);
      ctx.beginPath(); ctx.moveTo(x0, z); ctx.lineTo(x1, z); ctx.stroke();
    }
  }

  paintMinimap(state) {
    if (!this.minictx) return;
    const w = this.minimap.width, h = this.minimap.height;
    const ctx = this.minictx;
    this.paintMapBase(ctx, w, h, false);
    ctx.fillStyle = '#3366dd';
    for (const c of state.policeCars) {
      const [x, z] = this.worldToMap(c.x, c.z, w, h);
      ctx.fillRect(x - 2, z - 2, 4, 4);
    }
    if (state.target) {
      const [x, z] = this.worldToMap(state.target.x, state.target.z, w, h);
      ctx.fillStyle = '#ffd75e';
      ctx.beginPath(); ctx.arc(x, z, 4, 0, Math.PI * 2); ctx.fill();
    }
    const [px, pz] = this.worldToMap(state.player.x, state.player.z, w, h);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(state.playerHeading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(-4, 5); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  paintBigMap(state) {
    if (!this.bigctx) return;
    const w = this.bigmap.width, h = this.bigmap.height;
    const ctx = this.bigctx;
    // sea everywhere, then land, island, districts, roads on top
    ctx.fillStyle = MAP_COLORS.sea;
    ctx.fillRect(0, 0, w, h);
    const [lx0, lz0] = this.bigToMap(-150, -150);
    const [lx1, lz1] = this.bigToMap(196, 150);
    ctx.fillStyle = MAP_COLORS.land;
    ctx.fillRect(lx0, lz0, lx1 - lx0, lz1 - lz0);
    const [sx0] = this.bigToMap(153, 0);
    ctx.fillStyle = MAP_COLORS.sand;
    ctx.fillRect(sx0, lz0, lx1 - sx0, lz1 - lz0);
    // causeway first, island disc on top so the island reads grass
    ctx.fillStyle = MAP_COLORS.road;
    const [cx0, cz0] = this.bigToMap(160, 92);
    const [cx1, cz1] = this.bigToMap(251, 108);
    ctx.fillRect(cx0, cz0, cx1 - cx0, cz1 - cz0);
    const [ix, iz] = this.bigToMap(cfg.world.islandX, cfg.world.islandZ);
    ctx.fillStyle = MAP_COLORS.grass;
    ctx.beginPath(); ctx.arc(ix, iz, cfg.world.islandR * MAP.scale, 0, Math.PI * 2); ctx.fill();
    const tints = { glass: '#a8c8dc', brick: '#c89878', deco: '#f2e3c2', stucco: '#e8cfa8', residential: '#d8c8b0', mercado: '#e8b878', marina: '#bcd8e4', park: '#a8d498', commercial: '#d8d0c0' };
    for (const d of DISTRICTS) {
      if (d.name === 'DOWNTOWN') continue;
      const [x0, z0] = this.bigToMap(d.x0, d.z0);
      const [x1, z1] = this.bigToMap(d.x1, d.z1);
      ctx.fillStyle = tints[d.style] || '#cccccc';
      ctx.fillRect(x0, z0, x1 - x0, z1 - z0);
      ctx.fillStyle = 'rgba(20,30,40,0.75)';
      ctx.font = 'bold 10px Arial';
      ctx.fillText(d.name, x0 + 4, z0 + 13);
    }
    // roads as filled bands
    ctx.fillStyle = MAP_COLORS.road;
    for (const a of AVENUES) {
      const [x] = this.bigToMap(a.x - 10, 0);
      ctx.fillRect(x, lz0, 20 * MAP.scale, lz1 - lz0);
    }
    for (const s of STREETS) {
      const [, z] = this.bigToMap(0, s.z - 10);
      ctx.fillRect(lx0, z, lx1 - lx0, 20 * MAP.scale);
    }
    ctx.fillStyle = '#20262e';
    ctx.font = '9px Arial';
    for (const l of LANDMARKS) {
      if (l.id === 'island' || l.id === 'islandgate') continue;
      const [x, z] = this.bigToMap(l.x, l.z);
      ctx.fillRect(x - 2, z - 2, 4, 4);
      ctx.fillText(l.name, x + 4, z + 3);
    }
    ctx.fillStyle = '#7a2ea0';
    for (const s of SHOPS) {
      const [x, z] = this.bigToMap(s.x, s.z);
      ctx.fillRect(x - 2, z - 2, 4, 4);
      ctx.fillText(s.name, x + 4, z + 3);
    }
    if (state.target) {
      const [px, pz] = this.bigToMap(state.player.x, state.player.z);
      const [tx, tz] = this.bigToMap(state.target.x, state.target.z);
      ctx.strokeStyle = '#ffd75e';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(px, pz); ctx.lineTo(tx, tz); ctx.stroke();
      ctx.fillStyle = '#ffd75e';
      ctx.beginPath(); ctx.arc(tx, tz, 6, 0, Math.PI * 2); ctx.fill();
    }
    const [px, pz] = this.bigToMap(state.player.x, state.player.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(state.playerHeading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(-6, 7); ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('COSTA FUEGO — M to close', 12, 22);
  }

  toggleMap() {
    this.mapOpen = !this.mapOpen;
    return this.mapOpen;
  }

  closeMap() { this.mapOpen = false; }

  weaponListText(owned, currentId) {
    return WEAPONS.filter(w => owned.includes(w.id))
      .map(w => (w.id === currentId ? '▸ ' : '· ') + w.name)
      .join('  ');
  }

  weaponSlotsText(rep, owned) {
    return WEAPONS.map((w, i) => {
      const locked = rep < w.repNeed;
      return (i + 1) + ' · ' + w.name.toUpperCase() + (locked ? ' LOCKED (REP ' + w.repNeed + ')' : '');
    });
  }
}
