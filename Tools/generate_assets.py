"""Generate Shadow Hands placeholder art + audio. Offline, deterministic, no downloads.

  python Tools/generate_assets.py            (run from the ShadowHands project root)

Writes:
  Assets/Art/Silhouettes/<NN>_<name>.png          512x512 mask, black silhouette on white (scoring)
  Assets/Art/Silhouettes/<NN>_<name>_overlay.png  same shape, black on transparent (goal overlay + payoff)
  Assets/Art/puff.png                             soft round sprite for payoff puffs
  Assets/Audio/match_chime.wav + sfx_<name>.wav   synthesized tones (CC0 by construction)

Mask framing: the 512px image = the 0.9 x 0.9 m square WallCam sees at the wall's center.
Every shape includes a forearm entering from the bottom edge: with the lamp this close, the arm's
shadow always reaches the bottom of the wall, so a target without it would cap IoU well below 1.
These are PLACEHOLDERS drawn from classic hand-shadow poses; replace them with MaskRecorder captures
of a real hand once the game runs on device.
"""
import math
import os
import sys
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SIL = os.path.join(ROOT, "Assets", "Art", "Silhouettes")
ART = os.path.join(ROOT, "Assets", "Art")
AUD = os.path.join(ROOT, "Assets", "Audio")
N = 512
SS = 4  # supersample factor
S = N * SS


def P(x, y):
    """Design coords are 0..100 (x right, y down) -> supersampled pixels."""
    return (x * S / 100.0, y * S / 100.0)


class Pen:
    def __init__(self):
        self.img = Image.new("L", (S, S), 255)
        self.d = ImageDraw.Draw(self.img)

    def ellipse(self, cx, cy, rx, ry, ink=0):
        a, b = P(cx - rx, cy - ry), P(cx + rx, cy + ry)
        self.d.ellipse([a, b], fill=ink)

    def poly(self, pts, ink=0):
        self.d.polygon([P(*p) for p in pts], fill=ink)

    def line(self, pts, w, ink=0):
        px = [P(*p) for p in pts]
        width = int(w * S / 100.0)
        self.d.line(px, fill=ink, width=width, joint="curve")
        r = width / 2
        for x, y in (px[0], px[-1]):
            self.d.ellipse([x - r, y - r, x + r, y + r], fill=ink)

    def arm(self, x_top, y_top, x_bot, w=15):
        """Forearm from the bottom edge up into the hand."""
        self.line([(x_bot, 106), (x_top, y_top)], w)

    def hole(self, cx, cy, r):
        self.ellipse(cx, cy, r, r, ink=255)

    def mask(self):
        return self.img.resize((N, N), Image.LANCZOS).point(lambda v: 0 if v < 128 else 255)


# ---------------- silhouettes (one hand: 1-6, two hands: 7-10) ----------------

def bird():  # one hand, side view: flat fingers = beak, thumb tucked
    p = Pen()
    p.arm(46, 62, 40)
    p.ellipse(50, 50, 16, 13)                                   # head (back of hand)
    p.poly([(60, 42), (84, 49), (60, 58)])                      # beak (fingers together)
    p.poly([(40, 42), (44, 30), (50, 40)])                      # crest (thumb)
    p.hole(54, 46, 2.2)                                          # eye (gap)
    return p


def rabbit():  # one hand: two fingers up as ears, fist as head
    p = Pen()
    p.arm(48, 66, 44)
    p.ellipse(50, 58, 15, 12)
    p.line([(44, 50), (39, 22)], 7)                              # ear 1 (index)
    p.line([(53, 50), (58, 22)], 7)                              # ear 2 (middle)
    p.poly([(60, 58), (70, 62), (60, 66)])                      # nose (pinky/ring knuckle)
    p.hole(55, 56, 2.0)
    return p


def dog():  # one hand: fingers = snout, pinky dropped = jaw, thumb up = ear
    p = Pen()
    p.arm(40, 60, 36)
    p.ellipse(44, 50, 15, 12)
    p.poly([(52, 42), (80, 46), (80, 53), (54, 56)])            # snout
    p.poly([(46, 57), (74, 58), (72, 63), (46, 64)])            # lower jaw (pinky)
    p.line([(40, 42), (34, 26)], 8)                              # ear (thumb)
    p.hole(52, 46, 2.2)
    return p


def snail():  # one hand: fist = shell, index+middle = antennae, wrist = foot
    p = Pen()
    p.arm(46, 70, 44)
    p.ellipse(44, 54, 17, 16)                                   # shell (fist)
    p.ellipse(44, 54, 6, 6, ink=255)                            # spiral hint (curled finger gap)
    p.ellipse(44, 54, 2.5, 2.5)
    p.poly([(28, 70), (76, 66), (76, 72), (28, 74)])            # foot
    p.ellipse(72, 66, 6, 6)                                     # head (fingertips)
    p.line([(70, 62), (70, 42)], 4)                              # antenna 1 (index)
    p.line([(74, 62), (82, 45)], 4)                              # antenna 2 (middle)
    return p


def swan():  # one arm: forearm = neck, bent wrist = head, fingers = beak
    p = Pen()
    p.line([(48, 106), (46, 70), (44, 50), (48, 34), (58, 28)], 12)
    p.ellipse(60, 30, 9, 7)                                     # head
    p.poly([(66, 28), (80, 36), (66, 35)])                      # beak pointing down
    p.hole(61, 28, 1.8)
    return p


def wolf():  # one hand: open jaw (fingers / pinky apart), pointed ears (thumb + index knuckle)
    p = Pen()
    p.arm(40, 62, 36)
    p.ellipse(44, 50, 15, 12)
    p.poly([(52, 40), (82, 44), (80, 49), (54, 51)])            # upper jaw
    p.poly([(46, 55), (78, 62), (76, 66), (46, 63)])            # lower jaw, open gap
    p.poly([(34, 42), (34, 24), (44, 38)])                      # ear 1
    p.poly([(42, 40), (48, 24), (52, 39)])                      # ear 2
    p.hole(50, 46, 2.2)
    return p


def deer():  # two hands: one head, spread fingers of both hands = antlers
    p = Pen()
    p.arm(50, 66, 50, w=17)
    p.ellipse(50, 58, 12, 13)
    p.poly([(44, 64), (56, 64), (52, 80), (48, 80)])            # muzzle
    for side in (-1, 1):
        bx = 50 + side * 8
        p.line([(bx, 48), (50 + side * 22, 24)], 5)              # main beam
        p.line([(50 + side * 15, 35), (50 + side * 9, 20)], 4)   # tine
        p.line([(50 + side * 19, 29), (50 + side * 30, 22)], 4)  # tine
        p.arm(50 + side * 24, 30, 50 + side * 34, w=11)          # second hand's forearm
    p.hole(46, 56, 1.8)
    p.hole(54, 56, 1.8)
    return p


def elephant():  # two hands: big ears (palms) either side, forearm = trunk
    p = Pen()
    p.ellipse(50, 40, 14, 14)                                   # head
    p.ellipse(30, 42, 13, 17)                                   # ear L (hand)
    p.ellipse(70, 42, 13, 17)                                   # ear R (hand)
    p.line([(50, 50), (50, 74), (56, 86)], 9)                    # trunk
    p.arm(30, 56, 22, w=13)
    p.arm(70, 56, 78, w=13)
    p.hole(45, 38, 2.0)
    p.hole(55, 38, 2.0)
    return p


def crab():  # two hands: wrists together = body, fingers = claws and legs
    p = Pen()
    p.ellipse(50, 60, 20, 11)                                   # body
    for side in (-1, 1):
        p.line([(50 + side * 16, 54), (50 + side * 26, 38)], 6)  # claw arm
        p.ellipse(50 + side * 28, 32, 6, 7)                     # claw
        p.poly([(50 + side * 26, 26), (50 + side * 33, 22), (50 + side * 30, 30)], ink=255)  # pincer gap
        for i in range(3):
            p.line([(50 + side * (12 + 4 * i), 66), (50 + side * (22 + 5 * i), 76 + 2 * i)], 3)
        p.arm(50 + side * 8, 66, 50 + side * 18, w=12)
    p.hole(46, 54, 1.8)
    p.hole(54, 54, 1.8)
    return p


def dragon():  # two hands: one hand = head with open jaw, other = wing on top
    p = Pen()
    p.arm(36, 62, 30, w=14)
    p.ellipse(40, 52, 13, 11)
    p.poly([(46, 44), (80, 48), (78, 52), (48, 53)])            # upper jaw
    p.poly([(48, 58), (76, 62), (74, 66), (46, 64)])            # lower jaw
    p.poly([(34, 46), (26, 32), (40, 42)])                      # horn
    p.poly([(36, 42), (36, 28), (44, 40)])                      # horn
    p.poly([(36, 38), (14, 10), (24, 16), (28, 4), (36, 16), (46, 6), (46, 40)])  # wing (spread fingers)
    p.arm(22, 30, 10, w=12)
    p.hole(46, 48, 2.0)
    return p


LEVELS = [
    ("01", "bird", bird), ("02", "rabbit", rabbit), ("03", "dog", dog), ("04", "snail", snail),
    ("05", "swan", swan), ("06", "wolf", wolf), ("07", "deer", deer), ("08", "elephant", elephant),
    ("09", "crab", crab), ("10", "dragon", dragon),
]


def write_images():
    os.makedirs(SIL, exist_ok=True)
    stats = []
    for num, name, fn in LEVELS:
        m = fn().mask()
        m.convert("RGB").save(os.path.join(SIL, f"{num}_{name}.png"))
        a = np.array(m)
        rgba = np.zeros((N, N, 4), np.uint8)
        rgba[..., :3] = 12
        rgba[..., 3] = np.where(a < 128, 255, 0)
        Image.fromarray(rgba, "RGBA").save(os.path.join(SIL, f"{num}_{name}_overlay.png"))
        stats.append((num, name, float((a < 128).mean())))
    # puff: soft white disc
    g = np.linspace(-1, 1, 64)
    r = np.sqrt(g[None, :] ** 2 + g[:, None] ** 2)
    alpha = np.clip(1.0 - r, 0, 1) ** 0.8
    puff = np.zeros((64, 64, 4), np.uint8)
    puff[..., :3] = 255
    puff[..., 3] = (alpha * 255).astype(np.uint8)
    Image.fromarray(puff, "RGBA").save(os.path.join(ART, "puff.png"))
    return stats


# ---------------- audio ----------------
SR = 44100


def t_(d):
    return np.arange(int(SR * d)) / SR


def env(n, a=0.01, r=0.2):
    e = np.ones(n)
    na, nr = int(SR * a), int(SR * r)
    if na: e[:na] = np.linspace(0, 1, na)
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return e


def sweep(f0, f1, d, wave_="sine"):
    t = t_(d)
    f = np.linspace(f0, f1, len(t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    if wave_ == "saw":
        return 2 * ((ph / (2 * np.pi)) % 1) - 1
    if wave_ == "square":
        return np.sign(np.sin(ph))
    return np.sin(ph)


def lowpass(x, k):
    return np.convolve(x, np.ones(k) / k, mode="same")


def noise(d, seed):
    return np.random.default_rng(seed).uniform(-1, 1, int(SR * d))


def cat(*xs):
    return np.concatenate(xs)


def silence(d):
    return np.zeros(int(SR * d))


def save_wav(name, x, gain=0.6):
    x = x / (np.max(np.abs(x)) + 1e-9) * gain
    pcm = (x * 32767).astype(np.int16)
    with wave.open(os.path.join(AUD, name), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    return len(x) / SR


def bell(f, d):
    t = t_(d)
    return (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 6)) * np.exp(-t * 3.5)


def write_audio():
    os.makedirs(AUD, exist_ok=True)
    sounds = {
        "match_chime.wav": cat(bell(880, 0.25)[: int(SR * 0.12)], bell(1318.5, 0.9)),
        "sfx_bird.wav": cat(*[cat(sweep(2500, 4200, 0.07) * env(int(SR * 0.07), 0.005, 0.03), silence(0.05)) for _ in range(4)],
                            lowpass(noise(1.0, 1), 30) * np.linspace(0.6, 0, int(SR * 1.0)) * np.abs(np.sin(2 * np.pi * 9 * t_(1.0)))),
        "sfx_rabbit.wav": cat(*[cat(sweep(300, 700, 0.12) * env(int(SR * 0.12), 0.005, 0.06), silence(0.3)) for _ in range(4)]),
        "sfx_dog.wav": cat(*[cat((sweep(500, 280, 0.16, "saw") * 0.6 + lowpass(noise(0.16, i), 6) * 0.4) * env(int(SR * 0.16), 0.005, 0.08), silence(0.25)) for i in range(3)]),
        "sfx_snail.wav": lowpass(noise(3.0, 2), 200) * env(int(SR * 3.0), 0.5, 1.0) + 0.3 * sweep(140, 110, 3.0) * env(int(SR * 3.0), 0.5, 1.0),
        "sfx_swan.wav": (sweep(520, 600, 2.5) * 0.5 + sweep(780, 900, 2.5) * 0.25) * env(int(SR * 2.5), 0.6, 1.2),
        "sfx_wolf.wav": sweep(350, 650, 2.8) * (1 + 0.05 * np.sin(2 * np.pi * 5.5 * t_(2.8))) * env(int(SR * 2.8), 0.4, 1.2),
        "sfx_deer.wav": cat(*[cat(lowpass(noise(0.05, 10 + i), 3) * env(int(SR * 0.05), 0.001, 0.04), silence(0.22)) for i in range(10)]),
        "sfx_elephant.wav": sweep(300, 420, 1.6, "saw") * (1 + 0.15 * np.sin(2 * np.pi * 7 * t_(1.6))) * env(int(SR * 1.6), 0.08, 0.6),
        "sfx_crab.wav": cat(*[cat(lowpass(noise(0.015, 30 + i), 2), silence(0.09 + 0.04 * (i % 2))) for i in range(22)]),
        "sfx_dragon.wav": (lowpass(noise(3.2, 3), 25) * 0.8 + sweep(70, 45, 3.2, "saw") * 0.4) * env(int(SR * 3.2), 0.3, 1.4),
    }
    return {k: save_wav(k, v) for k, v in sounds.items()}


if __name__ == "__main__":
    stats = write_images()
    for num, name, fill in stats:
        print(f"{num}_{name:<9} fill={fill:5.1%}")
    for k, d in write_audio().items():
        print(f"{k:<18} {d:4.2f}s")
