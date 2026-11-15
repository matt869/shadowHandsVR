# Uploading Shadow Hands to the Meta Developer Dashboard

These steps need your Meta login. Meta renames dashboard buttons from time to time, so if a label
doesn't match exactly, look for the closest one.

## What you upload
- **File:** `Builds/ShadowHands.apk` (about 72 MB). Build it with `bash Tools/build_release.sh`.
- **Package name:** `com.matt869.shadowhands`
- **Version code:** 1. Every new upload to the same app needs a higher number: raise *Bundle Version Code*
  in Player Settings.
- **Signing:** release key in `C:\Users\profe\ShadowHands-signing\`. Check it's release-signed before
  uploading: `apksigner verify --print-certs Builds/ShadowHands.apk` must show `CN=Shadow Hands, O=matt869`,
  **not** `Android Debug`.

> Keep `C:\Users\profe\ShadowHands-signing\` backed up (USB stick or your own cloud). Meta ties the app to
> this key, and without it you can never upload an update.

## Steps
1. Sign in at **developers.meta.com/horizon** with the account you entered the competition with.
2. **Organization:** make sure your developer organization exists and is **verified**. Verification can
   take a day, so check this first.
3. **Create the app:** *Create New App*, platform **Meta Horizon Store** / Quest, name **Shadow Hands**.
4. **Release channel:** in the app, open *Distribution* then *Release Channels*. Create a channel named
   exactly **Competition**.
5. **Upload:** add a build to the **Competition** channel and choose `Builds/ShadowHands.apk`.
   - If it asks about input, declare **Hands only**: the game never uses a controller.
   - If it asks for a comfort rating: seated, no movement, so *Comfortable*.
   - The upload checks package name, signing, 64-bit code and target API level. This APK passes all of
     those locally (API 34, arm64-v8a, release-signed).
6. **Invite URL:** in the Competition channel, add testers or create the invite link. Open it while
   signed in to a **different** Meta account to confirm it works.
7. Put the invite URL in your Devpost submission (`Submission/devpost_form_draft.md`) and submit before
   **Nov 18, 12:00 PM PST**.
8. **After submitting, don't change the Competition channel.** It has to stay installable through Dec 9.

## If the upload is rejected
Copy the exact error message and send it to me; most rejections are a one-setting fix and a rebuild.
