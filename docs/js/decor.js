import * as THREE from 'three';

// Puppet-theatre dressing: paper screen, wooden frame, velvet curtains, a gold sign, a brass pendant
// lamp, a soft light beam and dust motes in it. Nothing here casts shadows or sits on the scorer's
// layers, so it can never change the score.

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = 4;
  return t;
}

function rng(seed) { let s = seed >>> 0; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0) / 4294967296); }

/** Warm rice-paper screen: very low-contrast fibres, so the scorer's lit reference absorbs it. */
export function paperTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#f6f1e6'; g.fillRect(0, 0, w, h);
    const r = rng(7), img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 10; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.8; }
    g.putImageData(img, 0, 0);
    g.globalAlpha = 0.05; g.strokeStyle = '#b8a887'; g.lineWidth = 1;
    for (let i = 0; i < 260; i++) {
      const x = r() * w, y = r() * h, a = r() * Math.PI, l = 10 + r() * 40;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 8, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  });
}

function woodTexture(base = '#5a3a24') {
  return canvasTex(256, 1024, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const r = rng(11);
    for (let i = 0; i < 90; i++) {
      const x = r() * w; g.globalAlpha = 0.08 + r() * 0.12;
      g.strokeStyle = r() > 0.5 ? '#2b1a10' : '#7a5235'; g.lineWidth = 1 + r() * 3;
      g.beginPath(); g.moveTo(x, 0);
      for (let y = 0; y <= h; y += 32) g.lineTo(x + Math.sin(y * 0.01 + i) * 6, y);
      g.stroke();
    }
  });
}

/** Curtain: a plane with sine folds, bunched toward the outer edge. */
function curtain(width, height, side, mat) {
  const geo = new THREE.PlaneGeometry(width, height, 64, 4);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), u = x / width + 0.5;                 // 0 = inner edge (screen side) ... 1 = outer
    const k = side < 0 ? 1 - u : u;
    const amp = 0.012 + 0.03 * k, freq = 5 + 6 * k;
    p.setZ(i, amp * Math.sin(u * Math.PI * 2 * freq));
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  return m;
}

function signTexture() {
  return canvasTex(1024, 128, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#5c0a12'); grd.addColorStop(1, '#3a050b');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c99a3e'; g.lineWidth = 4; g.strokeRect(10, 10, w - 20, h - 20);
    g.font = 'bold 72px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.letterSpacing = '14px';
    const t = g.createLinearGradient(0, 30, 0, 100); t.addColorStop(0, '#ffe7a3'); t.addColorStop(1, '#c48a2c');
    g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 6; g.shadowOffsetY = 3;
    g.fillStyle = t; g.fillText('SHADOW  HANDS', w / 2, h / 2 + 4);
  });
}

export class Decor {
  constructor(stage, { LAMP_POS, WALL_Z, wall }) {
    this.group = new THREE.Group();
    stage.add(this.group);
    const g = this.group;

    // room: a dark back wall around the screen and a floor
    const back = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), new THREE.MeshLambertMaterial({ color: 0x2b211c }));
    back.position.set(0, 0.2, WALL_Z - 0.03);
    g.add(back);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshLambertMaterial({ color: 0x17110e }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, -1.25, WALL_Z + 1);
    g.add(floor);

    // wooden frame around the screen
    const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.7, metalness: 0.05 });
    const fw = 0.05, fd = 0.04, W = 1.2, H = 0.9;
    for (const [w, h, x, y] of [[W + 2 * fw, fw, 0, H / 2 + fw / 2], [W + 2 * fw, fw, 0, -H / 2 - fw / 2], [fw, H, -W / 2 - fw / 2, 0], [fw, H, W / 2 + fw / 2, 0]]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, fd), wood);
      bar.position.set(x, y, WALL_Z + fd / 2 - 0.005);
      g.add(bar);
    }

    // velvet curtains + valance with the gold sign
    const velvet = new THREE.MeshStandardMaterial({ color: 0x8c1020, roughness: 0.82, metalness: 0.0, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const c = curtain(0.46, 1.32, side, velvet);
      c.position.set(side * (W / 2 + fw + 0.23 - 0.09), -0.04, WALL_Z + 0.075);
      g.add(c);
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 8, 24), new THREE.MeshStandardMaterial({ color: 0xc99a3e, metalness: 0.8, roughness: 0.35 }));
      tie.position.set(side * (W / 2 + fw + 0.14), -0.2, WALL_Z + 0.11); tie.rotation.x = Math.PI / 2; tie.scale.set(1.4, 1, 0.6);
      g.add(tie);
    }
    const valance = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.15, 0.07), velvet);
    valance.position.set(0, H / 2 + fw + 0.075, WALL_Z + 0.09);
    g.add(valance);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.125), new THREE.MeshBasicMaterial({ map: signTexture() }));
    sign.position.set(0, H / 2 + fw + 0.075, WALL_Z + 0.126);
    g.add(sign);

    // desk: warm wood
    const desk = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.5), new THREE.MeshStandardMaterial({ map: woodTexture('#6b4529'), roughness: 0.6 }));
    desk.position.set(0, -0.53, -0.35);
    g.add(desk);

    // brass pendant lamp (shade opening faces the screen)
    const toWall = new THREE.Vector3(0, 0, WALL_Z).sub(LAMP_POS).normalize();
    const lamp = new THREE.Group();
    lamp.position.copy(LAMP_POS);
    lamp.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), toWall);  // cone opening = local -Y
    const brass = new THREE.MeshStandardMaterial({ color: 0x9a7840, emissive: 0x3a2610, metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide });
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.048, 0.062, 32, 1, true), brass);
    shade.position.y = 0.005; lamp.add(shade);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.046, 0.06, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd58a, side: THREE.BackSide }));
    inner.position.y = 0.005; lamp.add(inner);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.016, 20, 14), new THREE.MeshBasicMaterial({ color: 0xfff1c9 }));
    bulb.position.y = -0.01; lamp.add(bulb);
    g.add(lamp);
    const cordTop = new THREE.Vector3(0, 1.6, LAMP_POS.z + 0.05), cordBot = LAMP_POS.clone().addScaledVector(toWall, -0.03);
    const cordLen = cordTop.distanceTo(cordBot);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, cordLen, 6), new THREE.MeshBasicMaterial({ color: 0x0c0a08 }));
    cord.position.addVectors(cordTop, cordBot).multiplyScalar(0.5);
    cord.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), cordTop.clone().sub(cordBot).normalize());
    g.add(cord);

    // soft light beam from the bulb to the screen (additive, view-angle faded)
    const beamLen = new THREE.Vector3(0, 0, WALL_Z).distanceTo(LAMP_POS);
    const beamGeo = new THREE.CylinderGeometry(0.03, 0.66, beamLen, 48, 1, true);
    this.beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(0xffd9a0) }, uOpacity: { value: 0.085 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying float vH;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz);
          vH = uv.y; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec3 vN; varying vec3 vV; varying float vH;
        void main(){ float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
          float a = uOpacity * pow(rim, 1.6) * mix(0.35, 1.0, vH);
          gl_FragColor = vec4(uColor * a, 1.0); }`,
    });
    const beam = new THREE.Mesh(beamGeo, this.beamMat);
    beam.position.copy(LAMP_POS).addScaledVector(toWall, beamLen / 2);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toWall.clone().negate());  // narrow end at the lamp
    beam.renderOrder = 5;
    g.add(beam);

    // dust motes drifting in the beam
    this.lamp = LAMP_POS.clone(); this.axis = toWall.clone(); this.beamLen = beamLen;
    const N = 240, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    this.motes = { N, pos, col, vel: new Float32Array(N * 3), phase: new Float32Array(N), r: rng(3) };
    for (let i = 0; i < N; i++) this._spawn(i, true);
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    mg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const dot = canvasTex(32, 32, (c, w) => { const r = c.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = r; c.fillRect(0, 0, w, w); });
    this.points = new THREE.Points(mg, new THREE.PointsMaterial({ size: 0.0055, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    g.add(this.points);
    this._t = 0;
  }

  _spawn(i, anywhere) {
    const { pos, vel, phase, r } = this.motes;
    const t = anywhere ? 0.08 + r() * 0.9 : 0.08 + r() * 0.15;
    const rad = t * 0.62 * Math.sqrt(r()), a = r() * Math.PI * 2;
    // orthonormal basis around the beam axis
    const ax = this.axis, u = new THREE.Vector3(1, 0, 0).cross(ax).normalize(), v = ax.clone().cross(u);
    const p = this.lamp.clone().addScaledVector(ax, t * this.beamLen).addScaledVector(u, Math.cos(a) * rad).addScaledVector(v, Math.sin(a) * rad);
    pos.set([p.x, p.y, p.z], i * 3);
    vel.set([(r() - 0.5) * 0.01, (r() - 0.4) * 0.008, (r() - 0.5) * 0.01], i * 3);
    phase[i] = r() * 100;
  }

  update(dt) {
    this._t += dt;
    const { N, pos, col, vel, phase } = this.motes, t = this._t;
    const p = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const k = i * 3;
      pos[k] += (vel[k] + Math.sin(t * 0.3 + phase[i]) * 0.002) * dt;
      pos[k + 1] += (vel[k + 1] + Math.cos(t * 0.23 + phase[i]) * 0.0015) * dt;
      pos[k + 2] += vel[k + 2] * dt;
      p.set(pos[k], pos[k + 1], pos[k + 2]).sub(this.lamp);
      const along = p.dot(this.axis) / this.beamLen;
      const radial = p.addScaledVector(this.axis, -along * this.beamLen).length();
      if (along < 0.05 || along > 0.98 || radial > along * 0.62) this._spawn(i, false);
      const tw = 0.45 + 0.55 * Math.max(0, Math.sin(t * 1.7 + phase[i]));
      const b = tw * (1.0 - 0.5 * along);
      col[k] = b; col[k + 1] = b * 0.86; col[k + 2] = b * 0.66;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
