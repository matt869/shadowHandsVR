using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

/// <summary>
/// End-to-end self-test without a headset. Headless:
///   Unity.exe -batchmode -projectPath . -executeMethod ShadowHandsSelfTest.Prepare -quit
///   Unity.exe -batchmode -projectPath . -executeMethod ShadowHandsSelfTest.Run        (no -quit: it exits itself)
/// Results: Builds/selftest/results.txt + screenshots.
/// </summary>
public static class ShadowHandsSelfTest
{
    const string TestScene = "Assets/Scenes/SelfTest.unity";

    /// <summary>One-time project preparation: URP asset, TMP resources, layers, levels, prefabs.</summary>
    public static void Prepare()
    {
        ShadowHandsSetup.EnsureUrp();
        ShadowHandsSetup.EnsureTmp();
        ShadowHandsSetup.CreateLayers();
        ShadowHandsSetup.CreateAssets();
        ShadowHandsSetup.ConfigureUrpShadows();
        AssetDatabase.SaveAssets();
        Debug.Log("[SelfTest] prepared");
    }

    [MenuItem("ShadowHands/Run Self-Test (no headset)", priority = 80)]
    public static void Run()
    {
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        var camGo = new GameObject("Main Camera") { tag = "MainCamera" };
        var cam = camGo.AddComponent<Camera>();
        camGo.AddComponent<AudioListener>();
        camGo.transform.position = new Vector3(0f, 1.2f, 0f);  // a seated head
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = new Color(0.01f, 0.01f, 0.015f);
        cam.nearClipPlane = 0.05f;
        cam.fieldOfView = 75f;

        Directory.CreateDirectory(Path.GetDirectoryName(TestScene));
        EditorSceneManager.SaveScene(scene, TestScene);
        ShadowHandsSetup.BuildStage(false);

        var d = new GameObject("SelfTestDriver").AddComponent<SelfTestDriver>();
        d.pm = Object.FindFirstObjectByType<PuzzleManager>();
        d.scorer = Object.FindFirstObjectByType<ShadowScorer>();
        d.caster = Object.FindFirstObjectByType<HandShadowCaster>();
        d.stage = GameObject.Find("ShadowHands_Stage").transform;
        d.lamp = d.stage.Find("Lamp");
        d.wallRoot = d.stage.Find("WallRoot");
        EditorSceneManager.SaveScene(scene);

        EditorApplication.delayCall += () => EditorApplication.EnterPlaymode();
    }
}
