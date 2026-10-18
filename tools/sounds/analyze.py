"""Acoustic checks for short speech-sound files (no numpy needed).

For each WAV (16-bit mono) prints:
  active   - seconds of sound above the noise floor
  voiced   - share of active frames with a clear pitch (vocal cords buzzing)
  centroid - average 'brightness' of the noise, in Hz (s is high, sh lower, f/th flat)
  F1/F2    - first two vowel formants (only for voiced stretches), estimated by LPC
  timeline - one char per 20ms: '.' silence, 'v' voiced, 'n' noise (unvoiced)
Optional: writes a spectrogram PNG strip for visual checking.
"""
import sys, wave, struct, math, cmath, zlib

def read(path):
    w = wave.open(path)
    sr, n, ch, sw = w.getframerate(), w.getnframes(), w.getnchannels(), w.getsampwidth()
    raw = w.readframes(n)
    vals = struct.unpack('<%dh' % (len(raw) // 2), raw)
    if ch == 2:
        vals = vals[::2]
    return sr, [v / 32768 for v in vals]

def fft(x):
    n = len(x)
    if n == 1:
        return x
    even, odd = fft(x[0::2]), fft(x[1::2])
    t = [cmath.exp(-2j * math.pi * k / n) * odd[k] for k in range(n // 2)]
    return [even[k] + t[k] for k in range(n // 2)] + [even[k] - t[k] for k in range(n // 2)]

def autocorr_voicing(frame, sr):
    m = sum(frame) / len(frame)
    f = [v - m for v in frame]
    e = sum(v * v for v in f)
    if e < 1e-9:
        return 0, 0
    best, lag_best = 0, 0
    for lag in range(int(sr / 400), int(sr / 75)):
        c = sum(f[i] * f[i + lag] for i in range(0, len(f) - lag, 2)) * 2
        r = c / e
        if r > best:
            best, lag_best = r, lag
    return best, (sr / lag_best if lag_best else 0)

def lpc_formants(frame, sr, order=20):
    # pre-emphasis + hamming
    x = [frame[0]] + [frame[i] - 0.95 * frame[i - 1] for i in range(1, len(frame))]
    n = len(x)
    x = [x[i] * (0.54 - 0.46 * math.cos(2 * math.pi * i / (n - 1))) for i in range(n)]
    r = [sum(x[i] * x[i + k] for i in range(n - k)) for k in range(order + 1)]
    if r[0] == 0:
        return []
    a = [1.0] + [0.0] * order
    err = r[0]
    for i in range(1, order + 1):
        acc = r[i] + sum(a[j] * r[i - j] for j in range(1, i))
        k = -acc / err
        a_new = a[:]
        for j in range(1, i):
            a_new[j] = a[j] + k * a[i - j]
        a_new[i] = k
        a = a_new
        err *= (1 - k * k)
    # find peaks of LPC spectrum
    spec = []
    for hz in range(100, 4000, 10):
        w = 2 * math.pi * hz / sr
        z = sum(a[k] * cmath.exp(-1j * w * k) for k in range(order + 1))
        spec.append((hz, 1 / max(abs(z), 1e-9)))
    peaks = [spec[i][0] for i in range(1, len(spec) - 1) if spec[i][1] > spec[i - 1][1] and spec[i][1] > spec[i + 1][1]]
    return [p for p in peaks if p > 200][:3]

def analyze(path, png=None):
    sr, s = read(path)
    hop = int(sr * 0.02)
    frames = [s[i:i + 512] for i in range(0, len(s) - 512, hop)]
    rms = [math.sqrt(sum(v * v for v in f) / len(f)) for f in frames]
    peak = max(rms) if rms else 0
    floor = peak * 0.06
    timeline, voiced, active, cents, f1s, f2s = '', 0, 0, [], [], []
    for f, e in zip(frames, rms):
        if e < floor:
            timeline += '.'
            continue
        active += 1
        v, pitch = autocorr_voicing(f, sr)
        spec = fft([f[i] * (0.5 - 0.5 * math.cos(2 * math.pi * i / 511)) for i in range(512)])[:256]
        mags = [abs(c) for c in spec]
        tot = sum(mags) or 1
        cents.append(sum(mags[k] * k * sr / 512 for k in range(256)) / tot)
        if v > 0.6:
            voiced += 1
            timeline += 'v'
            fm = lpc_formants(f, sr)
            if len(fm) >= 2:
                f1s.append(fm[0]); f2s.append(fm[1])
        else:
            timeline += 'n'
    med = lambda L: sorted(L)[len(L) // 2] if L else 0
    out = {
        'active': round(active * 0.02, 2),
        'voiced': round(voiced / active, 2) if active else 0,
        'centroid': int(sum(cents) / len(cents)) if cents else 0,
        'F1': int(med(f1s)), 'F2': int(med(f2s)),
        'timeline': timeline.strip('.'),
    }
    if png:
        spectrogram_png(s, sr, png)
    return out

def spectrogram_png(s, sr, path, height=128):
    hop = int(sr * 0.01)
    cols = []
    for i in range(0, len(s) - 256, hop):
        f = [s[i + j] * (0.5 - 0.5 * math.cos(2 * math.pi * j / 255)) for j in range(256)]
        mags = [abs(c) for c in fft(f)[:128]]
        cols.append([20 * math.log10(m + 1e-6) for m in mags])
    w = len(cols)
    rows = []
    for y in range(height):
        k = height - 1 - y
        row = bytearray([0])
        for x in range(w):
            db = cols[x][k]
            g = max(0, min(255, int((db + 60) * 255 / 70)))
            row += bytes([255 - g])
        rows.append(bytes(row))
    raw = b''.join(rows)
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, height, 8, 0, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
    open(path, 'wb').write(png)

if __name__ == '__main__':
    for p in sys.argv[1:]:
        r = analyze(p)
        print(f"{p.split('/')[-1]:<16} active={r['active']:<5} voiced={r['voiced']:<5} centroid={r['centroid']:<6} F1={r['F1']:<5} F2={r['F2']:<5} {r['timeline']}")
