using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;

/// <summary>
/// Drives the core loop: show goal -> player shapes hands -> score climbs ->
/// hold above threshold for N seconds -> payoff -> next level.
///
/// Modes:
///   Tutorial : first launch only. Bird at a generous threshold, with step-by-step prompts.
///   Story    : plays levels in order (10 levels, ~10 minutes).
///   Daily    : one level chosen deterministically from today's date.
/// </summary>
public class PuzzleManager : MonoBehaviour
{
    public enum Mode { Tutorial, Story, Daily }

    [Header("Refs")]
    public ShadowScorer scorer;
    public SpriteRenderer goalOverlay;      // on the wall, layer "Overlay"
    public Transform payoffSpawnPoint;      // on the wall
    public AudioSource sfx;
    public AudioClip matchChime;            // shared, plays on every lock
    [Tooltip("Optional looping tone that swells and rises in pitch while the match is being held")]
    public AudioSource holdTone;

    [Header("Levels")]
    public List<SilhouetteLevel> levels = new();
    [Tooltip("Played once on first launch. Leave empty to skip onboarding.")]
    public SilhouetteLevel tutorialLevel;

    [Header("Tuning")]
    [Tooltip("Seconds the match must stay above threshold")]
    public float holdSeconds = 1.25f;
    [Tooltip("Smoothing on the raw IoU so the meter doesn't jitter (per score sample)")]
    [Range(0.01f, 1f)] public float smoothing = 0.2f;
    public float payoffSeconds = 4f;
    [Tooltip("Gap between the shared chime and the level's own sound")]
    public float sfxDelay = 0.35f;

    [Header("Events (hook UI here)")]
    public UnityEvent<float> onMatchProgress = new();   // 0..1 smoothed score / threshold
    public UnityEvent<float> onHoldProgress = new();    // 0..1 hold timer
    public UnityEvent<SilhouetteLevel> onLevelStart = new();
    public UnityEvent<SilhouetteLevel> onLevelComplete = new();
    public UnityEvent<string> onHint = new();           // tutorial / status prompts
    public UnityEvent<string> onTitle = new();          // e.g. "3 / 10   Dog"
    public UnityEvent onAllComplete = new();

    public Mode mode = Mode.Story;
    public int CurrentIndex { get; private set; }
    public SilhouetteLevel Current { get; private set; }

    float smoothed;
    float holdTimer;
    float lastScoreTime = -1f;
    bool locked;
    Coroutine completing;
    int tutorialStep;
    float overlayBaseAlpha = 0.25f;
    float levelStartTime;

    const string ProgressKey = "shadowhands.story.index";
    const string DailyKey = "shadowhands.daily.done";
    const string TutorialKey = "shadowhands.tutorial.done";
    const string StreakKey = "shadowhands.daily.streak";
    const string StoryTimeKey = "shadowhands.story.seconds";

    void Awake()
    {
        if (goalOverlay) overlayBaseAlpha = goalOverlay.color.a;
        if (holdTone) holdTone.volume = 0f;
    }

    /// <summary>Consecutive days the Daily Shadow has been solved (0 if the chain is broken).</summary>
    public int DailyStreak
    {
        get
        {
            string last = PlayerPrefs.GetString(DailyKey, "");
            bool alive = last == TodayKey() || last == DateTime.Now.AddDays(-1).ToString("yyyy-MM-dd");
            return alive ? PlayerPrefs.GetInt(StreakKey, 0) : 0;
        }
    }

    void OnEnable() { if (scorer) scorer.OnScore += HandleScore; }
    void OnDisable() { if (scorer) scorer.OnScore -= HandleScore; }

    void Start()
    {
        // Straight into a puzzle on launch (cold start -> first puzzle as fast as possible).
        if (tutorialLevel && PlayerPrefs.GetInt(TutorialKey, 0) == 0) StartTutorial();
        else if (mode == Mode.Daily) StartDaily();
        else StartStory();
    }

    // ---------- public API (wire to hand-poke buttons) ----------

    public void StartTutorial()
    {
        CancelCompletion();
        mode = Mode.Tutorial;
        tutorialStep = 0;
        CurrentIndex = -1;
        LoadLevel(tutorialLevel);
        onHint?.Invoke("Put your hand between the lamp and the wall");
    }

    public void StartStory()
    {
        CancelCompletion();
        mode = Mode.Story;
        int saved = PlayerPrefs.GetInt(ProgressKey, 0);
        CurrentIndex = (saved >= 0 && saved < levels.Count) ? saved : 0; // finished -> start over
        if (CurrentIndex == 0) PlayerPrefs.SetFloat(StoryTimeKey, 0f);
        LoadLevel(CurrentIndex);
    }

    public void StartDaily()
    {
        CancelCompletion();
        mode = Mode.Daily;
        CurrentIndex = DailyIndex(levels.Count);
        LoadLevel(CurrentIndex);
        if (DailyDoneToday()) onHint?.Invoke($"Solved today (streak: {DailyStreak}). Play it again!");
    }

    public void Skip()
    {
        CancelCompletion();
        if (mode == Mode.Tutorial) { FinishTutorial(); return; }
        if (mode == Mode.Daily) { StartStory(); return; }
        Next();
    }

    public void ResetProgress()
    {
        PlayerPrefs.DeleteKey(ProgressKey);
        PlayerPrefs.DeleteKey(TutorialKey);
        PlayerPrefs.DeleteKey(DailyKey);
        PlayerPrefs.DeleteKey(StreakKey);
        PlayerPrefs.Save();
        Start();
    }

    public bool DailyDoneToday() => PlayerPrefs.GetString(DailyKey, "") == TodayKey();

    // ---------- internals ----------

    static string TodayKey() => DateTime.Now.ToString("yyyy-MM-dd");

    /// <summary>Same puzzle for everyone on a given day; changes at local midnight.</summary>
    public static int DailyIndex(int count) => DailyIndex(count, DateTime.Now.Date);

    public static int DailyIndex(int count, DateTime date)
    {
        if (count <= 0) return -1;
        int days = (int)(date.Date - new DateTime(2026, 1, 1)).TotalDays;
        // Knuth multiplicative hash so consecutive days don't just step through the list
        uint h = unchecked((uint)days * 2654435761u);
        return (int)(h % (uint)count);
    }

    void OnApplicationPause(bool paused)
    {
        SetFeedback(0f, 0f);
        // Headset removed / put back on: drop partial hold so nothing locks while nobody is looking.
        holdTimer = 0f;
        smoothed = 0f;
        lastScoreTime = -1f;
        onHoldProgress?.Invoke(0f);
        onMatchProgress?.Invoke(0f);
    }

    void CancelCompletion()
    {
        if (completing != null) StopCoroutine(completing);
        completing = null;
        if (payoffSpawnPoint)
            for (int i = payoffSpawnPoint.childCount - 1; i >= 0; i--)
                Destroy(payoffSpawnPoint.GetChild(i).gameObject);
    }

    void LoadLevel(int index)
    {
        if (index < 0 || index >= levels.Count) { onAllComplete?.Invoke(); return; }
        LoadLevel(levels[index]);
    }

    void LoadLevel(SilhouetteLevel lvl)
    {
        Current = lvl;
        locked = false;
        holdTimer = 0f;
        smoothed = 0f;
        lastScoreTime = -1f;

        // Remember where Story is, so Skip and quitting mid-level both resume here.
        if (mode == Mode.Story && CurrentIndex >= 0) { PlayerPrefs.SetInt(ProgressKey, CurrentIndex); PlayerPrefs.Save(); }

        scorer.SetTarget(lvl.mask);
        if (goalOverlay)
        {
            goalOverlay.sprite = lvl.goalOverlay;
            goalOverlay.enabled = lvl.goalOverlay != null;
        }
        levelStartTime = Time.time;
        SetFeedback(0f, 0f);
        onLevelStart?.Invoke(lvl);
        onTitle?.Invoke(mode == Mode.Story ? $"{CurrentIndex + 1} / {levels.Count}   {lvl.displayName}"
                      : mode == Mode.Daily ? $"Daily Shadow   {lvl.displayName}"
                      : lvl.displayName);
    }

    /// <summary>The target "stirs" as the match improves, and a tone swells while it is held.</summary>
    void SetFeedback(float match01, float hold01)
    {
        if (goalOverlay)
        {
            var c = goalOverlay.color;
            float pulse = hold01 > 0f ? 0.3f * Mathf.Sin(Time.time * 14f) * hold01 : 0f;
            c.a = Mathf.Clamp01(overlayBaseAlpha * (1f + 0.8f * match01 * match01 + pulse));
            goalOverlay.color = c;
        }
        if (holdTone)
        {
            holdTone.volume = 0.35f * hold01;
            holdTone.pitch = 1f + 0.5f * hold01;
        }
    }

    void HandleScore(float raw)
    {
        if (locked || Current == null) return;

        // Readbacks arrive every 1-3 frames, so measure real elapsed time between samples.
        float now = Time.time;
        float dt = lastScoreTime < 0f ? 0f : Mathf.Min(now - lastScoreTime, 0.1f);
        lastScoreTime = now;

        smoothed = Mathf.Lerp(smoothed, raw, smoothing);
        float thr = Current.lockThreshold;
        onMatchProgress?.Invoke(Mathf.Clamp01(smoothed / thr));

        if (smoothed >= thr) holdTimer += dt;
        else holdTimer = Mathf.Max(0f, holdTimer - dt * 2f); // decay, forgiving

        float hold01 = Mathf.Clamp01(holdTimer / holdSeconds);
        onHoldProgress?.Invoke(hold01);
        SetFeedback(Mathf.Clamp01(smoothed / thr), hold01);

        if (mode == Mode.Tutorial) UpdateTutorialPrompt();

        if (holdTimer >= holdSeconds) completing = StartCoroutine(Complete());
    }

    void UpdateTutorialPrompt()
    {
        if (tutorialStep == 0 && scorer.shadowCoverage > 0.02f)
        {
            tutorialStep = 1;
            onHint?.Invoke("That's your shadow! Shape it into the bird");
        }
        else if (tutorialStep == 1 && holdTimer > 0f)
        {
            tutorialStep = 2;
            onHint?.Invoke("Yes! Hold it still...");
        }
    }

    IEnumerator Complete()
    {
        locked = true;
        var lvl = Current;
        scorer.ClearTarget();
        if (goalOverlay) goalOverlay.enabled = false;

        if (sfx && matchChime) sfx.PlayOneShot(matchChime);
        onLevelComplete?.Invoke(lvl);

        SetFeedback(0f, 0f);
        if (mode == Mode.Daily)
        {
            if (!DailyDoneToday()) PlayerPrefs.SetInt(StreakKey, DailyStreak + 1); // DailyStreak is 0 if yesterday was missed
            PlayerPrefs.SetString(DailyKey, TodayKey());
        }
        else if (mode == Mode.Story)
        {
            PlayerPrefs.SetInt(ProgressKey, CurrentIndex + 1);
            PlayerPrefs.SetFloat(StoryTimeKey, PlayerPrefs.GetFloat(StoryTimeKey, 0f) + (Time.time - levelStartTime));
        }
        PlayerPrefs.Save();

        // Chime first, then the shadow comes alive with its own sound.
        yield return new WaitForSeconds(sfxDelay);
        if (sfx && lvl.payoffSfx) sfx.PlayOneShot(lvl.payoffSfx);
        if (lvl.payoffPrefab && payoffSpawnPoint)
            Instantiate(lvl.payoffPrefab, payoffSpawnPoint.position, payoffSpawnPoint.rotation, payoffSpawnPoint);

        yield return new WaitForSeconds(Mathf.Max(0f, payoffSeconds - sfxDelay));
        completing = null;
        CancelCompletion(); // clears the payoff

        if (mode == Mode.Tutorial) FinishTutorial();
        else if (mode == Mode.Daily) { onHint?.Invoke($"Daily Shadow solved! Streak: {DailyStreak} day{(DailyStreak == 1 ? "" : "s")}. Come back tomorrow."); onAllComplete?.Invoke(); }
        else Next();
    }

    void FinishTutorial()
    {
        PlayerPrefs.SetInt(TutorialKey, 1);
        PlayerPrefs.Save();
        StartStory();
    }

    void Next()
    {
        CurrentIndex++;
        if (CurrentIndex >= levels.Count)
        {
            int secs = Mathf.RoundToInt(PlayerPrefs.GetFloat(StoryTimeKey, 0f));
            onTitle?.Invoke("The End");
            onHint?.Invoke($"All {levels.Count} shadows found in {secs / 60}:{secs % 60:00}! Try the Daily Shadow.");
            onAllComplete?.Invoke();
            return;
        }
        LoadLevel(CurrentIndex);
    }
}
