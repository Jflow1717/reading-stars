# How the sound files are made

These scripts made `audio/sounds/*.m4a` (and `audio/names/*.m4a`). You don't need them to
run the app. They're here so new sounds in later units (like "ng" or "all") can be
made and checked the same way. Run everything in a scratch folder, not in the app.

1. **Build the speech helper.** It feeds Apple's speech engine an exact sound as a phonetic
   (IPA) symbol. The plain `say` command can't do this on current macOS.
   On this Mac the Command Line Tools have a duplicate `module.modulemap`, so the build
   hides it with an overlay instead of changing system files:
   ```bash
   : > empty.modulemap
   printf '{"version":0,"case-sensitive":"false","roots":[{"name":"/Library/Developer/CommandLineTools/usr/include/swift","type":"directory","contents":[{"name":"module.modulemap","type":"file","external-contents":"%s/empty.modulemap"}]}]}' "$PWD" > overlay.yaml
   swiftc -vfsoverlay overlay.yaml -Xcc -ivfsoverlay -Xcc overlay.yaml speak.swift -o speak
   ```
2. **Make the sounds:** `python3 make_sounds.py` (or `python3 make_sounds.py sh th` for some).
   Each sound's IPA symbol, speed and type (hold, hum, clip, burst) is in the `SOUNDS` table.
   WAV files land in `out/`.
3. **Check them:** `python3 verify.py` runs pass/fail checks that a letter name would fail
   (no vowel in s/sh/th/f, b/d/g clipped short, vowel resonances, voicing in z/v).
   On 2026-10-18 all 38 checks passed.
4. **Convert for the app:**
   `afconvert -f m4af -d aac -b 64000 out/sh.wav ../../audio/sounds/sh.m4a`

Letter names (for Trick Words) are spoken from plain text ("H.") with the same helper,
then trimmed and leveled with `make_sounds.finish`.
