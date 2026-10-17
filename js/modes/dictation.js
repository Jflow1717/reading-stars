// Spell It (dictation): the app says a word, she builds it from sound tiles.
// Digraphs and qu are single tiles, just like the tiles at school.
// Two tries; after that the app shows her the spelling and saves the word for the parent.

import { h, pickRound, runRound, buildSpeller, shuffle } from '../ui.js';
import { talk, chime, praise, tryAgain } from '../speech.js';
import { practiceWords, kindOf } from '../content.js';
import { recordResult } from '../progress.js';

const WORDS_PER_ROUND = 5;
const TILES_IN_BANK = 8;

// Sounds that are easy to mix up. Wrong tiles are picked from here so the
// choice is a real one (is it c, k or ck?).
const MIX_UPS = {
  a: ['e', 'i', 'o', 'u'], e: ['i', 'a', 'u'], i: ['e', 'a', 'u'], o: ['u', 'a'], u: ['o', 'a'],
  b: ['d', 'p'], d: ['b', 't'], p: ['b', 'd'], t: ['d', 'th'], g: ['j', 'k'], j: ['g'],
  m: ['n'], n: ['m'], f: ['v', 'th'], v: ['f'], s: ['z', 'sh'], z: ['s'], l: ['r'], r: ['l', 'w'],
  w: ['wh', 'r'], y: ['w'], h: ['wh'], c: ['k', 'ck'], k: ['c', 'ck'], x: ['z', 's'],
  sh: ['ch', 's', 'th'], ch: ['sh', 'th'], th: ['sh', 'f', 't'], wh: ['w', 'h'], ck: ['c', 'k'], qu: ['k', 'w'],
};
const FILLERS = ['m', 's', 't', 'a', 'n', 'p', 'i', 'o', 'sh', 'ch', 'th', 'ck'];

export default {
  id: 'dictation',
  name: 'Spell It',
  emoji: '✏️',
  color: 'var(--green)',
  intro: 'Listen to the word. Then build it with the tiles!',

  start(game) {
    const words = pickRound(practiceWords(game.content, game.week), WORDS_PER_ROUND);
    runRound(game, words, (word, finish) => showWord(game, word, finish));
  },
};

// The answer tiles plus a few look-alike/sound-alike tiles, mixed up
function makeBank(content, answer) {
  const known = (s) => !!content.sounds[s];
  const bank = new Set(answer);
  const extras = shuffle(answer.flatMap((s) => MIX_UPS[s] || []).filter(known));
  for (const s of [...extras, ...shuffle(FILLERS).filter(known)]) {
    if (bank.size >= TILES_IN_BANK) break;
    bank.add(s);
  }
  return shuffle([...bank]);
}

// A friendly tip for the two mistakes the teacher's letter talks about
function tipFor(answer, tried) {
  for (let i = 0; i < answer.length; i++) {
    if (answer[i] === tried[i]) continue;
    if (answer[i] === 'ck' && i === answer.length - 1 && ['c', 'k'].includes(tried[i])) {
      return 'Remember: the k sound at the end of a word is spelled C K!';
    }
    if (answer[i] === 'qu') return 'Remember: Q always has his buddy U!';
  }
  return null;
}

function showWord(game, word, finish) {
  const { stage, content } = game;
  const answer = word.sounds;
  let tries = 0;

  // Top row: speaker button, then (once she's done) the picture and the next button
  const hear = h('button', { class: 'hear', 'aria-label': 'Hear the word', onClick: () => sayWord() }, '🔊');
  const picture = h('span');
  const nextSpot = h('span');

  const speller = buildSpeller({
    answer,
    bank: makeBank(content, answer),
    kindOf: (s) => kindOf(content, s),
    onTileTap: (s) => talk().sound(s), // she hears the sound of the tile she picked
    onFull: check,
  });

  stage.replaceChildren(h('div', { class: 'row' }, hear, picture, nextSpot), speller.slotRow, speller.bankEl);

  async function sayWord(t = talk()) {
    hear.classList.add('talking');
    await t.say(word.word, { rate: 0.75 });
    hear.classList.remove('talking');
  }

  // Start: directions (first word only), then the word
  (async () => {
    const t = talk();
    await game.introOnce(t);
    await sayWord(t);
  })();

  async function check(tried) {
    const results = answer.map((s, i) => s === tried[i]);
    speller.showResults(results);

    if (results.every(Boolean)) {
      if (tries === 0) recordResult(word.word, 'dictation', true);
      game.earnStar();
      if (word.emoji) picture.replaceChildren(h('span', { class: 'word-emoji' }, word.emoji));
      nextSpot.replaceChildren(h('button', { class: 'btn big go', 'aria-label': 'Next', onClick: () => finish(true) }, '➜'));
      const t = talk();
      await t.say(praise());
      await t.say(word.word, { rate: 0.75 });
      return;
    }

    tries += 1;
    chime('oops');
    if (tries === 1) recordResult(word.word, 'dictation', false);

    if (tries < 2) {
      // Keep the right tiles, empty the wrong ones, and say the word again
      const t = talk();
      await t.say(tipFor(answer, tried) || tryAgain());
      speller.clearWrong(results);
      await sayWord(t);
      return;
    }

    // Second miss: show the answer, sound by sound, with no fuss
    await new Promise((resolve) => setTimeout(resolve, 700));
    speller.showAnswer();
    if (word.emoji) picture.replaceChildren(h('span', { class: 'word-emoji' }, word.emoji));
    nextSpot.replaceChildren(h('button', { class: 'btn big go', 'aria-label': 'Next', onClick: () => finish(false) }, '➜'));
    const t = talk();
    await t.say(`Here's how we spell ${word.word}.`);
    for (const s of answer) {
      await t.sound(s);
      await t.pause(200);
    }
    await t.say(word.word, { rate: 0.75 });
  }
}
