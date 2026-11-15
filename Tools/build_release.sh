#!/usr/bin/env bash
# Release-signed APK for the Meta Developer Dashboard.
#   bash Tools/build_release.sh [path/to/signing.env]
# signing.env (kept OUTSIDE the repo, default ~/ShadowHands-signing/signing.env) defines
# SHADOWHANDS_KEYSTORE, SHADOWHANDS_KEYSTORE_PASS, SHADOWHANDS_KEY_ALIAS, SHADOWHANDS_KEY_PASS.
# Unity Hub must be running (headless Unity borrows its license).
cd "$(dirname "$0")/.." || exit 1
ENV_FILE="${1:-$HOME/ShadowHands-signing/signing.env}"
[ -f "$ENV_FILE" ] || { echo "signing env not found: $ENV_FILE"; exit 1; }
set -a; . "$ENV_FILE"; set +a

U="/c/Program Files/Unity/Hub/Editor/6000.0.85f2/Editor/Unity.exe"
"$U" -batchmode -quit -buildTarget Android -projectPath "$(cygpath -w "$PWD")" \
  -executeMethod ShadowHandsBuild.BuildApk -logFile "$(cygpath -w "$PWD/Builds/build.log")"
code=$?
grep -E "error CS|^\[ShadowHands\]|BuildFailedException|No valid Unity" Builds/build.log | sort -u
echo "exit=$code"
exit $code
