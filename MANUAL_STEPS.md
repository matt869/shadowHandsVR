# What you have to do by hand

Items marked ⚠ could not be checked against the installed SDK. Confirm the exact menu names in your copy.

## A. Unity (about 45 min, mostly downloads)
1. Install **Unity Hub**, then **Unity 6 LTS** with **Android Build Support** (OpenJDK + SDK/NDK).
   Sign in. Unity Personal is free.
2. Create a new project with the **Universal 3D (URP)** template. Copy this folder's `Assets/` and `Tools/`
   into it. Keep the generated `Packages/` and `ProjectSettings/`.
3. Go to File > Build Profiles and switch to **Android**.
4. In Package Manager, open **My Assets** and install **Meta XR All-in-One SDK** (v207). Add it to your
   account on the Asset Store first.
5. Run **Meta > Tools > Project Setup Tool > Fix All** (Android tab). Run it again until nothing is red.
6. Open a new empty scene, then **Meta > Tools > Building Blocks**. Add **Camera Rig** and **Hand Tracking**.
   Skip Passthrough for now: the effect depends on a dark room.
7. On the OVRManager (on the camera rig), set **Hand Tracking Support = Hands Only** and
   **Target Devices = Quest 3 / Quest 3S**.
8. Run **ShadowHands > Setup Everything (1-4)**. It saves `Assets/Scenes/Main.unity`. If TMP asks to
   import Essentials, say yes, then run step 4 again.
9. ⚠ Right-click **DeskCanvas** and choose **Interaction SDK > Add Poke Interaction to Canvas** (or the
   Poke Canvas building block). This makes the buttons work with a fingertip.

## B. On the headset (needs `metavr` or adb)
1. Run `metavr init`, `metavr doctor`, then `metavr device list`. The Quest must be in Developer Mode
   with USB debugging allowed.
2. Build and Run: either **ShadowHands > Build APK**, or close Unity and run
   `powershell -ExecutionPolicy Bypass -File Tools/build.ps1`. The script builds headlessly, then
   installs and launches with adb. Put a hand between the lamp and the wall.
   - The match bar should move.
   - If it reacts upside-down, toggle `ShadowScorer.flipMaskY` on ShadowHands_Managers.
   - If it reacts mirrored, toggle `flipMaskX`.
3. **Tune the difficulty first.** In simulation, a shadow 4 cm off target scores about 0.47 IoU, so the
   0.65–0.75 thresholds may be too strict. The best fix is to replace the placeholder silhouettes with
   real hand shadows: enable `MaskRecorder` and the Btn_Record_DEV button, make each shape, and poke
   Record. Then run `adb pull /sdcard/Android/data/<package>/files/masks`.
4. Run `metavr device fov-sim` once. If the wall's edges are cut off, use **ShadowHands > Move Wall
   Closer** (0.1 m per click). The masks don't need regenerating, because the scored frame moves with
   the wall.
5. Time the cold start (target under 15 s). Take the headset off and put it back on, and check that the
   game resumes and recenters.
6. Disable `MaskRecorder` and the Record button before the competition build.

## C. Meta Developer Dashboard (developers.meta.com/horizon)
1. Confirm your developer org is verified. It can take a day, so do it first.
2. Create the app: **Meta Horizon Store**, Quest. Copy the **App ID**.
3. ⚠ In Unity, set **Meta > Platform > Edit Settings > App ID**. Under Player Settings, set a unique
   **Package Name** (e.g. `com.yourname.shadowhands`), version code 1, and IL2CPP + ARM64 (Fix All
   usually sets these).
4. Build a **release** (non-development) APK and sign it with your own keystore (Player Settings >
   Publishing Settings). The dashboard rejects debug-signed builds.
5. ⚠ Under Distribution > Release Channels, create a channel named exactly **Competition**.
6. Upload the APK to that channel, using the dashboard upload or Meta Quest Developer Hub. Fill in the
   **Hands-only** input declaration and comfort rating if asked.
7. ⚠ In the Competition channel, add testers or **generate the invite URL**. Test it in a different
   Meta account.
8. Don't touch the channel after submission. It has to stay installable through Dec 9.
