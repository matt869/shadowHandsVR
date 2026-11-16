// Records the competition video THROUGH Meta's Quest 3 emulator (IWER): the real VR session, emulated
// tracked hands casting real shadows, a real fingertip poke, then a creature montage. Frame-by-frame
// with a fixed time step, so it plays at true speed on any machine. Needs playwright, iwer@2.7.0, ffmpeg.
//   node Tools/web_xr_video.cjs   -> Builds/store/shadow_hands_quest_emulator.mp4
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', 'docs');
const OUT = path.resolve(__dirname, '..', 'Builds', 'store');
const FRAMES = path.join(OUT, 'xr_frames');
const FPS = 30;
const IWER_JS = fs.readFileSync(require.resolve('iwer/build/iwer.min.js'), 'utf8');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.png': 'image/png', '.wav': 'audio/wav', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const f = path.resolve(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});

async function choreography(FPS) {
  const sh = window.__sh, dev = window.__iwerDevice, { THREE, game, stage, ui, masks, LAMP_POS, WALL_Z, FRAME } = sh;
  const events = [], marks = {};
  let fi = 0, recording = false;
  const H = game.h, L = H.locked, P = H.payoff;
  H.locked = (l) => { events.push({ t: fi / FPS, s: 'match_chime' }); L(l); };
  H.payoff = (l) => { events.push({ t: fi / FPS, s: l.sfx }); P(l); };
  sh.hooks.fixedDt = 1 / FPS;
  const saves = [];
  sh.hooks.afterRender = () => {
    if (!recording) return;
    saves.push(window.__saveFrame(fi++, sh.renderer.domElement.toDataURL('image/jpeg', 0.92)));
  };
  const frames = (n) => new Promise((res) => { const end = fi + n; const t = setInterval(() => { if (fi >= end) { clearInterval(t); res(); } }, 4); });
  const secs = (s) => frames(Math.round(s * FPS));
  const mark = (k) => { marks[k] = fi / FPS; };
  const ease = (x) => x * x * (3 - 2 * x);
  const tmp = new THREE.Vector3();

  // smoothly move an emulated hand so `joint` arrives at `target` (world) over `s` seconds
  async function glide(handIdx, joint, target, s) {
    const h = sh.hands[handIdx], ih = handIdx === 0 ? dev.hands.left : dev.hands.right;
    if (!h.tracked || !h.pos(joint, tmp)) { await frames(2); if (!h.pos(joint, tmp)) return; }
    const d = target.clone().sub(tmp), base = ih.position.clone ? ih.position.clone() : { x: ih.position.x, y: ih.position.y, z: ih.position.z };
    const n = Math.max(1, Math.round(s * FPS));
    for (let k = 1; k <= n; k++) {
      const e = ease(k / n);
      ih.position.x = base.x + d.x * e; ih.position.y = base.y + d.y * e; ih.position.z = base.z + d.z * e;
      await frames(1);
    }
  }
  async function wobble(handIdx, s) {
    const ih = handIdx === 0 ? dev.hands.left : dev.hands.right, b = { x: ih.position.x, y: ih.position.y };
    const n = Math.round(s * FPS);
    for (let k = 0; k < n; k++) { ih.position.x = b.x + 0.012 * Math.sin(k * 0.12); ih.position.y = b.y + 0.008 * Math.sin(k * 0.09); await frames(1); }
    ih.position.x = b.x; ih.position.y = b.y;
  }

  // cut-out stand-in caster for the montage (emulated hands only have preset poses)
  const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
  function caster(img) {
    const G = 192, c = document.createElement('canvas'); c.width = c.height = G;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, G, G);
    const px = g.getImageData(0, 0, G, G).data, t = (-0.55 - LAMP_POS.z) / (WALL_Z - LAMP_POS.z), pos = [];
    const Pp = (u, v) => { const w = new THREE.Vector3((u - 0.5) * FRAME, (v - 0.5) * FRAME, WALL_Z); return LAMP_POS.clone().add(w.sub(LAMP_POS).multiplyScalar(t)); };
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      if (px[(y * G + x) * 4] >= 128) continue;
      const a = Pp(x / G, 1 - (y + 1) / G), b = Pp((x + 1) / G, 1 - (y + 1) / G), cc = Pp((x + 1) / G, 1 - y / G), d = Pp(x / G, 1 - y / G);
      for (const q of [a, b, cc, a, cc, d]) pos.push(q.x, q.y, q.z);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.layers.enable(6); m.frustumCulled = false; stage.add(m); return m;
  }
  async function montageLevel(i) {
    game._cancel(); game.mode = 'story'; game.index = i; game._load(game.levels[i]);
    const lvl = game.current;
    await secs(1.0);
    const c = caster(masks[lvl.file]), n = Math.round(1.5 * FPS);
    for (let k = 0; k <= n; k++) { const e = 1 - Math.pow(1 - k / n, 3); c.position.set((1 - e) * 0.09, -(1 - e) * 0.06, 0); await frames(1); }
    for (let k = 0; k < 6 * FPS && !game.locked; k++) { c.position.set(0.0015 * Math.sin(k * 0.9), 0.001 * Math.cos(k * 1.3), 0); await frames(1); }
    stage.remove(c);
    await secs(i === 9 ? 3.0 : 3.3);
  }

  // ---------------- the shoot
  try { localStorage.clear(); } catch { /* ignore */ }
  game.startTutorial();
  dev.hands.left.position.y -= 0.7; dev.hands.right.position.y -= 0.7;    // hands out of view to start
  await new Promise((r) => setTimeout(r, 600));
  recording = true; mark('start');
  await secs(2.6);

  mark('hand');                                                         // a real tracked hand enters the light
  dev.hands.right.poseId = 'flat';
  await glide(1, 'middle-finger-phalanx-proximal', stage.localToWorld(new THREE.Vector3(0.02, 0.1, -0.55)), 1.6);
  await wobble(1, 2.2);
  mark('pose');
  dev.hands.right.poseId = 'peace';                                     // any shape casts its true shadow
  await wobble(1, 1.6);
  dev.hands.right.poseId = 'point';
  await wobble(1, 1.0);

  mark('poke');                                                         // fingertip poke on the desk
  // look down at the desk like a player would (pitch only), then back up
  const q0 = { x: dev.quaternion.x, y: dev.quaternion.y, z: dev.quaternion.z, w: dev.quaternion.w };
  async function pitch(fromDeg, toDeg, s) {
    const n = Math.max(1, Math.round(s * FPS));
    for (let k = 1; k <= n; k++) {
      const a = THREE.MathUtils.degToRad(fromDeg + (toDeg - fromDeg) * ease(k / n));
      const q = new THREE.Quaternion(q0.x, q0.y, q0.z, q0.w).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a));
      dev.quaternion.x = q.x; dev.quaternion.y = q.y; dev.quaternion.z = q.z; dev.quaternion.w = q.w;
      await frames(1);
    }
  }
  await pitch(0, -32, 0.8);
  const btn = (z) => ui.mesh.localToWorld(new THREE.Vector3((625 / 1024 - 0.5) * 0.6, (0.5 - 525 / 683) * 0.4, z));
  await glide(1, 'index-finger-tip', btn(0.06), 1.2);
  await secs(0.3);
  await glide(1, 'index-finger-tip', btn(-0.012), 0.35);
  await secs(0.25);
  await glide(1, 'index-finger-tip', btn(0.08), 0.4);
  await secs(0.4);
  const ih = dev.hands.right; const by = ih.position.y;
  for (let k = 1; k <= 20; k++) { ih.position.y = by - 0.7 * (k / 20); await frames(1); }   // hand down, out of view
  await pitch(-32, 0, 0.8);

  mark('montage');
  for (const i of [1, 5, 7, 9]) await montageLevel(i);
  // cut away before the game's own "The End" screen (its total time would be meaningless here)
  game._cancel(); game.mode = 'story'; game.index = 0; game._load(game.levels[0]);
  mark('end');
  await secs(3.6);
  recording = false;
  await Promise.all(saves);
  return { frames: fi, events, marks };
}

(async () => {
  fs.rmSync(FRAMES, { recursive: true, force: true }); fs.mkdirSync(FRAMES, { recursive: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));   // any free port
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.exposeFunction('__saveFrame', (i, url) => fs.writeFileSync(path.join(FRAMES, `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(url.split(',')[1], 'base64')));
  await page.addInitScript({ content: IWER_JS + `;window.__iwerDevice = new IWER.XRDevice(IWER.metaQuest3, { stereoEnabled: false });
    window.__iwerDevice.installRuntime({ forceInstall: true }); window.__iwerDevice.primaryInputMode = 'hand';` });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__sh && window.__sh.ready, null, { timeout: 90000 });
  await page.click('#enter-vr');
  await page.waitForFunction(() => window.__sh.renderer.xr.isPresenting, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(choreography, FPS);
  await browser.close(); server.close();
  fs.writeFileSync(path.join(OUT, 'xr_video_events.json'), JSON.stringify(r, null, 1));
  const dur = r.frames / FPS, m = r.marks;
  console.log(`frames ${r.frames} (${dur.toFixed(1)} s), sounds ${r.events.length}, marks ${JSON.stringify(m)}`);

  const AUD = path.resolve(__dirname, '..', 'docs', 'assets', 'audio');
  const music = path.join(AUD, 'music_box.wav');
  const args = ['-y', '-loglevel', 'error', '-stream_loop', '-1', '-i', music];
  r.events.forEach((e) => args.push('-i', path.join(AUD, e.s + '.wav')));
  const parts = [`[0:a]volume=0.22,atrim=0:${dur.toFixed(2)}[m]`].concat(r.events.map((e, i) => `[${i + 1}:a]adelay=${Math.round(e.t * 1000)}|${Math.round(e.t * 1000)},volume=0.9[a${i}]`));
  const mix = '[m]' + r.events.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${r.events.length + 1}:normalize=0,apad,atrim=0:${dur.toFixed(2)}[aout]`;
  args.push('-filter_complex', parts.join(';') + ';' + mix, '-map', '[aout]', '-ar', '44100', path.join(OUT, 'xr_audio.wav'));
  execFileSync('ffmpeg', args, { stdio: 'inherit' });

  const font = 'C\\:/Windows/Fonts/segoeuib.ttf', fontR = 'C\\:/Windows/Fonts/segoeui.ttf';
  const cap = (text, a, b, size = 40, y = 'h-96', f = font) =>
    `drawtext=fontfile='${f}':text='${text}':fontsize=${size}:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=14:x=(w-text_w)/2:y=${y}:enable='between(t,${a},${b})'`;
  const lock1 = (r.events.find((e) => e.s === 'match_chime') || { t: m.montage + 3 }).t;
  const filters = [
    cap('Shadow Hands', 0, m.hand - 0.1, 64, '(h-text_h)/2-40'),
    cap('hand-shadow puppets for Meta Quest', 0.3, m.hand - 0.1, 34, '(h-text_h)/2+40', fontR),
    cap('Your tracked hands cast real shadows', m.hand + 0.4, m.poke - 0.2),
    cap('Hands only  -  poke the desk buttons', m.poke, m.montage),
    cap('Match the silhouette, hold it...', m.montage + 0.2, lock1),
    cap('...and the shadow comes alive', lock1, lock1 + 3.2),
    cap('10 creatures  -  one-hand and two-hand shapes', lock1 + 3.4, lock1 + 10.5),
    cap('A new Daily Shadow every day', lock1 + 10.8, m.end - 0.3),
    `drawbox=x=0:y=0:w=iw:h=ih:color=black@0.78:t=fill:enable='gte(t,${m.end})'`,
    cap('Play free in the Meta Quest Browser', m.end + 0.1, dur, 46, '(h-text_h)/2-40'),
    cap('matt869.github.io/shadowHandsVR', m.end + 0.1, dur, 40, '(h-text_h)/2+36', fontR),
    cap('Captured in the Meta Quest 3 emulator (IWER). Montage shadows come from stand-in cut-outs.', 0, dur, 19, 'h-32', fontR).replace('box=1', 'box=0'),
  ];
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(FRAMES, 'f%05d.jpg'),
    '-i', path.join(OUT, 'xr_audio.wav'), '-vf', filters.join(','), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', path.join(OUT, 'shadow_hands_quest_emulator.mp4')], { stdio: 'inherit' });
  console.log('video: ' + path.join(OUT, 'shadow_hands_quest_emulator.mp4'));
})().catch((e) => { console.error(e); process.exit(1); });
