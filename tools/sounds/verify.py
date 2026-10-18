"""Pass/fail checks for each sound file: is it the SOUND, and not the letter's name?

Letter names always contain a vowel ("ess", "tee", "aitch", "em", "bee"), so:
  - hissing/puff sounds (s, sh, f, th, h, p, t, k, c, ck, ch, x) must have NO voicing
  - b, d, g must be very short (a clipped b, not "bee")
  - m, n, l, r must be voiced with the right low resonance (not starting with the "e" of "em")
  - vowels must match the short-vowel resonances (F1/F2) for that vowel
  - z and v must have the low voice buzz that s and f lack
"""
import sys, math
sys.path.insert(0, '.')
from analyze import analyze, read, fft

def low_share(path):
    sr, s = read(path)
    lows = tots = 0
    for i in range(0, len(s) - 1024, 512):
        f = [s[i + j] * (0.5 - 0.5 * math.cos(2 * math.pi * j / 1023)) for j in range(1024)]
        mags = [abs(c) ** 2 for c in fft(f)[:512]]
        lows += sum(mags[int(80 * 1024 / sr):int(400 * 1024 / sr)])
        tots += sum(mags)
    return lows / tots

R = {n: analyze(f'out/{n}.wav') for n in
     ['wh','ch','sh','th','ck','qu','a','e','i','o','u','b','c','d','f','g','h','j','k','l','m','n','p','r','s','t','v','w','x','y','z']}

VOWELS = {  # (F1 low, F1 high, F2 low, F2 high), short vowels, adult female ranges with margin
    'a': (600, 900, 1700, 2400),   # apple
    'e': (580, 850, 1800, 2300),   # Ed
    'i': (330, 560, 2100, 2700),   # itch
    'o': (750, 1050, 1050, 1450),  # octopus
    'u': (650, 950, 1200, 1600),   # up
}
rows = []
def check(name, ok, why):
    rows.append((name, 'PASS' if ok else 'FAIL', why))

for n in ['s', 'sh', 'f', 'th', 'h', 'p', 't', 'k', 'c', 'ck', 'ch', 'x']:
    r = R[n]
    check(n, r['voiced'] <= 0.1 and r['active'] >= 0.1, f"no vowel in it (voiced {r['voiced']}), lasts {r['active']}s")
check('s/sh', R['s']['centroid'] - R['sh']['centroid'] > 1500, f"s brighter than sh ({R['s']['centroid']} vs {R['sh']['centroid']} Hz)")
for n in ['b', 'd', 'g']:
    r = R[n]
    check(n, 0.06 <= r['active'] <= 0.16, f"clipped, {r['active']}s (a letter name like 'bee' is ~0.4s)")
for n in ['j', 'w', 'wh', 'y', 'qu']:
    r = R[n]
    check(n, 0.1 <= r['active'] <= 0.3 and r['voiced'] > 0.25, f"short and voiced ({r['active']}s, voiced {r['voiced']})")
check('y', R['y']['F2'] > 2200, f"y has a high second resonance like 'ee' onset (F2 {R['y']['F2']})")
check('w', R['w']['F2'] < 1600, f"w starts rounded like 'oo' (F2 {R['w']['F2']})")
for n in ['m', 'n']:
    r = R[n]
    check(n, r['voiced'] >= 0.8 and r['centroid'] < 600 and r['active'] >= 0.4, f"steady hum, low and dark (centroid {r['centroid']} Hz, voiced {r['voiced']}, {r['active']}s)")
check('l', R['l']['voiced'] >= 0.8 and R['l']['F1'] < 450, f"steady voiced, F1 {R['l']['F1']} (not the 'e' of 'el')")
check('r', R['r']['voiced'] >= 0.75 and R['r']['F2'] < 1600, f"steady 'rrr', F2 {R['r']['F2']} (not 'are')")
for n in ['v', 'z']:
    ls = low_share(f'out/{n}.wav')
    check(n, ls > 0.05 and R[n]['active'] >= 0.4, f"has voice buzz (low share {ls:.3f}), lasts {R[n]['active']}s")
for n in ['s', 'f']:
    ls = low_share(f'out/{n}.wav')
    check(n, ls < 0.06, f"no voice buzz (low share {ls:.3f})")
for v, (a, b, c, d) in VOWELS.items():
    r = R[v]
    check(v, a <= r['F1'] <= b and c <= r['F2'] <= d and r['active'] >= 0.3, f"F1 {r['F1']}, F2 {r['F2']}, {r['active']}s")
check('c=k=ck', open('out/c.wav','rb').read() == open('out/k.wav','rb').read() == open('out/ck.wav','rb').read(), 'c, k and ck are the same /k/ sound')
check('w=wh', open('out/w.wav','rb').read() == open('out/wh.wav','rb').read(), 'wh is the same /w/ sound as w')

for name, res, why in rows:
    print(f"{res}  {name:<7} {why}")
print(f"\n{sum(r[1] == 'PASS' for r in rows)} of {len(rows)} checks passed")
