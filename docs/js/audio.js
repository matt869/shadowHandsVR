// Web Audio: one-shots (chime, per-level sounds) and a looping tone that swells while a match is held.
// All sounds are local files synthesized by Tools/generate_assets.py (no network services).
export class Sfx {
  constructor(base = 'assets/audio/') {
    this.base = base;
    this.ctx = null;
    this.buffers = {};
    this.toneGain = null;
    this.toneSrc = null;
  }

  /** Must be called from a user gesture (e.g. the Enter VR click). Safe to call repeatedly. */
  async unlock(names) {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
    await Promise.all(names.map((n) => this._load(n)));
    this._startTone();
  }

  async _load(name) {
    if (this.buffers[name]) return;
    try {
      const res = await fetch(`${this.base}${name}.wav`);
      this.buffers[name] = await this.ctx.decodeAudioData(await res.arrayBuffer());
    } catch (e) { console.warn('[audio] could not load', name, e); }
  }

  play(name, delay = 0, volume = 0.8) {
    const buf = this.buffers[name];
    if (!this.ctx || !buf) return;
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
    src.buffer = buf; g.gain.value = volume;
    src.connect(g).connect(this.ctx.destination);
    src.start(this.ctx.currentTime + delay);
  }

  _startTone() {
    const buf = this.buffers.hold_tone;
    if (!buf || this.toneSrc) return;
    this.toneGain = this.ctx.createGain();
    this.toneGain.gain.value = 0;
    this.toneSrc = this.ctx.createBufferSource();
    this.toneSrc.buffer = buf; this.toneSrc.loop = true;
    this.toneSrc.connect(this.toneGain).connect(this.ctx.destination);
    this.toneSrc.start();
  }

  /** 0..1 hold progress: louder and higher while the match is held. */
  setHold(h) {
    if (!this.toneGain) return;
    const t = this.ctx.currentTime;
    this.toneGain.gain.setTargetAtTime(0.3 * h, t, 0.05);
    this.toneSrc.playbackRate.setTargetAtTime(1 + 0.5 * h, t, 0.05);
  }
}
