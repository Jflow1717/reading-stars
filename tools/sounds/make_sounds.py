"""Build the 31 phonics sound files from Apple's speech engine using IPA phonemes.

Steps per sound: synthesize (./speak) -> trim silence -> shape by type -> even volume -> WAV.
Types:
  hold  - continuous sounds (s, sh, f, th, z, v, m, n, l, r, vowels): steady part is
          looped so the sound lasts ~0.5 s ("sss", "mmm", "aaa")
  clip  - stop sounds that need a tiny vowel to be heard (b, d, g, j, w, y, qu):
          keep the start plus ~70 ms of the vowel, then fade fast ("b'", not "buh")
  burst - voiceless stops and affricates (p, t, k, ch, x, h): kept as made, just breath
"""
import os, subprocess, struct, wave, math, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)
SR = 22050

# file name: (IPA, speaking rate, type)
SOUNDS = {
    # Unit 3 digraphs and the buddy letters
    'wh': ('wə', '60%', 'clip'),
    'ch': ('tʃ', '60%', 'burst'),
    'sh': ('ʃ', '20%', 'hold'),
    'th': ('θ', '20%', 'hold'),
    'ck': ('kh', '60%', 'burst'),
    'qu': ('kwə', '60%', 'clip'),
    # short vowels
    'a': ('æ', '40%', 'hum'),
    'e': ('ɛ', '40%', 'hum'),
    'i': ('ɪ', '40%', 'hum'),
    'o': ('ɑ', '40%', 'hum'),
    'u': ('ʌ', '40%', 'hum'),
    # consonants
    'b': ('bə', '60%', 'clip'),
    'c': ('kh', '60%', 'burst'),
    'd': ('də', '60%', 'clip'),
    'f': ('f', '20%', 'hold'),
    'g': ('ɡə', '60%', 'clip'),
    'h': ('h', '60%', 'burst'),
    'j': ('dʒə', '60%', 'clip'),
    'k': ('kh', '60%', 'burst'),
    'l': ('l', '20%', 'hum'),
    'm': ('m', '20%', 'hum'),
    'n': ('n', '20%', 'hum'),
    'p': ('ph', '60%', 'burst'),
    'r': ('ər', '20%', 'hum'),
    's': ('s', '20%', 'hold'),
    't': ('th', '60%', 'burst'),   # IPA t + h: a clipped /t/ with its puff of air
    'v': ('v', '20%', 'hum'),
    'w': ('wə', '60%', 'clip'),
    'x': ('ks', '60%', 'burst'),
    'y': ('jə', '60%', 'clip'),    # IPA j is the "y" sound
    'z': ('z', '20%', 'hum'),
}

HOLD_SECONDS = 0.55

def synth(names):
    lines = []
    for name in names:
        ipa, rate, _ = SOUNDS[name]
        lines.append(f'raw_{name}\t<speak><prosody rate="{rate}"><phoneme alphabet="ipa" ph="{ipa}">q q q q q</phoneme></prosody></speak>')
    subprocess.run([os.path.join(HERE, 'speak'), 'Samantha'], input='\n'.join(lines) + '\n', text=True, cwd=HERE, check=True, capture_output=True)
    for name in names:
        caf = os.path.join(HERE, f'raw_{name}.caf')
        subprocess.run(['afconvert', '-f', 'WAVE', '-d', f'LEI16@{SR}', caf, os.path.join(HERE, f'raw_{name}.wav')], check=True)

def read(path):
    w = wave.open(path)
    raw = w.readframes(w.getnframes())
    return [v / 32768 for v in struct.unpack('<%dh' % (len(raw) // 2), raw)]

def write(path, s):
    w = wave.open(path, 'wb')
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(struct.pack('<%dh' % len(s), *[max(-32767, min(32767, int(v * 32767))) for v in s]))
    w.close()

def envelope(s, win=220):
    return [math.sqrt(sum(v * v for v in s[i:i + win]) / win) for i in range(0, max(1, len(s) - win), win)]

def trim(s, rel=0.04):
    env = envelope(s)
    peak = max(env)
    on = [i for i, e in enumerate(env) if e > peak * rel]
    a, b = on[0] * 220, (on[-1] + 1) * 220 + 220
    return s[max(0, a - 110):min(len(s), b)]

def period(seg):
    # pitch period in samples (0 if not periodic)
    best, lag_best = 0, 0
    m = sum(seg) / len(seg)
    f = [v - m for v in seg]
    e = sum(v * v for v in f) or 1
    for lag in range(int(SR / 400), int(SR / 75)):
        r = sum(f[i] * f[i + lag] for i in range(len(f) - lag)) / e
        if r > best:
            best, lag_best = r, lag
    return lag_best if best > 0.5 else 0

def corr(a, b):
    num = sum(x * y for x, y in zip(a, b))
    den = math.sqrt(sum(x * x for x in a) * sum(y * y for y in b)) or 1
    return num / den

def rms(seg):
    return math.sqrt(sum(v * v for v in seg) / max(1, len(seg)))

def hold(s, seconds):
    """Make the sound last `seconds` by repeating its steady middle, with no clicks."""
    n = len(s)
    target = int(seconds * SR)
    if n >= target:
        return s
    a, b = int(n * 0.25), int(n * 0.75)        # steady middle
    mid = s[a:b]
    p = period(mid[:min(len(mid), 1200)])
    if p:
        # Voiced: find a loop length (whole voice cycles) whose end lines up with its start
        W = min(p, 160)
        best_L, best_c = p, -2
        for L in range(len(mid) - W - 1, p - 1, -1):
            c = corr(mid[:W], mid[L:L + W])
            if c > best_c:
                best_c, best_L = c, L
            if best_c > 0.98 and L < best_L - p:
                break
        loop = mid[:best_L]
        out = list(s[:a])
        while len(out) + len(loop) + (n - a - best_L) < target:
            out += loop
        return out + list(s[a + best_L:])  # the original continuation of the loop's end
    # Unvoiced hiss: random pieces of the middle, joined with equal-power crossfades
    import random
    random.seed(len(s))
    piece, fade = int(0.09 * SR), int(0.03 * SR)
    if len(mid) < piece + 10:
        piece = len(mid) - 10
        fade = min(fade, piece // 3)
    level = rms(mid)
    out = list(s[:b])
    while len(out) < target - (n - b):
        o = random.randint(0, len(mid) - piece)
        seg = mid[o:o + piece]
        g = level / (rms(seg) or 1)
        seg = [v * g for v in seg]
        for i in range(fade):
            t = (i + 0.5) / fade
            out[-fade + i] = out[-fade + i] * math.cos(t * math.pi / 2) + seg[i] * math.sin(t * math.pi / 2)
        out += seg[fade:]
    tail = s[b:]
    for i in range(min(fade, len(tail))):
        t = (i + 0.5) / fade
        out[-fade + i] = out[-fade + i] * math.cos(t * math.pi / 2) + tail[i] * math.sin(t * math.pi / 2)
    return out + list(tail[fade:])

def lowpass(s, cutoff, passes=3):
    rc = 1 / (2 * math.pi * cutoff)
    alpha = (1 / SR) / (rc + 1 / SR)
    for _ in range(passes):
        out, y = [], 0.0
        for x in s:
            y = y + alpha * (x - y)
            out.append(y)
        s = out
    return s

def append_xfade(out, seg, xf):
    """Add seg to out, blending the join over xf samples."""
    xf = min(xf, len(out), len(seg))
    for i in range(xf):
        w = (i + 0.5) / xf
        out[-xf + i] = out[-xf + i] * (1 - w) + seg[i] * w
    out += seg[xf:]

def hum(s, seconds):
    """Lengthen a voiced sound (mmm, vvv, zzz, vowels) by stitching randomly chosen
    whole voice cycles from its steady middle. Joins sit on the same point of the
    vocal-cord cycle, so the buzz stays smooth and no repeating texture builds up."""
    import random
    random.seed(len(s))
    n, target = len(s), int(seconds * SR)
    if n >= target:
        return s
    fund = lowpass(s, 450)
    ups = [i for i in range(1, n) if fund[i - 1] < 0 <= fund[i]]
    p = period(s[int(n * 0.3):int(n * 0.3) + 1200])
    if not p or not ups:
        return hold(s, seconds)
    # one mark per voice cycle: from each mark, the upward crossing closest to one period later
    cycle_marks = [next(u for u in ups if u >= int(n * 0.2))]
    while True:
        want = cycle_marks[-1] + p
        near = [u for u in ups if abs(u - want) <= p // 4]
        if not near:
            break
        cycle_marks.append(min(near, key=lambda u: abs(u - want)))
    mid = [m for m in cycle_marks if n * 0.2 <= m <= n * 0.8]
    if len(mid) < 5:
        return hold(s, seconds)
    a, b = mid[0], mid[-1]
    xf = int(0.003 * SR)
    out = list(s[:a])
    while len(out) + (n - b) < target:
        i = random.randint(0, len(mid) - 4)
        j = min(len(mid) - 1, i + random.randint(2, 5))
        # start xf samples early so that, after blending, the mark lands exactly on the join
        append_xfade(out, list(s[mid[i] - xf:mid[j]]), xf)
    append_xfade(out, list(s[b - xf:]), xf)
    return out

def level(s, skip_start=0.05, skip_end=0.08):
    """Even out small volume wobbles (flutter) in the middle of a held sound."""
    win = int(0.012 * SR)
    env = [math.sqrt(sum(v * v for v in s[max(0, i - win):i + win]) / (2 * win)) for i in range(len(s))]
    # smooth the loudness curve over ~30 ms
    k = int(0.015 * SR)
    pref = [0.0]
    for e in env:
        pref.append(pref[-1] + e)
    smooth = [(pref[min(len(env), i + k)] - pref[max(0, i - k)]) / (min(len(env), i + k) - max(0, i - k)) for i in range(len(env))]
    a, b = int(skip_start * SR), len(s) - int(skip_end * SR)
    target = sorted(smooth[a:b])[len(smooth[a:b]) // 2] if b > a else 0
    out = list(s)
    ramp = int(0.03 * SR)  # ease the leveling in and out so there's no jump
    for i in range(a, b):
        g = target / smooth[i] if smooth[i] > 1e-6 else 1
        g = max(0.6, min(1.6, g))
        edge = min(i - a, b - 1 - i)
        if edge < ramp:
            w = edge / ramp
            g = 1 + (g - 1) * w
        out[i] = s[i] * g
    return out

def highpass(s, cutoff=70):
    """Remove rumble below ~70 Hz (one-pole high-pass, run twice)."""
    rc = 1 / (2 * math.pi * cutoff)
    alpha = rc / (rc + 1 / SR)
    for _ in range(2):
        out, prev_x, prev_y = [], 0.0, 0.0
        for x in s:
            y = alpha * (prev_y + x - prev_x)
            out.append(y)
            prev_x, prev_y = x, y
        s = out
    return s

# How much of each clipped sound to keep (seconds): the consonant plus a hint of vowel
CLIP_SECONDS = {'b': 0.12, 'd': 0.12, 'g': 0.13, 'j': 0.18, 'w': 0.2, 'wh': 0.2, 'y': 0.2, 'qu': 0.26}

def clip(s, seconds):
    """Keep the start of the sound, then fade out fast ("b'", not "buh")."""
    out = s[:int(seconds * SR)]
    fade = int(0.04 * SR)
    for i in range(min(fade, len(out))):
        out[-1 - i] *= i / fade
    return out

def finish(s, target_rms=0.12):
    fade_in = int(0.008 * SR)
    for i in range(min(fade_in, len(s))):
        s[i] *= i / fade_in
    fade_out = int(0.05 * SR)
    for i in range(min(fade_out, len(s))):
        s[-1 - i] *= (i / fade_out)
    env = envelope(s)
    loud = sorted(env)[int(len(env) * 0.8)] or 1   # loudness of the main part
    gain = target_rms / loud
    peak = max(abs(v) for v in s) * gain
    if peak > 0.95:
        gain *= 0.95 / peak
    pad = [0.0] * int(0.04 * SR)                      # a breath of silence on each side
    return pad + [v * gain for v in s] + pad

if __name__ == '__main__':
    names = sys.argv[1:] or list(SOUNDS)
    synth(names)
    for name in names:
        s = trim(highpass(read(os.path.join(HERE, f'raw_{name}.wav'))))
        kind = SOUNDS[name][2]
        if kind == 'hold':
            s = hold(s, HOLD_SECONDS)
        elif kind == 'hum' and name in 'aeiou':
            pass  # vowels are already long enough; leave them exactly as spoken
        elif kind == 'hum':
            # make it two ways, keep whichever is smoother (more steadily voiced)
            from analyze import analyze
            best = None
            for way in (hum, hold):
                cand = way(list(s), HOLD_SECONDS)
                write(os.path.join(HERE, 'cand.wav'), finish(list(cand)))
                score = analyze(os.path.join(HERE, 'cand.wav'))['voiced']
                if best is None or score > best[0]:
                    best = (score, cand, way.__name__)
            s = level(best[1])
            print(f'  {name}: kept {best[2]} (voiced {best[0]})')
        elif kind == 'clip':
            s = clip(s, CLIP_SECONDS[name])
        s = finish(s)
        write(os.path.join(OUT, f'{name}.wav'), s)
        print(f'{name}: {len(s) / SR:.2f}s ({kind})')
