import { LEVELS, TUTORIAL, dailyIndex } from './levels.js';

const KEY = {
  progress: 'shadowhands.story.index',
  daily: 'shadowhands.daily.done',
  streak: 'shadowhands.daily.streak',
  tutorial: 'shadowhands.tutorial.done',
  storyTime: 'shadowhands.story.seconds',
};

// localStorage can throw (private mode, blocked storage): the game must still run without it.
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, String(v)); } catch { /* not persisted */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Core loop (port of the Unity PuzzleManager): show goal -> score climbs -> hold above threshold
 * for holdSeconds -> payoff -> next level. Modes: tutorial (first launch), story, daily.
 */
export class Game {
  constructor(hooks, { holdSeconds = 1.25, smoothTau = 0.12, payoffSeconds = 4, sfxDelay = 0.35, staleAfter = 1.5 } = {}) {
    this.h = hooks;
    this.levels = LEVELS;
    this.holdSeconds = holdSeconds;
    this.smoothTau = smoothTau;      // seconds: time-based, so slow shadow readbacks don't slow the meter
    this.staleAfter = staleAfter;    // no reading for this long -> freeze the hold (neither grow nor decay)
    this.payoffSeconds = payoffSeconds;
    this.sfxDelay = sfxDelay;
    this.mode = 'story';
    this.index = 0;
    this.current = null;
    this.smoothed = 0;
    this.holdTimer = 0;
    this.locked = false;
    this.lastScoreTime = -1;
    this.tutorialStep = 0;
    this.levelStart = 0;
    this.clock = 0;
    this.completeAt = -1;   // time the payoff finishes
    this.payoffAt = -1;     // time the payoff starts (after the chime)
  }

  get dailyStreak() {
    const last = store.get(KEY.daily, '');
    const y = new Date(); y.setDate(y.getDate() - 1);
    return last === dayKey() || last === dayKey(y) ? Number(store.get(KEY.streak, 0)) : 0;
  }
  dailyDoneToday() { return store.get(KEY.daily, '') === dayKey(); }

  start() {
    if (store.get(KEY.tutorial, '0') !== '1') this.startTutorial();
    else this.startStory();
  }

  startTutorial() {
    this._cancel();
    this.mode = 'tutorial'; this.tutorialStep = 0; this.index = -1;
    this._load(TUTORIAL);
    this.h.hint('Put your hand between the lamp and the wall');
  }

  startStory() {
    this._cancel();
    this.mode = 'story';
    const saved = Number(store.get(KEY.progress, 0));
    this.index = saved >= 0 && saved < this.levels.length ? saved : 0;
    if (this.index === 0) store.set(KEY.storyTime, 0);
    this._load(this.levels[this.index]);
  }

  startDaily() {
    this._cancel();
    this.mode = 'daily';
    this.index = dailyIndex(this.levels.length);
    this._load(this.levels[this.index]);
    if (this.dailyDoneToday()) this.h.hint(`Solved today (streak: ${this.dailyStreak}). Play it again!`);
  }

  skip() {
    this._cancel();
    if (this.mode === 'tutorial') return this._finishTutorial();
    if (this.mode === 'daily') return this.startStory();
    this._next();
  }

  resetProgress() {
    for (const k of Object.values(KEY)) store.del(k);
    this.start();
  }

  /** Headset removed / browser hidden: drop any partial hold. */
  pause() {
    this.holdTimer = 0; this.smoothed = 0; this.lastScoreTime = -1;
    this.h.match(0); this.h.hold(0); this.h.feedback(0, 0);
  }

  _cancel() {
    this.completeAt = -1; this.payoffAt = -1;
    this.h.clearPayoff();
  }

  _load(lvl) {
    this.current = lvl; this.locked = false;
    this.holdTimer = 0; this.smoothed = 0; this.lastScoreTime = -1;
    if (this.mode === 'story' && this.index >= 0) store.set(KEY.progress, this.index);
    this.levelStart = this.clock;
    this.h.levelStart(lvl);
    this.h.feedback(0, 0);
    this.h.title(this.mode === 'story' ? `${this.index + 1} / ${this.levels.length}   ${lvl.name}`
      : this.mode === 'daily' ? `Daily Shadow   ${lvl.name}` : lvl.name);
    this.h.hint(lvl.hint);
    this.h.match(0); this.h.hold(0);
  }

  /** Call every frame with elapsed seconds; drives the payoff timeline. */
  tick(dt) {
    this.clock += dt;
    if (!this.locked && this.current) this._updateHold(dt);
    if (this.payoffAt >= 0 && this.clock >= this.payoffAt) {
      this.payoffAt = -1;
      this.h.payoff(this.current);
    }
    if (this.completeAt >= 0 && this.clock >= this.completeAt) {
      this.completeAt = -1;
      this.h.clearPayoff();
      if (this.mode === 'tutorial') this._finishTutorial();
      else if (this.mode === 'daily') { this.h.hint(`Daily Shadow solved! Streak: ${this.dailyStreak} day${this.dailyStreak === 1 ? '' : 's'}. Come back tomorrow.`); this.h.allComplete(); }
      else this._next();
    }
  }

  /**
   * Called by the scorer with a raw IoU whenever a shadow reading arrives (every 1-3 frames on a
   * headset, slower on weak devices). coverage = fraction of the wall in shadow.
   * Smoothing is time-based, so the meter feels the same at any reading rate.
   */
  onScore(raw, coverage) {
    if (this.locked || !this.current) return;
    const now = this.clock;
    const since = this.lastScoreTime < 0 ? 0 : now - this.lastScoreTime;
    this.lastScoreTime = now;
    const a = since > 0 ? 1 - Math.exp(-since / this.smoothTau) : 0.3;
    this.smoothed += (raw - this.smoothed) * a;
    this.h.match(Math.min(1, this.smoothed / this.current.thr));
    if (this.mode === 'tutorial' && this.tutorialStep === 0 && coverage > 0.02) {
      this.tutorialStep = 1; this.h.hint("That's your shadow! Shape it into the bird");
    }
  }

  /** Hold-to-lock runs on frame time (not on reading rate), with forgiving decay. */
  _updateHold(dt) {
    const fresh = this.lastScoreTime >= 0 && this.clock - this.lastScoreTime < this.staleAfter;
    const thr = this.current.thr;
    if (fresh) {
      if (this.smoothed >= thr) this.holdTimer += dt;
      else this.holdTimer = Math.max(0, this.holdTimer - dt * 2);   // decay, forgiving
    }
    const match01 = Math.min(1, this.smoothed / thr), hold01 = Math.min(1, this.holdTimer / this.holdSeconds);
    this.h.hold(hold01);
    this.h.feedback(match01, hold01);
    if (this.mode === 'tutorial' && this.tutorialStep === 1 && this.holdTimer > 0) {
      this.tutorialStep = 2; this.h.hint('Yes! Hold it still...');
    }
    if (this.holdTimer >= this.holdSeconds) this._complete();
  }

  _complete() {
    this.locked = true;
    const lvl = this.current;
    this.h.feedback(0, 0);
    this.h.locked(lvl);                       // chime, hide goal, stop scoring
    this.h.hint(`${lvl.name} - it's alive!`);
    if (this.mode === 'daily') {
      if (!this.dailyDoneToday()) store.set(KEY.streak, this.dailyStreak + 1);
      store.set(KEY.daily, dayKey());
    } else if (this.mode === 'story') {
      store.set(KEY.progress, this.index + 1);
      store.set(KEY.storyTime, Number(store.get(KEY.storyTime, 0)) + (this.clock - this.levelStart));
    }
    this.payoffAt = this.clock + this.sfxDelay;
    this.completeAt = this.clock + this.payoffSeconds;
    this.h.completed(lvl);
  }

  _finishTutorial() {
    store.set(KEY.tutorial, 1);
    this.startStory();
  }

  _next() {
    this.index++;
    if (this.index >= this.levels.length) {
      const secs = Math.round(Number(store.get(KEY.storyTime, 0)));
      this.h.title('The End');
      this.h.hint(`All ${this.levels.length} shadows found in ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}! Try the Daily Shadow.`);
      this.h.allComplete();
      return;
    }
    this._load(this.levels[this.index]);
  }
}
