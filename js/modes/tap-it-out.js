// Tap It Out: one button for each SOUND in a word ("shop" = sh + o + p, three taps).
// A digraph like sh is one button, because it makes one sound.
// After tapping every sound, she slides the star across to blend them into the word.

import { h, pickRound, runRound, wiggle } from '../ui.js';
import { talk, chime, praise } from '../speech.js';
import { practiceWords, kindOf } from '../content.js';

const WORDS_PER_ROUND = 5;

export default {
  id: 'tap-it-out',
  name: 'Tap It',
  emoji: '👆',
  color: 'var(--blue)',
  intro: 'Tap each sound. Then slide the star to read the word!',

  start(game) {
    const words = pickRound(practiceWords(game.content, game.week), WORDS_PER_ROUND);
    runRound(game, words, (word, finish) => showWord(game, word, finish));
  },
};

function showWord(game, word, finish) {
  const { stage, content } = game;
  let nextSound = 0;

  // One big button per sound
  const buttons = word.sounds.map((sound, i) =>
    h('button', { class: `tile tap-btn ${kindOf(content, sound)}`, onClick: () => tapSound(i) },
      sound,
      h('span', { class: 'finger' }, '👆')));
  const row = h('div', { class: 'tap-row' }, buttons);
  const below = h('div', { class: 'row', style: 'min-height:6rem' });
  stage.replaceChildren(row, below);

  const t = talk();
  game.introOnce(t);

  function tapSound(i) {
    if (nextSound >= buttons.length) {
      // Already tapped them all: just play the sound again
      talk().sound(word.sounds[i]);
      return;
    }
    if (i !== nextSound) {
      // Tapped out of order: make the right one wiggle as a hint
      chime('tick');
      wiggle(buttons[nextSound], 'hint');
      return;
    }
    buttons[i].classList.add('lit');
    talk().sound(word.sounds[i]);
    nextSound += 1;
    if (nextSound === buttons.length) setTimeout(showBlendTrack, 500);
  }

  // The track with a star she drags from left to right
  function showBlendTrack() {
    const knob = h('div', { class: 'blend-knob' }, '⭐');
    const track = h('div', { class: 'blend-track waiting', 'aria-label': 'Slide the star' }, knob);
    below.replaceChildren(track);

    let dragging = false;
    let done = false;
    let lastLit = -1;

    const maxX = () => track.clientWidth - knob.offsetWidth;

    // Moves the star to x, and lights up each sound the star has passed
    function moveTo(x) {
      x = Math.max(0, Math.min(maxX(), x));
      knob.style.transform = `translateX(${x}px)`;
      const passed = Math.floor((x / maxX()) * buttons.length + 0.15);
      for (let i = 0; i < buttons.length; i++) {
        const isPast = i < passed;
        if (isPast && i > lastLit) {
          chime('pop');
          lastLit = i;
        }
        buttons[i].classList.toggle('swept', isPast);
      }
      if (x >= maxX() * 0.95) blend();
    }

    // If she just taps the track, slide the star across by itself
    function autoSlide(fromX) {
      const startTime = performance.now();
      const step = (now) => {
        if (done) return;
        const progress = Math.min(1, (now - startTime) / 900);
        moveTo(fromX + (maxX() - fromX) * progress);
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    const knobX = () => new DOMMatrix(getComputedStyle(knob).transform).m41 || 0;

    track.addEventListener('pointerdown', (event) => {
      if (done) return;
      track.classList.remove('waiting');
      track.setPointerCapture(event.pointerId);
      dragging = true;
    });
    track.addEventListener('pointermove', (event) => {
      if (!dragging || done) return;
      const box = track.getBoundingClientRect();
      // Only move forward, never back (so a wobbly finger still works)
      moveTo(Math.max(knobX(), event.clientX - box.left - knob.offsetWidth / 2));
    });
    track.addEventListener('pointerup', () => {
      if (!dragging || done) return;
      dragging = false;
      autoSlide(knobX());
    });

    async function blend() {
      if (done) return;
      done = true;
      row.classList.add('blended');
      buttons.forEach((b) => b.classList.add('swept'));
      game.earnStar();

      const replay = h('button', { class: 'hear', 'aria-label': 'Hear the word', onClick: () => talk().say(word.word) }, '🔊');
      const next = h('button', { class: 'btn big go', 'aria-label': 'Next', onClick: () => finish(true) }, '➜');
      below.replaceChildren(
        word.emoji ? h('span', { class: 'word-emoji' }, word.emoji) : null,
        replay,
        next,
      );

      const t = talk();
      await t.pause(300);
      await t.say(word.word, { rate: 0.75 });
      await t.pause(300);
      await t.say(praise());
    }
  }
}
