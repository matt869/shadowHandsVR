# Shadow Hands

Hands-first shadow-puppet puzzle game for Meta Quest 3 / Meta VR Glasses. Sit under a lamp, shape your
real tracked hands, and match the silhouette on the wall. Hold the match and the shadow comes alive.
Built for the Meta VR Start Developer Competition 2026 (Gaming track, New Experience). Fully offline,
no controllers.

## Status

| Part | State |
|---|---|
| Unity project | Opens and compiles in **Unity 6000.0.85f2** with **Meta XR Core + Interaction SDK 207.0.1** (no errors) |
| Quest scene `Assets/Scenes/Main.unity` | Built by script with Building Blocks (Camera Rig, Hand Tracking, Interaction, Hand Poke), poke-enabled desk UI, Hands Only, Quest 3/3S, Project Setup Tool *Fix All* applied |
| Gameplay | **Self-test passes 33/33** in the editor with real rendering: all 10 levels + tutorial + Daily lock from a real cast shadow (IoU 0.92–0.95), wrong shapes don't unlock, Skip/progress/streak/pause-resume work |
| On a Quest headset | **Not yet tested**: real hand tracking, comfort, 72 Hz and Glasses FOV need the device |
| Silhouettes | Placeholders from `Tools/generate_assets.py`; replace with real-hand captures (`MaskRecorder`) |

## Quick start

1. Open this folder in Unity **6000.0.85f2** (Android Build Support installed). Packages, including the
   Meta SDK from Meta's registry, resolve automatically from `Packages/manifest.json`.
   `Assets/Scenes/Main.unity` is ready to build. To rebuild it: **ShadowHands > Build Quest Scene (Building Blocks)**.
2. Build: **ShadowHands > Build APK**, or `powershell -ExecutionPolicy Bypass -File Tools/build.ps1`.
3. Test without a headset: **ShadowHands > Run Self-Test (no headset)**, or `bash Tools/selftest.sh`.
   Results and screenshots go to `Builds/selftest/`.
4. Optional, to regenerate art and audio: `python Tools/generate_assets.py` (needs Pillow and numpy).

See [CHANGELOG.md](CHANGELOG.md) for what changed from the original scaffold and why.

## Everything you need is free

| Need | Use | Cost |
|---|---|---|
| Engine | Unity 6 (Personal license) | Free |
| Hand tracking, interactions, simulator | **Meta XR All-in-One SDK v207** (Core + Interaction SDK + XR Simulator) | Free |
| Publish build for judges | Meta Quest Developer Dashboard (needs a verified dev org — do this today, verification can take a day) | Free |
| Desktop testing | Meta XR Simulator (ships in the All-in-One) | Free |
| Agentic dev tooling | **Meta VR CLI** (`metavr`) + Claude Code plugin `meta-vr@meta-quest` | Free |
| 3D props (lamp, desk) | Meta 3D asset library via `metavr`, or Kenney.nl (CC0) | Free |
| Sound | freesound.org (filter CC0), Kenney audio packs | Free |
| Silhouette art | Draw black-on-white PNGs (any paint tool), or trace CC0 animal silhouettes | Free |
| Video | Quest's built-in recorder → YouTube | Free |

**No LLM, no cloud, no REST API.** The game must pass the "take it away" test and must stay launchable through Dec 9 — offline-only is the safest possible submission.

## Project structure

```
ShadowHands/
├── Assets/
│   ├── Scenes/
│   │   └── Main.unity               ← one scene: Desk + Lamp + Wall + Hands + UI
│   ├── Scripts/
│   │   ├── ShadowScorer.cs          ← reads the REAL shadow off the wall, computes IoU
│   │   ├── PuzzleManager.cs         ← level flow, hold-to-lock, Story + Daily modes
│   │   ├── SilhouetteLevel.cs       ← ScriptableObject: one puzzle (mask, hint, payoff)
│   │   ├── HandShadowCaster.cs      ← forces hand meshes to cast shadows / correct layer
│   │   └── MatchMeterUI.cs          ← match bar, hold ring, level name, hint
│   ├── Editor/ShadowHandsSetup.cs   ← ShadowHands menu: one-click layers, levels, prefabs, scene
│   ├── Levels/                      ← Level_00_Tutorial_Bird … Level_10_Dragon (generated)
│   ├── Art/Silhouettes/             ← rabbit.png, wolf.png … (black on white, 512², Read/Write ON)
│   ├── Audio/                       ← lamp hum, match chime, per-level payoff sfx
│   └── Prefabs/                     ← Payoff_Rabbit (animated sprite/mesh that hops), etc.
├── Packages/
│   └── manifest.additions.json      ← what to add to the generated manifest (or use Asset Store)
├── Submission/
│   └── devpost_form_draft.md        ← pre-written form text + Day-5 checklist
└── README.md
```

## Scene setup

Follow **MANUAL_STEPS.md, section A**. In short: create a Unity 6 URP project, switch to Android, install
the Meta XR All-in-One SDK, run Project Setup Tool > Fix All, and add the **Camera Rig** + **Hand Tracking**
Building Blocks. Then run **ShadowHands > Setup Everything (1-4)**. It creates the layers, levels, payoff
prefabs and URP shadow settings, builds the lamp, wall, WallCam, overlay, desk and UI, and wires every
event. Last, add ISDK poke interaction to `DeskCanvas`.

How the stage works (all relative to the player's eyes, placed at runtime by `StageAnchor`):
- **Lamp:** a spot light 0.2 m above and 0.3 m in front of the eyes, with hard shadows. It is the only
  real-time light.
- **Wall:** a white Lit quad 1.0 m ahead (layer `Wall`). **WallCam** scores the central 0.9 x 0.9 m of it.
- **WallCam culling mask = Wall + Hands.** A layer the camera doesn't render casts no shadows in that
  camera, so Wall-only would score 0. The hands are drawn into it only as invisible shadow-only copies
  (`HandShadowCaster`).
- **GoalOverlay:** the faint target on layer `Overlay`. WallCam doesn't see it.

Art and audio come from `python Tools/generate_assets.py`. To make a target from a real hand,
use `MaskRecorder`.

## Agentic workflow (speeds up Days 2–4)

```bash
curl -fsSL https://developers.meta.com/horizon/install-cli/ | sh     # mac/linux
# windows: iwr -useb https://developers.meta.com/horizon/install-cli/windows/ | iex
metavr init          # installs the agent skill + MCP server
metavr doctor
metavr device list   # Quest in Developer Mode + USB debugging
```
In Claude Code: `/plugin marketplace add meta-quest/agentic-tools` then `/plugin install meta-vr@meta-quest`.
Then you can say things like "deploy the APK, launch it, screenshot the wall" and it does it.

Glasses check: `metavr device fov-sim` narrows a Quest's FOV to Meta VR Glasses — run your
playthrough once this way and mention it in the write-up.

## Level list (10 = ~10 minutes)

| # | Silhouette | Hands | Payoff |
|---|---|---|---|
| # | Silhouette | Hands | Threshold | Payoff |
|---|---|---|---|---|
| 0 | Bird (tutorial, first launch) | one hand | 0.55 | flaps away |
| 1 | Bird | one hand, flat, thumb up | 0.65 | flaps away |
| 2 | Rabbit | one hand, two fingers up | 0.65 | hops |
| 3 | Dog | one hand, pinky dropped for the jaw | 0.65 | barks |
| 4 | Snail | fist + two fingers | 0.70 | crawls off |
| 5 | Swan | arm up, wrist bent | 0.70 | glides |
| 6 | Wolf | one hand, open jaw | 0.70 | howls at a moon that appears |
| 7 | Deer | two hands (antlers) | 0.70 | turns, walks off |
| 8 | Elephant | two hands (ears + trunk) | 0.75 | sprays water |
| 9 | Crab | two hands | 0.75 | scuttles sideways |
| 10 | Dragon | two hands | 0.75 | breathes fire (finale) |

No shape needs crossed fingers, because hand tracking fails there. One-hand shapes come first.

## Tuning notes
- **Difficulty is the first thing to tune on device.** In simulation, a shadow 4 cm off target scores
  about 0.47 IoU. Record real-hand targets with `MaskRecorder`, or lower `lockThreshold`.
- Resolution 128 is plenty; drop to 64 if you need frame time. `ShadowScorer.renderEveryNFrames = 2`
  halves the scoring cost. Readback is async, so it never stalls.
- If the meter is jittery, lower `PuzzleManager.smoothing` toward 0.1. Hold decay keeps it forgiving.
- If the meter reacts upside-down, toggle `ShadowScorer.flipMaskY`. If it reacts mirrored, toggle `flipMaskX`.
- Try `HandShadowCaster.hideVisibleHands`. It shows only the shadow, which feels more magical and hides
  tracking jitter.
