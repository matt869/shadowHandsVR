using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

/// <summary>
/// Drop this on the root of each hand (the Building Blocks "Hand Tracking" block spawns
/// LeftHand / RightHand with skinned mesh renderers).
///
/// For every SkinnedMeshRenderer under it, this adds a sibling "shadow proxy": same mesh and bones,
/// an opaque material, ShadowCastingMode.ShadowsOnly, on the "Hands" layer. Why a proxy instead of
/// flipping the original renderer to cast shadows:
///   - ISDK's hand material is transparent (fading outline); transparent shaders don't cast shadows in URP.
///   - The proxy is never visible, so WallCam can include the Hands layer (needed for shadows to
///     appear in its render) without hand pixels polluting the score.
/// The original hand visual keeps its own layer/material and stops casting shadows itself.
/// Re-scans periodically because ISDK can swap or re-create hand visuals at runtime.
/// </summary>
public class HandShadowCaster : MonoBehaviour
{
    public string handsLayerName = "Hands";
    [Tooltip("Opaque material for the shadow proxy. Any URP Lit material works (e.g. the wall material).")]
    public Material shadowProxyMaterial;
    [Tooltip("Hide the visible hand mesh so only its shadow shows ('you ARE the puppet').")]
    public bool hideVisibleHands = false;
    public float rescanInterval = 1f;
    [Tooltip("Scan the whole scene instead of children. Use this when the hand meshes are created at runtime " +
             "(OVRMesh/Building Blocks): put ONE HandShadowCaster on the Managers object.")]
    public bool sceneWide = false;
    [Tooltip("Scene-wide mode: only meshes with an ancestor whose name contains this (case-insensitive)")]
    public string nameFilter = "hand";

    readonly Dictionary<SkinnedMeshRenderer, SkinnedMeshRenderer> proxies = new();
    float nextScan;

    void Start()
    {
        if (!shadowProxyMaterial)
        {
            var sh = Shader.Find("Universal Render Pipeline/Lit");
            if (sh) shadowProxyMaterial = new Material(sh);
        }
        Apply();
    }

    public void Apply()
    {
        int layer = LayerMask.NameToLayer(handsLayerName);
        var sources = sceneWide
            ? FindObjectsByType<SkinnedMeshRenderer>(FindObjectsInactive.Include, FindObjectsSortMode.None)
            : GetComponentsInChildren<SkinnedMeshRenderer>(true);
        foreach (var src in sources)
        {
            if (proxies.ContainsKey(src) || proxies.ContainsValue(src)) continue;
            if (src.sharedMesh == null || src.name.EndsWith("_ShadowProxy")) continue;
            if (sceneWide && !HasAncestorNamed(src.transform, nameFilter)) continue;

            var go = new GameObject(src.name + "_ShadowProxy");
            go.transform.SetParent(src.transform.parent, false);
            go.transform.localPosition = src.transform.localPosition;
            go.transform.localRotation = src.transform.localRotation;
            go.transform.localScale = src.transform.localScale;
            if (layer >= 0) go.layer = layer;

            var p = go.AddComponent<SkinnedMeshRenderer>();
            p.sharedMesh = src.sharedMesh;
            p.bones = src.bones;
            p.rootBone = src.rootBone;
            p.localBounds = src.localBounds;
            p.updateWhenOffscreen = true;
            p.sharedMaterial = shadowProxyMaterial;
            p.shadowCastingMode = ShadowCastingMode.ShadowsOnly;
            p.receiveShadows = false;
            proxies[src] = p;

            src.shadowCastingMode = ShadowCastingMode.Off;
            src.receiveShadows = false;
            // forceRenderingOff leaves .enabled under ISDK's control, so we can still read tracking state.
            src.forceRenderingOff = hideVisibleHands;
        }
    }

    static bool HasAncestorNamed(Transform t, string filter)
    {
        for (; t != null; t = t.parent)
            if (t.name.IndexOf(filter, System.StringComparison.OrdinalIgnoreCase) >= 0) return true;
        return false;
    }

    void LateUpdate()
    {
        // Mirror visibility: when tracking is lost ISDK hides the hand, so the shadow must vanish too.
        List<SkinnedMeshRenderer> dead = null;
        foreach (var kv in proxies)
        {
            if (!kv.Key || !kv.Value)
            {
                // ISDK re-created the hand: drop the orphaned proxy so it can't leave a frozen shadow.
                if (kv.Value) Destroy(kv.Value.gameObject);
                (dead ??= new List<SkinnedMeshRenderer>()).Add(kv.Key);
                continue;
            }
            bool visible = kv.Key.gameObject.activeInHierarchy && kv.Key.enabled;
            if (kv.Value.enabled != visible) kv.Value.enabled = visible;
            if (kv.Value.sharedMesh != kv.Key.sharedMesh) kv.Value.sharedMesh = kv.Key.sharedMesh;
        }
        if (dead != null) foreach (var k in dead) proxies.Remove(k);

        if (Time.unscaledTime >= nextScan)
        {
            nextScan = Time.unscaledTime + rescanInterval;
            Apply();
        }
    }
}
