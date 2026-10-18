// Trick Words: words you can't tap out (like "has" and "the"), so we learn them by heart.
// 1. Read the flashcard. Tap it to hear the word and its letters.
// 2. The card flips over, and she spells it from letter tiles.
//    Tiles say the letter NAMES (h... a... s...), never sounds, because trick words aren't tapped.

import { h, pickRound, runRound, buildSpeller, shuffle } from '../ui.js';
import { talk, chime, praise, tryAgain, playName } from '../speech.js';
import { trickWords } from '../content.js';
import { recordResult } from '../progress.js';

const WORDS_PER_ROUND = 5;
const TILES_IN_BANK = 8;
const LOOK_ALIKES = {
  a: ['e', 'o', 'u'], e: ['a', 'i'], i: ['e', 'l'], o: ['a', 'u'], u: ['o', 'a'],
  s: ['z', 'c'], h: ['n', 'b'], t: ['f', 'l'], n: ['m', 'h'], m: ['n', 'w'], w: ['m', 'v'],
  b: ['d', 'p'], d: ['b', 'p'], r: ['n'], f: ['t'], l: ['i', 't'],
};
const FILLERS = 'aeioustnhrmwbfdl'.split('');

export default {
  id: 'trick-words',
  name: 'Trick Words',
  emoji: '🎩',
  color: 'var(--pink)',
  intro: 'Read the trick word. Tap the card to check. Then spell it!',

  start(game) {
    // This unit's new trick words come up twice as often as older ones
    const words = pickRound(trickWords(game.content, game.week), WORDS_PER_ROUND,
      (w) => w.word, (w) => (w.week === 0 ? 1 : 2));
    runRound(game, words, (word, finish) => showWord(game, word, finish));
  },
};

function makeBank(letters) {
  const bank = new Set(letters);
  const extras = shuffle(letters.flatMap((l) => LOOK_ALIKES[l] || []));
  for (const l of [...extras, ...shuffle(FILLERS)]) {
    if (bank.size >= Math.max(TILES_IN_BANK, letters.length)) break;
    bank.add(l);
  }
  return shuffle([...bank]);
}

// "has ... h, a, s ... has"
async function sayAndSpell(t, word) {
  await t.say(word);
  await t.pause(200);
  for (const letter of word) {
    await t.name(letter);
  }
  await t.pause(200);
  await t.say(word);
}

function showWord(game, item, finish) {
  const { stage } = game;
  const word = item.word.toLowerCase();
  const letters = word.split('');
  let tries = 0;

  // ---- Step 1: read the card ----
  const card = h('button', { class: 'flashcard', 'aria-label': 'Trick word card' }, word);
  card.addEventListener('click', () => sayAndSpell(talk(), word));
  const spellButton = h('button', { class: 'btn big purple', 'aria-label': 'Spell it', onClick: startSpelling }, '✏️ ➜');
  stage.replaceChildren(card, h('div', { class: 'row' },
    h('button', { class: 'hear', 'aria-label': 'Hear it', onClick: () => sayAndSpell(talk(), word) }, '🔊'),
    spellButton));
  game.introOnce(talk());

  // ---- Step 2: cover the card and spell it ----
  function startSpelling() {
    const covered = h('div', { class: 'flashcard small covered', 'aria-label': 'Covered card' }, '🎩');
    const nextSpot = h('span');
    const speller = buildSpeller({
      answer: letters,
      bank: makeBank(letters),
      kindOf: (l) => ('aeiou'.includes(l) ? 'vowel' : 'consonant'),
      onTileTap: (l) => playName(l),
      onFull: check,
    });
    const hear = h('button', { class: 'hear', 'aria-label': 'Hear the word', onClick: () => talk().say(word) }, '🔊');
    stage.replaceChildren(h('div', { class: 'row' }, covered, hear, nextSpot), speller.slotRow, speller.bankEl);

    const t = talk();
    t.say(`Spell ${word}.`);

    function uncover() {
      covered.classList.remove('covered');
      covered.textContent = word;
    }

    async function check(tried) {
      const results = letters.map((l, i) => l === tried[i]);
      speller.showResults(results);

      if (results.every(Boolean)) {
        if (tries === 0) recordResult(word, 'trick-words', true);
        game.earnStar();
        uncover();
        nextSpot.replaceChildren(h('button', { class: 'btn big go', 'aria-label': 'Next', onClick: () => finish(true) }, '➜'));
        await talk().say(praise());
        return;
      }

      tries += 1;
      chime('oops');
      if (tries === 1) recordResult(word, 'trick-words', false);

      if (tries < 2) {
        const t = talk();
        await t.say(tryAgain());
        speller.clearWrong(results);
        await t.say(word);
        return;
      }

      // Second miss: show it and spell it out together
      await new Promise((resolve) => setTimeout(resolve, 700));
      speller.showAnswer();
      uncover();
      nextSpot.replaceChildren(h('button', { class: 'btn big go', 'aria-label': 'Next', onClick: () => finish(false) }, '➜'));
      const t = talk();
      await t.say("Let's spell it together.");
      await sayAndSpell(t, word);
    }
  }
}
