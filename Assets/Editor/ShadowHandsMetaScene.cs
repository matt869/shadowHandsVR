using System;
using System.Collections.Generic;
using System.Reflection;
using System.Threading.Tasks;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEditor.XR.Management;
using UnityEditor.XR.Management.Metadata;
using UnityEngine;
using UnityEngine.XR.Management;

/// <summary>
/// Builds the real Quest scene (Assets/Scenes/Main.unity) end to end, with Meta Building Blocks:
///   Camera Rig + Hand Tracking + Interaction + Hand Poke Interactor  (installed through the Building
///   Blocks system itself, so the result is identical to clicking them in Meta > Tools > Building Blocks)
///   + the Shadow Hands stage + ISDK poke interaction on the desk canvas (official QuickActionsAPI)
///   + project settings: Oculus XR loader, Hands Only, Quest 3 / 3S, Project Setup Tool "Fix All".
///
/// Menu: ShadowHands > Build Quest Scene (Building Blocks)
/// Headless: Unity.exe -batchmode -buildTarget Android -projectPath . -executeMethod ShadowHandsMetaScene.Build
///           (no -quit: it exits by itself when the async installs finish)
/// </summary>
public static class ShadowHandsMetaScene
{
    // Building Block ids, read from the installed v207 packages
    // (core: Editor/BuildingBlocks/BlockDataIds.cs; interaction.ovr: Editor/Blocks/*.asset).
    const string BlockInteractionHandTracking = "0393ca30-f2a9-4865-a40f-f9a68d01c3a9"; // pulls Camera Rig, Hand Tracking, Interaction
    const string BlockHandPokeInteractor = "f61a01e5-61c7-4589-bd2d-107bccae8f02";

    public const string AppId = "com.matt869.shadowhands";

    [MenuItem("ShadowHands/Build Quest Scene (Building Blocks)", priority = 5)]
    public static async void Build()
    {
        try
        {
            ConfigureProject();
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            await InstallBlock(BlockInteractionHandTracking);
            await InstallBlock(BlockHandPokeInteractor);

            // Seated in a dark room: plain black background behind the lit wall.
            var eye = GameObject.Find("CenterEyeAnchor");
            if (eye && eye.TryGetComponent<Camera>(out var cam))
            {
                cam.clearFlags = CameraClearFlags.SolidColor;
                cam.backgroundColor = Color.black;
            }

            ShadowHandsSetup.BuildStage(true);

            var canvas = GameObject.Find("DeskCanvas");
            Oculus.Interaction.Editor.QuickActions.QuickActionsAPI.AddPokeCanvasInteraction(canvas);

            // Save BEFORE Fix All: the scene is complete at this point.
            EditorSceneManager.MarkSceneDirty(EditorSceneManager.GetActiveScene());
            EditorSceneManager.SaveOpenScenes();
            AssetDatabase.SaveAssets();
            Report();

            // Project Setup Tool > Fix All. In batchmode its Task does not always complete even though
            // the fixes are applied, so never wait on it for more than a minute.
            var fix = OVRProjectSetup.FixAllAsync(BuildTargetGroup.Android);
            var done = await Task.WhenAny(fix, Task.Delay(60000));
            Debug.Log("[ShadowHands] Project Setup Fix All " + (done == fix ? "completed" : "still running after 60 s (fixes so far are applied)"));
            AssetDatabase.SaveAssets();
            Debug.Log("[ShadowHands] Quest scene built: " + EditorSceneManager.GetActiveScene().path);
            if (Application.isBatchMode) EditorApplication.Exit(0);
        }
        catch (Exception e)
        {
            Debug.LogError("[ShadowHands] Quest scene build FAILED: " + e);
            if (Application.isBatchMode) EditorApplication.Exit(1);
        }
    }

    static void ConfigureProject()
    {
        PlayerSettings.companyName = "matt869";
        PlayerSettings.productName = "Shadow Hands";
        PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, AppId);
        PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
        PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;

        // Oculus XR loader for Android
        if (!EditorBuildSettings.TryGetConfigObject(XRGeneralSettings.k_SettingsKey, out XRGeneralSettingsPerBuildTarget per) || !per)
        {
            per = ScriptableObject.CreateInstance<XRGeneralSettingsPerBuildTarget>();
            System.IO.Directory.CreateDirectory("Assets/XR");
            AssetDatabase.CreateAsset(per, "Assets/XR/XRGeneralSettingsPerBuildTarget.asset");
            EditorBuildSettings.AddConfigObject(XRGeneralSettings.k_SettingsKey, per, true);
        }
        if (!per.HasSettingsForBuildTarget(BuildTargetGroup.Android)) per.CreateDefaultSettingsForBuildTarget(BuildTargetGroup.Android);
        if (!per.HasManagerSettingsForBuildTarget(BuildTargetGroup.Android)) per.CreateDefaultManagerSettingsForBuildTarget(BuildTargetGroup.Android);
        var mgr = per.ManagerSettingsForBuildTarget(BuildTargetGroup.Android);
        bool ok = XRPackageMetadataStore.AssignLoader(mgr, "Unity.XR.Oculus.OculusLoader", BuildTargetGroup.Android);
        Debug.Log("[ShadowHands] Oculus XR loader assigned: " + ok);
        EditorUtility.SetDirty(per);

        // Hands only, Quest 3 / 3S (the game never needs a controller)
        var cfg = OVRProjectConfig.CachedProjectConfig;
        cfg.handTrackingSupport = OVRProjectConfig.HandTrackingSupport.HandsOnly;
        cfg.targetDeviceTypes = new List<OVRProjectConfig.DeviceType> { OVRProjectConfig.DeviceType.Quest3, OVRProjectConfig.DeviceType.Quest3S };
        OVRProjectConfig.CommitProjectConfig(cfg);
        AssetDatabase.SaveAssets();
    }

    /// <summary>Install a Building Block with its dependencies (same code path as the Building Blocks window).</summary>
    static async Task InstallBlock(string id)
    {
        Type utils = null;
        foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
        {
            utils = asm.GetType("Meta.XR.BuildingBlocks.Editor.Utils");
            if (utils != null) break;
        }
        if (utils == null) throw new Exception("Meta Building Blocks not found - is com.meta.xr.sdk.core installed?");

        var get = utils.GetMethod("GetBlockData", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static, null, new[] { typeof(string) }, null);
        var data = get.Invoke(null, new object[] { id });
        if (data == null) throw new Exception("Building Block not found: " + id);

        var present = data.GetType().GetMethod("IsBlockPresentInScene", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance, null, Type.EmptyTypes, null);
        if (present != null && (bool)present.Invoke(data, null)) { Debug.Log("[ShadowHands] block already present: " + data); return; }

        var install = data.GetType().GetMethod("InstallWithDependencies", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance, null, new[] { typeof(GameObject) }, null);
        await (Task)install.Invoke(data, new object[] { null });
        Debug.Log("[ShadowHands] installed block: " + data);
    }

    static void Report()
    {
        var sb = new System.Text.StringBuilder("[ShadowHands] scene roots:");
        foreach (var go in EditorSceneManager.GetActiveScene().GetRootGameObjects()) sb.Append("\n  - ").Append(go.name);
        sb.Append("\n  skinned hand meshes at edit time: ");
        foreach (var r in UnityEngine.Object.FindObjectsByType<SkinnedMeshRenderer>(FindObjectsInactive.Include, FindObjectsSortMode.None)) sb.Append(r.name).Append("; ");
        sb.Append("\n  PointableCanvasModule present: ").Append(UnityEngine.Object.FindFirstObjectByType<Oculus.Interaction.PointableCanvasModule>() != null);
        Debug.Log(sb.ToString());
    }
}
