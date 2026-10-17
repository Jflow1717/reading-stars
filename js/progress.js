// progress.js - remembers stars, missed words and settings on this tablet.
//
// Everything is saved in the browser's own storage ("localStorage") under one
// name. Nothing leaves the tablet. Clearing Chrome's site data erases it.

const KEY = 'reading-stars-progress';
const STARS_PER_STICKER = 10;

// The stickers she earns, in order (one for every 10 stars).
export const STICKERS = [
  '🦄', '🐉', '🦖', '🐬', '🦋', '🚀', '🌈', '🐼', '🦁', '🐙',
  '🦩', '🐢', '🍦', '🎈', '🏰', '🪐', '🐝', '🦕', '🌻', '🧁',
  '🐧', '🦊', '🍓', '🎠', '🐳', '🌟', '🦜', '🐨', '🍩', '👑',
];

// What a brand-new tablet starts with.
function freshData() {
  return {
    stars: 0,
    stickersSeen: 0,   // how many stickers she has already been shown
    days: {},          // "2026-10-17": stars earned that day
    words: {},         // "fish": { right, wrong, streak, modes, lastMissed, heard }
    settings: {
      unit: null,      // which unit file (null = the newest one)
      week: 'all',     // 1, 2 or 'all'
      voiceRate: 0.85, // how fast the voice talks (1 = normal)
    },
  };
}

let data = load();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && typeof saved === 'object') {
      // Fill in anything missing (for example after an app update adds a new setting)
      const fresh = freshData();
      return { ...fresh, ...saved, settings: { ...fresh.settings, ...saved.settings } };
    }
  } catch (e) {
    // Storage can be blocked or broken. The app still works, it just won't remember.
  }
  return freshData();
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    // See load(): nothing to do if storage is unavailable.
  }
}

// Today's date as "2026-10-17", in the tablet's own time zone.
export function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------- Stars and stickers ----------

export function getStars() {
  return data.stars;
}

export function addStar() {
  data.stars += 1;
  data.days[today()] = (data.days[today()] || 0) + 1;
  save();
  return data.stars;
}

export function stickersEarned() {
  return STICKERS.slice(0, Math.min(STICKERS.length, Math.floor(data.stars / STARS_PER_STICKER)));
}

// Stars still needed for the next sticker, as a fraction 0..1 (for the little bar)
export function nextStickerProgress() {
  return (data.stars % STARS_PER_STICKER) / STARS_PER_STICKER;
}

// Returns a sticker she has earned but not seen yet (or null), and marks it seen.
export function takeNewSticker() {
  const earned = stickersEarned();
  if (earned.length > data.stickersSeen) {
    data.stickersSeen = earned.length;
    save();
    return earned[earned.length - 1];
  }
  return null;
}

// Stars for each of the last 7 days, oldest first: [{ date, label, stars }]
export function lastSevenDays() {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const pad = (n) => String(n).padStart(2, '0');
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    out.push({ date, label: d.toLocaleDateString(undefined, { weekday: 'short' }), stars: data.days[date] || 0 });
  }
  return out;
}

// ---------- Right and missed words ----------

// mode is the game name, like "dictation". heard is what the microphone heard (Read to Me only).
export function recordResult(word, mode, correct, heard) {
  const key = String(word).toLowerCase();
  const w = data.words[key] || (data.words[key] = { right: 0, wrong: 0, streak: 0, modes: {}, lastMissed: null, heard: null });
  if (correct) {
    w.right += 1;
    w.streak += 1;
  } else {
    w.wrong += 1;
    w.streak = 0;
    w.modes[mode] = (w.modes[mode] || 0) + 1;
    w.lastMissed = today();
    if (heard) w.heard = heard;
  }
  save();
}

// A word "needs practice" if she missed it and hasn't since gotten it right 3 times in a row.
export function needsPractice(word) {
  const w = data.words[String(word).toLowerCase()];
  return !!w && w.wrong > 0 && w.streak < 3;
}

// Every word she has ever missed, the ones that still need practice first.
export function missedWords() {
  return Object.entries(data.words)
    .filter(([, w]) => w.wrong > 0)
    .map(([word, w]) => ({ word, ...w, stillLearning: w.streak < 3 }))
    .sort((a, b) => (b.stillLearning - a.stillLearning) || (b.wrong - a.wrong) || String(b.lastMissed).localeCompare(String(a.lastMissed)));
}

// The parent can clear a word from the list once she knows it.
export function clearWord(word) {
  delete data.words[String(word).toLowerCase()];
  save();
}

// ---------- Settings ----------

export function getSetting(name) {
  return data.settings[name];
}

export function setSetting(name, value) {
  data.settings[name] = value;
  save();
}

// ---------- Start over ----------

export function resetAll() {
  const keepSettings = data.settings;
  data = freshData();
  data.settings = keepSettings;
  save();
}
