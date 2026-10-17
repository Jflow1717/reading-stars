// Read to Me: she reads a word or sentence out loud, the tablet listens, and she
// gets a star if it heard the right thing.
// 🔴 records her voice and ▶️ plays it back, so she can hear herself read.
//
// Listening uses Chrome's speech recognition, which needs the internet and
// microphone permission. If either is missing, a grown-up checks instead (✅ / 🔁).

import { h, pickRound, runRound, shuffle } from '../ui.js';
import { talk, chime, praise, listen, canListen, stopListening, canRecord, startRecording } from '../speech.js';
import { practiceWords, trickWords, sentences } from '../content.js';
import { recordResult } from '../progress.js';

let grownUpChecks = false; // true once we know listening can't work on this tablet

export default {
  id: 'read-to-me',
  name: 'Read to Me',
  emoji: '🎤',
  color: '#e0a800',
  intro: 'Tap the microphone, then read it out loud!',

  start(game) {
    const { content, week } = game;
    // A round: 3 tap-able words, 1 trick word, 1 sentence
    const items = shuffle([
      ...pickRound(practiceWords(content, week), 3).map((w) => ({ text: w.word, emoji: w.emoji })),
      ...pickRound(trickWords(content, week), 1).map((w) => ({ text: w.word })),
    ]);
    const sentence = pickRound(sentences(content, week), 1, (s) => s.text)[0];
    if (sentence) items.push({ text: sentence.text, isSentence: true });
    if (!canListen()) grownUpChecks = true;
    runRound(game, items, (item, finish) => showItem(game, item, finish));
  },
};

// ---------- Did she say it? ----------

const NUMBER_WORDS = { 0: 'zero', 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten' };

// Words the listener often writes a different way. "to" might come back as "two".
const SOUNDS_LIKE = {
  to: ['two', 'too'], for: ['four', 'fore'], be: ['bee', 'b'], we: ['wee', 'wii'], he: ['hee'],
  me: ['mi'], or: ['oar', 'ore'], a: ['uh', 'ah', 'ay', 'eh', 'hey'], and: ['an', 'n'],
  as: ['az'], has: ['haz'], is: ['iz'], his: ['hiss'], the: ['thee', 'da', 'duh'],
  which: ['witch'], whiz: ['wiz', 'whizz', 'wizz'], deck: ['dec', 'dek'], math: ['maths'],
  pack: ['pac', 'pak'], cash: ['cache'], rock: ['roc'], sip: ['sipp'], tub: ['tubb'],
};

// "Which fish?" -> ['which', 'fish']
function toWords(text) {
  return String(text)
    .toLowerCase()
    .replace(/\d+/g, (n) => ` ${NUMBER_WORDS[n] || n} `)
    .replace(/[^a-z' ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function sameWord(target, heard) {
  return target === heard || (SOUNDS_LIKE[target] || []).includes(heard);
}

// How many of the target words were heard, in order (0 to 1)
function sentenceScore(target, heard) {
  // Longest run of matching words in the same order
  const table = Array.from({ length: target.length + 1 }, () => new Array(heard.length + 1).fill(0));
  for (let i = 1; i <= target.length; i++) {
    for (let j = 1; j <= heard.length; j++) {
      table[i][j] = sameWord(target[i - 1], heard[j - 1])
        ? table[i - 1][j - 1] + 1
        : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }
  return table[target.length][heard.length] / target.length;
}

// guesses: what the listener thinks she said (best guess first).
// Returns { ok: true/false, heard: the best guess }.
export function matches(targetText, guesses) {
  const target = toWords(targetText);
  let best = { ok: false, heard: guesses[0] || '', score: 0 };
  for (const guess of guesses) {
    const heard = toWords(guess);
    let score;
    if (target.length === 1) {
      // One word: it's right if she said it anywhere ("um... fish!"), or as two pieces ("in to")
      const joined = heard.join('');
      score = heard.some((w) => sameWord(target[0], w)) || joined === target[0] ? 1 : 0;
    } else {
      score = sentenceScore(target, heard);
    }
    if (score > best.score) best = { ok: false, heard: guess, score };
  }
  best.ok = target.length === 1 ? best.score === 1 : best.score >= 0.75;
  return { ok: best.ok, heard: best.heard };
}

// ---------- The screen ----------

function showItem(game, item, finish) {
  const { stage } = game;
  let tries = 0;
  let busy = false;
  let recorder = null;
  let recordingUrl = null;
  let recordTimer = null;

  const textEl = item.isSentence
    ? h('div', { class: 'read-sentence' }, item.text)
    : h('div', { class: 'big-word' }, item.text);
  const picture = h('span');                // the word's picture, shown once she reads it
  const main = h('div', { class: 'row' }); // 🎤, or 🔊 + ➜ when she's done
  const helpRow = h('div', { class: 'row' });

  // 🔴 record / ▶️ play back her own voice, on each side of the microphone
  const playButton = h('button', { class: 'btn big', disabled: true, 'aria-label': 'Play my voice', onClick: playBack }, '▶️');
  const recordButton = h('button', { class: 'btn big', 'aria-label': 'Record my voice', onClick: toggleRecording }, '🔴');
  const canRec = canRecord();

  stage.replaceChildren(
    h('div', { class: 'row' }, textEl, picture),
    h('div', { class: 'row', style: 'gap:2rem' }, canRec ? recordButton : null, main, canRec ? playButton : null),
    helpRow,
  );
  showMainButtons();

  // Moving on: switch off the microphone first
  function done(gotIt) {
    stopListening();
    stopRecording();
    finish(gotIt);
  }
  game.introOnce(talk());
  game.onCleanup(() => { stopListening(); stopRecording(); });

  function showMainButtons() {
    if (grownUpChecks) {
      // A grown-up listens and taps ✅ or 🔁
      main.replaceChildren(
        h('button', { class: 'btn big go', 'aria-label': 'She read it', onClick: () => success() }, '✅'),
        h('button', { class: 'btn big', 'aria-label': 'Not yet', onClick: () => miss('') }, '🔁'),
      );
      helpRow.replaceChildren(h('p', { style: 'color:var(--ink-soft);font-size:1rem;margin:0' },
        'Grown-up: listen, then tap ✅ if it was right.'));
    } else {
      const mic = h('button', { class: 'mic', 'aria-label': 'Listen to me read', onClick: () => listenNow(mic) }, '🎤');
      main.replaceChildren(mic);
    }
  }

  async function listenNow(mic) {
    if (busy) return;
    busy = true;
    await stopRecording();
    mic.classList.add('listening');
    let guesses;
    try {
      guesses = await listen();
    } catch (error) {
      // No permission, no internet, or not supported: switch to grown-up checks
      busy = false;
      mic.classList.remove('listening');
      grownUpChecks = true;
      showMainButtons();
      talk().say('Read it to a grown-up!');
      return;
    }
    mic.classList.remove('listening');
    busy = false;
    if (!guesses.length) {
      talk().say("I didn't hear you. Tap the microphone and read!");
      return;
    }
    const result = matches(item.text, guesses);
    if (result.ok) success();
    else miss(result.heard);
  }

  async function success() {
    if (tries === 0) recordResult(item.text, 'read-to-me', true);
    game.earnStar();
    if (item.emoji) picture.replaceChildren(h('span', { class: 'word-emoji' }, item.emoji));
    main.replaceChildren(
      h('button', { class: 'hear', 'aria-label': 'Hear it', onClick: () => talk().say(item.text, { rate: 0.8 }) }, '🔊'),
      h('button', { class: 'btn big go', 'aria-label': 'Next', onClick: () => done(true) }, '➜'),
    );
    helpRow.replaceChildren();
    await talk().say(praise());
  }

  async function miss(heard) {
    tries += 1;
    chime('oops');
    if (tries === 1) recordResult(item.text, 'read-to-me', false, heard);

    // After the first miss, she can hear it read to her
    const hear = h('button', { class: 'hear', 'aria-label': 'Hear it', onClick: () => talk().say(item.text, { rate: 0.75 }) }, '🔊');
    if (tries < 3) {
      helpRow.replaceChildren(hear);
      const t = talk();
      if (tries === 1) {
        await t.say("Let's try again! Tap each sound in your head, then read it.");
      } else {
        await t.say(`This says: ${item.text}. You try!`);
      }
      return;
    }

    // Third miss: no more tries, just move on happily
    main.replaceChildren(hear, h('button', { class: 'btn big go', 'aria-label': 'Next', onClick: () => done(false) }, '➜'));
    helpRow.replaceChildren();
    await talk().say(`Good try! This says: ${item.text}.`, { rate: 0.8 });
  }

  // ---- Recording her voice ----

  async function toggleRecording() {
    if (recorder) return stopRecording();
    try {
      recorder = await startRecording();
    } catch (error) {
      // no microphone: hide the record buttons
      recordButton.remove();
      playButton.remove();
      return;
    }
    chime('tick');
    recordButton.classList.add('recording');
    recordButton.textContent = '⏹️';
    recordTimer = setTimeout(stopRecording, 8000); // stop by itself after 8 seconds
  }

  async function stopRecording() {
    if (!recorder) return;
    clearTimeout(recordTimer);
    const current = recorder;
    recorder = null;
    recordingUrl = await current.stop();
    recordButton.classList.remove('recording');
    recordButton.textContent = '🔴';
    playButton.disabled = false;
    // Give the microphone a moment to be free before listening
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  function playBack() {
    if (recordingUrl) talk().play(recordingUrl);
  }
}
