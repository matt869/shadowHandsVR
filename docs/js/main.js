import * as THREE from 'three';
import { LEVELS } from './levels.js';
import { ShadowScorer, LAYER_WALL, LAYER_HANDS } from './scorer.js';
import { CapsuleHand } from './hands.js';
import { DeskPanel } from './ui.js';
import { Payoff } from './payoff.js';
import { Sfx } from './audio.js';
import { Game } from './game.js';

// Stage layout, metres, relative to the seated player's eyes (three.js looks down -Z).
const LAMP_POS = new THREE.Vector3(0, 0.2, -0.3);
const WALL_Z = -1.0;
const FRAME = 0.9;                     // scored square of wall = mask image
const OVERLAY_ALPHA = 0.25;

const statusEl = document.getElementById('status');
const vrButton = document.getElementById('enter-vr');
const setStatus = (t) => { if (statusEl) statusEl.textContent = t; };

// ---------------------------------------------------------------- renderer + scene
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;          // hard-edged puppet shadows
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local');               // seated: origin = head at session start
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020203);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.02, 30);
camera.rotation.x = THREE.MathUtils.degToRad(-12);   // desktop preview: see the wall and the desk panel (XR uses the head pose)

const ambient = new THREE.AmbientLight(0xffffff, 0.05);
ambient.layers.enable(LAYER_WALL);   // lights are filtered by camera layers too
scene.add(ambient);

const stage = new THREE.Group();
scene.add(stage);

const wall = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.9), new THREE.MeshLambertMaterial({ color: 0xffffff }));
wall.position.set(0, 0, WALL_Z);
wall.receiveShadow = true;
wall.layers.enable(LAYER_WALL);
stage.add(wall);

const lamp = new THREE.SpotLight(0xfff2d9, 2.2, 3, THREE.MathUtils.degToRad(52), 0.25, 2);
lamp.position.copy(LAMP_POS);
lamp.target.position.set(0, 0, WALL_Z);
lamp.castShadow = true;
lamp.shadow.mapSize.set(1024, 1024);
lamp.shadow.camera.near = 0.05;
lamp.shadow.camera.far = 3;
lamp.shadow.bias = -0.0005;
lamp.layers.enable(LAYER_WALL);
stage.add(lamp, lamp.target);

const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe6a0 }));
bulb.position.copy(LAMP_POS).add(new THREE.Vector3(0, 0, 0.03));
stage.add(bulb);

const desk = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.5), new THREE.MeshLambertMaterial({ color: 0x40302a }));
desk.position.set(0, -0.53, -0.35);
stage.add(desk);

const overlay = new THREE.Mesh(new THREE.PlaneGeometry(FRAME, FRAME),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: OVERLAY_ALPHA, depthWrite: false }));
overlay.position.z = 0.001;
overlay.renderOrder = 1;
wall.add(overlay);

// ---------------------------------------------------------------- hands
const handMat = new THREE.MeshStandardMaterial({ color: 0xd8b8a0, roughness: 0.85, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide });
const hands = [0, 1].map((i) => {
  const xrHand = renderer.xr.getHand(i);
  scene.add(xrHand);
  const h = new CapsuleHand(xrHand, handMat);
  scene.add(h.group);
  return h;
});

// ---------------------------------------------------------------- systems
const scorer = new ShadowScorer(renderer, scene, wall, { frame: FRAME });
const sfx = new Sfx();
const SOUNDS = ['match_chime', 'hold_tone', ...LEVELS.map((l) => l.sfx)];
const ui = new DeskPanel((id) => onButton(id));
ui.mesh.position.set(0, -0.37, -0.36);
ui.mesh.rotation.x = THREE.MathUtils.degToRad(-50);
stage.add(ui.mesh);

const masks = {}, overlays = {};
let payoff = null, feedback = { match: 0, hold: 0 };

const game = new Game({
  levelStart(lvl) {
    scorer.setTarget(masks[lvl.file]);
    overlay.material.map = overlays[lvl.file];
    overlay.material.needsUpdate = true;
    overlay.visible = true;
  },
  title: (t) => ui.set({ title: t }),
  hint: (t) => ui.set({ hint: t }),
  match: (m) => ui.set({ match: m }),
  hold: (h) => ui.set({ hold: h }),
  feedback(match, hold) { feedback = { match, hold }; sfx.setHold(hold); },
  locked() { scorer.clearTarget(); overlay.visible = false; sfx.play('match_chime'); },
  payoff(lvl) { payoff = new Payoff(wall, overlays[lvl.file], lvl.motion); sfx.play(lvl.sfx); },
  clearPayoff() { if (payoff) payoff.dispose(); payoff = null; },
  completed() {},
  allComplete() {},
});
scorer.onScore = (s) => game.onScore(s, scorer.coverage);

function onButton(id) {
  if (id === 'story') game.startStory();
  else if (id === 'daily') game.startDaily();
  else if (id === 'skip') game.skip();
  else if (id === 'recenter') recenter();
}

/** Put the stage in front of wherever the player's head is now (yaw only). */
function recenter() {
  const head = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  const p = new THREE.Vector3(), q = new THREE.Quaternion();
  head.getWorldPosition(p); head.getWorldQuaternion(q);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q); fwd.y = 0;
  const yaw = fwd.lengthSq() > 1e-4 ? Math.atan2(-fwd.x, -fwd.z) : 0;
  stage.position.copy(p);
  stage.rotation.set(0, yaw, 0);
  stage.updateMatrixWorld(true);
  scorer.resetLitReference();
}

// ---------------------------------------------------------------- loading
function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
async function loadAssets() {
  const texLoader = new THREE.TextureLoader();
  await Promise.all(LEVELS.map(async (l) => {
    masks[l.file] = await loadImage(`assets/sil/${l.file}.png`);
    const t = await texLoader.loadAsync(`assets/sil/${l.file}_overlay.png`);
    t.colorSpace = THREE.SRGBColorSpace;
    overlays[l.file] = t;
  }));
}

// ---------------------------------------------------------------- XR session
async function enterVR() {
  sfx.unlock(SOUNDS);                                   // needs this click (user gesture)
  try {
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['hand-tracking'] });
    await renderer.xr.setSession(session);
    session.addEventListener('visibilitychange', () => {
      if (session.visibilityState !== 'visible') game.pause();      // headset off / system menu
      else setTimeout(recenter, 300);
    });
    session.addEventListener('end', () => { vrButton.textContent = 'Enter VR'; });
    const ref = renderer.xr.getReferenceSpace();
    if (ref && ref.addEventListener) ref.addEventListener('reset', () => setTimeout(recenter, 100));
    setTimeout(recenter, 300);
    vrButton.textContent = 'Exit VR';
  } catch (e) {
    setStatus('Could not start VR: ' + e.message);
  }
}

async function setupVRButton() {
  const ok = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  if (!ok) {
    vrButton.disabled = true;
    setStatus('Open this page in the Meta Quest Browser to play with your hands.');
    return;
  }
  setStatus('Sit comfortably, then press Enter VR. Hands only - no controllers needed.');
  vrButton.addEventListener('click', () => {
    const s = renderer.xr.getSession();
    if (s) s.end(); else enterVR();
  });
}

// Desktop: click the panel with the mouse (for testing; the game is made for hands).
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
renderer.domElement.addEventListener('click', (e) => {
  if (renderer.xr.isPresenting) return;
  sfx.unlock(SOUNDS);
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObject(ui.mesh)[0];
  if (hit && hit.uv) ui.clickUV(hit.uv, clock.elapsedTime);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) game.pause(); });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
const tipTmp = [new THREE.Vector3(), new THREE.Vector3()];

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1), now = clock.elapsedTime;
  for (const h of hands) h.update();
  ui.update(now, hands.map((h, i) => ({ i, pos: h.tracked ? h.pos('index-finger-tip', tipTmp[i]) : null })));
  game.tick(dt);
  if (payoff) payoff.update(dt);
  // The goal stirs as the match improves, and pulses while held.
  const pulse = feedback.hold > 0 ? 0.3 * Math.sin(now * 14) * feedback.hold : 0;
  overlay.material.opacity = Math.min(1, OVERLAY_ALPHA * (1 + 0.8 * feedback.match * feedback.match + pulse));
  if (hooks.beforeScore) hooks.beforeScore(now);
  scorer.update();
  renderer.render(scene, camera);
}

// Test hooks (used by Tools/web_selftest.mjs). Harmless in normal play.
const hooks = {};
window.__sh = { THREE, renderer, scene, camera, stage, wall, lamp, scorer, game, hands, ui, handMat, hooks, recenter, masks, LAMP_POS, WALL_Z, FRAME };

async function main() {
  setStatus('Loading...');
  await loadAssets();
  recenter();
  game.start();
  ui.update(0, []);
  renderer.setAnimationLoop(frame);
  await setupVRButton();
  window.__sh.ready = true;
  if (new URLSearchParams(location.search).has('selftest')) (await import('./selftest.js')).run(window.__sh);
}
main().catch((e) => { console.error(e); setStatus('Error: ' + e.message); });
