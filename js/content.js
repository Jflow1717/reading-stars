// content.js - reads the word lists in the content folder and hands
// the games the words for the week the parent picked.

async function getJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not open ${path}`);
  return response.json();
}

// Loads one unit (or the newest one) plus the shared letter list.
export async function loadContent(unitFile) {
  const [index, letterFile] = await Promise.all([
    getJSON('content/units.json'),
    getJSON('content/letters.json'),
  ]);
  const known = index.units.find((u) => u.file === unitFile);
  const chosen = known || index.units[index.units.length - 1];
  const unit = await getJSON('content/' + chosen.file);

  // One table of every sound the app knows: 'a' ... 'z', plus this unit's digraphs.
  // kind decides the tile color: consonant, vowel, digraph, or buddy (qu).
  const sounds = {};
  for (const letter of letterFile.letters) {
    sounds[letter.letters] = { ...letter, kind: letter.vowel ? 'vowel' : 'consonant' };
  }
  for (const digraph of unit.digraphs || []) {
    sounds[digraph.letters] = { ...digraph, kind: digraph.buddy ? 'buddy' : 'digraph' };
  }

  return {
    units: index.units,
    unitFile: chosen.file,
    unitName: chosen.name,
    unit,
    letters: letterFile.letters,
    digraphs: unit.digraphs || [],
    sounds,
  };
}

// Does this item belong to the week the parent picked? week 0 = earlier unit, always in.
function inWeek(item, week) {
  return week === 'all' || item.week === 0 || item.week === undefined || String(item.week) === String(week);
}

// Words she can tap and spell (review words + this unit's words)
export function practiceWords(content, week) {
  const all = [...(content.unit.reviewWords || []), ...(content.unit.currentWords || [])];
  return all.filter((w) => inWeek(w, week));
}

export function trickWords(content, week) {
  return (content.unit.trickWords || []).filter((w) => inWeek(w, week));
}

export function sentences(content, week) {
  return (content.unit.sentences || []).filter((s) => inWeek(s, week));
}

// Which color tile a sound gets
export function kindOf(content, sound) {
  return (content.sounds[sound] && content.sounds[sound].kind) || 'consonant';
}

// Finds the digraphs (and qu) inside one word, e.g. 'Which' -> [{start:0, letters:'wh'}, {start:3, letters:'ch'}]
// Longer ones are checked first, so a later unit can add sounds like "all" or "ang".
export function findDigraphs(content, word) {
  const lower = word.toLowerCase();
  const targets = content.digraphs.map((d) => d.letters).sort((a, b) => b.length - a.length);
  const found = [];
  let i = 0;
  while (i < lower.length) {
    const match = targets.find((t) => lower.startsWith(t, i));
    if (match) {
      found.push({ start: i, letters: match, kind: kindOf(content, match) });
      i += match.length;
    } else {
      i += 1;
    }
  }
  return found;
}

// Checks the unit file for typing mistakes. Returns a list of problems in plain words
// (an empty list means everything looks right). Shown on the parent screen.
export function checkContent(content) {
  const problems = [];
  const unit = content.unit;
  const seen = new Set();

  for (const listName of ['reviewWords', 'currentWords']) {
    if (!Array.isArray(unit[listName]) || unit[listName].length === 0) {
      problems.push(`The list "${listName}" is empty or missing.`);
      continue;
    }
    for (const w of unit[listName]) {
      if (!w.word) {
        problems.push(`A word in "${listName}" has no "word".`);
        continue;
      }
      if (seen.has(w.word)) problems.push(`"${w.word}" is listed twice.`);
      seen.add(w.word);
      if (!Array.isArray(w.sounds) || w.sounds.length === 0) {
        problems.push(`"${w.word}" has no sounds list.`);
        continue;
      }
      const joined = w.sounds.join('');
      if (joined !== w.word.toLowerCase()) {
        problems.push(`"${w.word}": the sounds ${w.sounds.join(' + ')} spell "${joined}", not "${w.word}".`);
      }
      for (const s of w.sounds) {
        if (!content.sounds[s]) problems.push(`"${w.word}": the app doesn't know the sound "${s}". Add it to the digraphs or letters.`);
      }
    }
  }

  for (const t of unit.trickWords || []) {
    if (!t.word || !/^[a-z]+$/i.test(t.word)) problems.push(`Trick word "${t.word}" should be letters only.`);
  }
  for (const s of unit.sentences || []) {
    if (!s.text) problems.push('A sentence has no "text".');
  }
  for (const d of unit.digraphs || []) {
    if (!d.letters || !d.keyword) problems.push(`A digraph is missing its letters or keyword.`);
  }
  return problems;
}
