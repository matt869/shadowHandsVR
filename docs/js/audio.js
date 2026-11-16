// Web Audio: one-shots (chime, per-level sounds) and a looping tone that swells while a match is held.
// All sounds are local files synthesized by Tools/generate_assets.py (no network services).
export class Sfx {
  constructor(base = 'assets/audio/') {
    this.base = base;
    this.ctx = null;
    this.buffers = {};
    this.toneGain = null;
    this.toneSrc = null;
    this.musicGain = null;
    this.master = null;
    this.muted = false;
  }

  /** Must be called from a user gesture (e.g. the Enter VR click). Safe to call repeatedly. */
  async unlock(names) {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
    await Promise.all(names.map((n) => this._load(n)));
    this._startTone();
    this._startMusic();
  }

  /** Quiet music-box loop; dips briefly while a creature's sound plays. */
  _startMusic() {
    const buf = this.buffers.music_box;
    if (!buf || this.musicGain) return;
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.gain.setTargetAtTime(0.16, this.ctx.currentTime, 1.5);   // fade in
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    src.connect(this.musicGain).connect(this.master);
    src.start();
  }

  duck(seconds = 2.5) {
    if (!this.musicGain) return;
    const g = this.musicGain.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setTargetAtTime(0.06, t, 0.15); g.setTargetAtTime(0.16, t + seconds, 0.8);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
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
    src.connect(g).connect(this.master);
    src.start(this.ctx.currentTime + delay);
  }

  _startTone() {
    const buf = this.buffers.hold_tone;
    if (!buf || this.toneSrc) return;
    this.toneGain = this.ctx.createGain();
    this.toneGain.gain.value = 0;
    this.toneSrc = this.ctx.createBufferSource();
    this.toneSrc.buffer = buf; this.toneSrc.loop = true;
    this.toneSrc.connect(this.toneGain).connect(this.master);
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
