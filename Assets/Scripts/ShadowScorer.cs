using System;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

/// <summary>
/// Measures how well the REAL cast shadow on the wall matches a target silhouette.
///
/// How it works:
///   - A spot light ("Lamp") casts hand shadows onto a white Lit wall quad.
///   - WallCam is an orthographic camera facing the wall. Shadowed pixels are dark, lit pixels bright.
///   - Every N frames we render WallCam into a small R8 RenderTexture, read it back async,
///     classify shadow pixels, and compute IoU (intersection over union) against the target mask.
///
/// Notes / fixes vs. the original scaffold:
///   - Culling mask is Wall + Hands. A layer excluded by a camera's culling mask does not cast
///     shadows in that camera's render, so a Wall-only WallCam would never see hand shadows.
///     Hands are drawn into WallCam ONLY as ShadowsOnly proxies (see HandShadowCaster), so no hand
///     pixels end up in the image. Do NOT shrink the far clip plane to hug the wall: URP clamps
///     shadow distance to it and the shadows fade out.
///   - Spot light falloff makes wall corners dim. A fixed brightness threshold would count dim corners
///     as "shadow" and wreck the IoU, so each pixel is compared to the brightest value it has ever
///     had (its "lit reference"). Shadow = pixel < reference * shadowRatio.
/// </summary>
public class ShadowScorer : MonoBehaviour
{
    [Header("Setup")]
    public Camera wallCam;
    [Range(32, 256)] public int resolution = 128;
    [Tooltip("Pixel counts as shadow when darker than (its lit reference * this)")]
    [Range(0.1f, 0.95f)] public float shadowRatio = 0.55f;
    [Tooltip("Pixels whose lit reference stays below this (0-255) are outside the lamp cone and ignored")]
    [Range(0, 255)] public int minLitLevel = 25;
    [Tooltip("Flip mask vertically if readback appears upside-down on your platform")]
    public bool flipMaskY = false;
    [Tooltip("Flip mask horizontally if matching appears mirrored")]
    public bool flipMaskX = false;
    [Tooltip("Render + read back every N frames (1 = every frame). 2 halves the GPU cost.")]
    [Range(1, 4)] public int renderEveryNFrames = 2;
    public string wallLayer = "Wall";
    public string handsLayer = "Hands";

    [Header("Output (read-only)")]
    [Range(0, 1)] public float score;
    [Tooltip("Fraction of the scored area currently in shadow (used by the tutorial)")]
    [Range(0, 1)] public float shadowCoverage;
    public event Action<float> OnScore;

    RenderTexture rt;
    bool[] target;
    byte[] litRef;
    bool[] lastShadow;
    byte[] lastRaw;
    bool pending;
    int frame;

    void Awake()
    {
        rt = new RenderTexture(resolution, resolution, 16, RenderTextureFormat.R8);
        rt.Create();
        litRef = new byte[resolution * resolution];
        lastShadow = new bool[resolution * resolution];
        lastRaw = new byte[resolution * resolution];

        wallCam.targetTexture = rt;
        wallCam.enabled = false; // rendered manually
        wallCam.clearFlags = CameraClearFlags.SolidColor;
        wallCam.backgroundColor = Color.white;
        int mask = LayerMask.GetMask(wallLayer, handsLayer);
        if (mask != 0) wallCam.cullingMask = mask;
        // Shadow distance is clamped to the far plane (with a fade before it): keep it well past the wall.
        if (wallCam.farClipPlane < 10f) wallCam.farClipPlane = 20f;
    }

    /// <summary>Set the goal silhouette. Dark pixels = silhouette. Texture must be Read/Write enabled.</summary>
    public void SetTarget(Texture2D mask)
    {
        if (mask == null) { target = null; return; }
        target = new bool[resolution * resolution];
        for (int y = 0; y < resolution; y++)
        {
            float v = (y + 0.5f) / resolution;
            if (flipMaskY) v = 1f - v;
            for (int x = 0; x < resolution; x++)
            {
                float u = (x + 0.5f) / resolution;
                if (flipMaskX) u = 1f - u;
                target[y * resolution + x] = mask.GetPixelBilinear(u, v).grayscale < 0.5f;
            }
        }
    }

    public void ClearTarget() => target = null;

    /// <summary>Forget the lit reference (call after the lamp or wall moves).</summary>
    public void ResetLitReference() => Array.Clear(litRef, 0, litRef.Length);

    void OnApplicationPause(bool paused)
    {
        // A readback in flight across a pause can be dropped without a callback; don't stay stuck.
        if (!paused) pending = false;
    }

    void LateUpdate()
    {
        if (pending || wallCam == null) return;
        if (++frame % renderEveryNFrames != 0) return;

        var req = new UniversalRenderPipeline.SingleCameraRequest { destination = rt };
        if (RenderPipeline.SupportsRenderRequest(wallCam, req))
            RenderPipeline.SubmitRenderRequest(wallCam, req);
        else
            wallCam.Render();

        pending = true;
        AsyncGPUReadback.Request(rt, 0, TextureFormat.R8, OnReadback);
    }

    void OnReadback(AsyncGPUReadbackRequest req)
    {
        pending = false;
        if (req.hasError) return;

        var data = req.GetData<byte>();
        int n = Mathf.Min(data.Length, litRef.Length);
        int inter = 0, union = 0, shadowCount = 0, scored = 0;

        for (int i = 0; i < n; i++)
        {
            byte p = data[i];
            lastRaw[i] = p;
            if (p > litRef[i]) litRef[i] = p;
            int reference = litRef[i];
            if (reference < minLitLevel) { lastShadow[i] = false; continue; }

            scored++;
            bool shadow = p < reference * shadowRatio;
            lastShadow[i] = shadow;
            if (shadow) shadowCount++;

            if (target == null) continue;
            bool goal = target[i];
            if (shadow && goal) inter++;
            if (shadow || goal) union++;
        }

        shadowCoverage = scored == 0 ? 0f : (float)shadowCount / scored;
        if (target == null) return;

        score = union == 0 ? 0f : (float)inter / union;
        OnScore?.Invoke(score);
    }

    /// <summary>
    /// Snapshot of the current shadow as a black-on-white texture (same orientation as masks).
    /// Used by MaskRecorder to author achievable targets from a real hand.
    /// </summary>
    public Texture2D CaptureShadowMask()
    {
        var tex = new Texture2D(resolution, resolution, TextureFormat.RGB24, false);
        var px = new Color32[resolution * resolution];
        for (int y = 0; y < resolution; y++)
        {
            int sy = flipMaskY ? resolution - 1 - y : y;
            for (int x = 0; x < resolution; x++)
            {
                int sx = flipMaskX ? resolution - 1 - x : x;
                byte c = lastShadow[sy * resolution + sx] ? (byte)0 : (byte)255;
                px[y * resolution + x] = new Color32(c, c, c, 255);
            }
        }
        tex.SetPixels32(px);
        tex.Apply();
        return tex;
    }

    /// <summary>Debug: the raw WallCam brightness image (grey), and the learned lit reference.</summary>
    public Texture2D CaptureRaw(bool reference = false)
    {
        var tex = new Texture2D(resolution, resolution, TextureFormat.R8, false);
        tex.LoadRawTextureData(reference ? litRef : lastRaw);
        tex.Apply();
        return tex;
    }

    void OnDestroy()
    {
        if (rt != null) rt.Release();
    }
}
