// main.js - starts the app, draws the home screen, and opens each game.
//
// Each game lives in its own file in js/modes/. The address bar shows which
// screen is open (#dictation, #parent...), so the tablet's Back button works.

import * as progress from './progress.js';
import * as speech from './speech.js';
import { loadContent } from './content.js';
import { h, makeDots, burst } from './ui.js';
import { showParent } from './parent.js';

import soundCards from './modes/sound-cards.js';
import tapItOut from './modes/tap-it-out.js';
import dictation from './modes/dictation.js';
import trickWords from './modes/trick-words.js';
import detective from './modes/detective.js';
import readToMe from './modes/read-to-me.js';

// The games, in the order they appear on the home screen
const MODES = [soundCards, tapItOut, dictation, trickWords, detective, readToMe];

const app = document.getElementById('app');
let content = null;
let cleanups = [];          // things to switch off when leaving a screen (microphone etc.)
let cameFromHome = false;   // so the 🏠 button can use "Back" instead of piling up history

// Lets Chrome's "install this app" offer be shown from the parent screen instead of popping up
let installOffer = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installOffer = event;
});
export const getInstallOffer = () => installOffer;

// Saves the app on the tablet so it opens without internet
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

async function start() {
  speech.setVoiceRate(progress.getSetting('voiceRate'));
  try {
    await reloadContent();
  } catch (error) {
    app.replaceChildren(h('p', { class: 'loading', style: 'font-size:1.4rem;animation:none' },
      '😕 The word lists did not load. Check your internet and reopen the app.'));
    return;
  }
  window.addEventListener('hashchange', route);
  route();
}

// Loads (or re-loads, after the parent picks a different unit) the word lists
async function reloadContent() {
  content = await loadContent(progress.getSetting('unit'));
  speech.setSoundInfo(content.sounds);
  return content;
}

// Shows whichever screen the address says
function route() {
  speech.stop();
  speech.stopListening();
  cleanups.forEach((fn) => { try { fn(); } catch (e) { /* already off */ } });
  cleanups = [];
  window.scrollTo(0, 0);

  const id = location.hash.slice(1);
  if (id === 'parent') {
    showParent(app, { getContent: () => content, reloadContent, goHome, getInstallOffer, onCleanup: (fn) => cleanups.push(fn) });
    return;
  }
  const mode = MODES.find((m) => m.id === id);
  if (mode) startMode(mode);
  else showHome();
}

function goHome() {
  if (cameFromHome) history.back();
  else location.hash = '';
}

function openScreen(id) {
  cameFromHome = true;
  location.hash = id;
}

// ---------- Home screen ----------

function showHome() {
  cameFromHome = false;
  const week = progress.getSetting('week');
  app.replaceChildren(
    h('div', { class: 'home-top' },
      starCounter().el,
      h('div', { class: 'stickers' },
        progress.stickersEarned(),
        // The little bar fills up as she gets closer to the next sticker
        h('div', { class: 'next-sticker', 'aria-label': 'Next sticker' },
          h('span', { style: `width:${Math.round(progress.nextStickerProgress() * 100)}%` })),
        '🎁',
      ),
      parentButton(),
    ),
    h('h1', { class: 'title' }, 'Reading ', h('span', { class: 'twinkle' }, '⭐'), ' Stars'),
    h('div', { class: 'mode-grid' },
      MODES.map((mode) =>
        h('button', {
          class: 'mode-tile',
          style: `background:${mode.color}`,
          onClick: () => { speech.chime('pop'); openScreen(mode.id); },
        }, h('span', { class: 'emoji' }, mode.emoji), mode.name)),
    ),
    h('p', { style: 'text-align:center;color:var(--ink-soft);font-size:1rem;margin:0 0 1.5rem' },
      `${content.unitName} · ${week === 'all' ? 'Weeks 1 and 2' : 'Week ' + week}`),
  );
}

// Grown-ups hold this down for 1.5 seconds to open the parent screen
function parentButton() {
  const button = h('button', { class: 'parent-hold', 'aria-label': 'Grown-ups: press and hold' }, '⚙️');
  let timer = null;
  const cancel = () => {
    clearTimeout(timer);
    button.classList.remove('holding');
  };
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    button.classList.add('holding');
    timer = setTimeout(() => { cancel(); openScreen('parent'); }, 1500);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((name) => button.addEventListener(name, cancel));
  button.addEventListener('contextmenu', (event) => event.preventDefault());
  return button;
}

// The ⭐ 23 bubble. update() refreshes the number with a little bounce.
function starCounter() {
  const number = h('span', {}, progress.getStars());
  const el = h('div', { class: 'star-count', 'aria-label': 'Stars' }, '⭐', number);
  return {
    el,
    update() {
      number.textContent = progress.getStars();
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    },
  };
}

// ---------- A game screen ----------

function startMode(mode) {
  const stars = starCounter();
  const dotsEl = h('div', { class: 'dots' });
  const stage = h('section', { class: 'stage' });
  let introSaid = false;

  app.replaceChildren(
    h('header', { class: 'topbar' },
      h('button', { class: 'btn round', 'aria-label': 'Home', onClick: goHome }, '🏠'),
      h('span', { class: 'mode-emoji' }, mode.emoji),
      dotsEl,
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn round', 'aria-label': 'Hear the directions', onClick: () => speech.say(mode.intro) }, '❓'),
      stars.el,
    ),
    stage,
  );

  // Everything a game needs, in one bundle
  const game = {
    stage,
    content,
    week: progress.getSetting('week'),
    dots: (total) => makeDots(dotsEl, total),
    earnStar() {
      progress.addStar();
      stars.update();
      speech.chime('star');
      burst('⭐');
    },
    // Says the directions the first time only. Pass in a talk() so it can be interrupted.
    async introOnce(t) {
      if (introSaid) return;
      introSaid = true;
      await t.say(mode.intro);
      await t.pause(250);
    },
    again() {
      cleanups.forEach((fn) => { try { fn(); } catch (e) { /* already off */ } });
      cleanups = [];
      speech.stop();
      mode.start(game);
    },
    home: goHome,
    onCleanup: (fn) => cleanups.push(fn),
  };
  mode.start(game);
}

start();
