import * as THREE from 'three';

// Goal outline + "it's alive" burst. All on layer 0 only (never seen by the scorer's wall camera).

/** Soft outline band just outside the silhouette, as a white alpha texture (tinted by the material). */
export function rimTexture(img, size = 512, blur = 9) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.shadowColor = 'rgba(255,255,255,1)'; g.shadowBlur = blur;
  for (let i = 0; i < 3; i++) g.drawImage(img, 0, 0, size, size);   // strengthen the glow
  g.shadowBlur = 0;
  g.globalCompositeOperation = 'source-in';                          // make everything white
  g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'destination-out';                    // cut the inside: outline only
  g.drawImage(img, 0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const COLD = new THREE.Color(0x3a3640), HOT = new THREE.Color(0xff7a14), GOLD = new THREE.Color(0xffc23a);

export class GoalFx {
  constructor(wall, frame) {
    this.rimMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, color: COLD.clone(), opacity: 0.55 });
    this.rim = new THREE.Mesh(new THREE.PlaneGeometry(frame, frame), this.rimMat);
    this.rim.position.z = 0.0015; this.rim.renderOrder = 1;
    wall.add(this.rim);
    this.rims = {};
  }
  setTarget(file, overlayTex) {
    if (!this.rims[file]) this.rims[file] = rimTexture(overlayTex.image);
    this.rimMat.map = this.rims[file]; this.rimMat.needsUpdate = true;
    this.rim.visible = true;
  }
  hide() { this.rim.visible = false; }
  /** match/hold 0..1 */
  update(now, match, hold) {
    const m = match * match;
    this.rimMat.color.copy(COLD).lerp(HOT, m);
    if (hold > 0) this.rimMat.color.lerp(GOLD, hold * (0.5 + 0.5 * Math.sin(now * 16)));
    this.rimMat.opacity = 0.45 + 0.5 * m;
  }
}

/** Warm flash on the screen + golden sparks rising out of the creature's shape. */
export class Burst {
  constructor(wall, maskImg, frame, n = 110) {
    this.wall = wall; this.t = 0; this.life = 1.8;
    const S = 96, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(maskImg, 0, 0, S, S);
    const px = g.getImageData(0, 0, S, S).data, cells = [];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (px[(y * S + x) * 4] < 128) cells.push([x, y]);
    const pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.n = n;
    let cx = 0, cy = 0;
    for (let i = 0; i < n; i++) {
      const [x, y] = cells.length ? cells[(Math.random() * cells.length) | 0] : [S / 2, S / 2];
      const wx = (x / S - 0.5) * frame, wy = (0.5 - y / S) * frame;
      pos.set([wx, wy, 0.004], i * 3); cx += wx; cy += wy;
    }
    cx /= n; cy /= n;
    for (let i = 0; i < n; i++) {
      const dx = pos[i * 3] - cx, dy = pos[i * 3 + 1] - cy, d = Math.hypot(dx, dy) || 1, sp = 0.05 + Math.random() * 0.12;
      this.vel.set([dx / d * sp, dy / d * sp + 0.06 + Math.random() * 0.06, 0], i * 3);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dot = document.createElement('canvas'); dot.width = dot.height = 32;
    const dg = dot.getContext('2d'), r = dg.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,220,140,0.9)'); r.addColorStop(1, 'rgba(255,180,60,0)');
    dg.fillStyle = r; dg.fillRect(0, 0, 32, 32);
    this.mat = new THREE.PointsMaterial({ size: 0.016, map: new THREE.CanvasTexture(dot), color: 0xffd27a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(geo, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 4;
    wall.add(this.points);
    this.flashMat = new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.9), this.flashMat);
    this.flash.position.z = 0.003; this.flash.renderOrder = 3;
    wall.add(this.flash);
  }
  get done() { return this.t >= this.life; }
  update(dt) {
    this.t += dt;
    const p = this.points.geometry.attributes.position, k = Math.min(1, this.t / this.life);
    for (let i = 0; i < this.n; i++) {
      p.array[i * 3] += this.vel[i * 3] * dt; p.array[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.vel[i * 3 + 1] -= 0.02 * dt;                                  // gentle float, slight fall
    }
    p.needsUpdate = true;
    this.mat.opacity = 1 - k * k;
    this.mat.size = 0.016 * (1 - 0.5 * k);
    this.flashMat.opacity = 0.45 * Math.max(0, 1 - this.t / 0.5);
  }
  dispose() {
    this.wall.remove(this.points, this.flash);
    this.points.geometry.dispose(); this.mat.dispose(); this.flashMat.dispose(); this.flash.geometry.dispose();
  }
}
