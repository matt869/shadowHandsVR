using UnityEngine;

/// <summary>
/// One puzzle. Create via: Assets > Create > ShadowHands > Silhouette Level.
/// Put the .asset files in Assets/Levels and drag them into PuzzleManager.
/// </summary>
[CreateAssetMenu(menuName = "ShadowHands/Silhouette Level", fileName = "Level_")]
public class SilhouetteLevel : ScriptableObject
{
    public string displayName = "Rabbit";

    [Tooltip("Black silhouette on white. Import settings: Read/Write Enabled, no compression, sRGB.")]
    public Texture2D mask;

    [Tooltip("Shown on the wall as a faint goal outline (same image, or a dashed version)")]
    public Sprite goalOverlay;

    [Tooltip("Optional one-line hint, e.g. 'Two fingers up, thumb out'")]
    public string hint;

    [Tooltip("IoU needed to lock this level (0.65 = forgiving, 0.8 = strict)")]
    [Range(0.4f, 0.95f)] public float lockThreshold = 0.70f;

    [Tooltip("Prefab spawned on the wall when matched — the animated 'comes alive' payoff")]
    public GameObject payoffPrefab;

    public AudioClip payoffSfx;
}
