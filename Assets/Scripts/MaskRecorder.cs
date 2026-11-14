using System.IO;
using UnityEngine;

/// <summary>
/// DEV TOOL (disable for the competition build). Makes a level target from a REAL hand shadow, which
/// guarantees the shape is achievable. Make the shape, poke the "Record" button (or press R in the
/// editor), and the current shadow is saved as a PNG to Application.persistentDataPath/masks/.
/// Pull from the headset with:
///   adb pull /sdcard/Android/data/&lt;package&gt;/files/masks ./Assets/Art/Silhouettes/recorded
/// then point the level's mask at it (re-run ShadowHands > Configure Silhouette Import).
/// </summary>
public class MaskRecorder : MonoBehaviour
{
    public ShadowScorer scorer;
    public string prefix = "mask";

    void Update()
    {
#if UNITY_EDITOR && ENABLE_LEGACY_INPUT_MANAGER
        if (Input.GetKeyDown(KeyCode.R)) Record();
#endif
    }

    public void Record()
    {
        if (!scorer) return;
        var tex = scorer.CaptureShadowMask();
        var dir = Path.Combine(Application.persistentDataPath, "masks");
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, $"{prefix}_{System.DateTime.Now:yyyyMMdd_HHmmss}.png");
        File.WriteAllBytes(path, tex.EncodeToPNG());
        Destroy(tex);
        Debug.Log($"[MaskRecorder] saved {path}");
    }
}
