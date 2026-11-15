# Devpost submission draft

Only **Team** is left for you to fill. Re-check every claim against what you have actually tested before submitting.

**Submission name:** Shadow Hands

**Tagline (≤140 chars):**
Make hand shadows on a lamp-lit wall. Match the silhouette and it comes alive. No controllers — your hands are the puppets.

**Track:** Gaming
**Division:** New Experience (conceived and built after Sept 24, 2026)

**Description (≤500 words) — draft:**

*Inspiration.* Hand-shadow puppets are the oldest hands-first game there is: a lamp, a wall, and two hands. We realized Quest's hand tracking makes the real thing playable — and that the tracking itself could be the mechanic rather than an obstacle.

*What it does.* You sit at a desk under a lamp. A silhouette appears on the wall — a rabbit, a wolf, a dragon. You shape your real hands until your cast shadow matches it. The closer you get, the more the shadow stirs; hold the match for a moment and it comes alive and plays out a short scene. Story mode is 10 puzzles, from one-hand animals to two-hand creatures, about ten minutes end-to-end. Daily Shadow gives everyone the same new puzzle each day.

*How we built it.* WebXR with three.js, playable straight from the Quest Browser with no install. Each hand-tracking joint becomes a solid capsule hand that casts the shadow (a native Unity 6 + Meta XR SDK v207 version is in the same repo). The scoring is physical, not a gesture classifier. A spot light casts the tracked hand meshes onto a white wall, and a small orthographic camera reads the actual shadow back and computes intersection-over-union against the target mask. Any hand shape that casts the right shadow counts; there's no "correct" finger pose to memorize. Every level is checked by an automated test that casts real shadows and plays the game end to end: tutorial, all 10 levels, Daily mode, and pause/resume.

*Design choices.* Seated, everything within a two-foot radius, one scene that drops you straight into the first puzzle, fully offline with no third-party services, and hands only from start to finish. Hold-to-lock with decay keeps it forgiving for shaky tracking. The target darkens as you get closer and a tone rises while you hold, so you can feel the match without reading a number.

*What's next.* A two-player puppet theater over Shared Spatial Anchors, user-created silhouettes recorded from your own hands, and a storytelling mode where shadows act out a narrated tale.

**Hand interactions (optional field):**
Hands are the entire input: the shadow of the tracked hand mesh is the controller. UI is ISDK poke/pinch. What excites us about hands-first VR: your hands stop being a stand-in for a controller and become the thing itself, so the oldest game people play with light and a wall works in VR exactly the way it does in a bedroom.

**Target launch date:** Q1 2027

**Team:** [YOUR NAME — YOUR EMAIL — role]  ← only you can fill this

---

## Pre-submit checklist (do Day 5, leave buffer)
- [ ] Start program membership approved
- [ ] WebXR entry: GitHub Pages enabled (Settings → Pages → main /docs) and https://matt869.github.io/shadowHandsVR/ opens and plays in the Quest Browser
- [ ] Public link pasted into the Devpost form
- [ ] Video < 3:00, public on YouTube/Vimeo, best 20 seconds FIRST, footage from headset or XR Simulator
- [ ] Hands-only playthrough verified end-to-end (never paired a controller)
- [ ] Cold-start timed on a headset (target < 15 s); pause/resume (headset off/on) tested on a headset
- [ ] Build stays accessible through Dec 9 (don't touch the channel after deadline)
- [ ] Submit before **Nov 18, 12:00 PM PST = Nov 19, 4:00 AM Manila**
