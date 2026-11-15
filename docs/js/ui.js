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
    this.state = { title: 'Shadow Hands', hint: '', match: 0, hold: 0 };
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
    round(g, 0, 0, W, H, 36); g.fillStyle = 'rgba(18,18,24,0.94)'; g.fill();

    g.fillStyle = '#fff'; g.font = 'bold 56px system-ui, sans-serif'; g.textBaseline = 'alphabetic';
    g.fillText(s.title, 40, 90, 760);
    g.font = '34px system-ui, sans-serif'; g.fillStyle = '#d8d8e0';
    wrap(g, s.hint, 40, 150, 760, 42, 3);

    // match bar
    round(g, 40, 300, 760, 44, 22); g.fillStyle = 'rgba(255,255,255,0.15)'; g.fill();
    if (s.match > 0.005) {
      round(g, 40, 300, Math.max(44, 760 * s.match), 44, 22);
      g.fillStyle = matchColor(s.match); g.fill();
    }
    g.font = '26px system-ui, sans-serif'; g.fillStyle = '#9a9aa8'; g.fillText('match', 40, 380);

    // hold ring
    const cx = 900, cy = 200, r = 72;
    g.lineWidth = 18; g.strokeStyle = 'rgba(255,255,255,0.15)';
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    if (s.hold > 0.001) {
      g.strokeStyle = '#4fe06a'; g.lineCap = 'round';
      g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.hold); g.stroke();
    }
    g.font = '26px system-ui, sans-serif'; g.fillStyle = '#9a9aa8'; g.textAlign = 'center';
    g.fillText('hold', cx, cy + 10); g.textAlign = 'left';

    for (const b of BUTTONS) {
      round(g, b.x, b.y, b.w, b.h, 22);
      g.fillStyle = this.flash.id === b.id ? '#4fe06a' : this.hover === b.id ? '#5a6080' : '#3c4258';
      g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 40px system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 14, b.w - 20); g.textAlign = 'left';
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
