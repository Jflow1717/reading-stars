// Digraph Detective: find every digraph in the sentence.
// Tap a digraph (wh, ch, sh, th, ck) and it gets underlined.
// Tap the buddy letters qu and they get circled.
// When she's found them all, the words with digraphs pop out below.

import { h, pickRound, runRound, wiggle, confetti } from '../ui.js';
import { talk, chime, praise } from '../speech.js';
import { sentences, findDigraphs } from '../content.js';
import { recordResult } from '../progress.js';

const SENTENCES_PER_ROUND = 3;

export default {
  id: 'detective',
  name: 'Detective',
  emoji: '🔍',
  color: 'var(--orange)',
  intro: 'Find the digraphs! Tap them to underline. Circle Q U!',

  start(game) {
    const list = pickRound(sentences(game.content, game.week), SENTENCES_PER_ROUND, (s) => s.text);
    runRound(game, list, (sentence, finish) => showSentence(game, sentence, finish));
  },
};

function showSentence(game, sentence, finish) {
  const { stage, content } = game;
  const targets = [];      // every digraph to find: { el, word, letters, found }

  // Build the sentence: each word is a box, each letter its own piece,
  // and each digraph is wrapped so it can be underlined or circled.
  const wordEls = sentence.text.split(' ').map((rawWord) => {
    const letters = rawWord.replace(/[^a-z']/gi, '');
    const found = findDigraphs(content, letters);
    const wordEl = h('span', { class: 'word' });
    let i = 0;              // position among the letters (punctuation not counted)
    let openTarget = null;  // a digraph whose other letters are still to come
    let lettersLeft = 0;
    for (const char of rawWord) {
      if (!/[a-z']/i.test(char)) {
        wordEl.append(h('span', { class: 'punct' }, char));
        continue;
      }
      const letterEl = h('span', { class: 'letter' }, char);
      const digraph = found.find((d) => d.start === i);
      if (digraph) {
        // First letter of a digraph: start a new underline/circle box
        openTarget = { word: letters.toLowerCase(), shown: letters, letters: digraph.letters, found: false,
          el: h('span', { class: `target ${digraph.kind}` }, letterEl) };
        targets.push(openTarget);
        wordEl.append(openTarget.el);
        lettersLeft = digraph.letters.length - 1;
      } else if (lettersLeft > 0) {
        // The rest of the digraph's letters go in the same box
        openTarget.el.append(letterEl);
        lettersLeft -= 1;
      } else {
        wordEl.append(letterEl);
      }
      i += 1;
    }
    // Tapping anywhere on a word picks the letter closest to the finger
    wordEl.addEventListener('pointerdown', (event) => tapWord(wordEl, event.clientX));
    return wordEl;
  });

  const sentenceEl = h('div', { class: 'sentence' }, wordEls);
  const wordBank = h('div', { class: 'found-words' });
  const controls = h('div', { class: 'row' },
    h('button', { class: 'hear', 'aria-label': 'Read the sentence to me', onClick: () => talk().say(sentence.text, { rate: 0.8 }) }, '🔊'),
    h('button', { class: 'btn big sunny', 'aria-label': 'Hint', onClick: hint }, '💡'),
  );
  stage.replaceChildren(sentenceEl, controls, wordBank);
  game.introOnce(talk());

  function tapWord(wordEl, x) {
    const letters = [...wordEl.querySelectorAll('.letter')];
    let closest = letters[0];
    let bestDistance = Infinity;
    for (const letter of letters) {
      const box = letter.getBoundingClientRect();
      const distance = Math.abs(box.left + box.width / 2 - x);
      if (distance < bestDistance) {
        bestDistance = distance;
        closest = letter;
      }
    }
    const targetEl = closest.closest('.target');
    const target = targets.find((t) => t.el === targetEl);
    if (!target) {
      chime('tick');
      wiggle(closest, 'nope');
      return;
    }
    if (target.found) {
      talk().sound(target.letters);
      return;
    }
    target.found = true;
    target.el.classList.remove('hint');
    target.el.classList.add('found');
    chime('pop');
    talk().sound(target.letters);
    if (targets.every((t) => t.found)) setTimeout(allFound, 600);
  }

  function hint() {
    const missing = targets.find((t) => !t.found);
    if (!missing) return;
    // A hint means this word is worth practicing: it goes on the parent's list
    recordResult(missing.word, 'detective', false);
    wiggle(missing.el, 'hint');
    talk().say('Look here!');
  }

  async function allFound() {
    game.earnStar();
    confetti();
    controls.replaceChildren(
      h('button', { class: 'hear', 'aria-label': 'Read the sentence to me', onClick: () => talk().say(sentence.text, { rate: 0.8 }) }, '🔊'),
      h('button', { class: 'btn big go', 'aria-label': 'Next', onClick: () => finish(true) }, '➜'),
    );

    // The words that had digraphs, with the digraph marked, like the worksheet's last step
    const seen = new Set();
    targets.forEach((t, n) => {
      if (seen.has(t.word)) return;
      seen.add(t.word);
      const marks = findDigraphs(content, t.word);
      const parts = [];
      let i = 0;
      for (const m of marks) {
        parts.push(t.shown.slice(i, m.start));
        const end = m.start + m.letters.length;
        const pair = t.shown.slice(m.start, end); // keeps capitals, like "Ch" in Chad
        parts.push(m.kind === 'buddy' ? h('span', { class: 'circled' }, pair) : h('u', {}, pair));
        i = end;
      }
      parts.push(t.shown.slice(i));
      wordBank.append(h('button', {
        class: 'btn',
        style: `animation-delay:${n * 0.12}s`,
        onClick: () => talk().say(t.word),
      }, h('span', {}, parts)));
    });

    const t = talk();
    await t.say(praise());
    await t.say(sentence.text, { rate: 0.8 });
  }
}
