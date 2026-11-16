import * as THREE from 'three';

const W = 1024, H = 683;                 // canvas px for a 0.6 x 0.4 m panel
const PW = 0.6, PH = 0.4;
const BUTTONS = [
  { id: 'story', label: 'Story', x: 40, y: 470, w: 210, h: 110 },
  { id: 'daily', label: 'Daily', x: 280, y: 470, w: 210, h: 110 },
  { id: 'skip', label: 'Skip', x: 520, y: 470, w: 210, h: 110 },
  { id: 'recenter', label: 'Recenter', x: 760, y: 470, w: 224, h: 110 },
];
const PRESS_DEPTH = 0.008, FRONT = 0.02, BEHIND = -0.05, COOLDOWN = 0.5;

/**
 * Desk panel: level title, hint, match bar, hold ring and four big poke buttons.
 * Pressing = an index fingertip crossing the panel surface from the front (hands only),
 * or a mouse click on desktop.
 */
export class DeskPanel {
  constructor(onPress) {
    this.onPress = onPress;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true }));
    this.state = { title: 'Shadow Hands', hint: '', match: 0, hold: 0, dots: null, sub: '' };
    this.fingers = new Map();      // hand index -> { z, cooldown }
    this.hover = null;
    this.flash = { id: null, until: 0 };
    this._dirty = true;
    this._lastDraw = -1;
    this._local = new THREE.Vector3();
  }

  set(patch) {
    for (const k in patch) if (this.state[k] !== patch[k]) { this.state[k] = patch[k]; this._dirty = true; }
  }

  /** tips: array of {i, pos: Vector3|null} for each hand's index fingertip. */
  update(now, tips) {
    let hover = null;
    for (const { i, pos } of tips) {
      const f = this.fingers.get(i) || { z: 1, cooldown: 0 };
      if (!pos) { f.z = 1; this.fingers.set(i, f); continue; }
      const l = this.mesh.worldToLocal(this._local.copy(pos));
      const btn = this._hit(l.x, l.y);
      if (btn && l.z < FRONT && l.z > BEHIND) hover = btn.id;
      if (btn && f.z >= PRESS_DEPTH && l.z < PRESS_DEPTH && l.z > BEHIND && now > f.cooldown) {
        f.cooldown = now + COOLDOWN;
        this._press(btn, now);
      }
      f.z = l.z;
      this.fingers.set(i, f);
    }
    if (hover !== this.hover) { this.hover = hover; this._dirty = true; }
    if (this.flash.id && now > this.flash.until) { this.flash.id = null; this._dirty = true; }
    if (this._dirty && now - this._lastDraw > 0.05) this._draw(now);
  }

  /** Desktop: uv from a raycast hit on the panel. */
  clickUV(uv, now) {
    const btn = this._hit((uv.x - 0.5) * PW, (uv.y - 0.5) * PH);
    if (btn) this._press(btn, now);
  }

  _press(btn, now) {
    this.flash = { id: btn.id, until: now + 0.25 };
    this._dirty = true;
    this.onPress(btn.id);
  }

  _hit(x, y) {
    if (Math.abs(x) > PW / 2 || Math.abs(y) > PH / 2) return null;
    const cx = (x / PW + 0.5) * W, cy = (0.5 - y / PH) * H;
    return BUTTONS.find((b) => cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h) || null;
  }

  _draw(now) {
    const g = this.g, s = this.state;
    this._dirty = false; this._lastDraw = now;
    g.clearRect(0, 0, W, H);
    // theatre card: warm dark gradient, gold hairline
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, 'rgba(38,28,24,0.96)'); bg.addColorStop(1, 'rgba(16,12,12,0.96)');
    round(g, 0, 0, W, H, 36); g.fillStyle = bg; g.fill();
    round(g, 8, 8, W - 16, H - 16, 30); g.strokeStyle = 'rgba(201,154,62,0.55)'; g.lineWidth = 3; g.stroke();

    g.textBaseline = 'alphabetic';
    g.fillStyle = '#fbefd6'; g.font = 'bold 54px Georgia, "Times New Roman", serif';
    g.fillText(s.title, 44, 88, 720);
    g.font = '32px system-ui, sans-serif'; g.fillStyle = '#d9cdb8';
    wrap(g, s.hint, 44, 146, 740, 40, 2);

    // progress dots (story) or a sub-line (daily streak etc.)
    if (s.dots) {
      for (let i = 0; i < s.dots.total; i++) {
        const x = 56 + i * 44, y = 252, done = i < s.dots.done, cur = i === s.dots.current;
        g.beginPath(); g.arc(x, y, cur ? 13 : 10, 0, Math.PI * 2);
        if (done) { g.fillStyle = '#e6b04a'; g.fill(); }
        else { g.lineWidth = cur ? 4 : 3; g.strokeStyle = cur ? '#fbefd6' : 'rgba(251,239,214,0.3)'; g.stroke(); }
      }
    } else if (s.sub) {
      g.font = '28px system-ui, sans-serif'; g.fillStyle = '#e6b04a'; g.fillText(s.sub, 44, 262);
    }

    // match bar
    round(g, 44, 300, 740, 40, 20); g.fillStyle = 'rgba(255,240,215,0.12)'; g.fill();
    if (s.match > 0.005) {
      const mw = Math.max(40, 740 * s.match);
      const mg = g.createLinearGradient(44, 0, 44 + mw, 0);
      mg.addColorStop(0, '#b5482a'); mg.addColorStop(1, matchColor(s.match));
      round(g, 44, 300, mw, 40, 20); g.fillStyle = mg; g.fill();
    }
    g.font = '24px system-ui, sans-serif'; g.fillStyle = '#9d907c'; g.fillText('match', 44, 374);

    // hold ring
    const cx = 900, cy = 200, r = 72;
    g.lineWidth = 16; g.strokeStyle = 'rgba(255,240,215,0.12)';
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    if (s.hold > 0.001) {
      g.strokeStyle = '#f2c14e'; g.lineCap = 'round';
      g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.hold); g.stroke();
      g.lineCap = 'butt';
    }
    g.font = '24px system-ui, sans-serif'; g.fillStyle = '#9d907c'; g.textAlign = 'center';
    g.fillText('hold', cx, cy + 9); g.textAlign = 'left';

    for (const b of BUTTONS) {
      round(g, b.x, b.y, b.w, b.h, 24);
      const on = this.flash.id === b.id, hv = this.hover === b.id;
      const bgB = g.createLinearGradient(0, b.y, 0, b.y + b.h);
      bgB.addColorStop(0, on ? '#f2c14e' : hv ? '#6a4a34' : '#4a3426'); bgB.addColorStop(1, on ? '#c48a2c' : hv ? '#4e3424' : '#33231a');
      g.fillStyle = bgB; g.fill();
      g.strokeStyle = 'rgba(201,154,62,0.5)'; g.lineWidth = 2; g.stroke();
      g.fillStyle = on ? '#2a1a08' : '#fbefd6'; g.font = 'bold 38px system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 13, b.w - 20); g.textAlign = 'left';
    }
    this.tex.needsUpdate = true;
  }
}

function matchColor(t) {
  const lerp = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const c = t < 0.6 ? lerp([230, 77, 51], [255, 204, 51], t / 0.6) : lerp([255, 204, 51], [77, 230, 102], (t - 0.6) / 0.4);
  return `rgb(${c.join(',')})`;
}

function round(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function wrap(g, text, x, y, maxW, lh, maxLines) {
  const words = (text || '').split(' ');
  let line = '', n = 0;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, y + n * lh); line = w;
      if (++n >= maxLines) return;
    } else line = test;
  }
  if (line) g.fillText(line, x, y + n * lh);
}
