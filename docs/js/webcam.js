import * as THREE from 'three';

// Webcam hand tracking (desktop / laptop): MediaPipe Hand Landmarker, vendored in vendor/mediapipe and
// run entirely in the browser (frames never leave the device). Each tracked hand is exposed as a
// WebXR-shaped `joints` object so the same CapsuleHand builds the shadow-casting hand.
//
// Mapping, chosen to feel like a mirror with the webcam as the lamp:
//   - hand moves right on screen -> shadow moves right
//   - hand closer to the webcam (bigger in the image) -> closer to the lamp -> bigger shadow

// Absolute URL: a bare './vendor/...' would resolve against this script (js/) for import(), but
// against the page for MediaPipe's own fetches. Resolving from this file makes both correct.
const MP = new URL('../vendor/mediapipe', import.meta.url).href;
const NAMES = ['wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'];
const FINGERS = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
const MCP = { 'index-finger': 5, 'middle-finger': 9, 'ring-finger': 13, 'pinky-finger': 17 };
const RADIUS = { wrist: 0.02, tip: 0.008, default: 0.0095 };

class FakeJoint {
  constructor(name) {
    this.name = name; this.visible = false; this.p = new THREE.Vector3(); this.has = false;
    this.jointRadius = name === 'wrist' ? RADIUS.wrist : name.endsWith('tip') ? RADIUS.tip : RADIUS.default;
  }
  getWorldPosition(out) { return out.copy(this.p); }
}

/** One webcam-tracked hand, shaped like three.js' XR hand (`.joints[name]`). */
class WebcamHand {
  constructor() {
    this.joints = {};
    for (const n of NAMES) this.joints[n] = new FakeJoint(n);
    for (const f of FINGERS) this.joints[`${f}-metacarpal`] = new FakeJoint(`${f}-metacarpal`);
    this.lastSeen = -1;
  }
  hide() { for (const j of Object.values(this.joints)) { j.visible = false; j.has = false; } }
}

export class WebcamHands {
  /** stage: the Group the game is laid out in (hand positions are stage-local). */
  constructor(stage, { handZ = -0.55, smooth = 0.55, lostAfter = 0.35 } = {}) {
    this.stage = stage;
    this.handZ = handZ;
    this.smooth = smooth;
    this.lostAfter = lostAfter;
    this.hands = [new WebcamHand(), new WebcamHand()];
    this.landmarker = null;
    this.video = null;
    this.running = false;
    this._lastVideoTime = -1;
    this._tmp = new THREE.Vector3();
    this._lastResult = null;
  }

  /** Load the model (about 23 MB, all local). Tries the GPU, falls back to CPU. */
  async load() {
    if (this.landmarker) return;
    const { FilesetResolver, HandLandmarker } = await import(`${MP}/vision_bundle.mjs`);
    const fileset = await FilesetResolver.forVisionTasks(`${MP}/wasm`);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: `${MP}/hand_landmarker.task`, delegate },
      runningMode: 'VIDEO', numHands: 2,
      minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    try { this.landmarker = await HandLandmarker.createFromOptions(fileset, opts('GPU')); }
    catch (e) { console.warn('[webcam] GPU delegate unavailable, using CPU', e); this.landmarker = await HandLandmarker.createFromOptions(fileset, opts('CPU')); }
  }

  /** Ask for the camera (must follow a click). Returns the <video> element for a preview. */
  async startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
    const v = document.createElement('video');
    v.srcObject = stream; v.muted = true; v.playsInline = true;
    await v.play();
    this.video = v;
    this.running = true;
    return v;
  }

  stop() {
    this.running = false;
    if (this.video && this.video.srcObject) for (const t of this.video.srcObject.getTracks()) t.stop();
    this.video = null;
    for (const h of this.hands) h.hide();
  }

  /** Call once per frame. now = seconds. */
  update(now) {
    if (this.running && this.landmarker && this.video && this.video.readyState >= 2 && this.video.currentTime !== this._lastVideoTime) {
      this._lastVideoTime = this.video.currentTime;
      const res = this.landmarker.detectForVideo(this.video, performance.now());
      this.apply(res, now);
    }
    for (const h of this.hands) if (h.lastSeen >= 0 && now - h.lastSeen > this.lostAfter) { h.hide(); h.lastSeen = -1; }
  }

  /** Map a HandLandmarkerResult onto the two hands. Public so it can be tested without a camera. */
  apply(res, now) {
    this._lastResult = res;
    const n = res && res.landmarks ? res.landmarks.length : 0;
    const used = [false, false];
    for (let i = 0; i < n; i++) {
      const label = res.handedness && res.handedness[i] && res.handedness[i][0] ? res.handedness[i][0].categoryName : '';
      let slot = label === 'Left' ? 0 : label === 'Right' ? 1 : i;   // stable slots by handedness
      if (used[slot]) slot = 1 - slot;
      used[slot] = true;
      this._applyHand(this.hands[slot], res.landmarks[i], res.worldLandmarks && res.worldLandmarks[i], now);
    }
  }

  _applyHand(hand, img, world, now) {
    if (!img || img.length < 21) return;
    // where the hand is on screen, and how big (= how close to the webcam)
    const cx = (img[0].x + img[9].x) / 2, cy = (img[0].y + img[9].y) / 2;
    const size = Math.hypot(img[0].x - img[9].x, img[0].y - img[9].y);
    const z = THREE.MathUtils.clamp(-0.85 + size * 1.6, -0.75, -0.38);
    const anchor = new THREE.Vector3(-(cx - 0.5) * 0.55, -(cy - 0.5) * 0.45 + 0.1, z);
    // hand shape: metric world landmarks when available, else rebuilt from the image (approx. scale)
    const pts = [];
    for (let k = 0; k < 21; k++) {
      const w = world && world[k];
      const local = w ? new THREE.Vector3(-w.x, -w.y, -w.z)
        : new THREE.Vector3(-(img[k].x - cx), -(img[k].y - cy), -(img[k].z || 0)).multiplyScalar(0.09 / Math.max(size, 0.02));
      pts.push(anchor.clone().add(local));
    }
    const first = hand.lastSeen < 0;
    const a = first ? 1 : this.smooth;
    const set = (j, p) => {
      if (first || !j.has) j.p.copy(p); else j.p.lerp(p, a);
      j.has = true; j.visible = true;
    };
    for (let k = 0; k < 21; k++) set(hand.joints[NAMES[k]], this.stage.localToWorld(this._tmp.copy(pts[k])));
    for (const f of FINGERS) {
      const p = pts[0].clone().lerp(pts[MCP[f]], 0.28);              // synthetic metacarpal (not tracked by MediaPipe)
      set(hand.joints[`${f}-metacarpal`], this.stage.localToWorld(p));
    }
    hand.lastSeen = now;
  }

  /** Draw tracked points over the preview canvas (mirrored like the video). */
  drawOverlay(canvas) {
    const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    g.clearRect(0, 0, W, H);
    const res = this._lastResult;
    if (!res || !res.landmarks) return;
    g.fillStyle = '#ffc23a';
    for (const hand of res.landmarks) for (const p of hand) { g.beginPath(); g.arc((1 - p.x) * W, p.y * H, 3, 0, Math.PI * 2); g.fill(); }
  }
}
