// speech.js - everything the app says or hears.
//
//   playSound('sh')  plays the sound file audio/sounds/sh.mp3 (or sh.m4a).
//                    The app comes with a file for every sound. Your own
//                    recordings can replace them (see RECORDING-SOUNDS.md).
//   playName('h')    plays the letter's NAME ("aitch") from audio/names/h.m4a.
//   say('fish')      the built-in voice reads a word or sentence.
//
// Why files for sounds: a tablet's built-in voice can read words, but it can't
// make a sound on its own. Asked to say "th", it says the letters "T, H".
//   talk()           for saying several things in a row (see below).
//   listen()         the microphone listens and returns what it heard.
//   startRecording() records her voice so she can play it back.
//   chime('good')    little sound effects made in code (no files needed).

const SOUNDS_FOLDER = 'audio/sounds/';
const NAMES_FOLDER = 'audio/names/';
// .mp3 is checked first, so your own recording (sh.mp3) wins over the file the app came with (sh.m4a)
const AUDIO_TYPES = ['mp3', 'm4a'];

let soundInfo = {};       // 'sh' -> { keyword: 'ship', ... } from the content files
let voiceRate = 0.85;
const found = {};         // 'audio/sounds/sh' -> Promise of a playable address, or null if there is no file
let currentAudio = null;
let turn = 0;             // goes up every time something new starts talking

export function setSoundInfo(map) {
  soundInfo = map;
}

export function setVoiceRate(rate) {
  voiceRate = rate;
}

// ---------- Stopping ----------

// Stop anything that is talking right now.
export function stop() {
  turn += 1;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

// talk() starts a new "turn" and stops whatever was talking before.
// Use it to say several things in order; if she taps something else
// meanwhile, the rest is skipped. Example:
//     const t = talk();
//     await t.sound('sh');
//     await t.say('ship');
export function talk() {
  stop();
  const myTurn = turn;
  const stillMyTurn = () => myTurn === turn;
  return {
    sound: (key) => (stillMyTurn() ? soundNow(key) : Promise.resolve()),
    name: (letter) => (stillMyTurn() ? nameNow(letter) : Promise.resolve()),
    say: (text, options) => (stillMyTurn() ? sayNow(text, options) : Promise.resolve()),
    play: (url) => (stillMyTurn() ? playUrl(url) : Promise.resolve()),
    pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    stillMyTurn,
  };
}

export const playSound = (key) => talk().sound(key);
export const playName = (letter) => talk().name(letter);
export const say = (text, options) => talk().say(text, options);

// ---------- Recorded sounds ----------

// Looks for <folder><key>.mp3, then .m4a. Remembers the answer.
function findFile(folder, key) {
  const id = folder + key;
  if (!(id in found)) {
    found[id] = (async () => {
      for (const type of AUDIO_TYPES) {
        try {
          const response = await fetch(`${folder}${encodeURIComponent(key)}.${type}`);
          const kind = response.headers.get('content-type') || '';
          if (response.ok && !kind.includes('text/html')) {
            const blob = await response.blob();
            if (blob.size > 0) return URL.createObjectURL(blob);
          }
        } catch (e) {
          // No internet and not saved yet: try the next type
        }
      }
      return null;
    })();
  }
  return found[id];
}

export const findRecording = (key) => findFile(SOUNDS_FOLDER, key);

async function soundNow(key) {
  const url = await findRecording(key);
  if (url) return playUrl(url);
  // No sound file (for example a new unit's new sound): say its keyword ("thumb").
  // Never ask the built-in voice to make the sound itself; it reads the letters instead.
  const info = soundInfo[key];
  return sayNow(info && info.keyword ? info.keyword : key);
}

async function nameNow(letter) {
  const url = await findFile(NAMES_FOLDER, letter);
  if (url) return playUrl(url);
  // No file: a single capital letter is the surest way to get the voice to say its name
  return sayNow(letter.toUpperCase());
}

function playUrl(url) {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onended = resolve;
    audio.onerror = resolve;
    audio.onpause = resolve; // stop() pauses it
    audio.play().catch(resolve);
  });
}

// ---------- The built-in voice ----------

let chosenVoice = null;

// Pick an American English voice, preferring one that works without internet.
function pickVoice() {
  if (chosenVoice || !('speechSynthesis' in window)) return chosenVoice;
  const voices = speechSynthesis.getVoices();
  const lang = (v) => (v.lang || '').replace('_', '-').toLowerCase();
  chosenVoice =
    voices.find((v) => lang(v) === 'en-us' && v.localService) ||
    voices.find((v) => lang(v) === 'en-us') ||
    voices.find((v) => lang(v).startsWith('en')) ||
    null;
  return chosenVoice;
}
if ('speechSynthesis' in window) {
  speechSynthesis.addEventListener?.('voiceschanged', () => {
    chosenVoice = null;
    pickVoice();
  });
}

function sayNow(text, options = {}) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window) || !text) return resolve();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    const voice = pickVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = options.rate ?? voiceRate;
    utterance.pitch = options.pitch ?? 1.1;

    // Some tablets forget to say "I'm done", so we also give up after a while.
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, 2000 + text.length * 160);
    utterance.onend = finish;
    utterance.onerror = finish;
    speechSynthesis.speak(utterance);
  });
}

// ---------- Sound effects (made in code, no files) ----------

let audioContext = null;

export function chime(kind) {
  try {
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const notes = {
      good: [523, 659, 784, 1047],
      star: [784, 988, 1175, 1568, 2093],
      pop: [660],
      tick: [880],
      oops: [330, 262],
    }[kind] || [660];
    const start = audioContext.currentTime;
    notes.forEach((frequency, i) => {
      const osc = audioContext.createOscillator();
      const volume = audioContext.createGain();
      osc.type = kind === 'oops' ? 'triangle' : 'sine';
      osc.frequency.value = frequency;
      const t = start + i * 0.09;
      volume.gain.setValueAtTime(0.0001, t);
      volume.gain.exponentialRampToValueAtTime(kind === 'oops' ? 0.12 : 0.22, t + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      osc.connect(volume).connect(audioContext.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  } catch (e) {
    // Sound effects are a bonus; ignore if the tablet won't play them.
  }
}

// ---------- Listening (Read to Me) ----------

let currentListener = null;

export function canListen() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

// Listens once. Resolves with a list of guesses at what she said (best guess first),
// or an empty list if she didn't say anything. Rejects with an error name like
// 'not-allowed' (no microphone permission) or 'network' (no internet).
export function listen() {
  return new Promise((resolve, reject) => {
    const Recognizer = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognizer) return reject(new Error('unsupported'));
    stop(); // stop talking so the microphone doesn't hear the app
    const recognizer = new Recognizer();
    recognizer.lang = 'en-US';
    recognizer.interimResults = false;
    recognizer.continuous = false;
    recognizer.maxAlternatives = 5;

    const heard = [];
    let problem = null;
    recognizer.onresult = (event) => {
      for (const result of event.results) {
        for (const guess of result) heard.push(guess.transcript);
      }
    };
    recognizer.onerror = (event) => {
      problem = event.error;
    };
    recognizer.onend = () => {
      clearTimeout(timer);
      currentListener = null;
      if (heard.length) resolve(heard);
      else if (problem && problem !== 'no-speech' && problem !== 'aborted') reject(new Error(problem));
      else resolve([]);
    };
    // Stop listening after 7 seconds no matter what
    const timer = setTimeout(() => recognizer.stop(), 7000);
    currentListener = recognizer;
    try {
      recognizer.start();
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
}

export function stopListening() {
  if (currentListener) {
    try { currentListener.abort(); } catch (e) { /* already stopped */ }
    currentListener = null;
  }
}

// ---------- Recording her voice ----------

export function canRecord() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
}

// Starts recording. Returns { stop() } - stop() gives back an address you can play().
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const pieces = [];
  recorder.ondataavailable = (event) => pieces.push(event.data);
  const done = new Promise((resolve) => {
    recorder.onstop = () => {
      // Let go of the microphone right away, so listening works afterwards
      stream.getTracks().forEach((track) => track.stop());
      resolve(URL.createObjectURL(new Blob(pieces, { type: recorder.mimeType || 'audio/webm' })));
    };
  });
  recorder.start();
  return {
    stop() {
      if (recorder.state !== 'inactive') recorder.stop();
      return done;
    },
  };
}

// ---------- Kind words ----------

const PRAISE = ['Great job!', 'You got it!', 'Super reading!', 'Awesome!', 'Wow, nice work!', 'Yes! Way to go!', 'You are a reading star!', 'Fantastic!'];
const TRY_AGAIN = ['Almost! Try again.', 'So close! Try one more time.', 'Good try! Let\'s try again.'];

export const praise = () => PRAISE[Math.floor(Math.random() * PRAISE.length)];
export const tryAgain = () => TRY_AGAIN[Math.floor(Math.random() * TRY_AGAIN.length)];
