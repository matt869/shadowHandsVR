import * as THREE from 'three';
import { LAYER_HANDS } from './scorer.js';

const FINGERS = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
const PHALANGES = ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'];
const THUMB = ['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'];

// Bone segments [from, to]: wrist to each metacarpal, then along every finger.
const SEGMENTS = [];
for (let i = 0; i < THUMB.length - 1; i++) SEGMENTS.push([THUMB[i], THUMB[i + 1]]);
for (const f of FINGERS) {
  SEGMENTS.push(['wrist', `${f}-metacarpal`]);
  for (let i = 0; i < PHALANGES.length - 1; i++) SEGMENTS.push([`${f}-${PHALANGES[i]}`, `${f}-${PHALANGES[i + 1]}`]);
}
// Palm outline (filled as a fan) so the shadow has no gaps between the metacarpals.
const PALM = ['wrist', 'thumb-metacarpal', 'index-finger-phalanx-proximal', 'middle-finger-phalanx-proximal',
  'ring-finger-phalanx-proximal', 'pinky-finger-phalanx-proximal', 'pinky-finger-metacarpal'];
const FOREARM_LEN = 0.26, FOREARM_R = 0.028;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

/**
 * A solid "capsule hand" built from WebXR hand-tracking joints every frame. It is what casts the
 * puppet shadow. On layer 0 (the XR eye cameras only render layer 0, and three.js only lets objects
 * on the viewing camera's layers cast shadows) and on LAYER_HANDS (so the scorer's wall camera sees
 * the shadow too).
 */
export class CapsuleHand {
  constructor(xrHand, material) {
    this.xrHand = xrHand;
    this.group = new THREE.Group();
    this.bones = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10), material, SEGMENTS.length + 1);
    this.knuckles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), material, SEGMENTS.length * 2 + 1);
    const palmGeo = new THREE.BufferGeometry();
    palmGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((PALM.length + 1) * 3), 3));
    const idx = [];
    for (let i = 0; i < PALM.length; i++) idx.push(PALM.length, i, (i + 1) % PALM.length);
    palmGeo.setIndex(idx);
    this.palm = new THREE.Mesh(palmGeo, material);
    for (const m of [this.bones, this.knuckles, this.palm]) {
      m.castShadow = true;
      m.receiveShadow = false;
      m.frustumCulled = false;
      m.layers.enable(LAYER_HANDS);
      this.group.add(m);
    }
    this.group.visible = false;
    this.tracked = false;
  }

  joint(name) {
    const j = this.xrHand.joints && this.xrHand.joints[name];
    return j && j.visible ? j : null;
  }

  /** World position of a joint, or null when not tracked. */
  pos(name, out) {
    const j = this.joint(name);
    return j ? j.getWorldPosition(out) : null;
  }

  update() {
    const wrist = this.joint('wrist');
    this.tracked = !!(wrist && this.joint('index-finger-tip'));
    this.group.visible = this.tracked;
    if (!this.tracked) return;

    let bi = 0, ki = 0;
    for (const [from, to] of SEGMENTS) {
      const ja = this.joint(from), jb = this.joint(to);
      if (!ja || !jb) continue;
      ja.getWorldPosition(_a); jb.getWorldPosition(_b);
      const r = Math.max(0.006, Math.min(ja.jointRadius || 0.01, jb.jointRadius || 0.01));
      this._capsule(bi++, ki, _a, _b, r);
      ki += 2;
    }
    // Forearm: continue backward from the wrist, away from the knuckles.
    if (this.pos('wrist', _a) && this.pos('middle-finger-phalanx-proximal', _b)) {
      _d.subVectors(_a, _b).normalize().multiplyScalar(FOREARM_LEN).add(_a);
      this._capsule(bi++, ki, _a, _d, FOREARM_R);
      ki += 2;
    }
    this.bones.count = bi;
    this.knuckles.count = ki;
    this.bones.instanceMatrix.needsUpdate = true;
    this.knuckles.instanceMatrix.needsUpdate = true;

    const pos = this.palm.geometry.attributes.position;
    const c = new THREE.Vector3();
    let ok = 0;
    for (let i = 0; i < PALM.length; i++) {
      if (!this.pos(PALM[i], _a)) continue;
      pos.setXYZ(i, _a.x, _a.y, _a.z);
      c.add(_a); ok++;
    }
    if (ok) { c.multiplyScalar(1 / ok); pos.setXYZ(PALM.length, c.x, c.y, c.z); }
    pos.needsUpdate = true;
  }

  _capsule(bi, ki, a, b, r) {
    _d.subVectors(b, a);
    const len = _d.length();
    _q.setFromUnitVectors(_up, len > 1e-6 ? _d.clone().divideScalar(len) : _up);
    _m.compose(_s.addVectors(a, b).multiplyScalar(0.5), _q, new THREE.Vector3(r, len, r));
    this.bones.setMatrixAt(bi, _m);
    _m.makeScale(r, r, r).setPosition(a); this.knuckles.setMatrixAt(ki, _m);
    _m.makeScale(r, r, r).setPosition(b); this.knuckles.setMatrixAt(ki + 1, _m);
  }
}
