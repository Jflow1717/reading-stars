// ui.js - small building blocks the games share:
//   h()            makes a piece of the screen (a button, a box, some text)
//   pickRound()    picks the words for one round, missed words more often
//   runRound()     shows the round one word at a time, then the "You did it!" screen
//   buildSpeller() the empty boxes + letter tiles used by Spell It and Trick Words
//   confetti(), burst(), wiggle()   celebrations and gentle "not that one" shakes

import { needsPractice, takeNewSticker } from './progress.js';
import { talk, chime } from './speech.js';

// h('button', { class: 'btn', onClick: doSomething }, 'Tap me')
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style') el.style.cssText = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

export function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Picks `count` items at random. Words she missed come up 3 times as often.
// extraWeight(item) can make some items more likely too (like this week's trick words).
export function pickRound(items, count, keyOf = (item) => item.word, extraWeight = () => 1) {
  const pool = items.map((item) => ({ item, weight: (needsPractice(keyOf(item)) ? 3 : 1) * extraWeight(item) }));
  const chosen = [];
  while (chosen.length < count && pool.length) {
    const total = pool.reduce((sum, p) => sum + p.weight, 0);
    let ticket = Math.random() * total;
    let index = pool.findIndex((p) => (ticket -= p.weight) < 0);
    if (index === -1) index = pool.length - 1;
    chosen.push(pool.splice(index, 1)[0].item);
  }
  return chosen;
}

// Plays one round: shows each item, waits for the game to call finish(gotIt),
// then moves on. At the end, shows the "You did it!" screen.
export function runRound(game, items, showItem) {
  // Nothing to practice (for example, no sentences in the week the parent picked)
  if (!items.length) {
    game.dots(0);
    game.stage.replaceChildren(h('div', { class: 'trophy', style: 'font-size:6rem' }, '🤔'),
      h('button', { class: 'btn big', onClick: () => game.home(), 'aria-label': 'Home' }, '🏠'));
    return;
  }
  const dots = game.dots(items.length);
  let index = 0;
  let starsWon = 0;

  const next = () => {
    if (index >= items.length) return showRoundEnd(game, starsWon, items.length);
    dots.now(index);
    game.stage.replaceChildren();
    let finished = false;
    showItem(items[index], (gotIt) => {
      if (finished) return; // ignore a double tap on "next"
      finished = true;
      dots.mark(index, gotIt);
      if (gotIt) starsWon += 1;
      index += 1;
      next();
    }, index);
  };
  next();
}

function showRoundEnd(game, starsWon, total) {
  const sticker = takeNewSticker();
  confetti();
  chime('star');
  game.stage.replaceChildren(
    h('div', { class: 'round-end' },
      h('div', { class: 'trophy' }, '🏆'),
      // A star for each one she got, a little sprout for each one she's still growing on
      h('div', { class: 'stars-won' }, '⭐'.repeat(starsWon) + '🌱'.repeat(total - starsWon)),
      sticker ? h('div', { class: 'new-sticker' }, sticker) : null,
    ),
    h('div', { class: 'row' },
      h('button', { class: 'btn big go', onClick: () => game.again(), 'aria-label': 'Play again' }, '🔁'),
      h('button', { class: 'btn big', onClick: () => game.home(), 'aria-label': 'Home' }, '🏠'),
    ),
  );
  const t = talk();
  t.say(starsWon === total ? 'You did it! You got every star!' : 'You did it! Great practice!')
    .then(() => sticker && t.say('You earned a new sticker!'));
}

// The progress dots along the top of the screen
export function makeDots(container, total) {
  const dots = Array.from({ length: total }, () => h('span', { class: 'dot' }));
  container.replaceChildren(...dots);
  return {
    now(i) {
      dots.forEach((dot, j) => dot.classList.toggle('now', j === i));
    },
    mark(i, gotIt) {
      dots[i].classList.remove('now');
      dots[i].classList.add(gotIt ? 'done' : 'missed');
    },
  };
}

// A letter tile. kind is consonant, vowel, digraph or buddy (it sets the color).
export function tile(label, kind, onTap) {
  return h('button', { class: `tile ${kind}`, onClick: onTap }, label);
}

// The spelling board: empty boxes on top, letter tiles below.
// She taps tiles to fill the boxes left to right, and taps a box to empty it.
// When every box is full, onFull(pieces) is called so the game can check it.
export function buildSpeller({ answer, bank, kindOf, onTileTap, onFull }) {
  const filled = answer.map(() => null);
  let locked = false;

  const slots = answer.map((_, i) =>
    h('button', { class: 'slot', 'aria-label': `box ${i + 1}`, onClick: () => emptySlot(i) }));
  const tiles = bank.map((piece) => tile(piece, kindOf(piece), () => place(piece)));

  function paint() {
    const nextEmpty = locked ? -1 : filled.indexOf(null);
    slots.forEach((slot, i) => {
      slot.textContent = filled[i] || '';
      slot.className = 'slot' + (filled[i] ? ` filled ${kindOf(filled[i])}` : '') + (i === nextEmpty ? ' next' : '');
    });
  }

  function place(piece) {
    if (locked) return;
    onTileTap(piece);
    const i = filled.indexOf(null);
    if (i === -1) return;
    filled[i] = piece;
    if (!filled.includes(null)) locked = true;
    paint();
    if (locked) setTimeout(() => onFull([...filled]), 450);
  }

  function emptySlot(i) {
    if (locked || !filled[i]) return;
    filled[i] = null;
    chime('tick');
    paint();
  }

  paint();
  return {
    slotRow: h('div', { class: 'slots' }, slots),
    bankEl: h('div', { class: 'bank' }, tiles),
    // results is a list of true/false, one per box
    showResults(results) {
      results.forEach((ok, i) => slots[i].classList.add(ok ? 'right' : 'wrong'));
    },
    // Empties the wrong boxes (keeps the right ones) so she can try again
    clearWrong(results) {
      results.forEach((ok, i) => { if (!ok) filled[i] = null; });
      locked = false;
      paint();
    },
    showAnswer() {
      answer.forEach((piece, i) => { filled[i] = piece; });
      locked = true;
      paint();
      slots.forEach((slot) => slot.classList.add('right'));
    },
  };
}

// ---------- Celebrations ----------

export function confetti() {
  const pieces = ['⭐', '🌟', '✨', '🎉', '💛', '💜', '💚', '🎈'];
  for (let i = 0; i < 34; i++) {
    const bit = h('span', {
      class: 'confetti',
      style: `left:${Math.random() * 100}vw; animation-duration:${1.6 + Math.random() * 1.6}s; animation-delay:${Math.random() * 0.4}s; font-size:${1.4 + Math.random() * 1.6}rem`,
    }, pieces[i % pieces.length]);
    document.body.append(bit);
    setTimeout(() => bit.remove(), 3800);
  }
}

// One big emoji that pops up in the middle of the screen
export function burst(emoji = '⭐') {
  const big = h('div', { class: 'burst' }, emoji);
  document.body.append(big);
  setTimeout(() => big.remove(), 1100);
}

// Gives an element a little shake (or another animation class), then removes it
export function wiggle(el, className = 'nope') {
  el.classList.remove(className);
  void el.offsetWidth; // restart the animation if it's already running
  el.classList.add(className);
  setTimeout(() => el.classList.remove(className), 900);
}
