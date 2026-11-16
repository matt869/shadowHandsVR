// Tests the real VR code path with Meta's Immersive Web Emulation Runtime (IWER): an emulated
// Meta Quest 3 (and Meta VR Glasses) with hand tracking, in headless Chrome.
//   npm i playwright iwer@2.7.0 && npx playwright install chromium
//   node Tools/web_xrtest.cjs                 -> Builds/xr_test/results.txt + headset-view screenshots
//   SH_URL=https://matt869.github.io/shadowHandsVR/ node Tools/web_xrtest.cjs   -> test the live site
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', 'docs');
const OUT = path.resolve(__dirname, '..', 'Builds', 'xr_test');
const IWER_JS = fs.readFileSync(require.resolve('iwer/build/iwer.min.js'), 'utf8');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.png': 'image/png', '.wav': 'audio/wav', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const f = path.resolve(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});

// Runs inside the page, in VR. Returns { lines, failures }.
async function scenario(full) {
  const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
  const sh = window.__sh, dev = window.__iwerDevice, { THREE, game, scorer, stage, ui } = sh;
  const lines = []; let failures = 0;
  const check = (ok, what) => { if (!ok) failures++; lines.push((ok ? 'PASS  ' : 'FAIL  ') + what); };
  const until = async (fn, secs) => { const t = performance.now(); while (!fn() && performance.now() - t < secs * 1000) await wait(0.05); return fn(); };

  check(await until(() => sh.renderer.xr.isPresenting, 10), 'Enter VR starts an immersive session');
  await wait(1.0);
  const head = new THREE.Vector3(); sh.renderer.xr.getCamera().getWorldPosition(head);
  check(stage.position.distanceTo(head) < 0.05, `stage recentred on the head (offset ${(stage.position.distanceTo(head) * 100).toFixed(1)} cm)`);
  if (!full) return { lines, failures };

  // ---- move an emulated hand so a chosen joint lands on a world target (translation feedback loop)
  const tmp = new THREE.Vector3();
  async function placeJoint(handIdx, joint, target, iters = 5) {
    const h = sh.hands[handIdx], ih = handIdx === 0 ? dev.hands.left : dev.hands.right;
    for (let i = 0; i < iters; i++) {
      await wait(0.15);
      if (!h.tracked || !h.pos(joint, tmp)) continue;
      const d = target.clone().sub(tmp);
      ih.position.x += d.x; ih.position.y += d.y; ih.position.z += d.z;
    }
    await wait(0.2);
    return h.tracked && h.pos(joint, tmp) ? tmp.distanceTo(target) : Infinity;
  }

  check(await until(() => sh.hands.some((h) => h.tracked), 5), 'emulated tracked hands reach the game (WebXR hand joints)');

  // ---- a real tracked hand in the lamp light casts a shadow the scorer sees
  dev.hands.right.poseId = 'flat';
  const lightSpot = stage.localToWorld(new THREE.Vector3(0.0, 0.1, -0.55));
  const err = await placeJoint(1, 'middle-finger-phalanx-proximal', lightSpot);
  const covered = await until(() => scorer.coverage > 0.02, 5);
  check(covered, `tracked hand in the lamp light casts a shadow (coverage ${scorer.coverage.toFixed(3)}, placed within ${(err * 100).toFixed(1)} cm)`);
  check(game.mode === 'tutorial' && /That's your shadow/.test(ui.state.hint), `tutorial reacts to the real shadow ("${ui.state.hint}")`);
  window.__shots.push(['vr_hand_shadow', sh.renderer.domElement.toDataURL('image/jpeg', 0.9)]);

  // ---- poke the desk's Skip button with the index fingertip (tutorial -> story)
  dev.hands.right.poseId = 'point';
  const local = (cx, cy, z) => ui.mesh.localToWorld(new THREE.Vector3((cx / 1024 - 0.5) * 0.6, (0.5 - cy / 683) * 0.4, z));
  await placeJoint(1, 'index-finger-tip', local(625, 525, 0.05));        // hover in front of "Skip"
  const before = game.mode;
  await placeJoint(1, 'index-finger-tip', local(625, 525, -0.012), 4);   // push through the panel
  check(await until(() => game.mode !== before, 3), `fingertip poke on "Skip" works (mode ${before} -> ${game.mode})`);
  await placeJoint(1, 'index-finger-tip', local(625, 525, 0.08), 2);     // pull back

  // ---- the scorer works inside the XR session: a matching shadow locks the level
  dev.hands.right.position.y -= 1.0; dev.hands.left.position.y -= 1.0;   // hands out of the light
  await wait(0.5);
  const lvl = game.current;
  window.__shTest.setFake(sh.masks[lvl.file]);
  check(await until(() => game.locked, 12), `in VR, a matching shadow locks "${lvl.name}" (IoU ${scorer.score.toFixed(2)})`);
  await wait(1.6);
  window.__shots.push(['vr_payoff', sh.renderer.domElement.toDataURL('image/jpeg', 0.9)]);
  window.__shTest.clearFake();
  await until(() => game.current !== lvl, 6);

  // ---- headset off / on
  dev.updateVisibilityState('hidden');
  await wait(0.4);
  check(game.holdTimer === 0, 'headset off: game pauses (hold reset)');
  dev.updateVisibilityState('visible');
  await wait(0.8);
  sh.renderer.xr.getCamera().getWorldPosition(head);
  check(sh.renderer.xr.isPresenting && stage.position.distanceTo(head) < 0.05, 'headset back on: still in VR, stage recentred');
  return { lines, failures };
}

async function runDevice(browser, base, cfgName, full) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript({ content: IWER_JS + `
    ;window.__shots = [];
    window.__iwerDevice = new IWER.XRDevice(IWER.${cfgName}, { stereoEnabled: true });
    window.__iwerDevice.installRuntime({ forceInstall: true });
    window.__iwerDevice.primaryInputMode = 'hand';` });
  await page.goto(base + 'index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__sh && window.__sh.ready, null, { timeout: 90000 });
  // test helper: the same cut-out caster the desktop self-test uses
  await page.evaluate(() => {
    const sh = window.__sh, { THREE, stage, LAMP_POS, WALL_Z, FRAME } = sh; let fake = null;
    const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
    window.__shTest = {
      setFake(img) {
        const G = 96, c = document.createElement('canvas'); c.width = c.height = G;
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, G, G);
        const px = g.getImageData(0, 0, G, G).data, t = (-0.55 - LAMP_POS.z) / (WALL_Z - LAMP_POS.z), pos = [];
        const P = (u, v) => { const w = new THREE.Vector3((u - 0.5) * FRAME, (v - 0.5) * FRAME, WALL_Z); return LAMP_POS.clone().add(w.sub(LAMP_POS).multiplyScalar(t)); };
        for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
          if (px[(y * G + x) * 4] >= 128) continue;
          const a = P(x / G, 1 - (y + 1) / G), b = P((x + 1) / G, 1 - (y + 1) / G), cc = P((x + 1) / G, 1 - y / G), d = P(x / G, 1 - y / G);
          for (const q of [a, b, cc, a, cc, d]) pos.push(q.x, q.y, q.z);
        }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        fake = new THREE.Mesh(geo, mat); fake.castShadow = true; fake.layers.enable(6); fake.frustumCulled = false; stage.add(fake);
      },
      clearFake() { if (fake) { stage.remove(fake); fake = null; } },
    };
  });
  await page.click('#enter-vr');
  const r = await page.evaluate(scenario, full);
  await new Promise((res) => setTimeout(res, 300));
  const shots = await page.evaluate(() => { window.__shots.push(['view', window.__sh.renderer.domElement.toDataURL('image/jpeg', 0.9)]); return window.__shots; });
  for (const [name, url] of shots) fs.writeFileSync(path.join(OUT, `${cfgName}_${name}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
  await page.close();
  return { lines: [`== ${cfgName}`, ...r.lines, ...errors.map((e) => 'ERROR ' + e)], failures: r.failures + errors.length };
}

(async () => {
  const LIVE = process.env.SH_URL;
  if (!LIVE) await new Promise((r) => server.listen(8772, '127.0.0.1', r));
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const base = LIVE ? LIVE.replace(/\/?$/, '/') : 'http://127.0.0.1:8772/';
  let lines = [], failures = 0;
  for (const [cfg, full] of [['metaQuest3', true], ['metaVRGlasses', false]]) {
    try { const r = await runDevice(browser, base, cfg, full); lines.push(...r.lines); failures += r.failures; }
    catch (e) { lines.push(`== ${cfg}`, 'RUNNER ERROR ' + e.message); failures++; }
  }
  lines.push(failures === 0 ? 'RESULT: ALL PASSED' : `RESULT: ${failures} FAILED`);
  fs.writeFileSync(path.join(OUT, 'results.txt'), lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  await browser.close(); if (!LIVE) server.close();
  process.exit(failures ? 1 : 0);
})();
