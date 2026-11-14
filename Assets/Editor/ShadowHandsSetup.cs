using System.Collections.Generic;
using System.IO;
using TMPro;
using UnityEditor;
using UnityEditor.Events;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.Rendering;
using UnityEngine.UI;

/// <summary>
/// One-click project/scene setup for Shadow Hands. Menu: ShadowHands > ...
/// Run AFTER: Meta SDK installed, Project Setup Tool "Fix All", and the Camera Rig + Hand Tracking
/// Building Blocks added to the open scene. Every step is idempotent (safe to re-run).
/// Deliberately references no Meta SDK types, so it compiles even before the SDK is installed.
/// </summary>
public static class ShadowHandsSetup
{
    const string SilDir = "Assets/Art/Silhouettes";
    const string LevelDir = "Assets/Levels";
    const string PrefabDir = "Assets/Prefabs";
    const string AudioDir = "Assets/Audio";
    const string ScenePath = "Assets/Scenes/Main.unity";
    const string WallMatPath = "Assets/Art/Wall.mat";
    const string DeskMatPath = "Assets/Art/Desk.mat";
    const float FrameMeters = 0.9f;   // mask image spans 0.9 x 0.9 m of wall (= WallCam ortho size 0.45)
    const float WallDistance = 1.0f;  // ShadowHands > Move Wall Closer if Glasses FOV clips it

    struct Lvl
    {
        public string num, file, name, hint; public float thr; public PayoffAnimator.Motion motion;
        public Lvl(string n, string f, string d, string h, float t, PayoffAnimator.Motion m) { num = n; file = f; name = d; hint = h; thr = t; motion = m; }
    }

    static readonly Lvl[] Levels =
    {
        new("01", "bird", "Bird", "Flat hand sideways, thumb up for the crest", 0.65f, PayoffAnimator.Motion.FlapAway),
        new("02", "rabbit", "Rabbit", "Two fingers up for ears, curl the rest", 0.65f, PayoffAnimator.Motion.Hop),
        new("03", "dog", "Dog", "Fingers forward, drop your pinky for the jaw, thumb up", 0.65f, PayoffAnimator.Motion.Bark),
        new("04", "snail", "Snail", "Make a fist, two fingers forward for feelers", 0.70f, PayoffAnimator.Motion.Crawl),
        new("05", "swan", "Swan", "Arm up, bend your wrist down, fingers together", 0.70f, PayoffAnimator.Motion.Glide),
        new("06", "wolf", "Wolf", "Like the dog, but open the jaw wide", 0.70f, PayoffAnimator.Motion.Howl),
        new("07", "deer", "Deer", "Two hands: spread your fingers up for antlers", 0.70f, PayoffAnimator.Motion.WalkOff),
        new("08", "elephant", "Elephant", "Two hands: palms out for ears, one arm down as the trunk", 0.75f, PayoffAnimator.Motion.Spray),
        new("09", "crab", "Crab", "Two hands: wrists together, fingers up as claws", 0.75f, PayoffAnimator.Motion.Scuttle),
        new("10", "dragon", "Dragon", "Two hands: one open jaw, one spread-finger wing", 0.75f, PayoffAnimator.Motion.BreatheFire),
    };

    // ------------------------------------------------------------------ menu

    [MenuItem("ShadowHands/Setup Everything (1-4)", priority = 0)]
    public static void SetupEverything()
    {
        CreateLayers();
        CreateAssets();
        ConfigureUrpShadows();
        BuildScene();
    }

    [MenuItem("ShadowHands/1. Create Layers", priority = 20)]
    public static void CreateLayers()
    {
        var tm = new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/TagManager.asset")[0]);
        var layers = tm.FindProperty("layers");
        foreach (var name in new[] { "Hands", "Wall", "Overlay" })
        {
            if (LayerMask.NameToLayer(name) >= 0) continue;
            for (int i = 8; i < layers.arraySize; i++)
            {
                var p = layers.GetArrayElementAtIndex(i);
                if (string.IsNullOrEmpty(p.stringValue)) { p.stringValue = name; Debug.Log($"[ShadowHands] layer {i} = {name}"); break; }
            }
        }
        tm.ApplyModifiedPropertiesWithoutUndo();
        AssetDatabase.SaveAssets();
    }

    [MenuItem("ShadowHands/2. Import Settings + Levels + Payoff Prefabs", priority = 21)]
    public static void CreateAssets()
    {
        Directory.CreateDirectory(LevelDir);
        Directory.CreateDirectory(PrefabDir);
        AssetDatabase.Refresh();

        ConfigureTextures();
        var puff = AssetDatabase.LoadAssetAtPath<Sprite>("Assets/Art/puff.png");

        SilhouetteLevel bird = null;
        foreach (var l in Levels)
        {
            var mask = AssetDatabase.LoadAssetAtPath<Texture2D>($"{SilDir}/{l.num}_{l.file}.png");
            var overlay = AssetDatabase.LoadAssetAtPath<Sprite>($"{SilDir}/{l.num}_{l.file}_overlay.png");
            if (!mask || !overlay) { Debug.LogError($"[ShadowHands] missing art for {l.file}; run Tools/generate_assets.py"); continue; }

            var prefab = MakePayoffPrefab(l, overlay, puff);
            var lvl = LoadOrCreate<SilhouetteLevel>($"{LevelDir}/Level_{l.num}_{l.name}.asset");
            lvl.displayName = l.name;
            lvl.mask = mask;
            lvl.goalOverlay = overlay;
            lvl.hint = l.hint;
            lvl.lockThreshold = l.thr;
            lvl.payoffPrefab = prefab;
            lvl.payoffSfx = AssetDatabase.LoadAssetAtPath<AudioClip>($"{AudioDir}/sfx_{l.file}.wav");
            EditorUtility.SetDirty(lvl);
            if (l.file == "bird") bird = lvl;
        }

        if (bird)
        {
            var tut = LoadOrCreate<SilhouetteLevel>($"{LevelDir}/Level_00_Tutorial_Bird.asset");
            EditorUtility.CopySerialized(bird, tut);
            tut.name = "Level_00_Tutorial_Bird";
            tut.displayName = "Your first shadow";
            tut.hint = "Put your hand between the lamp and the wall";
            tut.lockThreshold = 0.55f;
            EditorUtility.SetDirty(tut);
        }
        AssetDatabase.SaveAssets();
        Debug.Log("[ShadowHands] levels + payoff prefabs ready");
    }

    [MenuItem("ShadowHands/3. Configure URP Lamp Shadows", priority = 22)]
    public static void ConfigureUrpShadows()
    {
        var assets = new HashSet<RenderPipelineAsset>();
        if (GraphicsSettings.defaultRenderPipeline) assets.Add(GraphicsSettings.defaultRenderPipeline);
        for (int i = 0; i < QualitySettings.names.Length; i++)
        {
            var a = QualitySettings.GetRenderPipelineAssetAt(i);
            if (a) assets.Add(a);
        }
        if (assets.Count == 0) Debug.LogWarning("[ShadowHands] no URP asset found - is this a URP project?");

        foreach (var a in assets)
        {
            var so = new SerializedObject(a);
            SetInt(so, "m_AdditionalLightsRenderingMode", 1);     // Per Pixel (spot lights are "additional")
            SetInt(so, "m_AdditionalLightsPerObjectLimit", 4);
            SetBool(so, "m_AdditionalLightShadowsSupported", true);
            SetInt(so, "m_AdditionalLightsShadowmapResolution", 2048);
            SetBool(so, "m_SoftShadowsSupported", false);          // hard shadows: crisp puppets, cheaper
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(a);
            Debug.Log($"[ShadowHands] URP shadows configured on {a.name}");
        }
        AssetDatabase.SaveAssets();
    }

    [MenuItem("ShadowHands/4. Build Stage In Open Scene", priority = 23)]
    public static void BuildScene()
    {
        int wallL = LayerMask.NameToLayer("Wall"), overlayL = LayerMask.NameToLayer("Overlay");
        if (wallL < 0 || overlayL < 0 || LayerMask.NameToLayer("Hands") < 0) { CreateLayers(); wallL = LayerMask.NameToLayer("Wall"); overlayL = LayerMask.NameToLayer("Overlay"); }

        foreach (var n in new[] { "ShadowHands_Stage", "ShadowHands_Managers" })
        {
            var old = GameObject.Find(n);
            if (old) Object.DestroyImmediate(old);
        }

        // Only one real-time shadow light: switch off anything else (e.g. the template's Directional Light).
        foreach (var other in Object.FindObjectsByType<Light>(FindObjectsInactive.Include, FindObjectsSortMode.None))
        {
            Undo.RecordObject(other, "disable light");
            other.enabled = false; // the component only - its GameObject may belong to something else
            Debug.Log($"[ShadowHands] disabled extra light '{other.name}'");
        }
        RenderSettings.ambientMode = AmbientMode.Flat;
        RenderSettings.ambientLight = new Color(0.04f, 0.04f, 0.05f);
        RenderSettings.skybox = null;

        var wallMat = MakeMaterial(WallMatPath, Color.white);
        var deskMat = MakeMaterial(DeskMatPath, new Color(0.25f, 0.18f, 0.12f));

        // ---- stage (positioned at the player's eyes at runtime by StageAnchor)
        var stage = new GameObject("ShadowHands_Stage");
        var anchor = stage.AddComponent<StageAnchor>();
        var eye = GameObject.Find("CenterEyeAnchor");
        anchor.head = eye ? eye.transform : (Camera.main ? Camera.main.transform : null);
        if (!anchor.head) Debug.LogWarning("[ShadowHands] CenterEyeAnchor not found - add the Camera Rig building block, then re-run step 4.");
        stage.transform.position = new Vector3(0f, 1.2f, 0f); // editor preview only; runtime snaps to the head

        var wallRoot = Child(stage, "WallRoot", new Vector3(0f, 0f, WallDistance));

        var wall = GameObject.CreatePrimitive(PrimitiveType.Quad);
        wall.name = "Wall";
        Object.DestroyImmediate(wall.GetComponent<Collider>());
        wall.transform.SetParent(wallRoot.transform, false);
        wall.transform.localScale = new Vector3(1.2f, 0.9f, 1f);   // quad faces -Z = toward the player
        wall.layer = wallL;
        var wr = wall.GetComponent<MeshRenderer>();
        wr.sharedMaterial = wallMat;
        wr.receiveShadows = true;
        wr.shadowCastingMode = ShadowCastingMode.Off;

        var camGo = Child(wallRoot, "WallCam", new Vector3(0f, 0f, -0.5f));
        var cam = camGo.AddComponent<Camera>();
        cam.orthographic = true;
        cam.orthographicSize = FrameMeters / 2f;
        cam.nearClipPlane = 0.45f;   // hug the wall: nothing but the wall surface is in frame
        cam.farClipPlane = 0.6f;
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = Color.white;
        cam.cullingMask = LayerMask.GetMask("Wall", "Hands");
        cam.stereoTargetEye = StereoTargetEyeMask.None;
        cam.allowHDR = false;
        cam.allowMSAA = false;
        cam.enabled = false;

        var overlayGo = Child(wallRoot, "GoalOverlay", new Vector3(0f, 0f, -0.001f));
        overlayGo.layer = overlayL;
        var overlay = overlayGo.AddComponent<SpriteRenderer>();
        overlay.color = new Color(1f, 1f, 1f, 0.25f);
        overlay.shadowCastingMode = ShadowCastingMode.Off;

        var payoffSpawn = Child(wallRoot, "PayoffSpawn", new Vector3(0f, 0f, -0.002f));
        payoffSpawn.layer = overlayL;

        var lamp = Child(stage, "Lamp", new Vector3(0f, 0.2f, 0.3f));
        lamp.transform.LookAt(wallRoot.transform.position);
        var light = lamp.AddComponent<Light>();
        light.type = LightType.Spot;
        light.spotAngle = 105f;
        light.innerSpotAngle = 80f;
        light.range = 3f;
        light.intensity = 1.5f;
        light.color = new Color(1f, 0.95f, 0.85f);
        light.shadows = LightShadows.Hard;
        light.shadowStrength = 1f;
        light.shadowResolution = UnityEngine.Rendering.LightShadowResolution.VeryHigh;
        light.shadowNearPlane = 0.05f;
        light.shadowBias = 0.02f;
        light.shadowNormalBias = 0.2f;
        // A small visible bulb so the player knows where the light comes from.
        var bulb = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        bulb.name = "Bulb";
        Object.DestroyImmediate(bulb.GetComponent<Collider>());
        bulb.transform.SetParent(lamp.transform, false);
        bulb.transform.localScale = Vector3.one * 0.035f;
        bulb.transform.localPosition = new Vector3(0f, 0f, -0.03f);
        var bulbR = bulb.GetComponent<MeshRenderer>();
        bulbR.shadowCastingMode = ShadowCastingMode.Off;
        bulbR.sharedMaterial = MakeMaterial("Assets/Art/Bulb.mat", new Color(1f, 0.9f, 0.6f), emissive: true);

        var desk = GameObject.CreatePrimitive(PrimitiveType.Cube);
        desk.name = "Desk";
        Object.DestroyImmediate(desk.GetComponent<Collider>());
        desk.transform.SetParent(stage.transform, false);
        desk.transform.localPosition = new Vector3(0f, -0.53f, 0.35f);
        desk.transform.localScale = new Vector3(0.9f, 0.03f, 0.5f);
        var deskR = desk.GetComponent<MeshRenderer>();
        deskR.sharedMaterial = deskMat;
        deskR.shadowCastingMode = ShadowCastingMode.Off;

        // ---- managers
        var mgr = new GameObject("ShadowHands_Managers");
        var scorer = mgr.AddComponent<ShadowScorer>();
        scorer.wallCam = cam;
        anchor.scorer = scorer;
        var sfx = mgr.AddComponent<AudioSource>();
        sfx.playOnAwake = false;
        sfx.spatialBlend = 0f;
        var hands = mgr.AddComponent<HandShadowCaster>();
        hands.sceneWide = true;
        hands.shadowProxyMaterial = wallMat;
        var rec = mgr.AddComponent<MaskRecorder>();
        rec.scorer = scorer;
        rec.enabled = false; // dev tool

        var pm = mgr.AddComponent<PuzzleManager>();
        pm.scorer = scorer;
        pm.goalOverlay = overlay;
        pm.payoffSpawnPoint = payoffSpawn.transform;
        pm.sfx = sfx;
        pm.matchChime = AssetDatabase.LoadAssetAtPath<AudioClip>($"{AudioDir}/match_chime.wav");
        pm.payoffSeconds = 4f;
        pm.levels = new List<SilhouetteLevel>();
        foreach (var l in Levels)
        {
            var a = AssetDatabase.LoadAssetAtPath<SilhouetteLevel>($"{LevelDir}/Level_{l.num}_{l.name}.asset");
            if (a) pm.levels.Add(a);
        }
        pm.tutorialLevel = AssetDatabase.LoadAssetAtPath<SilhouetteLevel>($"{LevelDir}/Level_00_Tutorial_Bird.asset");
        if (pm.levels.Count != Levels.Length) Debug.LogWarning("[ShadowHands] some levels missing - run step 2 first");

        // ---- desk UI
        var ui = BuildCanvas(stage, pm, anchor, rec);
        UnityEventTools.AddPersistentListener(pm.onMatchProgress, new UnityAction<float>(ui.SetMatch));
        UnityEventTools.AddPersistentListener(pm.onHoldProgress, new UnityAction<float>(ui.SetHold));
        UnityEventTools.AddPersistentListener(pm.onLevelStart, new UnityAction<SilhouetteLevel>(ui.OnLevelStart));
        UnityEventTools.AddPersistentListener(pm.onLevelComplete, new UnityAction<SilhouetteLevel>(ui.OnLevelComplete));
        UnityEventTools.AddPersistentListener(pm.onHint, new UnityAction<string>(ui.SetHint));

        // ---- save + build settings
        var scene = EditorSceneManager.GetActiveScene();
        EditorSceneManager.MarkSceneDirty(scene);
        if (string.IsNullOrEmpty(scene.path))
        {
            Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));
            EditorSceneManager.SaveScene(scene, ScenePath);
        }
        else EditorSceneManager.SaveScene(scene);
        var path = scene.path;
        var list = new List<EditorBuildSettingsScene>(EditorBuildSettings.scenes);
        list.RemoveAll(s => s.path == path);
        list.Insert(0, new EditorBuildSettingsScene(path, true));
        EditorBuildSettings.scenes = list.ToArray();

        Selection.activeGameObject = ui.gameObject;
        Debug.Log("[ShadowHands] stage built. NEXT: right-click 'DeskCanvas' > Interaction SDK > Add Poke Interaction to Canvas (or use the Poke building block).");
    }

    [MenuItem("ShadowHands/Move Wall Closer (Glasses FOV)", priority = 40)]
    public static void MoveWallCloser()
    {
        var w = GameObject.Find("ShadowHands_Stage/WallRoot");
        if (!w) return;
        Undo.RecordObject(w.transform, "wall closer");
        var p = w.transform.localPosition;
        p.z = Mathf.Max(0.6f, p.z - 0.1f);
        w.transform.localPosition = p;
        Debug.Log($"[ShadowHands] wall now at z={p.z:0.00} m");
    }

    // ------------------------------------------------------------------ helpers

    static void ConfigureTextures()
    {
        float ppu = 512f / FrameMeters;
        foreach (var guid in AssetDatabase.FindAssets("t:Texture2D", new[] { SilDir }))
        {
            var path = AssetDatabase.GUIDToAssetPath(guid);
            var ti = (TextureImporter)AssetImporter.GetAtPath(path);
            bool isOverlay = path.EndsWith("_overlay.png");
            ti.textureType = isOverlay ? TextureImporterType.Sprite : TextureImporterType.Default;
            ti.spriteImportMode = isOverlay ? SpriteImportMode.Single : SpriteImportMode.None;
            ti.spritePixelsPerUnit = ppu;
            ti.alphaIsTransparency = isOverlay;
            ti.isReadable = !isOverlay;                      // masks are sampled by ShadowScorer.SetTarget
            ti.sRGBTexture = true;
            ti.mipmapEnabled = false;
            ti.npotScale = TextureImporterNPOTScale.None;
            ti.textureCompression = TextureImporterCompression.Uncompressed;
            ti.wrapMode = TextureWrapMode.Clamp;
            ti.SaveAndReimport();
        }
        var puff = (TextureImporter)AssetImporter.GetAtPath("Assets/Art/puff.png");
        if (puff)
        {
            puff.textureType = TextureImporterType.Sprite;
            puff.spritePixelsPerUnit = 64f;
            puff.alphaIsTransparency = true;
            puff.mipmapEnabled = false;
            puff.SaveAndReimport();
        }
    }

    static GameObject MakePayoffPrefab(Lvl l, Sprite overlay, Sprite puff)
    {
        var go = new GameObject($"Payoff_{l.name}");
        var sr = go.AddComponent<SpriteRenderer>();
        sr.sprite = overlay;
        sr.color = Color.black;   // the shadow itself steps off the wall
        sr.sortingOrder = 10;
        sr.shadowCastingMode = ShadowCastingMode.Off;
        int overlayL = LayerMask.NameToLayer("Overlay");
        if (overlayL >= 0) go.layer = overlayL;
        var anim = go.AddComponent<PayoffAnimator>();
        anim.motion = l.motion;
        anim.duration = 3.5f;
        anim.puffSprite = puff;
        var prefab = PrefabUtility.SaveAsPrefabAsset(go, $"{PrefabDir}/Payoff_{l.name}.prefab");
        Object.DestroyImmediate(go);
        return prefab;
    }

    static MatchMeterUI BuildCanvas(GameObject stage, PuzzleManager pm, StageAnchor anchor, MaskRecorder rec)
    {
        // 0.6 x 0.4 m panel on the desk, 36 cm in front and 37 cm below the eyes (0.52 m reach), tilted toward the player.
        // Its top edge sits just below the sight line from the eyes to the bottom of the wall.
        var cgo = new GameObject("DeskCanvas", typeof(RectTransform));
        cgo.transform.SetParent(stage.transform, false);
        var canvas = cgo.AddComponent<Canvas>();
        canvas.renderMode = RenderMode.WorldSpace;
        cgo.AddComponent<CanvasScaler>();
        cgo.AddComponent<GraphicRaycaster>();
        var rt = (RectTransform)cgo.transform;
        rt.sizeDelta = new Vector2(600, 400);
        rt.localScale = Vector3.one * 0.001f;
        rt.localPosition = new Vector3(0f, -0.37f, 0.36f);
        rt.localRotation = Quaternion.Euler(50f, 0f, 0f);

        var uiSprite = AssetDatabase.GetBuiltinExtraResource<Sprite>("UI/Skin/UISprite.psd");
        var knob = AssetDatabase.GetBuiltinExtraResource<Sprite>("UI/Skin/Knob.psd");

        Img(cgo, "Background", new Vector2(0, 0), new Vector2(600, 400), new Color(0.08f, 0.08f, 0.1f, 0.85f), uiSprite);

        var ui = cgo.AddComponent<MatchMeterUI>();
        ui.levelName = Text(cgo, "LevelName", new Vector2(-60, 160), new Vector2(440, 60), 40, FontStyles.Bold);
        ui.levelName.text = "Shadow Hands";
        ui.hint = Text(cgo, "Hint", new Vector2(-60, 100), new Vector2(440, 70), 26, FontStyles.Normal);
        ui.hint.text = "";

        Img(cgo, "MatchBarBg", new Vector2(-60, 35), new Vector2(440, 34), new Color(1, 1, 1, 0.15f), uiSprite);
        ui.matchFill = Img(cgo, "MatchFill", new Vector2(-60, 35), new Vector2(440, 34), Color.white, uiSprite);
        ui.matchFill.type = Image.Type.Filled;
        ui.matchFill.fillMethod = Image.FillMethod.Horizontal;
        ui.matchFill.fillAmount = 0f;
        ui.matchColor = new Gradient();
        ui.matchColor.SetKeys(
            new[] { new GradientColorKey(new Color(0.9f, 0.3f, 0.2f), 0f), new GradientColorKey(new Color(1f, 0.8f, 0.2f), 0.6f), new GradientColorKey(new Color(0.3f, 0.9f, 0.4f), 1f) },
            new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(1f, 1f) });

        Img(cgo, "HoldRingBg", new Vector2(220, 100), new Vector2(110, 110), new Color(1, 1, 1, 0.15f), knob);
        ui.holdRing = Img(cgo, "HoldRing", new Vector2(220, 100), new Vector2(110, 110), new Color(0.3f, 0.9f, 0.4f), knob);
        ui.holdRing.type = Image.Type.Filled;
        ui.holdRing.fillMethod = Image.FillMethod.Radial360;
        ui.holdRing.fillAmount = 0f;

        // Big buttons (>= 9 cm wide) - easy fingertip targets.
        Button(cgo, "Btn_Story", "Story", new Vector2(-210, -100), pm.StartStory, uiSprite);
        Button(cgo, "Btn_Daily", "Daily", new Vector2(-70, -100), pm.StartDaily, uiSprite);
        Button(cgo, "Btn_Skip", "Skip", new Vector2(70, -100), pm.Skip, uiSprite);
        Button(cgo, "Btn_Recenter", "Recenter", new Vector2(210, -100), anchor.Recenter, uiSprite);
        var recBtn = Button(cgo, "Btn_Record_DEV", "Record", new Vector2(210, -170), rec.Record, uiSprite);
        recBtn.SetActive(false); // enable together with MaskRecorder when authoring masks
        return ui;
    }

    static GameObject Child(GameObject parent, string name, Vector3 localPos)
    {
        var go = new GameObject(name);
        go.transform.SetParent(parent.transform, false);
        go.transform.localPosition = localPos;
        return go;
    }

    static Image Img(GameObject parent, string name, Vector2 pos, Vector2 size, Color c, Sprite sprite)
    {
        var go = new GameObject(name, typeof(RectTransform));
        go.transform.SetParent(parent.transform, false);
        var r = (RectTransform)go.transform;
        r.anchoredPosition = pos;
        r.sizeDelta = size;
        var img = go.AddComponent<Image>();
        img.sprite = sprite;
        img.color = c;
        img.raycastTarget = false;
        return img;
    }

    static TextMeshProUGUI Text(GameObject parent, string name, Vector2 pos, Vector2 size, float fontSize, FontStyles style)
    {
        var go = new GameObject(name, typeof(RectTransform));
        go.transform.SetParent(parent.transform, false);
        var r = (RectTransform)go.transform;
        r.anchoredPosition = pos;
        r.sizeDelta = size;
        var t = go.AddComponent<TextMeshProUGUI>();
        t.fontSize = fontSize;
        t.fontStyle = style;
        t.alignment = TextAlignmentOptions.Left;
        t.color = Color.white;
        t.raycastTarget = false;
        t.text = name;
        return t;
    }

    static GameObject Button(GameObject parent, string name, string label, Vector2 pos, UnityAction onClick, Sprite sprite)
    {
        var img = Img(parent, name, pos, new Vector2(125, 70), new Color(0.25f, 0.27f, 0.35f), sprite);
        img.raycastTarget = true;
        img.type = Image.Type.Sliced;
        var b = img.gameObject.AddComponent<Button>();
        b.targetGraphic = img;
        UnityEventTools.AddPersistentListener(b.onClick, onClick);
        var t = Text(img.gameObject, "Label", Vector2.zero, new Vector2(125, 70), 26, FontStyles.Bold);
        t.alignment = TextAlignmentOptions.Center;
        t.text = label;
        return img.gameObject;
    }

    static Material MakeMaterial(string path, Color c, bool emissive = false)
    {
        var m = AssetDatabase.LoadAssetAtPath<Material>(path);
        if (!m)
        {
            var sh = Shader.Find(emissive ? "Universal Render Pipeline/Unlit" : "Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            m = new Material(sh);
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            AssetDatabase.CreateAsset(m, path);
        }
        if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", c);
        m.color = c;
        if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", 0f);
        if (m.HasProperty("_SpecularHighlights")) m.SetFloat("_SpecularHighlights", 0f);
        EditorUtility.SetDirty(m);
        return m;
    }

    static T LoadOrCreate<T>(string path) where T : ScriptableObject
    {
        var a = AssetDatabase.LoadAssetAtPath<T>(path);
        if (a) return a;
        a = ScriptableObject.CreateInstance<T>();
        AssetDatabase.CreateAsset(a, path);
        return a;
    }

    static void SetInt(SerializedObject so, string prop, int v)
    {
        var p = so.FindProperty(prop);
        if (p != null) p.intValue = v; else Debug.LogWarning($"[ShadowHands] URP property {prop} not found - set it by hand in the URP asset");
    }

    static void SetBool(SerializedObject so, string prop, bool v)
    {
        var p = so.FindProperty(prop);
        if (p != null) p.boolValue = v; else Debug.LogWarning($"[ShadowHands] URP property {prop} not found - set it by hand in the URP asset");
    }
}
