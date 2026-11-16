// Automated end-to-end test (index.html?selftest). Plays the real game with real rendering:
// a cut-out of each target is placed in the lamp's light so its CAST SHADOW lands on the target,
// and the actual scorer/game code has to lock it. Also checks the capsule hand from joint data.
// Results: window.__selftest = { done, failures, lines }.
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));

export async function run(sh) {
  const { THREE, game, scorer, stage, hands, handMat, masks, LAMP_POS, WALL_Z, FRAME } = sh;
  const out = { done: false, failures: 0, lines: [] };
  window.__selftest = out;
  const check = (ok, what) => { if (!ok) out.failures++; const l = (ok ? 'PASS  ' : 'FAIL  ') + what; out.lines.push(l); console.log('[selftest] ' + l); };

  let completed = null, allComplete = 0;
  const hk = game.h;
  const origCompleted = hk.completed, origAll = hk.allComplete;
  hk.completed = (l) => { completed = l; origCompleted(l); };
  hk.allComplete = () => { allComplete++; origAll(); };

  // fresh "first launch"
  try { localStorage.clear(); } catch { /* ignore */ }
  game.start();
  await wait(1.0);

  check(game.mode === 'tutorial', 'first launch starts in the tutorial');
  check(scorer.coverage < 0.01, `empty wall reads as no shadow (coverage ${scorer.coverage.toFixed(3)})`);

  // ---- fake cut-out caster -------------------------------------------------------------
  const HAND_Z = -0.55;
  let fake = null;
  const casterMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
  function setFake(img) {
    clearFake();
    const G = 96, c = document.createElement('canvas'); c.width = c.height = G;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, G, G);
    const px = g.getImageData(0, 0, G, G).data;
    const t = (HAND_Z - LAMP_POS.z) / (WALL_Z - LAMP_POS.z), pos = [];
    const P = (u, v) => { const w = new THREE.Vector3((u - 0.5) * FRAME, (v - 0.5) * FRAME, WALL_Z); return LAMP_POS.clone().add(w.sub(LAMP_POS).multiplyScalar(t)); };
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      if (px[(y * G + x) * 4] >= 128) continue;
      const u0 = x / G, u1 = (x + 1) / G, v0 = 1 - (y + 1) / G, v1 = 1 - y / G;   // canvas row 0 = top
      const a = P(u0, v0), b = P(u1, v0), cc = P(u1, v1), d = P(u0, v1);
      for (const q of [a, b, cc, a, cc, d]) pos.push(q.x, q.y, q.z);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    fake = new THREE.Mesh(geo, casterMat);
    fake.castShadow = true; fake.layers.enable(6); fake.frustumCulled = false;
    stage.add(fake);
  }
  function clearFake() { if (fake) { stage.remove(fake); fake.geometry.dispose(); fake = null; } }

  async function play(label, shot) {
    const lvl = game.current; completed = null;
    const allBefore = allComplete;
    setFake(masks[lvl.file]);
    let max = 0; const t0 = performance.now();
    while (completed !== lvl && performance.now() - t0 < 12000) { max = Math.max(max, scorer.score); await wait(0.05); }
    const secs = (performance.now() - t0) / 1000;
    check(completed === lvl, `${label}: ${lvl.name} locked in ${secs.toFixed(1)}s (IoU ${max.toFixed(2)}, needs ${lvl.thr.toFixed(2)})`);
    clearFake();
    if (shot) { await wait(1.8); out[shot] = sh.renderer.domElement.toDataURL('image/png'); }
    const t1 = performance.now();
    while (game.current === lvl && allComplete === allBefore && performance.now() - t1 < 8000) await wait(0.05);
    await wait(0.1);
  }

  // ---- wrong shape must not unlock
  const wrong = game.levels[8];
  setFake(masks[wrong.file]);
  let maxWrong = 0; const tw = performance.now();
  while (performance.now() - tw < 3000) { maxWrong = Math.max(maxWrong, scorer.score); await wait(0.05); }
  check(completed === null && maxWrong < game.current.thr, `wrong shape (${wrong.name}) does not unlock the tutorial (best ${maxWrong.toFixed(2)} < ${game.current.thr})`);
  clearFake(); await wait(0.4);

  // ---- capsule hand from joint data: a flat open hand held in the light must cast a shadow
  const fakeXR = { joints: {} };
  const J = (name, x, y, z, r = 0.009) => { const o = new THREE.Object3D(); o.position.set(x, y, z); o.visible = true; o.jointRadius = r; stage.add(o); o.updateMatrixWorld(); fakeXR.joints[name] = o; };
  const z = HAND_Z, yb = 0.0;
  J('wrist', 0, yb - 0.08, z, 0.02);
  J('thumb-metacarpal', -0.025, yb - 0.06, z); J('thumb-phalanx-proximal', -0.05, yb - 0.03, z); J('thumb-phalanx-distal', -0.065, yb - 0.005, z); J('thumb-tip', -0.075, yb + 0.015, z);
  [['index-finger', -0.02], ['middle-finger', 0], ['ring-finger', 0.02], ['pinky-finger', 0.038]].forEach(([f, x]) => {
    J(`${f}-metacarpal`, x * 0.5, yb - 0.07, z); J(`${f}-phalanx-proximal`, x, yb, z); J(`${f}-phalanx-intermediate`, x, yb + 0.04, z);
    J(`${f}-phalanx-distal`, x, yb + 0.065, z); J(`${f}-tip`, x, yb + 0.085, z, 0.008);
  });
  const { CapsuleHand } = await import('./hands.js');
  const testHand = new CapsuleHand(fakeXR, handMat);
  sh.scene.add(testHand.group); testHand.update();
  const th = performance.now();   // poll: the software renderer in CI can take a few frames per readback
  while (scorer.coverage <= 0.03 && performance.now() - th < 5000) await wait(0.1);
  check(testHand.tracked && scorer.coverage > 0.03, `capsule hand from joints casts a shadow on the wall (coverage ${scorer.coverage.toFixed(3)})`);
  out.handShot = sh.renderer.domElement.toDataURL('image/png');
  sh.scene.remove(testHand.group);
  for (const o of Object.values(fakeXR.joints)) stage.remove(o);
  await wait(0.4);

  // ---- webcam mode, part 1: the real MediaPipe model loads from vendor/ and runs (no camera needed)
  try {
    const tl = performance.now();
    await sh.webcam.load();
    const blank = document.createElement('canvas'); blank.width = 320; blank.height = 240;
    blank.getContext('2d').fillRect(0, 0, 320, 240);
    const r = sh.webcam.landmarker.detectForVideo(blank, performance.now());
    check(Array.isArray(r.landmarks) && r.landmarks.length === 0, `MediaPipe hand model loads locally and runs (${((performance.now() - tl) / 1000).toFixed(1)}s, 0 hands in a blank frame)`);
  } catch (e) { check(false, 'MediaPipe hand model loads locally and runs: ' + e.message); }

  // ---- webcam mode, part 2: a MediaPipe-shaped result (open hand) becomes a shadow-casting hand
  {
    const W = [[0, 0.08, 0], [-0.03, 0.06, 0], [-0.05, 0.03, 0], [-0.065, 0.005, 0], [-0.075, -0.015, 0]];
    [-0.02, 0, 0.02, 0.038].forEach((x) => W.push([x, 0, 0], [x, -0.04, 0], [x, -0.065, 0], [x, -0.085, 0]));
    const world = W.map(([x, y, z]) => ({ x, y, z }));
    const img = W.map(([x, y]) => ({ x: 0.5 + x * 2.5, y: 0.5 + y * 2.5, z: 0 }));
    const fakeRes = { landmarks: [img], worldLandmarks: [world], handedness: [[{ categoryName: 'Right' }]] };
    sh.webcam.apply(fakeRes, game.clock);
    for (const c of sh.camHands) c.update();
    const tc = performance.now();
    while (scorer.coverage <= 0.03 && performance.now() - tc < 5000) { sh.webcam.apply(fakeRes, game.clock); await wait(0.1); }
    check(sh.camHands.some((c) => c.tracked) && scorer.coverage > 0.03, `webcam hand (MediaPipe landmarks) casts a shadow on the wall (coverage ${scorer.coverage.toFixed(3)})`);
    out.webcamShot = sh.renderer.domElement.toDataURL('image/png');
    for (const h of sh.webcam.hands) { h.hide(); h.lastSeen = -1; }
    for (const c of sh.camHands) c.update();
    await wait(0.4);
  }

  // ---- tutorial then all story levels
  await play('tutorial', 'shotTutorial');
  check(game.mode === 'story' && game.index === 0, 'tutorial hands over to Story level 1');
  for (let i = 0; i < game.levels.length; i++) {
    check(game.index === i, `story is on level ${i + 1}`);
    await play(`story ${i + 1}`, i === 9 ? 'shotDragon' : null);
  }
  check(allComplete > 0, 'story ends with "all complete"');

  game.startStory();
  check(game.index === 0, 'Story restarts from level 1 after finishing');
  game.skip();
  check(game.index === 1 && localStorage.getItem('shadowhands.story.index') === '1', 'Skip advances and saves progress');

  game.startDaily();
  check(game.mode === 'daily', 'Daily mode starts');
  await play('daily', null);
  check(game.dailyDoneToday() && game.dailyStreak === 1, `Daily marked done, streak = ${game.dailyStreak}`);

  game.pause();
  check(game.holdTimer === 0, 'pause (headset off) drops any partial hold');
  game.startStory();
  await play('after pause', null);

  out.lines.push(out.failures === 0 ? 'RESULT: ALL PASSED' : `RESULT: ${out.failures} FAILED`);
  console.log('[selftest] ' + out.lines[out.lines.length - 1]);
  out.done = true;
}
