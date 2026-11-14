using System.Collections;
using UnityEngine;

/// <summary>
/// Puts the whole "stage" (lamp, wall, desk, UI) in front of wherever the seated player's head is,
/// so it works regardless of chair height or tracking-origin mode. The stage children are authored
/// relative to the eyes: lamp (0, +0.2, 0.3), wall (0, 0, 1.0), desk UI below and in front.
/// Re-anchors after the headset is put back on (pause/resume), since the player may have moved.
/// Only yaw is taken from the head, so a tilted head at startup doesn't tilt the room.
/// </summary>
public class StageAnchor : MonoBehaviour
{
    [Tooltip("The rig's center-eye camera (Camera Rig building block > CenterEyeAnchor)")]
    public Transform head;
    public ShadowScorer scorer;
    [Tooltip("Wait this long after start/resume so tracking has a valid pose")]
    public float settleSeconds = 0.3f;

    IEnumerator Start()
    {
        if (!head && Camera.main) head = Camera.main.transform;
        yield return new WaitForSeconds(settleSeconds);
        Recenter();
    }

    void OnApplicationPause(bool paused)
    {
        if (!paused && isActiveAndEnabled) StartCoroutine(RecenterSoon());
    }

    IEnumerator RecenterSoon()
    {
        yield return new WaitForSeconds(settleSeconds);
        Recenter();
    }

    /// <summary>Wire to a "Recenter" poke button too.</summary>
    public void Recenter()
    {
        if (!head) return;
        var fwd = Vector3.ProjectOnPlane(head.forward, Vector3.up);
        if (fwd.sqrMagnitude < 1e-4f) fwd = Vector3.forward;
        transform.SetPositionAndRotation(head.position, Quaternion.LookRotation(fwd.normalized, Vector3.up));
        if (scorer) scorer.ResetLitReference();
    }
}
