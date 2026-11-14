#!/usr/bin/env bash
# Headless end-to-end self-test. Usage: bash Tools/selftest.sh   (from the project root)
cd "$(dirname "$0")/.." || exit 1
U="/c/Program Files/Unity/Hub/Editor/6000.0.85f2/Editor/Unity.exe"
rm -rf Builds/selftest
timeout 560 "$U" -batchmode -projectPath "$(cygpath -w "$PWD")" -executeMethod ShadowHandsSelfTest.Run -logFile "$(cygpath -w "$PWD/Builds/selftest.log")" 2>/dev/null
echo "exit=$?"
grep -E "^\[SelfTest\]" Builds/selftest.log
grep -E "error CS|Exception" Builds/selftest.log | sort | uniq -c | head
