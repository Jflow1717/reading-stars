// parent.js - the grown-up screen (hold the ⚙️ on the home screen for 1.5 seconds).
// Shows practice by day, the words she missed, settings, which sound files
// are recorded, and a check that the word lists have no typing mistakes.

import * as progress from './progress.js';
import { h } from './ui.js';
import { findRecording, playSound, say, setVoiceRate } from './speech.js';
import { checkContent } from './content.js';

const GAME_NAMES = {
  dictation: 'Spell It',
  'trick-words': 'Trick Words',
  detective: 'Detective (needed a hint)',
  'read-to-me': 'Read to Me',
};

export function showParent(app, { getContent, reloadContent, goHome, getInstallOffer }) {
  const content = getContent();
  const page = h('div', { class: 'parent' });
  app.replaceChildren(
    h('header', { class: 'topbar' },
      h('button', { class: 'btn round', 'aria-label': 'Back to the app', onClick: goHome }, '🏠'),
      h('div', { class: 'spacer' })),
    page,
  );

  page.append(
    h('h1', {}, 'Grown-ups'),
    practiceSection(),
    missedSection(),
    settingsSection(),
    soundsSection(content),
    checkSection(content),
    toolsSection(),
  );

  // ---------- Practice by day ----------
  function practiceSection() {
    const days = progress.lastSevenDays();
    const most = Math.max(1, ...days.map((d) => d.stars));
    const stickers = progress.stickersEarned();
    return h('section', {},
      h('h2', {}, 'Practice this week'),
      h('div', { class: 'panel' },
        h('div', { class: 'bars' }, days.map((d) =>
          h('div', { class: 'bar' },
            h('span', {}, d.stars || ''),
            h('span', { class: 'fill', style: `height:${(d.stars / most) * 75}%` }),
            h('span', {}, d.label)))),
        h('p', {}, `⭐ ${progress.getStars()} stars in all. Stickers: ${stickers.join(' ') || 'none yet'} (one every 10 stars).`),
        h('p', { class: 'muted' }, 'She gets a star for each word she finishes. Sound Cards gives one star when all the new cards are tapped.'),
      ));
  }

  // ---------- Missed words ----------
  function missedSection() {
    const section = h('section', {}, h('h2', {}, 'Words to practice'));
    const words = progress.missedWords();
    if (!words.length) {
      section.append(h('div', { class: 'panel' }, h('p', {}, 'Nothing missed yet. 🎉')));
      return section;
    }
    const rows = words.map((w) => {
      const where = Object.entries(w.modes).map(([mode, n]) => `${GAME_NAMES[mode] || mode} ×${n}`).join(', ');
      const status = !w.stillLearning ? '✅ Learned (right 3 times in a row)'
        : w.streak === 0 ? 'Not right yet'
        : `Right ${w.streak} time${w.streak === 1 ? '' : 's'} in a row`;
      const missedOn = w.lastMissed
        ? new Date(w.lastMissed + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
        : '';
      const row = h('tr', {},
        h('td', { class: 'word' }, h('button', { class: 'small-btn', onClick: () => say(w.word) }, '🔊'), ' ', w.word),
        h('td', {}, where, w.heard ? h('div', { class: 'muted' }, `Microphone heard: “${w.heard}”`) : null),
        h('td', {}, status, h('div', { class: 'muted' }, `last missed ${missedOn}`)),
        h('td', {}, h('button', {
          class: 'small-btn',
          onClick: () => { progress.clearWord(w.word); row.remove(); },
        }, 'Clear')),
      );
      return row;
    });
    section.append(h('div', { class: 'panel' },
      h('p', { class: 'muted' }, 'Missed words come up more often in the games until she gets them right 3 times in a row. "Clear" takes a word off this list.'),
      h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Word'), h('th', {}, 'Missed in'), h('th', {}, 'Since then'), h('th', {}, ''))),
        h('tbody', {}, rows))));
    return section;
  }

  // ---------- Settings ----------
  function settingsSection() {
    const week = progress.getSetting('week');
    const weekButtons = ['1', '2', 'all'].map((value) =>
      h('button', {
        class: `small-btn ${String(week) === value ? 'on' : ''}`,
        onClick: () => { progress.setSetting('week', value); showParent(app, { getContent, reloadContent, goHome, getInstallOffer }); },
      }, value === 'all' ? 'Both weeks' : `Week ${value}`));

    const unitPicker = h('select', {
      onChange: async (event) => {
        progress.setSetting('unit', event.target.value);
        await reloadContent();
        showParent(app, { getContent, reloadContent, goHome, getInstallOffer });
      },
    }, content.units.map((u) => h('option', { value: u.file, selected: u.file === content.unitFile }, u.name)));

    const rate = progress.getSetting('voiceRate');
    const speed = h('input', { type: 'range', min: '0.6', max: '1.1', step: '0.05', value: rate });
    speed.addEventListener('change', () => {
      progress.setSetting('voiceRate', Number(speed.value));
      setVoiceRate(Number(speed.value));
      say('Which fish did Tom get?');
    });

    return h('section', {},
      h('h2', {}, 'Settings'),
      h('div', { class: 'panel' },
        h('div', { class: 'setting' }, h('label', {}, 'Unit'), unitPicker),
        h('div', { class: 'setting' }, h('label', {}, 'Words from'), weekButtons),
        h('p', { class: 'muted' }, 'Trick words from earlier units are always included.'),
        h('div', { class: 'setting' }, h('label', {}, 'Voice speed'), 'slow', speed, 'fast'),
      ));
  }

  // ---------- Recorded sounds ----------
  function soundsSection(content) {
    const keys = Object.keys(content.sounds);
    const summary = h('p', {}, 'Checking which sound files are there…');
    const chips = keys.map((key) => h('button', { class: 'chip', onClick: () => playSound(key) }, key));
    const missingList = h('p', { class: 'muted' });

    Promise.all(keys.map((key) => findRecording(key))).then((found) => {
      const missing = [];
      found.forEach((url, i) => {
        if (url) chips[i].classList.add('yes');
        else missing.push(`${keys[i]}.mp3`);
      });
      summary.textContent = `${keys.length - missing.length} of ${keys.length} sounds have a sound file (green). Tap one to hear it.`;
      missingList.textContent = missing.length
        ? `No sound file yet, so the keyword is said instead: ${missing.join(', ')}`
        : '';
    });

    return h('section', {},
      h('h2', {}, 'Sounds'),
      h('div', { class: 'panel' },
        summary,
        h('div', { class: 'chips' }, chips),
        missingList,
        h('p', { class: 'muted' }, 'The app comes with a computer-made file for every sound. To use your own voice instead, see RECORDING-SOUNDS.md.'),
      ));
  }

  // ---------- Content check ----------
  function checkSection(content) {
    const problems = checkContent(content);
    const counts = `${(content.unit.reviewWords || []).length} review words, ${(content.unit.currentWords || []).length} new words, ${(content.unit.trickWords || []).length} trick words, ${(content.unit.sentences || []).length} sentences.`;
    return h('section', {},
      h('h2', {}, 'Word list check'),
      h('div', { class: 'panel' },
        h('p', {}, `${content.unitName}: ${counts}`),
        problems.length
          ? h('div', {}, problems.map((p) => h('p', { class: 'problem' }, '⚠️ ' + p)))
          : h('p', { class: 'ok' }, '✅ No typing mistakes found.'),
      ));
  }

  // ---------- Install and reset ----------
  function toolsSection() {
    const offer = getInstallOffer();
    return h('section', {},
      h('h2', {}, 'This tablet'),
      h('div', { class: 'panel' },
        offer
          ? h('p', {}, h('button', {
            class: 'small-btn on',
            onClick: async () => { await offer.prompt(); },
          }, '📲 Put Reading Stars on the home screen'))
          : h('p', { class: 'muted' }, 'To put the app on the home screen: Chrome menu ⋮ → "Add to Home screen" (or "Install app").'),
        h('p', {}, h('button', {
          class: 'small-btn danger',
          onClick: () => {
            if (confirm('Erase all stars, stickers and missed words on this tablet? Settings are kept.')) {
              progress.resetAll();
              showParent(app, { getContent, reloadContent, goHome, getInstallOffer });
            }
          },
        }, 'Erase all progress')),
      ));
  }
}
