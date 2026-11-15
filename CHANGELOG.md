# Changelog

## 2026-11-15: ready to upload
- **Release signing.** `bash Tools/build_release.sh` builds an APK signed with your own key, which the
  Meta dashboard requires (it rejects debug-signed builds). The key and its password stay in
  `~/ShadowHands-signing/`, outside the repo; the build loads them from environment variables and
  clears them from ProjectSettings afterwards.
- **Removed Unity Analytics, In-App Purchasing and Unity Cloud services.** Unity had added them by
  default. The competition requires no network calls and no third-party services. The APK shrank
  from 72 MB to 66 MB, and the self-test still passes.
- **Devpost draft:** removed claims that haven't been verified (headset/FOV test, cold-start time) and
  filled every blank except Team.
- **Added `Submission/UPLOAD_GUIDE.md`:** Developer Dashboard steps.

## 2026-11-14: running in Unity
Verified by actually running it in Unity 6000.0.85f2 with Meta XR SDK 207.0.1 (headless editor, real URP rendering).

### Fixed (bugs only running it could find)
- **Hand shadows faded out of the scorer's view.** URP clamps shadow distance to the camera's far plane,
  and WallCam's far plane hugged the wall (0.6 m). The score could never reach the lock threshold. This
  would have broken scoring on the headset too.
- PuzzleManager's UnityEvents were null when the component was added from code, so wiring them crashed.
- All UI text was invisible: TextMeshPro's font resources were never imported. Setup now imports them.
- Payoff puffs (fire, water, moon) didn't render: the sprite import mode produced no sprite.
- Controller models under the camera rig were picked up as "hands" and would cast shadows. They're now excluded.
- The default TMP font has no ellipsis glyph; text truncates instead.

### Added
- **More feedback:** the goal silhouette darkens as the match improves and pulses while held, and a tone
  swells and rises in pitch during the hold.
- **More to come back for:** a Daily Shadow streak, Story completion time, and a "3 / 10 Dog" level counter.
- **Ships as a complete Unity project:** `Packages/manifest.json` pulls URP and Meta XR Core + Interaction 207.0.1.
- **ShadowHands > Build Quest Scene (Building Blocks):** builds `Main.unity` with Camera Rig, Hand Tracking,
  Interaction and Hand Poke blocks, adds ISDK poke to the desk UI, sets the Oculus XR loader, Hands Only and
  Quest 3/3S, and runs Project Setup Tool *Fix All*.
- **ShadowHands > Run Self-Test:** plays the whole game in the editor with a stand-in hand and real
  shadows, and writes pass/fail results and screenshots. Currently 33/33 pass.

## 2026-11-14: polish pass
- Skip and quitting mid-level now save Story progress. Before, relaunching returned you to the level you skipped.
- The match chime plays first, then the level's sound and animation start 0.35 s later (`sfxDelay`).
  They used to play at the same instant.
- The desk panel and desk are lower. The panel's top edge used to hide the bottom ~10 cm of the wall.
  It is still within 0.52 m of the eyes.
- Water and fire payoff puffs now start at the elephant's trunk tip and between the dragon's jaws.
- HandShadowCaster removes a shadow-only hand copy when ISDK rebuilds the hand mesh. Before, the old
  copy could leave a frozen ghost shadow.
- Setup now disables only the Light component on extra lights, not their whole GameObject.
- UI no longer shows placeholder object names on the first frame.
- Added **ShadowHands > Build APK** and `Tools/build.ps1`: a headless APK build, then install and launch
  on the headset with adb.
- README and Devpost draft brought in line with the code (WallCam culling, level table, tuning notes).

## 2026-11-14: scoring fixes, content, one-click scene setup

Not yet compiled in Unity or run on a headset. Unity, the Android SDK and `metavr` are not installed
on the build PC. The C# passes a Roslyn syntax check. The scoring logic was checked in a numpy simulation.

### Fixed
- **ShadowScorer: hand shadows were likely invisible to WallCam.** A layer excluded from a camera's
  culling mask does not cast shadows in that camera's render, so a Wall-only WallCam probably scored 0
  forever. WallCam now renders Wall + Hands, and the hands appear only as invisible shadow-only copies
  (see HandShadowCaster).
- **ShadowScorer: wall corners counted as shadow.** Spot-light falloff made the edges dark enough to
  cross the fixed 0.45 threshold. In simulation, even a pixel-perfect shadow scored only 0.90. Each pixel
  is now compared with the brightest value it has had (its "lit reference"), and a perfect shadow scores 1.00.
- **ShadowScorer:** uses the URP render-request API (falls back to `Camera.Render`), renders every 2nd
  frame to save GPU time, recovers from a readback dropped during pause, and adds a `flipMaskX` toggle
  alongside `flipMaskY`.
- **HandShadowCaster:** ISDK's hand material is transparent, and transparent materials don't cast
  shadows in URP. It now adds an opaque shadow-only copy of each hand mesh on the Hands layer, which
  follows tracking loss. A scene-wide mode handles hand meshes that Building Blocks create at runtime.
- **PuzzleManager:**
  - Holds lasted 2–3× longer than `holdSeconds`. Time was counted per score sample, not real time.
  - Skip during a payoff advanced two levels.
  - After the last Story level, every later launch replayed level 10 forever.
  - Holds now reset when the headset comes off.
- **MatchMeterUI:** the ✓ glyph isn't in the default TMP font, so it now uses plain text.

### Added
- 10 silhouettes (`Assets/Art/Silhouettes`): black-on-white masks plus transparent overlay sprites,
  generated by `Tools/generate_assets.py`. Every shape includes a forearm entering from the bottom edge.
  Shapes 1–6 are one-hand and 7–10 are two-hand, with no crossed fingers. These are **placeholders**.
- Synthesized audio (`Assets/Audio`): match chime plus one sound per level, CC0 by construction.
- `PayoffAnimator`: procedural "comes alive" animations (flap, hop, bark, crawl, glide, howl with moon,
  walk off, trunk spray, scuttle, fire breath). No Animator assets needed.
- First-launch tutorial: the Bird at threshold 0.55, with step prompts ("Put your hand between the lamp
  and the wall" → "That's your shadow!" → "Hold it still...").
- `StageAnchor`: places the lamp, wall and desk relative to the seated player's eyes, and re-places them
  after the headset is put back on. A Recenter button is on the desk.
- `MaskRecorder` (dev tool, off by default): saves the real current shadow as a mask PNG, so level
  targets can be made from an actual hand.
- `Assets/Editor/ShadowHandsSetup.cs`: **ShadowHands > Setup Everything** creates the layers, import
  settings, 11 level assets and 10 payoff prefabs. It enables URP spot-light shadows, builds the whole
  stage, wires every event and button, saves `Main.unity` and adds it to Build Settings.
