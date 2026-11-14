# Headless APK build, then install + launch on the connected Quest.
#   powershell -ExecutionPolicy Bypass -File Tools\build.ps1            (build + install + launch)
#   powershell -ExecutionPolicy Bypass -File Tools\build.ps1 -NoDeploy  (build only)
# Close the Unity editor first: batchmode can't open a project that is already open.
param([switch]$NoDeploy, [string]$UnityExe = "")

$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $PSScriptRoot
$apk = Join-Path $project "Builds\ShadowHands.apk"
$log = Join-Path $project "Builds\build.log"

if (-not $UnityExe) {
    $editors = Get-ChildItem "C:\Program Files\Unity\Hub\Editor" -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "6000.*" } | Sort-Object Name -Descending
    if (-not $editors) { throw "No Unity 6 (6000.x) editor under C:\Program Files\Unity\Hub\Editor. Pass -UnityExe." }
    $UnityExe = Join-Path $editors[0].FullName "Editor\Unity.exe"
}

New-Item -ItemType Directory -Force (Split-Path $apk) | Out-Null
Write-Host "Building with $UnityExe ..."
$p = Start-Process -FilePath $UnityExe -Wait -PassThru -ArgumentList @(
    "-batchmode", "-quit", "-projectPath", "`"$project`"",
    "-executeMethod", "ShadowHandsBuild.BuildApk", "-logFile", "`"$log`"")
Select-String -Path $log -Pattern "\[ShadowHands\]|error CS|BuildFailedException" | ForEach-Object { $_.Line }
if ($p.ExitCode -ne 0) { throw "Build failed (exit $($p.ExitCode)). Full log: $log" }

if ($NoDeploy) { Write-Host "Built $apk"; exit 0 }

# Deploy: prefer metavr, fall back to adb.
$pkg = (Select-String -Path (Join-Path $project "ProjectSettings\ProjectSettings.asset") -Pattern "^\s+Android: (com\..+)$" |
    Select-Object -First 1).Matches.Groups[1].Value
if (Get-Command metavr -ErrorAction SilentlyContinue) {
    Write-Host "Use metavr to install/launch (see 'metavr --help'): $apk  package=$pkg"
} elseif (Get-Command adb -ErrorAction SilentlyContinue) {
    adb install -r $apk
    if ($pkg) { adb shell monkey -p $pkg -c android.intent.category.LAUNCHER 1 | Out-Null; Write-Host "Launched $pkg" }
} else {
    Write-Host "Built $apk - no metavr or adb on PATH, install it from Meta Quest Developer Hub."
}
