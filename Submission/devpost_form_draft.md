# Devpost submission draft — fill the [brackets]

**Submission name:** Shadow Hands

**Tagline (≤140 chars):**
Make hand shadows on a lamp-lit wall. Match the silhouette and it comes alive. No controllers — your hands are the puppets.

**Track:** Gaming
**Division:** New Experience (conceived and built after Sept 24, 2026)

**Description (≤500 words) — draft:**

*Inspiration.* Hand-shadow puppets are the oldest hands-first game there is: a lamp, a wall, and two hands. We realized Quest's hand tracking makes the real thing playable — and that the tracking itself could be the mechanic rather than an obstacle.

*What it does.* You sit at a desk under a lamp. A silhouette appears on the wall — a rabbit, a wolf, a dragon. You shape your real hands until your cast shadow matches it. The closer you get, the more the shadow stirs; hold the match for a moment and it comes alive and plays out a short scene. Story mode is 10 puzzles, from one-hand animals to two-hand creatures, about ten minutes end-to-end. Daily Shadow gives everyone the same new puzzle each day.

*How we built it.* Unity 6 + Meta XR All-in-One SDK v207 (Interaction SDK for hand visuals and poke UI). The scoring is physical, not a gesture classifier: a spot light casts the tracked hand meshes onto a white wall; a small orthographic camera reads the actual shadow back each frame and computes intersection-over-union against the target mask. That means any hand shape that casts the right shadow counts — there's no "correct" finger pose to memorize. Tested on Quest 3 with `metavr device fov-sim` to check the Meta VR Glasses field of view.

*Design choices.* Seated, two-foot radius, cold start to first puzzle in under 15 seconds, no third-party services, fully playable with hands end-to-end. Hold-to-lock with decay keeps it forgiving for shaky tracking.

*What's next.* [Two-player puppet theater over Shared Spatial Anchors; user-created silhouettes; hand-shadow storytelling mode with narration.]

**Hand interactions (optional field):**
Hands are the entire input: the shadow of the tracked hand mesh is the controller. UI is ISDK poke/pinch. What excites us about hands-first VR: [one sentence].

**Target launch date:** [Q1 2027]

**Team:** [Name — email — role]

---

## Pre-submit checklist (do Day 5, leave buffer)
- [ ] Start program membership approved
- [ ] APK uploaded to release channel named exactly **Competition** in Developer Dashboard
- [ ] Invite URL generated and tested in a fresh account
- [ ] Video < 3:00, public on YouTube/Vimeo, best 20 seconds FIRST, footage from headset or XR Simulator
- [ ] Hands-only playthrough verified end-to-end (never paired a controller)
- [ ] Cold-start timed; pause/resume (headset off/on) tested
- [ ] Build stays accessible through Dec 9 (don't touch the channel after deadline)
- [ ] Submit before **Nov 18, 12:00 PM PST = Nov 19, 4:00 AM Manila**
