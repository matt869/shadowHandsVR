# Devpost submission: Meta VR Start Developer Competition 2026

Paste each section into the matching Devpost field. Only **Team** and **Video link** are left for you.
Deadline: **Nov 18, 2026, 12:00 PM PST = Nov 19, 4:00 AM Manila.** Nothing can change after it.

---

**Submission name:** Shadow Hands

**Tagline (≤140 characters):**
Make hand shadows on a lamp-lit wall with your real hands. Match the silhouette, hold it, and the shadow comes alive.

**Track:** Gaming
**Division:** New Experience

**Project link (playable build):** https://matt869.github.io/shadowHandsVR/
Open in the Meta Quest Browser → **Enter VR**. Hands only, no install.

**Video link:** [YouTube or Vimeo, public, under 3:00, footage from a Quest or an XR emulator]

---

**Description (about 400 words):**

*Inspiration.* Hand-shadow puppets are the oldest hands-first game there is: a lamp, a wall, and two
hands. Quest hand tracking makes the real thing playable, and the tracking itself becomes the mechanic
rather than an obstacle.

*What it does.* You sit at a desk in a small puppet theatre under a brass lamp. A faint silhouette
appears on the paper screen: a rabbit, a wolf, a dragon. Shape your real hands until your shadow matches
it. As you get closer, the target's outline warms from grey to glowing orange. Hold the match for a
moment and the shadow comes alive: it hops, howls at a rising moon, sprays water or breathes fire, with
a flash and golden sparks.

- 10 creatures, from one-hand animals to two-hand shapes, none of which need crossed fingers.
- A 20-second tutorial on first launch: "Put your hand between the lamp and the wall."
- Story mode, about ten minutes end to end, with saved progress.
- **Daily Shadow:** the same puzzle for everyone each day, with a streak.

*How we built it.* WebXR with three.js, played straight from the Quest Browser. The scoring is
physical, not a gesture classifier. A spot light casts your tracked hands onto the wall, and a small
orthographic camera reads the actual shadow back from the GPU and computes intersection over union
against the target. Any hand shape that casts the right shadow counts; there's no "correct" pose to
memorize. Each WebXR hand-tracking joint becomes a solid capsule hand (bones, palm, forearm) that casts
the shadow. Every pixel is compared with its own lit brightness, so the lamp's fall-off isn't mistaken
for shadow. An automated test plays the whole game in a browser with real shadows: the tutorial, all 10
levels, Daily mode, pause and resume, and rejecting wrong shapes. The same game is also playable on a
laptop through a webcam, using on-device hand tracking.

*Design choices.* Seated, everything within a two-foot radius, one scene that drops you straight into
the first puzzle, and hands only from start to finish (poke buttons on the desk). It's fully offline once
loaded, with no third-party services; all libraries are bundled. Hold-to-lock with a forgiving decay copes
with shaky tracking, and it runs on real time, so it feels the same on any device.

*What's next.* A two-player puppet theatre over shared spatial anchors, silhouettes recorded from your
own hands to challenge friends, and a storytelling mode where your shadows act out a narrated tale.

---

**Hand interactions (optional field):**
Hands are the entire input. Your tracked hands become a solid shadow-casting mesh, and the shadow itself
is the controller. Menus are big poke buttons on the desk, pressed with a fingertip. What excites us
about hands-first VR: your hands stop being a stand-in for a controller and become the thing itself,
so the oldest game people play with light and a wall works in VR exactly the way it does in a bedroom.

**Target launch date:** Q1 2027

**Team:** [YOUR NAME, YOUR EMAIL, role]

---

## Special awards this fits
- **Best Reason to Come Back:** Daily Shadow with a streak.
- **Best First Five Minutes:** a 20-second tutorial, and you're casting shadows in the first seconds.
- **Boldest Original Concept:** physical shadow scoring instead of gesture recognition.

## Before you press Submit
- [ ] Start program membership approved (required)
- [ ] The link opens and plays in the Meta Quest Browser (or the Immersive Web Emulator)
- [ ] Video under 3:00, **public**, best 20 seconds first, footage from a Quest or an XR emulator
- [ ] Don't change the GitHub repo after the deadline. The site must stay up through judging.
