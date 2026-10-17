# Reading Stars ⭐

A reading practice app for a 1st grader, built from the school's Unit 3 homework
pack (consonant digraphs: wh, ch, sh, th, ck, and the buddy letters qu).
It runs in Chrome on the Galaxy tablet. There are no accounts. Stars and missed
words are saved on the tablet itself.

## The six games

| Game | What she does | Saved for you |
| --- | --- | --- |
| 🔤 **Sounds** | Taps a card to hear its sound and keyword ("/sh/ ... ship"). Tapping all six new cards earns a star. | |
| 👆 **Tap It** | Taps one button per sound (sh is one tap), then slides the star across to blend the word. | |
| ✏️ **Spell It** | Hears a word and builds it from sound tiles (sh, ck and qu are single tiles). Two tries, with tips for the ck and qu rules. | Words she missed |
| 🎩 **Trick Words** | Reads the flashcard, then spells it from letter tiles. Tiles say letter names, never sounds. | Words she missed |
| 🔍 **Detective** | Taps the digraphs in a sentence to underline them, and taps qu to circle it. | Words where she needed a hint |
| 🎤 **Read to Me** | Reads a word or sentence aloud and gets a star if the tablet heard it right. 🔴 records her voice, ▶️ plays it back. | Words she missed, and what the microphone heard |

Each round is 5 words (3 sentences in Detective), then a trophy screen.
Every 10 stars earns a sticker on the home screen.

## The grown-up screen

**Hold the ⚙️ on the home screen for about 2 seconds** (a quick tap does nothing,
so she won't open it by accident). It shows:

- stars per day for the last week
- **words to practice**: what she missed, in which game, and whether she's gotten it right since.
  Missed words come up 3 times as often in the games until she gets them right 3 times in a row.
- settings: Week 1, Week 2 or both weeks; how fast the voice talks
- which sound recordings are in place (see below)
- a check that the word list has no typing mistakes
- a button to erase all progress

## Getting it onto the tablet

The tablet has to open the app from a secure (https) web address. That's what
lets Chrome install it on the home screen, run it with no internet, and use the
microphone. The free option is GitHub Pages, which Claude can set up for you.
Then on the tablet: open the address in Chrome, tap ⋮, then **Add to Home screen**
(or **Install app**).

## Recording the sounds

Until you record them, the built-in voice guesses at each sound, and the guesses are rough.
See [RECORDING-SOUNDS.md](RECORDING-SOUNDS.md) for the list of 31 files and tips.
Phone recordings (.m4a) work as they are.

## Good to know

- **Read to Me needs the internet.** Chrome sends her voice to Google to understand it.
  The first time, Chrome asks for microphone permission. If it can't listen (no internet
  or permission denied), the game switches to a grown-up check: you tap ✅ or 🔁.
- Speech recognition is not perfect with short words like "fog" or "sip". The app accepts
  common mix-ups ("two" for "to", "witch" for "which"), and the parent screen shows
  what the microphone heard, so you can tell a real miss from a microphone mistake.
- Progress lives in Chrome on that tablet. Clearing Chrome's data for the site erases it.
- **Earlier trick words:** the photos only showed five from earlier units (the, a, and, is, his).
  They're used in the sentences or shown in bold. Add any others from her Unit 1 and 2
  flashcards to `content/unit-03.json` with `"week": 0`.
- Other games use no internet once the app has been opened once.

## Adding the next unit

The easiest way is to send Claude photos of the new pack. To do it by hand:

1. Copy `content/unit-03.json` to `content/unit-04.json` and change the words.
   Each word lists its sounds, one per tap: `"sounds": ["sh", "o", "p"]`.
   Keep all the old trick words in the list and add the new ones.
2. Add a line for it in `content/units.json`. The last unit listed is the one the app opens with.
3. Open the grown-up screen. "Word list check" should say ✅. If it lists a problem, fix that line.

## Trying it on the Mac

In Terminal:

```bash
cd ~/Documents/claude/reading-stars && python3 -m http.server 8642
```

Then open http://localhost:8642 in Chrome. Press Ctrl+C in Terminal to stop it.

## What's in the folder

| Path | What it is |
| --- | --- |
| `index.html` | The page the app runs in |
| `css/style.css` | Colors, sizes, animations |
| `js/main.js` | Home screen, and opens each game |
| `js/modes/` | One file per game |
| `js/parent.js` | The grown-up screen |
| `js/speech.js` | Sounds, the built-in voice, the microphone |
| `js/progress.js` | Stars, missed words and settings saved on the tablet |
| `js/content.js` | Reads the word lists |
| `content/` | Word lists: `unit-03.json`, the shared `letters.json`, and `units.json` |
| `audio/sounds/` | Your sound recordings go here |
| `sw.js`, `manifest.json`, `icons/` | What makes it installable and work offline |

Not affiliated with the reading program the school uses. The word lists are copied
from the school's homework pages for home practice.
