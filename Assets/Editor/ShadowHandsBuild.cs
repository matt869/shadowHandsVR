using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

/// <summary>
/// APK build, from the menu or headless:
///   Unity.exe -batchmode -quit -projectPath . -executeMethod ShadowHandsBuild.BuildApk -logFile Builds/build.log
///
/// Release signing (required by the Meta Developer Dashboard) comes from environment variables, so no
/// keystore path or password is ever written into ProjectSettings and pushed to git:
///   SHADOWHANDS_KEYSTORE, SHADOWHANDS_KEYSTORE_PASS, SHADOWHANDS_KEY_ALIAS, SHADOWHANDS_KEY_PASS
/// Tools/build_release.sh loads them from a signing.env kept outside the repo. Without them the
/// APK is debug-signed (fine for sideloading, rejected by the dashboard).
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
            Fail("No scenes in Build Settings - run ShadowHands > Build Quest Scene first.");
            return;
        }
        if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.Android)
            EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.Android, BuildTarget.Android);

        bool signed = ApplyReleaseSigning();
        Directory.CreateDirectory(Path.GetDirectoryName(ApkPath));
        EditorUserBuildSettings.buildAppBundle = false;
        BuildReport report;
        try
        {
            report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = scenes,
                locationPathName = ApkPath,
                target = BuildTarget.Android,
                options = BuildOptions.None,
            });
        }
        finally
        {
            ClearSigning(); // never leave the keystore path in ProjectSettings
        }

        var s = report.summary;
        Debug.Log($"[ShadowHands] build {s.result} ({(signed ? "RELEASE-signed" : "debug-signed")}): {ApkPath} in {s.totalTime.TotalSeconds:0}s, {s.totalErrors} errors");
        if (Application.isBatchMode) EditorApplication.Exit(s.result == BuildResult.Succeeded ? 0 : 1);
    }

    static bool ApplyReleaseSigning()
    {
        string ks = Environment.GetEnvironmentVariable("SHADOWHANDS_KEYSTORE");
        if (string.IsNullOrEmpty(ks)) { Debug.Log("[ShadowHands] no SHADOWHANDS_KEYSTORE set - debug signing"); return false; }
        if (!File.Exists(ks)) { Fail("SHADOWHANDS_KEYSTORE points to a missing file: " + ks); return false; }
        PlayerSettings.Android.useCustomKeystore = true;
        PlayerSettings.Android.keystoreName = ks;
        PlayerSettings.Android.keystorePass = Environment.GetEnvironmentVariable("SHADOWHANDS_KEYSTORE_PASS");
        PlayerSettings.Android.keyaliasName = Environment.GetEnvironmentVariable("SHADOWHANDS_KEY_ALIAS");
        PlayerSettings.Android.keyaliasPass = Environment.GetEnvironmentVariable("SHADOWHANDS_KEY_PASS");
        return true;
    }

    static void ClearSigning()
    {
        PlayerSettings.Android.useCustomKeystore = false;
        PlayerSettings.Android.keystoreName = "";
        PlayerSettings.Android.keystorePass = "";
        PlayerSettings.Android.keyaliasName = "";
        PlayerSettings.Android.keyaliasPass = "";
        AssetDatabase.SaveAssets();
    }

    static void Fail(string msg)
    {
        Debug.LogError("[ShadowHands] " + msg);
        if (Application.isBatchMode) EditorApplication.Exit(1);
    }
}
