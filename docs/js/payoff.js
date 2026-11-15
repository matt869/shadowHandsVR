import * as THREE from 'three';

let puffTex = null;
function puffTexture() {
  if (puffTex) return puffTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  puffTex = new THREE.CanvasTexture(c);
  puffTex.colorSpace = THREE.SRGBColorSpace;
  return puffTex;
}

const ease = (t, d) => { const x = Math.min(1, Math.max(0, t / Math.max(0.01, d))); return x * x * (3 - 2 * x); };

/**
 * "The shadow comes alive": the solid silhouette steps off the wall and plays a short motion.
 * Procedural port of the Unity PayoffAnimator (same motions and timings).
 */
export class Payoff {
  constructor(parent, overlayTex, motion, duration = 3.5, frame = 0.9) {
    this.parent = parent;
    this.motion = motion;
    this.duration = duration;
    this.t = 0;
    this.nextPuff = 0;
    this.mat = new THREE.MeshBasicMaterial({ map: overlayTex, color: 0x000000, transparent: true, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(frame, frame), this.mat);
    this.mesh.position.z = 0.002;
    this.mesh.renderOrder = 2;
    parent.add(this.mesh);
    this.puffs = [];
    if (motion === 'howl') this._puff(new THREE.Vector3(0.3, 0.3, 0.003), new THREE.Vector3(), 0.2, 0xffb81a, duration, 0);
  }

  get done() { return this.t >= this.duration; }

  update(dt) {
    this.t += dt;
    const t = this.t, k = Math.min(1, t / this.duration), D = this.duration;
    const p = new THREE.Vector3(); let rot = 0; const s = new THREE.Vector3(1, 1, 1);
    switch (this.motion) {
      case 'flapAway': s.y = 1 + 0.25 * Math.sin(t * 22); if (t > 1) p.set(0.4, 0.35, 0).multiplyScalar(ease(t - 1, D - 1)); break;
      case 'hop': p.y = 0.08 * Math.abs(Math.sin(t * 5)); p.x = 0.12 * k; s.y = 1 - 0.08 * Math.max(0, -Math.cos(t * 10)); break;
      case 'bark': rot = 6 * Math.sin(t * 14) * (Math.sin(t * 3) > 0 ? 1 : 0); s.setScalar(1 + 0.04 * Math.abs(Math.sin(t * 14))); break;
      case 'crawl': p.x = 0.15 * k; s.x = 1 + 0.05 * Math.sin(t * 4); break;
      case 'glide': p.x = 0.25 * ease(t, D); p.y = 0.015 * Math.sin(t * 3); rot = 3 * Math.sin(t * 2); break;
      case 'howl': rot = 18 * Math.min(1, t / 0.8); p.y = 0.02 * Math.min(1, t / 0.8); break;
      case 'walkOff': rot = t < 1 ? 10 * Math.sin(t * 6) : 0; if (t > 1) p.x = -0.35 * ease(t - 1, D - 1); p.y = 0.01 * Math.abs(Math.sin(t * 8)); break;
      case 'spray': rot = 4 * Math.sin(t * 3); if (t > 0.6) this._emit(new THREE.Vector3(0.06, -0.32, 0), new THREE.Vector3(0.18, 0.45, 0), 0x99d9ff); break;
      case 'scuttle': p.x = 0.06 * Math.sin(t * 9) + 0.2 * k; p.y = 0.008 * Math.abs(Math.sin(t * 18)); break;
      case 'fire': s.setScalar(1 + 0.06 * Math.sin(t * 2)); if (t > 0.8) this._emit(new THREE.Vector3(0.27, -0.05, 0), new THREE.Vector3(0.45, 0.03, 0), 0xff8c1a); break;
    }
    this.mesh.position.set(p.x, p.y, 0.002);
    this.mesh.rotation.z = THREE.MathUtils.degToRad(rot);
    this.mesh.scale.copy(s);
    this.mat.opacity = k > 0.8 ? (1 - k) / 0.2 : 1;

    for (const f of this.puffs) {
      f.age += dt;
      f.mesh.position.addScaledVector(f.vel, dt);
      f.mesh.scale.setScalar(f.size * (1 + f.age * f.grow));
      f.mesh.material.opacity = Math.max(0, 1 - f.age / f.life);
    }
    this.puffs = this.puffs.filter((f) => {
      if (f.age < f.life) return true;
      this.parent.remove(f.mesh); f.mesh.material.dispose(); return false;
    });
  }

  _emit(origin, vel, color) {
    if (this.t < this.nextPuff) return;
    this.nextPuff = this.t + 0.06;
    const j = new THREE.Vector3((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06, 0);
    this._puff(origin.clone().add(this.mesh.position).setZ(0.003), vel.clone().add(j), 0.05, color, 0.7, 1.5);
  }

  _puff(pos, vel, size, color, life, grow) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: puffTexture(), color, transparent: true, depthWrite: false }));
    mesh.position.copy(pos); mesh.scale.setScalar(size); mesh.renderOrder = 3;
    this.parent.add(mesh);
    this.puffs.push({ mesh, vel, size, life, grow, age: 0 });
  }

  dispose() {
    this.parent.remove(this.mesh); this.mat.dispose();
    for (const f of this.puffs) { this.parent.remove(f.mesh); f.mesh.material.dispose(); }
    this.puffs = [];
  }
}
