import * as THREE from 'three';

// Layers. 1 and 2 are reserved by three.js for the left/right XR eye cameras.
export const LAYER_WALL = 5;
export const LAYER_HANDS = 6;

/**
 * Measures how well the REAL cast shadow on the wall matches a target silhouette (IoU).
 *
 * An orthographic "wall camera" renders only the wall (+ the hands layer, so hands cast shadows in
 * this render: three.js filters shadow casters by the viewing camera's layers). Its near/far planes
 * hug the wall, so hand geometry itself is never in the image. Each pixel is compared with the
 * brightest value it has ever had (its "lit reference"), so spot-light falloff at the edges is not
 * mistaken for shadow.
 */
export class ShadowScorer {
  constructor(renderer, scene, wall, { res = 128, ratio = 0.55, minLit = 25, everyN = 2, frame = 0.9 } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.res = res;
    this.ratio = ratio;
    this.minLit = minLit;
    this.everyN = everyN;
    this.rt = new THREE.WebGLRenderTarget(res, res, { depthBuffer: true });
    const h = frame / 2;
    this.cam = new THREE.OrthographicCamera(-h, h, h, -h, 0.45, 0.55);
    this.cam.position.set(0, 0, 0.5);           // 0.5 m in front of the wall, looking at it (-Z)
    this.cam.layers.set(LAYER_WALL);
    this.cam.layers.enable(LAYER_HANDS);
    wall.add(this.cam);

    const n = res * res;
    this.buf = new Uint8Array(n * 4);
    this.litRef = new Uint8Array(n);
    this.shadow = new Uint8Array(n);
    this.target = null;
    this.score = 0;
    this.coverage = 0;
    this.onScore = null;
    this._frame = 0;
    this._pending = false;
  }

  /** Mask image: dark = silhouette. Built bottom-up to match readPixels row order. */
  setTarget(img) {
    if (!img) { this.target = null; return; }
    const r = this.res;
    const c = document.createElement('canvas');
    c.width = c.height = r;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, r, r);
    const px = g.getImageData(0, 0, r, r).data;
    const t = new Uint8Array(r * r);
    for (let y = 0; y < r; y++)
      for (let x = 0; x < r; x++) {
        const i = ((r - 1 - y) * r + x) * 4;          // flip: canvas row 0 is the top
        t[y * r + x] = px[i] < 128 ? 1 : 0;
      }
    this.target = t;
  }

  clearTarget() { this.target = null; }
  resetLitReference() { this.litRef.fill(0); }

  update() {
    if (this._pending || (++this._frame % this.everyN) !== 0) return;
    const r = this.renderer;
    const xrWas = r.xr.enabled;
    const prevTarget = r.getRenderTarget();
    r.xr.enabled = false;                          // render a plain (non-stereo) view into the RT
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(this.scene, this.cam);
    r.setRenderTarget(prevTarget);
    r.xr.enabled = xrWas;

    if (r.readRenderTargetPixelsAsync) {
      this._pending = true;
      r.readRenderTargetPixelsAsync(this.rt, 0, 0, this.res, this.res, this.buf)
        .then(() => { this._pending = false; this._evaluate(); })
        .catch((e) => { this._pending = false; console.error('[scorer]', e); });
    } else {
      r.readRenderTargetPixels(this.rt, 0, 0, this.res, this.res, this.buf);
      this._evaluate();
    }
  }

  _evaluate() {
    const n = this.res * this.res, buf = this.buf, ref = this.litRef, sh = this.shadow, t = this.target;
    let inter = 0, union = 0, shadowCount = 0, scored = 0;
    for (let i = 0; i < n; i++) {
      const p = buf[i * 4];                         // red channel; the wall is white
      if (p > ref[i]) ref[i] = p;
      const lit = ref[i];
      if (lit < this.minLit) { sh[i] = 0; continue; }
      scored++;
      const s = p < lit * this.ratio ? 1 : 0;
      sh[i] = s;
      shadowCount += s;
      if (!t) continue;
      if (s && t[i]) inter++;
      if (s || t[i]) union++;
    }
    this.coverage = scored ? shadowCount / scored : 0;
    if (!t) return;
    this.score = union ? inter / union : 0;
    if (this.onScore) this.onScore(this.score);
  }

  /** Debug: the current shadow as a black-on-white canvas (top-down), e.g. for recording targets. */
  captureCanvas() {
    const r = this.res, c = document.createElement('canvas');
    c.width = c.height = r;
    const g = c.getContext('2d'), img = g.createImageData(r, r);
    for (let y = 0; y < r; y++)
      for (let x = 0; x < r; x++) {
        const v = this.shadow[(r - 1 - y) * r + x] ? 0 : 255, i = (y * r + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    return c;
  }
}
