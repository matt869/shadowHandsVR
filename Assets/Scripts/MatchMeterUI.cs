using UnityEngine;
using UnityEngine.UI;
using TMPro;

/// <summary>
/// Minimal world-space UI: a fill bar for match %, a ring for hold progress, level name + hint.
/// PuzzleManager events are wired to these methods (ShadowHands > Build Scene does it for you).
/// Put the Canvas on an ISDK poke-interactable canvas so buttons work with a fingertip.
/// </summary>
public class MatchMeterUI : MonoBehaviour
{
    public Image matchFill;
    public Image holdRing;
    public TMP_Text levelName;
    public TMP_Text hint;
    public Gradient matchColor;

    public void SetMatch(float t)
    {
        if (!matchFill) return;
        matchFill.fillAmount = t;
        if (matchColor != null) matchFill.color = matchColor.Evaluate(t);
    }

    public void SetHold(float t)
    {
        if (holdRing) holdRing.fillAmount = t;
    }

    public void SetHint(string text)
    {
        if (hint) hint.text = text;
    }

    public void OnLevelStart(SilhouetteLevel lvl)
    {
        if (levelName) levelName.text = lvl.displayName;
        if (hint) hint.text = lvl.hint;
        SetMatch(0); SetHold(0);
    }

    public void OnLevelComplete(SilhouetteLevel lvl)
    {
        // Default TMP font has no check-mark glyph, so plain text.
        if (hint) hint.text = lvl.displayName + " - it's alive!";
    }
}
