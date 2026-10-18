// sw.js - the "service worker". It lets the app open with no internet.
//
// How it works: every time the app asks for a file, we try the internet first
// (so you always get the newest version), and save a copy. If there is no
// internet, we hand back the saved copy instead.
//
// You never need to edit this file, even when you add new units or sounds.

const CACHE = 'reading-stars';

// Files saved the very first time the app is opened, so it works offline right away.
const APP_FILES = [
  './',
  'index.html',
  'manifest.json',
  'css/style.css',
  'js/main.js',
  'js/content.js',
  'js/progress.js',
  'js/speech.js',
  'js/ui.js',
  'js/parent.js',
  'js/modes/sound-cards.js',
  'js/modes/tap-it-out.js',
  'js/modes/dictation.js',
  'js/modes/trick-words.js',
  'js/modes/detective.js',
  'js/modes/read-to-me.js',
  'content/units.json',
  'content/letters.json',
  'content/unit-03.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

// The sound files (sh, ch, a, b...) and letter names (a, b, c...) that come with the app
const SOUND_NAMES = ['wh', 'ch', 'sh', 'th', 'ck', 'qu', ...'abcdefghijklmnoprstuvwxyz'];
const SOUND_FILES = [
  ...SOUND_NAMES.map((s) => `audio/sounds/${s}.m4a`),
  ...'abcdefghijklmnopqrstuvwxyz'.split('').map((l) => `audio/names/${l}.m4a`),
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(async (cache) => {
    await cache.addAll(APP_FILES);
    // Sound files one at a time, so one missing file doesn't stop the rest
    await Promise.all(SOUND_FILES.map((file) => cache.add(file).catch(() => {})));
  }));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  // Only plain "get a file" requests. Audio "range" requests go straight through.
  if (request.method !== 'GET' || request.headers.has('range')) return;

  // For the app's own files, always ask the server "has this changed?" so edits show up right away.
  const ownFile = new URL(request.url).origin === self.location.origin;
  const download = ownFile ? fetch(request.url, { cache: 'no-cache' }) : fetch(request);

  event.respondWith(
    download
      .then((response) => {
        // Save good answers (and font files from Google) for offline use.
        if (response.ok || response.type === 'opaque') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request, { ignoreSearch: true }).then((saved) => saved || Response.error())
      )
  );
});
