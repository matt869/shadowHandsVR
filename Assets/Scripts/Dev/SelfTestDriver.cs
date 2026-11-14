using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

/// <summary>
/// DEV ONLY (lives in Assets/Scenes/SelfTest.unity, never in Main). Plays the whole game with a fake hand
/// and the real renderer: for each level it builds a cut-out of the target, places it between the lamp
/// and the wall so its REAL cast shadow lands on the target, and lets the actual game code score it,
/// hold, lock, play the payoff and advance. Run via ShadowHands > Run Self-Test, or headless with
/// -executeMethod ShadowHandsSelfTest.Run. Results + screenshots go to Builds/selftest/.
/// </summary>
public class SelfTestDriver : MonoBehaviour
{
    public PuzzleManager pm;
    public ShadowScorer scorer;
    public HandShadowCaster caster;
    public Transform stage, lamp, wallRoot;
    public string outDir = "Builds/selftest";
    [Tooltip("Where the fake hand sits: metres in front of the eyes (lamp is at 0.3, wall at 1.0)")]
    public float handZ = 0.55f;

    readonly List<string> lines = new();
    int failures;
    GameObject fake;
    SilhouetteLevel completed;
    bool allComplete;

    void Awake()
    {
        PlayerPrefs.DeleteAll();   // simulate a first launch (runs before PuzzleManager.Start)
        Application.runInBackground = true;
        pm.onLevelComplete.AddListener(l => completed = l);
        pm.onAllComplete.AddListener(() => allComplete = true);
        caster.hideVisibleHands = true; // screenshots show the shadow, not the cut-out
    }

    IEnumerator Start()
    {
        Directory.CreateDirectory(outDir);
        yield return new WaitForSeconds(1.2f);  // StageAnchor settles, scorer learns the lit wall

        Check(pm.mode == PuzzleManager.Mode.Tutorial, "first launch starts in the tutorial");
        Check(scorer.shadowCoverage < 0.01f, $"empty wall reads as no shadow (coverage {scorer.shadowCoverage:0.000})");
        yield return Shot("00_empty_wall");

        // --- a wrong shape must NOT unlock
        var wrong = pm.levels[pm.levels.Count - 2];
        SetFake(wrong.mask);
        float max = 0f, t0 = Time.time;
        while (Time.time - t0 < 3f) { max = Mathf.Max(max, scorer.score); yield return null; }
        Check(completed == null && max < pm.Current.lockThreshold,
            $"wrong shape ({wrong.displayName}) does not unlock the tutorial (best score {max:0.00} < {pm.Current.lockThreshold:0.00})");
        ClearFake();
        yield return new WaitForSeconds(0.5f);

        // --- tutorial, then the 10 story levels
        yield return Play("tutorial", "01_tutorial");
        if (failures > 0) { Finish(); yield break; }   // fail fast: later checks all depend on this
        Check(pm.mode == PuzzleManager.Mode.Story && pm.CurrentIndex == 0, "tutorial hands over to Story level 1");
        for (int i = 0; i < pm.levels.Count; i++)
        {
            Check(pm.CurrentIndex == i, $"story is on level {i + 1}");
            yield return Play($"story {i + 1}", i == 1 || i == 5 || i == 9 ? $"1{i}_level{i + 1}" : null);
        }
        Check(allComplete, "story ends with onAllComplete");

        // --- skip saves progress
        pm.StartStory();
        Check(pm.CurrentIndex == 0, "Story restarts from level 1 after finishing");
        pm.Skip();
        Check(pm.CurrentIndex == 1 && PlayerPrefs.GetInt("shadowhands.story.index", -1) == 1, "Skip advances and saves progress");

        // --- daily
        allComplete = false;
        pm.StartDaily();
        Check(pm.mode == PuzzleManager.Mode.Daily && pm.CurrentIndex == PuzzleManager.DailyIndex(pm.levels.Count), "Daily picks today's level");
        yield return Play("daily", null);
        Check(pm.DailyDoneToday() && pm.DailyStreak == 1, $"Daily marked done, streak = {pm.DailyStreak}");

        // --- headset off / on
        foreach (var mb in FindObjectsByType<MonoBehaviour>(FindObjectsSortMode.None)) mb.SendMessage("OnApplicationPause", true, SendMessageOptions.DontRequireReceiver);
        yield return new WaitForSeconds(0.3f);
        foreach (var mb in FindObjectsByType<MonoBehaviour>(FindObjectsSortMode.None)) mb.SendMessage("OnApplicationPause", false, SendMessageOptions.DontRequireReceiver);
        yield return new WaitForSeconds(1.2f);
        pm.StartStory();
        yield return Play("after pause/resume", null);

        // --- no orphaned shadow proxies left behind
        yield return new WaitForSeconds(0.2f);
        int orphans = 0;
        foreach (var r in FindObjectsByType<SkinnedMeshRenderer>(FindObjectsInactive.Include, FindObjectsSortMode.None))
            if (r.name.EndsWith("_ShadowProxy")) orphans++;
        Check(orphans == 0, $"no leftover shadow proxies ({orphans})");

        Finish();
    }

    void Finish()
    {
        lines.Add(failures == 0 ? "RESULT: ALL PASSED" : $"RESULT: {failures} FAILED");
        File.WriteAllLines(Path.Combine(outDir, "results.txt"), lines);
        Debug.Log("[SelfTest] " + lines[lines.Count - 1]);
#if UNITY_EDITOR
        if (Application.isBatchMode) UnityEditor.EditorApplication.Exit(failures == 0 ? 0 : 1);
        else UnityEditor.EditorApplication.isPlaying = false;
#endif
    }

    IEnumerator Play(string label, string shotName)
    {
        var lvl = pm.Current;
        completed = null;
        bool wasAllComplete = allComplete;
        SetFake(lvl.mask);
        float t0 = Time.time, max = 0f;
        bool shot = false;
        while (completed != lvl && Time.time - t0 < 12f)
        {
            max = Mathf.Max(max, scorer.score);
            if (shotName != null && !shot && Time.time - t0 > 0.9f) { shot = true; yield return Shot(shotName + "_matching"); }
            yield return null;
        }
        Check(completed == lvl, $"{label}: {lvl.displayName} locked in {Time.time - t0:0.0}s (IoU {max:0.00}, needs {lvl.lockThreshold:0.00})");
        ClearFake();
        if (shotName != null)
        {
            yield return new WaitForSeconds(2.2f);
            yield return Shot(shotName + "_payoff");
            // and the desk panel, as the player sees it when glancing down
            var cam = Camera.main.transform;
            cam.localRotation = Quaternion.Euler(42f, 0f, 0f);
            yield return Shot(shotName + "_desk");
            cam.localRotation = Quaternion.identity;
        }

        // wait for the payoff to finish and the next level (or the end) to arrive
        float t1 = Time.time;
        while (pm.Current == lvl && allComplete == wasAllComplete && Time.time - t1 < 8f) yield return null;
        yield return null;
    }

    // ---------------------------------------------------------------- fake hand

    /// <summary>Cut-out of the mask, shrunk toward the lamp so its shadow lands exactly on the target.</summary>
    void SetFake(Texture2D mask)
    {
        ClearFake();
        const int G = 96;
        const float frame = 0.9f;
        Vector3 L = stage.InverseTransformPoint(lamp.position);
        Vector3 W0 = stage.InverseTransformPoint(wallRoot.position);
        float t = (handZ - L.z) / (W0.z - L.z);

        var verts = new List<Vector3>();
        var tris = new List<int>();
        for (int y = 0; y < G; y++)
            for (int x = 0; x < G; x++)
            {
                if (mask.GetPixelBilinear((x + 0.5f) / G, (y + 0.5f) / G).grayscale >= 0.5f) continue;
                int b = verts.Count;
                for (int c = 0; c < 4; c++)
                {
                    float u = (x + (c == 1 || c == 2 ? 1 : 0)) / (float)G, v = (y + (c >= 2 ? 1 : 0)) / (float)G;
                    Vector3 w = W0 + new Vector3((u - 0.5f) * frame, (v - 0.5f) * frame, 0f);
                    verts.Add(L + (w - L) * t);
                }
                tris.AddRange(new[] { b, b + 3, b + 2, b, b + 2, b + 1 });
            }

        var mesh = new Mesh { indexFormat = IndexFormat.UInt32 };
        mesh.SetVertices(verts);
        mesh.SetTriangles(tris, 0);
        mesh.RecalculateBounds();

        fake = new GameObject("FakeHand");
        fake.transform.SetParent(stage, false);
        var smr = fake.AddComponent<SkinnedMeshRenderer>();
        smr.sharedMesh = mesh;
        smr.localBounds = mesh.bounds;
        smr.sharedMaterial = caster.shadowProxyMaterial;
        caster.Apply(); // don't wait for the 1 s rescan
    }

    void ClearFake()
    {
        if (fake) Destroy(fake);
        fake = null;
    }

    // ---------------------------------------------------------------- reporting

    void Check(bool ok, string what)
    {
        if (!ok) failures++;
        string line = (ok ? "PASS  " : "FAIL  ") + what;
        lines.Add(line);
        Debug.Log("[SelfTest] " + line);
    }

    IEnumerator Shot(string name)
    {
        yield return null; // (WaitForEndOfFrame never fires in batchmode)
        var cam = Camera.main;
        var rt = new RenderTexture(1280, 720, 24, RenderTextureFormat.ARGB32);
        var req = new UniversalRenderPipeline.SingleCameraRequest { destination = rt };
        if (RenderPipeline.SupportsRenderRequest(cam, req)) RenderPipeline.SubmitRenderRequest(cam, req);
        var prev = RenderTexture.active;
        RenderTexture.active = rt;
        var tex = new Texture2D(rt.width, rt.height, TextureFormat.RGB24, false);
        tex.ReadPixels(new Rect(0, 0, rt.width, rt.height), 0, 0);
        tex.Apply();
        RenderTexture.active = prev;
        File.WriteAllBytes(Path.Combine(outDir, name + ".png"), tex.EncodeToPNG());
        Destroy(tex);
        rt.Release();

        // also what the scorer sees
        var m = scorer.CaptureShadowMask();
        File.WriteAllBytes(Path.Combine(outDir, name + "_scorer.png"), m.EncodeToPNG());
        Destroy(m);
        foreach (bool reference in new[] { false, true })
        {
            var raw = scorer.CaptureRaw(reference);
            File.WriteAllBytes(Path.Combine(outDir, name + (reference ? "_litref.png" : "_raw.png")), raw.EncodeToPNG());
            Destroy(raw);
        }
    }
}
