// Records a gameplay video of the WebXR build frame-by-frame (smooth at any machine speed), with the
// game's real sounds and captions. Needs playwright + chromium, and ffmpeg on PATH.
//   node Tools/web_video.cjs   -> Builds/store/shadow_hands_gameplay.mp4 + stills
// The shadows are cast by a cut-out of each target sliding into the lamp light (no headset here);
// in VR your own tracked hands cast them. The captions say so.
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', 'docs');
const OUT = path.resolve(__dirname, '..', 'Builds', 'store');
const FRAMES = path.join(OUT, 'frames');
const FPS = 30;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  const f = path.resolve(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});

(async () => {
  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });
  await new Promise((r) => server.listen(8767, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.exposeFunction('__saveFrame', (i, dataUrl) =>
    fs.writeFileSync(path.join(FRAMES, `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(dataUrl.split(',')[1], 'base64')));
  await page.goto('http://127.0.0.1:8767/index.html?demo', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__sh && window.__sh.ready && window.__sh.demo, null, { timeout: 60000 });

  const result = await page.evaluate(async (FPS) => {
    const sh = window.__sh, { THREE, game, stage, masks, scorer, LAMP_POS, WALL_Z, FRAME } = sh;
    const DT = 1 / FPS, events = [], stills = {};
    sh.camera.fov = 80; sh.camera.rotation.x = THREE.MathUtils.degToRad(-10); sh.camera.updateProjectionMatrix();   // fit the whole wall + panel
    let fi = 0;
    const H = game.h, L = H.locked, P = H.payoff;
    H.locked = (lvl) => { events.push({ t: fi / FPS, s: 'match_chime' }); L(lvl); };
    H.payoff = (lvl) => { events.push({ t: fi / FPS, s: lvl.sfx }); P(lvl); };

    async function step(n = 1) {
      for (let i = 0; i < n; i++) {
        sh.step(DT);
        for (let w = 0; scorer._pending && w < 200; w++) await new Promise((r) => setTimeout(r, 2));
        await window.__saveFrame(fi++, sh.renderer.domElement.toDataURL('image/jpeg', 0.92));
      }
    }
    const still = (name) => { stills[name] = fi; };

    // cut-out caster, as in the self-test
    const HAND_Z = -0.55, mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
    function caster(img) {
      const G = 192, c = document.createElement('canvas'); c.width = c.height = G;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, G, G);
      const px = g.getImageData(0, 0, G, G).data, t = (HAND_Z - LAMP_POS.z) / (WALL_Z - LAMP_POS.z), pos = [];
      const P = (u, v) => { const w = new THREE.Vector3((u - 0.5) * FRAME, (v - 0.5) * FRAME, WALL_Z); return LAMP_POS.clone().add(w.sub(LAMP_POS).multiplyScalar(t)); };
      for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
        if (px[(y * G + x) * 4] >= 128) continue;
        const a = P(x / G, 1 - (y + 1) / G), b = P((x + 1) / G, 1 - (y + 1) / G), cc = P((x + 1) / G, 1 - y / G), d = P(x / G, 1 - y / G);
        for (const q of [a, b, cc, a, cc, d]) pos.push(q.x, q.y, q.z);
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.layers.enable(6); m.frustumCulled = false;
      stage.add(m); return m;
    }
    const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

    async function playLevel(slideSecs, tag) {
      const lvl = game.current;
      await step(Math.round(1.2 * FPS));                        // see the goal first
      const c = caster(masks[lvl.file]);
      const n = Math.round(slideSecs * FPS);
      for (let i = 0; i <= n; i++) {                             // the shadow arrives like a hand would
        const k = ease(i / n), wob = (1 - k) * 0.02 * Math.sin(i * 0.35);
        c.position.set((1 - k) * 0.09 + wob, -(1 - k) * 0.06, 0);
        await step();
      }
      for (let i = 0; i < 6 * FPS && !game.locked; i++) {        // hold (tiny tremor) until it locks
        c.position.set(0.0015 * Math.sin(i * 0.9), 0.001 * Math.cos(i * 1.3), 0);
        if (tag && i === 8) still(tag + '_matching');
        await step();
      }
      stage.remove(c);
      for (let i = 0; i < 5 * FPS && game.current === lvl && !game.done; i++) {
        if (tag && i === Math.round(1.8 * FPS)) still(tag + '_payoff');
        await step();
        // last level: cut before the game's own "The End" screen (its total time would be meaningless here)
        if (game.index === game.levels.length - 1 && i > 3.3 * FPS) break;
      }
    }
    const jump = (i) => { game._cancel(); game.mode = 'story'; game.index = i; game._load(game.levels[i]); };

    try { localStorage.clear(); } catch { /* ignore */ }
    game.start();                                                // first launch -> tutorial (bird)
    await step(Math.round(1.0 * FPS));
    await playLevel(2.0, 'bird');
    for (const [i, tag] of [[1, 'rabbit'], [5, 'wolf'], [7, 'elephant'], [9, 'dragon']]) { jump(i); await playLevel(1.6, tag); }
    jump(0); still('desk'); await step(Math.round(3.5 * FPS));    // end card plays over this
    return { frames: fi, events, stills };
  }, FPS);

  await browser.close(); server.close();
  fs.writeFileSync(path.join(OUT, 'video_events.json'), JSON.stringify(result, null, 1));
  console.log(`frames ${result.frames} (${(result.frames / FPS).toFixed(1)} s), sounds ${result.events.length}`);

  // stills
  for (const [name, i] of Object.entries(result.stills))
    fs.copyFileSync(path.join(FRAMES, `f${String(i).padStart(5, '0')}.jpg`), path.join(OUT, `still_${name}.jpg`));

  // audio track: each sound placed at its event time
  const AUD = path.resolve(__dirname, '..', 'docs', 'assets', 'audio');
  const args = ['-y', '-loglevel', 'error'];
  result.events.forEach((e) => args.push('-i', path.join(AUD, e.s + '.wav')));
  const dur = result.frames / FPS;
  const parts = result.events.map((e, i) => `[${i}:a]adelay=${Math.round(e.t * 1000)}|${Math.round(e.t * 1000)},volume=0.9[a${i}]`);
  const mix = result.events.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${result.events.length}:normalize=0,apad,atrim=0:${dur.toFixed(2)}[aout]`;
  args.push('-filter_complex', parts.join(';') + ';' + mix, '-map', '[aout]', '-ar', '44100', path.join(OUT, 'audio.wav'));
  execFileSync('ffmpeg', args, { stdio: 'inherit' });

  // captions
  const font = 'C\\:/Windows/Fonts/segoeuib.ttf', fontR = 'C\\:/Windows/Fonts/segoeui.ttf';
  const firstLock = result.events.find((e) => e.s === 'match_chime').t;
  const cap = (text, a, b, size = 40, y = 'h-90', f = font) =>
    `drawtext=fontfile='${f}':text='${text}':fontsize=${size}:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=14:x=(w-text_w)/2:y=${y}:enable='between(t,${a},${b})'`;
  const end = dur - 3.4;
  const filters = [
    cap('Shadow Hands', 0, 2.6, 64, '(h-text_h)/2-40'),
    cap('hand-shadow puppets in VR', 0.3, 2.6, 34, '(h-text_h)/2+40', fontR),
    cap('Shape your hands in the lamp light to match the silhouette', 2.8, firstLock - 0.3),
    cap('Hold the match... and the shadow comes alive', firstLock - 0.3, firstLock + 3.5),
    cap('10 creatures  -  one-hand and two-hand shapes', firstLock + 4, firstLock + 11),
    cap('Hands only  -  no controllers, play seated', firstLock + 11.5, firstLock + 18.5),
    cap('A new Daily Shadow every day', firstLock + 19, end - 0.5),
    `drawbox=x=0:y=0:w=iw:h=ih:color=black@0.78:t=fill:enable='gte(t,${end})'`,
    cap('Play free in the Meta Quest Browser', end + 0.1, dur, 46, '(h-text_h)/2-40'),
    cap('matt869.github.io/shadowHandsVR', end + 0.1, dur, 40, '(h-text_h)/2+36', fontR),
    cap('Recorded in-engine. In VR, your own tracked hands cast the shadows.', 0, dur, 20, 'h-34', fontR).replace('box=1', 'box=0'),
  ];
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(FRAMES, 'f%05d.jpg'),
    '-i', path.join(OUT, 'audio.wav'), '-vf', filters.join(','), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', path.join(OUT, 'shadow_hands_gameplay.mp4')], { stdio: 'inherit' });
  console.log('video: ' + path.join(OUT, 'shadow_hands_gameplay.mp4'));
})().catch((e) => { console.error(e); process.exit(1); });
