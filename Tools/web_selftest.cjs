// Headless end-to-end test of the WebXR build (docs/). Needs: npm i playwright && npx playwright install chromium
//   node Tools/web_selftest.cjs          -> Builds/web_selftest/results.txt + screenshots
//   SH_URL=https://matt869.github.io/shadowHandsVR/ node Tools/web_selftest.cjs   -> test the live site
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', 'docs');
const OUT = path.resolve(__dirname, '..', 'Builds', 'web_selftest');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.png': 'image/png', '.wav': 'audio/wav', '.txt': 'text/plain' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  const LIVE = process.env.SH_URL;
  if (!LIVE) await new Promise((r) => server.listen(8765, '127.0.0.1', r));
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  let code = 1;
  try {
    await page.goto(LIVE ? LIVE.replace(/\/?$/, '/') + 'index.html?selftest' : 'http://127.0.0.1:8765/index.html?selftest', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__sh && window.__sh.ready, null, { timeout: 60000 });
    await page.screenshot({ path: path.join(OUT, '00_start.png') });
    await page.waitForFunction(() => window.__selftest && window.__selftest.done, null, { timeout: 600000, polling: 1000 });
    const r = await page.evaluate(() => window.__selftest);
    for (const k of ['shotTutorial', 'shotDragon', 'handShot', 'webcamShot'])
      if (r[k]) fs.writeFileSync(path.join(OUT, k + '.png'), Buffer.from(r[k].split(',')[1], 'base64'));
    const lines = [...r.lines, ...errors.map((e) => 'ERROR ' + e)];
    fs.writeFileSync(path.join(OUT, 'results.txt'), lines.join('\n') + '\n');
    console.log(lines.join('\n'));
    code = r.failures === 0 && errors.length === 0 ? 0 : 1;
  } catch (e) {
    console.log('RUNNER ERROR: ' + e.message);
    console.log(errors.join('\n'));
    await page.screenshot({ path: path.join(OUT, 'error.png') }).catch(() => {});
  }
  await browser.close();
  if (!LIVE) server.close();
  process.exit(code);
})();
