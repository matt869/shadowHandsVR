using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

/// <summary>
/// APK build, from the menu or headless:
///   Unity.exe -batchmode -quit -projectPath . -executeMethod ShadowHandsBuild.BuildApk -logFile Builds/build.log
/// (Tools/build.ps1 does this, then installs and launches on the headset.)
/// </summary>
public static class ShadowHandsBuild
{
    public const string ApkPath = "Builds/ShadowHands.apk";

    [MenuItem("ShadowHands/Build APK", priority = 60)]
    public static void BuildApk()
    {
        var scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray();
        if (scenes.Length == 0)
        {
            Fail("No scenes in Build Settings - run ShadowHands > Setup Everything first.");
            return;
        }
        if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.Android)
            EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.Android, BuildTarget.Android);

        Directory.CreateDirectory(Path.GetDirectoryName(ApkPath));
        EditorUserBuildSettings.buildAppBundle = false;
        var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
        {
            scenes = scenes,
            locationPathName = ApkPath,
            target = BuildTarget.Android,
            options = BuildOptions.None,
        });

        var s = report.summary;
        Debug.Log($"[ShadowHands] build {s.result}: {ApkPath} {s.totalSize / (1024f * 1024f):0.0} MB in {s.totalTime.TotalSeconds:0}s, {s.totalErrors} errors");
        if (Application.isBatchMode) EditorApplication.Exit(s.result == BuildResult.Succeeded ? 0 : 1);
    }

    static void Fail(string msg)
    {
        Debug.LogError("[ShadowHands] " + msg);
        if (Application.isBatchMode) EditorApplication.Exit(1);
    }
}
