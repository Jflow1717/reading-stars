// Sound Cards: tap a card to hear its sound and its keyword ("sh ... ship").
// Tap all of this unit's new cards to earn a star.

import { h, confetti } from '../ui.js';
import { talk } from '../speech.js';

export default {
  id: 'sound-cards',
  name: 'Sounds',
  emoji: '🔤',
  color: 'var(--purple)',
  intro: 'Tap a card to hear its sound!',

  start(game) {
    const { content, stage } = game;
    const tapped = new Set();
    let starGiven = false;
    game.dots(0);

    function card(info, isNew) {
      const el = h('button', { class: `sound-card ${info.kind}`, 'aria-label': info.letters },
        h('span', { class: 'pic' }, info.emoji),
        h('span', { class: 'letters' }, info.letters),
        h('span', { class: 'keyword' }, info.keyword),
      );
      el.addEventListener('click', async () => {
        el.classList.remove('playing');
        void el.offsetWidth;
        el.classList.add('playing', 'played');

        if (isNew && !tapped.has(info.letters)) {
          tapped.add(info.letters);
          el.append(h('span', { class: 'check' }, '✅'));
        }

        // The sound, then the keyword: "/sh/ ... ship"
        const t = talk();
        await t.sound(info.letters);
        await t.pause(250);
        await t.say(info.keyword);

        // Every new card tapped? That's a star!
        if (!starGiven && tapped.size === content.digraphs.length && t.stillMyTurn()) {
          starGiven = true;
          game.earnStar();
          confetti();
          await t.say('You heard all the new sounds!');
        }
      });
      return el;
    }

    const newCards = content.digraphs.map((d) => card(content.sounds[d.letters], true));
    const abcCards = content.letters.map((l) => card(content.sounds[l.letters], false));

    stage.style.justifyContent = 'flex-start';
    stage.replaceChildren(
      h('p', { class: 'section-label' }, '⭐ New'),
      h('div', { class: 'card-grid new' }, newCards),
      h('p', { class: 'section-label' }, 'abc'),
      h('div', { class: 'card-grid abc' }, abcCards),
    );
    game.onCleanup(() => { stage.style.justifyContent = ''; });

    game.introOnce(talk());
  },
};
