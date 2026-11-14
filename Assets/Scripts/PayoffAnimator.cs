using UnityEngine;

/// <summary>
/// The "shadow comes alive" payoff. Lives on a payoff prefab: a SpriteRenderer showing the solid
/// silhouette, spawned on the wall when a level locks. Everything is procedural (no Animator,
/// no extra art) so each prefab is just a sprite + this component with a different Motion.
/// </summary>
[RequireComponent(typeof(SpriteRenderer))]
public class PayoffAnimator : MonoBehaviour
{
    public enum Motion { FlapAway, Hop, Bark, Crawl, Glide, Howl, WalkOff, Spray, Scuttle, BreatheFire }

    public Motion motion = Motion.Hop;
    public float duration = 3.5f;
    [Tooltip("Small round sprite used for puffs (water, fire, moon). Optional.")]
    public Sprite puffSprite;
    public Color puffColor = new Color(1f, 0.55f, 0.1f, 1f);

    SpriteRenderer sr;
    Vector3 basePos, baseScale;
    float t0;
    float nextPuff;

    void Start()
    {
        sr = GetComponent<SpriteRenderer>();
        basePos = transform.localPosition;
        baseScale = transform.localScale;
        t0 = Time.time;
        if (motion == Motion.Howl && puffSprite) Puff(new Vector3(0.3f, 0.3f, 0f), Vector3.zero, 0.2f, new Color(1f, 0.72f, 0.1f, 1f), duration, 0f); // amber: a pale moon vanishes on the lit wall
    }

    void Update()
    {
        float t = Time.time - t0;
        float k = Mathf.Clamp01(t / duration);
        Vector3 p = Vector3.zero;
        float rot = 0f;
        Vector3 s = Vector3.one;

        switch (motion)
        {
            case Motion.FlapAway:
                s.y = 1f + 0.25f * Mathf.Sin(t * 22f);
                if (t > 1f) p = new Vector3(0.4f, 0.35f, 0f) * Ease(t - 1f, duration - 1f);
                break;
            case Motion.Hop:
                p.y = 0.08f * Mathf.Abs(Mathf.Sin(t * 5f));
                p.x = 0.12f * k;
                s.y = 1f - 0.08f * Mathf.Max(0f, -Mathf.Cos(t * 10f));
                break;
            case Motion.Bark:
                rot = 6f * Mathf.Sin(t * 14f) * (Mathf.Sin(t * 3f) > 0 ? 1f : 0f);
                s = Vector3.one * (1f + 0.04f * Mathf.Abs(Mathf.Sin(t * 14f)));
                break;
            case Motion.Crawl:
                p.x = 0.15f * k;
                s.x = 1f + 0.05f * Mathf.Sin(t * 4f);
                break;
            case Motion.Glide:
                p.x = 0.25f * Ease(t, duration);
                p.y = 0.015f * Mathf.Sin(t * 3f);
                rot = 3f * Mathf.Sin(t * 2f);
                break;
            case Motion.Howl:
                rot = Mathf.Lerp(0f, 18f, Mathf.Clamp01(t / 0.8f));
                p.y = 0.02f * Mathf.Clamp01(t / 0.8f);
                break;
            case Motion.WalkOff:
                rot = t < 1f ? 10f * Mathf.Sin(t * 6f) : 0f;
                if (t > 1f) p.x = -0.35f * Ease(t - 1f, duration - 1f);
                p.y = 0.01f * Mathf.Abs(Mathf.Sin(t * 8f));
                break;
            case Motion.Spray:
                rot = 4f * Mathf.Sin(t * 3f);
                if (t > 0.6f) EmitPuffs(new Vector3(0.06f, -0.32f, 0f), new Vector3(0.18f, 0.45f, 0f), new Color(0.6f, 0.85f, 1f, 1f)); // trunk tip, arcing up
                break;
            case Motion.Scuttle:
                p.x = 0.06f * Mathf.Sin(t * 9f) + 0.2f * k;
                p.y = 0.008f * Mathf.Abs(Mathf.Sin(t * 18f));
                break;
            case Motion.BreatheFire:
                s = Vector3.one * (1f + 0.06f * Mathf.Sin(t * 2f));
                if (t > 0.8f) EmitPuffs(new Vector3(0.27f, -0.05f, 0f), new Vector3(0.45f, 0.03f, 0f), puffColor); // between the jaws
                break;
        }

        transform.localPosition = basePos + p;
        transform.localRotation = Quaternion.Euler(0f, 0f, rot);
        transform.localScale = Vector3.Scale(baseScale, s);

        // fade out over the last 20%
        var c = sr.color;
        c.a = k > 0.8f ? Mathf.InverseLerp(1f, 0.8f, k) : 1f;
        sr.color = c;
    }

    static float Ease(float t, float d) { float x = Mathf.Clamp01(t / Mathf.Max(0.01f, d)); return x * x * (3f - 2f * x); }

    void EmitPuffs(Vector3 localOrigin, Vector3 velocity, Color color)
    {
        if (!puffSprite || Time.time < nextPuff) return;
        nextPuff = Time.time + 0.06f;
        var jitter = new Vector3(Random.Range(-0.03f, 0.03f), Random.Range(-0.03f, 0.03f), 0f);
        Puff(transform.localPosition + localOrigin, velocity + jitter, 0.05f, color, 0.7f, 1.5f);
    }

    void Puff(Vector3 localPos, Vector3 velocity, float size, Color color, float life, float grow)
    {
        var go = new GameObject("Puff");
        go.transform.SetParent(transform.parent, false);
        go.transform.localPosition = localPos + new Vector3(0f, 0f, -0.001f);
        go.transform.localScale = Vector3.one * size;
        var r = go.AddComponent<SpriteRenderer>();
        r.sprite = puffSprite;
        r.color = color;
        r.sortingOrder = sr.sortingOrder + 1;
        var mover = go.AddComponent<PuffMover>();
        mover.velocity = velocity;
        mover.life = life;
        mover.grow = grow;
    }
}

/// <summary>Tiny helper for payoff puffs: drift, grow, fade, die.</summary>
public class PuffMover : MonoBehaviour
{
    public Vector3 velocity;
    public float life = 0.7f;
    public float grow = 1.5f;
    float age;
    SpriteRenderer r;
    Vector3 s0;

    void Start() { r = GetComponent<SpriteRenderer>(); s0 = transform.localScale; }

    void Update()
    {
        age += Time.deltaTime;
        transform.localPosition += velocity * Time.deltaTime;
        transform.localScale = s0 * (1f + age * grow);
        var c = r.color; c.a = 1f - age / life; r.color = c;
        if (age >= life) Destroy(gameObject);
    }
}
