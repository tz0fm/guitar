'use strict';
// Guitar: an offline guitar reference. All chart content lives in data.js; this file
// does the music theory (note spelling, shape placement), draws the diagrams as SVG
// and plays notes with a small plucked-string synth.

/* ---------- Helpers ---------- */

const $ = (id) => document.getElementById(id);
const mod = (n, m) => ((n % m) + m) % m;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- Music theory ---------- */

const LETTERS = 'CDEFGAB';
const NAT_PC = [0, 2, 4, 5, 7, 9, 11];
const OPEN_MIDI = [40, 45, 50, 55, 59, 64];            // E2 A2 D3 G3 B3 E4
const OPEN_PC = OPEN_MIDI.map((m) => m % 12);
const STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'E'];
const STRING_ORD = ['6th', '5th', '4th', '3rd', '2nd', '1st'];
const DEG_SEMI = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 8: 12, 9: 14, 10: 16, 11: 17, 12: 19, 13: 21 };
// Default spelling of each pitch class as a root. Minor-flavoured chords and keys use C♯ / G♯.
const MAJ_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MIN_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function noteInfo(name) {
  const li = LETTERS.indexOf(name[0]);
  let acc = 0;
  for (const c of name.slice(1)) acc += c === '#' ? 1 : -1;
  return { li, pc: mod(NAT_PC[li] + acc, 12) };
}
function ivInfo(sym) {
  if (sym === 'R') return { deg: 1, semi: 0 };
  const m = /^([b#]*)(\d+)$/.exec(sym);
  const acc = [...m[1]].reduce((a, c) => a + (c === '#' ? 1 : -1), 0);
  return { deg: Number(m[2]), semi: DEG_SEMI[m[2]] + acc };
}
// The note `sym` (an interval like 'b3') above `root`, spelled correctly (E♭ minor → G♭, not F♯).
function spell(root, sym) {
  const r = noteInfo(root), iv = ivInfo(sym);
  const li = (r.li + iv.deg - 1) % 7;
  const acc = mod(r.pc + iv.semi - NAT_PC[li] + 6, 12) - 6;
  return LETTERS[li] + (acc > 0 ? '#'.repeat(acc) : 'b'.repeat(-acc));
}
const pretty = (n) => n[0] + n.slice(1).replace(/#/g, '♯').replace(/b/g, '♭');
const prettySym = (s) => s.replace(/#/g, '♯').replace(/b/g, '♭');
const isMinorish = (type) => CHORD_TYPES[type].f.includes('b3');
const rootName = (pc, minor) => (minor ? MIN_NAMES : MAJ_NAMES)[pc];
const chordName = (root, type) => pretty(root) + CHORD_TYPES[type].sym;
const chordNotes = (root, type) => CHORD_TYPES[type].f.map((s) => pretty(spell(root, s)));
const formulaText = (type) => CHORD_TYPES[type].f.map(prettySym).join(' ');

// Label for a sounding pitch class inside a chord: its interval symbol or its note name.
function chordLabel(pc, root, type, mode) {
  const rootPc = noteInfo(root).pc;
  const sym = CHORD_TYPES[type].f.find((s) => mod(ivInfo(s).semi, 12) === mod(pc - rootPc, 12));
  if (!sym) return '';
  return mode === 'notes' ? pretty(spell(root, sym)) : prettySym(sym);
}

const fretText = (f) => (f === 0 ? 'open string' : `fret ${f}`);
const parseShape = (s) => [...s].map((c) => (c === 'x' ? null : Number(c)));

// Slide a movable shape so its root string plays `rootPc`.
function placeMovable(shape, rootPc) {
  const rel = parseShape(shape.s);
  const minRel = Math.min(...rel.filter((f) => f !== null));
  let k = mod(rootPc - OPEN_PC[shape.r] - rel[shape.r], 12);
  // Lowest place on the neck; at the very bottom the first fret becomes the open strings
  // (the E-shape barre chord at fret 0 is the open E chord).
  while (minRel + k - 12 >= 0) k -= 12;
  return {
    frets: rel.map((f) => (f === null ? null : f + k)),
    barres: (shape.b || []).map(([f, a, b]) => [f + k, a, b]).filter(([f]) => f > 0),
    r: shape.r,
  };
}
function openShape(type, key) {
  const sh = BASIC_CHORDS[type] && BASIC_CHORDS[type][key];
  return sh ? { frets: parseShape(sh.s), barres: sh.b || [], r: sh.r } : null;
}

/* ---------- Settings ---------- */

const STORE_KEY = 'guitar.settings.v1';
const TABS = ['chords', 'scales', 'keys', 'neck', 'theory'];
const LABEL_MODES = { dots: 'Dots', intervals: 'Intervals', notes: 'Notes' };
const DEFAULTS = {
  tab: 'chords', chordMode: 'open', labels: 'intervals', openKey: 'C', movRoot: 0, movType: 'maj',
  scale: 'ionian', scaleRoot: 0, scalePos: 0, scaleLabels: 'intervals',
  keyMode: 'major', majorKey: 'C', minorKey: 'A', neckNote: -1, neckSpell: 'sharps', theoryRoot: 0,
};
function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { /* storage unavailable */ }
  const pick = (k, ok) => (ok(s[k]) ? s[k] : DEFAULTS[k]);
  const isPc = (v) => Number.isInteger(v) && v >= 0 && v < 12;
  return {
    tab: pick('tab', (v) => TABS.includes(v)),
    chordMode: pick('chordMode', (v) => v === 'open' || v === 'movable'),
    labels: pick('labels', (v) => Object.hasOwn(LABEL_MODES, v)),
    openKey: pick('openKey', (v) => BASIC_KEYS.includes(v)),
    movRoot: pick('movRoot', isPc),
    movType: pick('movType', (v) => Object.hasOwn(MOVABLE_CHORDS, v)),
    scale: pick('scale', (v) => SCALES.some((x) => x.id === v)),
    scaleRoot: pick('scaleRoot', isPc),
    scalePos: pick('scalePos', (v) => Number.isInteger(v) && v >= 0 && v <= 5),
    scaleLabels: pick('scaleLabels', (v) => v === 'intervals' || v === 'notes'),
    keyMode: pick('keyMode', (v) => v === 'major' || v === 'minor'),
    majorKey: pick('majorKey', (v) => MAJOR_KEYS.includes(v)),
    minorKey: pick('minorKey', (v) => MINOR_KEYS.includes(v)),
    neckNote: pick('neckNote', (v) => v === -1 || isPc(v)),
    neckSpell: pick('neckSpell', (v) => v === 'sharps' || v === 'flats'),
    theoryRoot: pick('theoryRoot', isPc),
  };
}
const state = loadSettings();
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}

/* ---------- Sound: Karplus–Strong plucked string ---------- */

let ctx = null, master = null;
const bufferCache = new Map();
let voices = [];

function ensureAudio() {
  if (!ctx) {
    // iOS 17+: play through the ring/silent switch, like a music app.
    if (navigator.audioSession) {
      try { navigator.audioSession.type = 'playback'; } catch { /* ignore */ }
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
    // Unlock inside the user gesture with a one-sample silent buffer.
    const unlock = ctx.createBufferSource();
    unlock.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    unlock.connect(ctx.destination);
    unlock.start(0);
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
}

// One plucked note, rendered once per pitch and cached. The delay line has an integer
// length, so playbackRate corrects the pitch to exactly `freq`.
function pluck(midi) {
  if (bufferCache.has(midi)) return bufferCache.get(midi);
  const sr = ctx.sampleRate;
  const freq = 440 * 2 ** ((midi - 69) / 12);
  const N = Math.max(2, Math.round(sr / freq - 0.5));
  const len = Math.round(sr * 2.6);
  const buf = ctx.createBuffer(1, len, sr);
  const y = buf.getChannelData(0);
  // Excitation: noise, softened a little and with a pick-position comb for a guitar-like tone.
  let prev = 0;
  for (let i = 0; i < N; i++) { const w = Math.random() * 2 - 1; prev = prev * 0.45 + w * 0.55; y[i] = prev; }
  const pickAt = Math.max(1, Math.round(N * 0.18));
  for (let i = N - 1; i >= pickAt; i--) y[i] -= 0.6 * y[i - pickAt];
  const decay = Math.min(0.9985, 0.994 + midi * 0.00006);
  for (let i = N; i < len; i++) y[i] = decay * 0.5 * (y[i - N] + y[i - N - 1 < 0 ? 0 : i - N - 1]);
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(y[i]));
  const fadeFrom = len - Math.round(sr * 0.25);
  for (let i = 0; i < len; i++) {
    y[i] /= peak || 1;
    if (i > fadeFrom) y[i] *= (len - i) / (len - fadeFrom);
  }
  const out = { buf, rate: freq / (sr / (N + 0.5)) };
  bufferCache.set(midi, out);
  return out;
}

function playNote(midi, when = 0, gain = 0.32) {
  ensureAudio();
  const { buf, rate } = pluck(midi);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(master);
  const t = ctx.currentTime + 0.01 + when;
  src.start(t);
  const v = { src, g };
  voices.push(v);
  src.onended = () => { voices = voices.filter((x) => x !== v); };
}

function silence() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const { src, g } of voices) {
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0, t, 0.03);
    try { src.stop(t + 0.2); } catch { /* already stopped */ }
  }
  voices = [];
}

// Strum low to high, like a downstroke.
function strum(frets) {
  stopScalePlayback();
  silence();
  const midis = frets.map((f, i) => (f === null ? null : OPEN_MIDI[i] + f)).filter((m) => m !== null);
  midis.forEach((m, i) => playNote(m, i * 0.035, 0.42 / Math.sqrt(midis.length)));
}

/* ---------- Chord diagram (SVG) ---------- */

// shape: { frets: [6], barres: [[fret, from, to]], r }; `label(stringIndex, fret)` gives dot text.
function chordSVG(shape, label) {
  const { frets, barres, r } = shape;
  const fretted = frets.filter((f) => f !== null && f > 0);
  const max = fretted.length ? Math.max(...fretted) : 0;
  const min = fretted.length ? Math.min(...fretted) : 1;
  const start = max <= 4 ? 1 : min;
  const rows = Math.max(4, max - start + 1);
  const SX = 17, FY = 21, L = 32, T = 24, R = 7.2;
  const W = L + 5 * SX + 16, H = T + rows * FY + 6;
  const x = (s) => L + s * SX;
  const y = (f) => T + (f - start + 0.5) * FY;
  let o = `<svg class="dg" viewBox="0 0 ${W} ${H}" aria-hidden="true">`;
  for (let i = 0; i <= rows; i++) o += `<line class="fret" x1="${x(0)}" x2="${x(5)}" y1="${T + i * FY}" y2="${T + i * FY}"/>`;
  for (let s = 0; s < 6; s++) o += `<line class="str" x1="${x(s)}" x2="${x(s)}" y1="${T}" y2="${T + rows * FY}"/>`;
  if (start === 1) o += `<line class="nut" x1="${x(0) - 0.5}" x2="${x(5) + 0.5}" y1="${T - 1}" y2="${T - 1}"/>`;
  else o += `<text class="fretno" x="${L - 10}" y="${y(start)}">${start}fr</text>`;
  // Open / muted markers above the nut
  frets.forEach((f, s) => {
    const cx = x(s), cy = T - 12;
    if (f === null) {
      o += `<path class="xmark" d="M${cx - 3.6} ${cy - 3.6}L${cx + 3.6} ${cy + 3.6}M${cx + 3.6} ${cy - 3.6}L${cx - 3.6} ${cy + 3.6}"/>`;
    } else if (f === 0) {
      const text = label ? label(s, 0) : '';
      o += `<circle class="mark${s === r ? ' root' : ''}" cx="${cx}" cy="${cy}" r="${text ? 6.2 : 4.2}"/>`;
      if (text) o += `<text class="olabel${s === r ? ' rlabel' : ''}" x="${cx}" y="${cy + 0.3}">${esc(text)}</text>`;
    }
  });
  for (const [f, a, b] of barres) {
    o += `<rect class="barre" x="${x(a) - R}" y="${y(f) - R}" width="${x(b) - x(a) + 2 * R}" height="${2 * R}" rx="${R}"/>`;
  }
  frets.forEach((f, s) => {
    if (f === null || f === 0) return;
    const covered = barres.some(([bf, a, b]) => bf === f && s >= a && s <= b);
    const text = label ? label(s, f) : '';
    if (s === r) o += `<circle class="root" cx="${x(s)}" cy="${y(f)}" r="${R}"/>`;
    else if (!covered || text) o += `<circle class="dot" cx="${x(s)}" cy="${y(f)}" r="${R}"/>`;
    if (text) o += `<text class="dlabel${s === r ? ' rlabel' : ''}" x="${x(s)}" y="${y(f) + 0.3}">${esc(text)}</text>`;
  });
  return o + '</svg>';
}

// A tappable chord card. `frets` go in a data attribute so a tap can strum them.
function chordCard(shape, root, type, title, sub) {
  const label = state.labels === 'dots' ? null
    : (s, f) => chordLabel(mod(OPEN_PC[s] + f, 12), root, type, state.labels);
  return `<button class="ccard" data-strum="${shape.frets.map((f) => (f === null ? 'x' : f)).join(',')}">
    <span class="cname">${esc(title)}</span>
    ${chordSVG(shape, label)}
    <span class="csub">${esc(sub || '')}</span>
  </button>`;
}

function flashCard(card) {
  document.querySelectorAll('.ccard.playing').forEach((c) => c.classList.remove('playing'));
  card.classList.add('playing');
  clearTimeout(card._t);
  card._t = setTimeout(() => card.classList.remove('playing'), 900);
}

document.addEventListener('click', (e) => {
  const card = e.target.closest('[data-strum]');
  if (card) {
    strum(card.dataset.strum.split(',').map((v) => (v === 'x' ? null : Number(v))));
    flashCard(card);
  }
});

/* ---------- Small UI builders ---------- */

function buildSeg(el, options, current, onPick) {
  el.innerHTML = options.map(([v, html]) =>
    `<button data-v="${esc(v)}" aria-pressed="${String(v) === String(current)}">${html}</button>`).join('');
  el.onclick = (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    [...el.children].forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
    onPick(b.dataset.v);
  };
}

function buildNotePicker(el, current, names, onPick, allowNone = false) {
  el.innerHTML = names.map((n, pc) =>
    `<button data-pc="${pc}" aria-pressed="${pc === current}">${pretty(n)}</button>`).join('');
  el.onclick = (e) => {
    const b = e.target.closest('button[data-pc]');
    if (!b) return;
    let pc = Number(b.dataset.pc);
    if (allowNone && pc === current) pc = -1;
    current = pc;
    [...el.children].forEach((c) => c.setAttribute('aria-pressed', String(Number(c.dataset.pc) === pc)));
    onPick(pc);
  };
  return (pc) => { current = pc; [...el.children].forEach((c) => c.setAttribute('aria-pressed', String(Number(c.dataset.pc) === pc))); };
}

/* ---------- Tabs ---------- */

const views = { chords: $('chordsView'), scales: $('scalesView'), keys: $('keysView'), neck: $('neckView'), theory: $('theoryView') };
function setTab(tab) {
  state.tab = tab;
  save();
  for (const b of $('tabs').children) b.setAttribute('aria-pressed', String(b.dataset.tab === tab));
  for (const [k, v] of Object.entries(views)) v.hidden = k !== tab;
  if (tab !== 'scales') stopScalePlayback();
}
$('tabs').onclick = (e) => {
  const b = e.target.closest('button[data-tab]');
  if (b) setTab(b.dataset.tab);
};

/* ---------- Chords tab ---------- */

function renderChords() {
  $('openPane').hidden = state.chordMode !== 'open';
  $('movPane').hidden = state.chordMode !== 'movable';
  if (state.chordMode === 'open') renderOpen(); else renderMovable();
}

function renderOpen() {
  const key = state.openKey;
  $('openGrid').innerHTML = BASIC_ROWS.map(({ type }) =>
    chordCard(openShape(type, key), key, type, chordName(key, type), chordNotes(key, type).join(' '))).join('');
}

function renderMovable() {
  const type = state.movType;
  const root = rootName(state.movRoot, isMinorish(type));
  const t = CHORD_TYPES[type];
  $('movHead').innerHTML = `
    <div><div class="big">${esc(chordName(root, type))}</div><div class="formula">${esc(t.name)} · ${esc(formulaText(type))}</div></div>
    <div class="notes-line">${esc(chordNotes(root, type).join(' '))}</div>`;
  $('movGrid').innerHTML = MOVABLE_CHORDS[type].map((sh, i) => {
    const placed = placeMovable(sh, state.movRoot);
    const rootFret = placed.frets[placed.r];
    return chordCard(placed, root, type, VOICING_NAMES[i], `root: ${STRING_ORD[sh.r]} string, ${fretText(rootFret)}`);
  }).join('');
}

function initChords() {
  buildSeg($('chordMode'), [['open', 'Open chords'], ['movable', 'Movable shapes']], state.chordMode, (v) => {
    state.chordMode = v; save(); renderChords();
  });
  buildSeg($('labelMode'), Object.entries(LABEL_MODES).map(([k, v]) => [k, v]), state.labels, (v) => {
    state.labels = v; save(); renderChords();
  });
  buildSeg($('openKey'), BASIC_KEYS.map((k) => [k, k]), state.openKey, (v) => {
    state.openKey = v; save(); renderOpen();
  });
  buildNotePicker($('movRoot'), state.movRoot, MAJ_NAMES, (pc) => {
    state.movRoot = pc; save(); renderMovable();
  });
  const typeBtn = (type) => {
    const sym = CHORD_TYPES[type].sym;
    return `<button data-type="${esc(type)}" aria-pressed="${type === state.movType}">${esc(sym === '' ? 'maj' : sym)}</button>`;
  };
  $('movType').innerHTML = MOVABLE_GROUPS.map((g) =>
    `<div class="glabel">${g.name}</div><div class="chips">${g.types.map(typeBtn).join('')}</div>`).join('');
  $('movType').onclick = (e) => {
    const b = e.target.closest('button[data-type]');
    if (!b) return;
    state.movType = b.dataset.type; save();
    $('movType').querySelectorAll('button').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
    renderMovable();
  };
  renderChords();
}

/* ---------- Chord sheet (opened from Keys and Theory) ---------- */

function openChordSheet(root, type) {
  const t = CHORD_TYPES[type];
  const open = BASIC_KEYS.includes(root) ? openShape(type, root) : null;
  const movable = MOVABLE_CHORDS[type];
  const rootPc = noteInfo(root).pc;
  let html = `<div class="grab"></div>
    <div class="sheet-top"><div class="chord-head" style="flex:1">
      <div><div class="big">${esc(chordName(root, type))}</div><div class="formula">${esc(t.name)} · ${esc(formulaText(type))}</div></div>
      <div class="notes-line">${esc(chordNotes(root, type).join(' '))}</div>
    </div><button class="xbtn" data-close aria-label="Close">✕</button></div>`;
  if (open) html += `<div class="section-title">Open chord</div><div class="cgrid three">${chordCard(open, root, type, chordName(root, type), '')}</div>`;
  if (movable) {
    html += `<div class="section-title">Movable shapes</div><div class="cgrid three">${movable.map((sh, i) => {
      const placed = placeMovable(sh, rootPc);
      return chordCard(placed, root, type, i < 3 ? `Root ${6 - i}` : `Alt ${i - 2}`, fretText(placed.frets[placed.r]));
    }).join('')}</div>`;
  } else {
    html += `<p class="hint" style="margin-top:4px">The chart has no shapes for this chord, but you can hear its notes.</p>`;
  }
  html += `<button class="pill" data-arp="${esc(root)}|${esc(type)}">▶ Hear the notes one by one</button>`;
  $('sheet').innerHTML = html;
  $('sheetBg').hidden = false;
  $('sheet').scrollTop = 0;
  // Play the chord straight away: the first diagram, or the notes.
  const first = $('sheet').querySelector('[data-strum]');
  if (first) { strum(first.dataset.strum.split(',').map((v) => (v === 'x' ? null : Number(v)))); flashCard(first); }
  else arpeggiate(root, type);
}
function closeSheet() { $('sheetBg').hidden = true; }
$('sheetBg').addEventListener('click', (e) => {
  if (e.target === $('sheetBg') || e.target.closest('[data-close]')) closeSheet();
  const arp = e.target.closest('[data-arp]');
  if (arp) { const [root, type] = arp.dataset.arp.split('|'); arpeggiate(root, type); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

function arpeggiate(root, type) {
  silence();
  const base = 48 + noteInfo(root).pc;   // root in the octave above C3
  const notes = CHORD_TYPES[type].f.map((s) => base + ivInfo(s).semi);
  notes.forEach((m, i) => playNote(m, i * 0.32, 0.4));
  notes.forEach((m) => playNote(m, notes.length * 0.32 + 0.2, 0.42 / Math.sqrt(notes.length)));
}

/* ---------- Fretboard (vertical neck) ---------- */

const NECK_FRETS = 15;
const NK = { L: 40, SX: 52, T: 30, FY: 44, R: 17 };
NK.W = NK.L + 5 * NK.SX + 30;
NK.H = NK.T + (NECK_FRETS + 1) * NK.FY + 6;
const nx = (s) => NK.L + s * NK.SX;
const ny = (f) => NK.T + (f + 0.5) * NK.FY;   // row 0 = open strings, above the nut

// notes: [{ s, f, text, cls }]; band: [lo, hi] frets to shade.
function neckSVG(notes, band) {
  const { L, SX, T, FY, R, W, H } = NK;
  const top = T + FY;          // the nut
  const bottom = T + (NECK_FRETS + 1) * FY;
  let o = `<svg class="neck" viewBox="0 0 ${W} ${H}">`;
  o += `<rect class="board" x="${nx(0) - 18}" y="${top}" width="${5 * SX + 36}" height="${bottom - top}" rx="4"/>`;
  if (band) {
    const y1 = band[0] === 0 ? T + 2 : T + band[0] * FY;
    const y2 = T + (band[1] + 1) * FY;
    o += `<rect class="band" id="neckBand" x="4" y="${y1}" width="${W - 8}" height="${y2 - y1}" rx="12"/>`;
  }
  for (const f of [3, 5, 7, 9, 15]) o += `<circle class="inlay" cx="${nx(2.5)}" cy="${ny(f)}" r="7"/>`;
  o += `<circle class="inlay" cx="${nx(1.5)}" cy="${ny(12)}" r="7"/><circle class="inlay" cx="${nx(3.5)}" cy="${ny(12)}" r="7"/>`;
  for (let f = 1; f <= NECK_FRETS; f++) {
    o += `<line class="fret" x1="${nx(0) - 18}" x2="${nx(5) + 18}" y1="${T + (f + 1) * FY}" y2="${T + (f + 1) * FY}"/>`;
    o += `<text class="fno" x="${L - 26}" y="${ny(f)}">${f}</text>`;
  }
  o += `<text class="fno" x="${L - 26}" y="${ny(0)}">0</text>`;
  for (let s = 0; s < 6; s++) {
    o += `<line class="str" x1="${nx(s)}" x2="${nx(s)}" y1="${top}" y2="${bottom}" stroke-width="${2.6 - s * 0.32}"/>`;
    o += `<text class="sname" x="${nx(s)}" y="${T - 12}">${STRING_NAMES[s]}</text>`;
  }
  o += `<line class="nut" x1="${nx(0) - 18}" x2="${nx(5) + 18}" y1="${top}" y2="${top}"/>`;
  for (const n of notes) {
    o += `<g class="n ${n.cls || ''}" data-s="${n.s}" data-f="${n.f}"><circle cx="${nx(n.s)}" cy="${ny(n.f)}" r="${R}"/>` +
      `<text x="${nx(n.s)}" y="${ny(n.f) + 0.5}">${esc(n.text)}</text></g>`;
  }
  return o + '</svg>';
}

/* ---------- Scales tab ---------- */

let scaleTimers = [];
function stopScalePlayback() {
  scaleTimers.forEach(clearTimeout);
  scaleTimers = [];
  document.querySelectorAll('#scaleNeck .n.on').forEach((n) => n.classList.remove('on'));
  const b = $('scalePlay');
  if (b) b.textContent = state.scalePos ? '▶ Play this position' : '▶ Play the scale';
}

const curScale = () => SCALES.find((s) => s.id === state.scale);
const scaleRootName = () => rootName(state.scaleRoot, curScale().minor);

// The fret window of a position for the current key: [lo, hi], within frets 0..15.
function positionWindow(scale, rootPc, n) {
  const majRoot = scale.minor ? rootPc + 3 : rootPc;
  const r = mod(majRoot - OPEN_PC[0], 12);
  let [a, b] = scale.pos[n];
  let lo = r + a, hi = r + b;
  if (lo > 11) { lo -= 12; hi -= 12; }
  return [Math.max(0, lo), hi];
}

function scaleNotes() {
  const scale = curScale(), root = scaleRootName(), rootPc = state.scaleRoot;
  const bySemi = new Map(scale.notes.map((s) => [mod(ivInfo(s).semi, 12), s]));
  const win = state.scalePos ? positionWindow(scale, rootPc, state.scalePos) : null;
  const notes = [];
  for (let s = 0; s < 6; s++) {
    for (let f = 0; f <= NECK_FRETS; f++) {
      const sym = bySemi.get(mod(OPEN_PC[s] + f - rootPc, 12));
      if (!sym) continue;
      const inWin = !win || (f >= win[0] && f <= win[1]);
      const cls = [sym === 'R' ? 'root' : '', (scale.blue || []).includes(sym) ? 'blue' : '', inWin ? '' : 'dim'].join(' ');
      const text = state.scaleLabels === 'notes' ? pretty(spell(root, sym)) : (sym === 'R' ? 'R' : prettySym(sym));
      notes.push({ s, f, text, cls, inWin, midi: OPEN_MIDI[s] + f });
    }
  }
  return { notes, win };
}

function renderScale() {
  stopScalePlayback();
  const scale = curScale(), root = scaleRootName();
  const noteSet = new Set(scale.notes);
  $('scaleHead').innerHTML = `
    <div class="scale-title">${scale.roman ? `<span class="roman">${scale.roman}</span>` : ''}
      <span class="name">${esc(pretty(root))} ${esc(scale.name)}</span><span class="sub">${esc(scale.sub)}</span></div>
    <div class="degrees">${scale.degrees.map((d) => {
      const cls = d === 'R' ? 'root' : (scale.blue || []).includes(d) ? 'blue' : noteSet.has(d) ? '' : 'off';
      return `<div class="deg ${cls}"><b>${d === 'R' ? 'R' : esc(prettySym(d))}</b><span>${noteSet.has(d) ? esc(pretty(spell(root, d))) : ''}</span></div>`;
    }).join('')}</div>
    <div class="count">${scale.notes.length} notes${scale.blue ? ' · blue note in blue' : ''}</div>`;
  const { notes, win } = scaleNotes();
  $('scaleNeck').innerHTML = neckSVG(notes, win);
  if (win) {
    const band = $('neckBand');
    requestAnimationFrame(() => band && band.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }
  $('scalePlay').textContent = state.scalePos ? '▶ Play this position' : '▶ Play the scale';
}

// Play the notes of the selected position low to high and back; with "All", one octave from
// the lowest root on the low E string.
function playScale() {
  if (scaleTimers.length) { stopScalePlayback(); silence(); return; }
  ensureAudio();
  silence();
  const scale = curScale();
  const { notes } = scaleNotes();
  let seq;
  if (state.scalePos) {
    const seen = new Set();
    seq = notes.filter((n) => n.inWin).sort((a, b) => a.midi - b.midi || b.s - a.s)
      .filter((n) => !seen.has(n.midi) && seen.add(n.midi));
  } else {
    const startFret = mod(state.scaleRoot - OPEN_PC[0], 12);
    const lowRoot = OPEN_MIDI[0] + startFret;
    const pos = positionWindow(scale, state.scaleRoot, scale.minor ? 5 : 1);
    const seen = new Set();
    seq = notes.filter((n) => n.midi >= lowRoot && n.midi <= lowRoot + 12)
      .sort((a, b) => a.midi - b.midi ||
        Math.abs(a.f - (pos[0] + pos[1]) / 2) - Math.abs(b.f - (pos[0] + pos[1]) / 2))
      .filter((n) => !seen.has(n.midi) && seen.add(n.midi));
  }
  seq = seq.concat(seq.slice(0, -1).reverse());
  const dt = 0.3;
  const els = new Map([...document.querySelectorAll('#scaleNeck .n')].map((g) => [`${g.dataset.s},${g.dataset.f}`, g]));
  seq.forEach((n, i) => {
    playNote(n.midi, i * dt, 0.42);
    scaleTimers.push(setTimeout(() => {
      document.querySelectorAll('#scaleNeck .n.on').forEach((x) => x.classList.remove('on'));
      const g = els.get(`${n.s},${n.f}`);
      if (g) g.classList.add('on');
    }, i * dt * 1000 + 10));
  });
  scaleTimers.push(setTimeout(stopScalePlayback, seq.length * dt * 1000 + 300));
  $('scalePlay').textContent = '■ Stop';
}

function initScales() {
  $('scaleType').innerHTML = SCALES.map((s) =>
    `<button data-id="${s.id}" aria-pressed="${s.id === state.scale}">${esc(s.name)}</button>`).join('');
  $('scaleType').onclick = (e) => {
    const b = e.target.closest('button[data-id]');
    if (!b) return;
    state.scale = b.dataset.id; save();
    $('scaleType').querySelectorAll('button').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
    renderScaleRootPicker();
    renderScale();
  };
  renderScaleRootPicker();
  buildSeg($('scalePos'), [[0, 'All'], ...POSITIONS.map((p) => [p.n, `${p.n}<small>${p.shape}</small>`])], state.scalePos, (v) => {
    state.scalePos = Number(v); save(); renderScale();
  });
  buildSeg($('scaleLabels'), [['intervals', 'Intervals'], ['notes', 'Note names']], state.scaleLabels, (v) => {
    state.scaleLabels = v; save(); renderScale();
  });
  $('scalePlay').onclick = playScale;
  $('scaleNeck').onclick = (e) => {
    const g = e.target.closest('.n');
    if (g) playNote(OPEN_MIDI[g.dataset.s] + Number(g.dataset.f), 0, 0.45);
  };
  renderScale();
}
function renderScaleRootPicker() {
  buildNotePicker($('scaleRoot'), state.scaleRoot, curScale().minor ? MIN_NAMES : MAJ_NAMES, (pc) => {
    state.scaleRoot = pc; save(); renderScale();
  });
}

/* ---------- Neck tab ---------- */

function renderNeck() {
  const names = state.neckSpell === 'flats' ? FLAT_NAMES : SHARP_NAMES;
  const notes = [];
  for (let s = 0; s < 6; s++) {
    for (let f = 0; f <= NECK_FRETS; f++) {
      const pc = mod(OPEN_PC[s] + f, 12);
      const acc = names[pc].length > 1;
      let cls = acc ? 'acc' : '';
      if (state.neckNote >= 0) cls = pc === state.neckNote ? 'hl' : `${cls} dim`;
      notes.push({ s, f, text: pretty(names[pc]), cls });
    }
  }
  $('neckBoard').innerHTML = neckSVG(notes, null);
}
let setNeckPicker = () => {};
function initNeck() {
  const pick = () => buildNotePicker($('neckNote'), state.neckNote, state.neckSpell === 'flats' ? FLAT_NAMES : SHARP_NAMES, (pc) => {
    state.neckNote = pc; save(); renderNeck();
    if (pc >= 0) playNote(52 + mod(pc - 4, 12), 0, 0.45);
  }, true);
  setNeckPicker = pick();
  buildSeg($('neckSpell'), [['sharps', 'Sharps ♯'], ['flats', 'Flats ♭']], state.neckSpell, (v) => {
    state.neckSpell = v; save(); setNeckPicker = pick(); renderNeck();
  });
  $('neckBoard').onclick = (e) => {
    const g = e.target.closest('.n');
    if (!g) return;
    const s = Number(g.dataset.s), f = Number(g.dataset.f);
    playNote(OPEN_MIDI[s] + f, 0, 0.45);
    const pc = mod(OPEN_PC[s] + f, 12);
    state.neckNote = state.neckNote === pc ? -1 : pc;
    save(); setNeckPicker(state.neckNote); renderNeck();
  };
  renderNeck();
}

/* ---------- Keys tab ---------- */

// Circle of fifths: position 0..11 clockwise from the top.
const CIRCLE_MAJOR = ['C', 'G', 'D', 'A', 'E', 'B/C♭', 'F♯/G♭', 'D♭/C♯', 'A♭', 'E♭', 'B♭', 'F'];
const CIRCLE_MINOR = ['A', 'E', 'B', 'F♯', 'C♯', 'G♯', 'E♭/D♯', 'B♭/A♯', 'F', 'C', 'G', 'D'];
const CIRCLE_DIM = ['B', 'F♯', 'C♯', 'G♯', 'D♯', 'A♯', 'E♯', 'C', 'G', 'D', 'A', 'E'];
const MAJOR_POS = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, Gb: 6, Db: 7, Ab: 8, Eb: 9, Bb: 10, F: 11 };
const MINOR_POS = { A: 0, E: 1, B: 2, 'F#': 3, 'C#': 4, 'G#': 5, 'D#': 6, Eb: 6, Bb: 7, F: 8, C: 9, G: 10, D: 11 };

const curKey = () => (state.keyMode === 'major' ? state.majorKey : state.minorKey);
function keyChords(key, mode) {
  const syms = mode === 'major' ? ['R', '2', '3', '4', '5', '6', '7'] : ['R', '2', 'b3', '4', '5', 'b6', 'b7'];
  const degs = mode === 'major' ? MAJOR_DEGREES : MINOR_DEGREES;
  return degs.map((d, i) => {
    const root = spell(key, syms[i]);
    return { ...d, root, name: pretty(root) + (d.type === 'maj' ? '' : d.type === 'm' ? 'm' : '°') };
  });
}
function keySignature(key, mode) {
  const syms = mode === 'major' ? ['R', '2', '3', '4', '5', '6', '7'] : ['R', '2', 'b3', '4', '5', 'b6', 'b7'];
  const notes = syms.map((s) => spell(key, s));
  const sharps = notes.filter((n) => n.includes('#')).length;
  const flats = notes.filter((n) => n.includes('b')).length;
  return { notes, text: sharps ? `${sharps} sharp${sharps > 1 ? 's' : ''}` : flats ? `${flats} flat${flats > 1 ? 's' : ''}` : 'no sharps or flats' };
}

function renderCircle() {
  const major = state.keyMode === 'major';
  const p = major ? MAJOR_POS[state.majorKey] : MINOR_POS[state.minorKey];
  const C = 190, rings = [{ id: 'o', r: 158, cr: 25, fs: 19, labels: CIRCLE_MAJOR },
    { id: 'm', r: 110, cr: 20, fs: 15, labels: CIRCLE_MINOR }, { id: 'd', r: 68, cr: 15, fs: 12, labels: CIRCLE_DIM }];
  // Chords of the key: three neighbours on the outer and middle rings, plus one diminished.
  const near = (i) => [mod(p - 1, 12), p, mod(p + 1, 12)].includes(i);
  const inKey = (ring, i) => (ring === 'd' ? i === p : near(i));
  const tonic = (ring, i) => i === p && ((major && ring === 'o') || (!major && ring === 'm'));
  let o = `<svg class="circle" viewBox="0 0 ${C * 2} ${C * 2}">`;
  for (const ring of rings) o += `<circle class="ring" cx="${C}" cy="${C}" r="${ring.r}"/>`;
  for (const ring of rings) {
    ring.labels.forEach((lab, i) => {
      const a = (i * 30 - 90) * Math.PI / 180;
      const cx = C + ring.r * Math.cos(a), cy = C + ring.r * Math.sin(a);
      const cls = `k ${ring.id} ${inKey(ring.id, i) ? 'in' : 'out'} ${tonic(ring.id, i) ? 'tonic' : ''}`;
      const two = lab.includes('/');
      const fs = two ? ring.fs * 0.62 : ring.fs;
      o += `<g class="${cls}" data-ring="${ring.id}" data-pos="${i}"><circle cx="${cx}" cy="${cy}" r="${ring.cr}"/>`;
      if (two) {
        const [l1, l2] = lab.split('/');
        o += `<text x="${cx}" y="${cy - fs * 0.55}" font-size="${fs}">${l1}</text><text x="${cx}" y="${cy + fs * 0.6}" font-size="${fs}">${l2}</text>`;
      } else o += `<text x="${cx}" y="${cy + 0.5}" font-size="${fs}">${lab}</text>`;
      o += '</g>';
    });
  }
  o += `<text class="legend" x="6" y="16" fill="#e9e6e1" font-weight="700">MAJOR</text>
    <text class="legend" x="6" y="34" fill="#9aa0ad">minor</text>
    <text class="legend" x="6" y="52" fill="#6b7180">dim</text>`;
  $('keyCircle').innerHTML = o + '</svg><p class="hint" style="margin:6px 0 0;text-align:center">Tap a key. Neighbours on the circle are the chords that belong to it.</p>';
}

function renderKeyInfo() {
  const key = curKey(), mode = state.keyMode;
  const sig = keySignature(key, mode);
  const chords = keyChords(key, mode);
  $('keyInfo').innerHTML = `
    <div class="key-title"><span class="big">${esc(pretty(key))} ${mode}</span><span class="sig">${sig.text}</span></div>
    <div class="kchords">${chords.map((c, i) => `
      <button class="kchord ${i === 0 ? 'tonic' : ''}" data-chord="${esc(c.root)}|${c.type}">
        <span class="rn">${esc(c.roman)}</span><span class="cn">${esc(c.name)}</span><span class="q">${c.q}</span>
      </button>`).join('')}</div>
    <div class="scale-line"><b>Scale</b>${sig.notes.map((n) => esc(pretty(n))).join('  ')}</div>`;
}

// "Key key": the chords of the key on the low E and A strings, at real frets.
function renderKeyMap() {
  const key = curKey(), mode = state.keyMode;
  const map = KEY_MAP[mode];
  const chords = keyChords(key, mode);
  const byRoman = new Map(chords.map((c) => [c.roman, c]));
  const ds = map.map((m) => m.d);
  let t = mod(noteInfo(key).pc - OPEN_PC[0], 12);
  if (t + Math.min(...ds) < 0) t += 12;
  const lo = Math.max(0, t + Math.min(...ds) - 1), hi = t + Math.max(...ds) + 1;
  const n = hi - lo + 1;
  const L = 30, Wd = 330, colW = (Wd - L - 6) / n, yA = 34, yE = 100, H = 142;
  const fx = (f) => L + (f - lo + 0.5) * colW;
  let o = `<svg class="keymap" viewBox="0 0 ${Wd} ${H}">`;
  for (let f = lo; f <= hi + 1; f++) {
    const xL = L + (f - lo) * colW;
    if (f === 0) continue;
    o += `<line class="${f - 1 === 0 && lo === 0 ? 'nut' : 'fret'}" x1="${xL}" x2="${xL}" y1="${yA - 18}" y2="${yE + 18}"/>`;
  }
  for (let f = lo; f <= hi; f++) o += `<text class="fno" x="${fx(f)}" y="${H - 2}">${f === 0 ? 'open' : f}</text>`;
  o += `<line class="str" x1="${L}" x2="${Wd - 6}" y1="${yA}" y2="${yA}"/><line class="str" x1="${L}" x2="${Wd - 6}" y1="${yE}" y2="${yE}" stroke-width="2"/>`;
  o += `<text class="sname" x="12" y="${yA}">A</text><text class="sname" x="12" y="${yE}">E</text>`;
  for (const m of map) {
    const c = byRoman.get(m.roman);
    const f = t + m.d, cx = fx(f), cy = m.s === 1 ? yA : yE;
    const fs = m.roman.length > 3 ? 9.5 : 11;
    o += `<g class="km ${m.home ? 'home' : ''}" data-chord="${esc(c.root)}|${c.type}"><circle cx="${cx}" cy="${cy}" r="16"/>` +
      `<text class="rn" x="${cx}" y="${cy + 0.5}" font-size="${fs}">${esc(m.roman)}</text>` +
      `<text class="cn" x="${cx}" y="${cy + 29}">${esc(c.name)}</text></g>`;
  }
  $('keyMap').innerHTML = o + '</svg>';
}

function renderKeyTable() {
  const major = state.keyMode === 'major';
  const keys = major ? MAJOR_KEYS : MINOR_KEYS;
  const degs = major ? MAJOR_DEGREES : MINOR_DEGREES;
  $('keyTableTitle').textContent = `Chords in every ${major ? 'major' : 'minor'} key`;
  $('keyTable').innerHTML = `<table class="ktable"><thead><tr>${degs.map((d) =>
    `<th>${esc(d.roman)}<small>${d.q}</small></th>`).join('')}</tr></thead><tbody>${keys.map((k) =>
    `<tr data-key="${k}" class="${k === curKey() ? 'sel' : ''}">${keyChords(k, state.keyMode).map((c) => `<td>${esc(c.name)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function renderKeys() { renderCircle(); renderKeyInfo(); renderKeyMap(); renderKeyTable(); }

function selectKey(mode, key) {
  state.keyMode = mode;
  if (mode === 'major') state.majorKey = key; else state.minorKey = key;
  save();
  [...$('keyMode').children].forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.v === mode)));
  renderKeys();
}

function initKeys() {
  buildSeg($('keyMode'), [['major', 'Major keys'], ['minor', 'Minor keys']], state.keyMode, (v) => {
    state.keyMode = v; save(); renderKeys();
  });
  $('keyCircle').onclick = (e) => {
    const g = e.target.closest('g.k');
    if (!g) return;
    const pos = Number(g.dataset.pos), ring = g.dataset.ring;
    const mode = ring === 'm' ? 'minor' : 'major';
    const table = mode === 'major' ? MAJOR_POS : MINOR_POS;
    const options = Object.keys(table).filter((k) => table[k] === pos);
    const cur = mode === 'major' ? state.majorKey : state.minorKey;
    // Enharmonic spot (F♯/G♭, D♯/E♭): tapping again switches the spelling.
    const key = options.length > 1 && state.keyMode === mode && options.includes(cur)
      ? options[(options.indexOf(cur) + 1) % options.length] : options[0];
    selectKey(mode, key);
  };
  const chordTap = (e) => {
    const b = e.target.closest('[data-chord]');
    if (!b) return;
    const [root, type] = b.dataset.chord.split('|');
    openChordSheet(root, type);
  };
  $('keyInfo').onclick = chordTap;
  $('keyMap').onclick = chordTap;
  $('keyTable').onclick = (e) => {
    const tr = e.target.closest('tr[data-key]');
    if (!tr) return;
    selectKey(state.keyMode, tr.dataset.key);
    $('keyCircle').scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  renderKeys();
}

/* ---------- Theory tab ---------- */

function renderTheory() {
  const pc = state.theoryRoot;
  $('formulaList').innerHTML = FORMULA_GROUPS.map((g) =>
    `<div class="fgroup">${g.name}</div>` + g.types.map((type) => {
      const root = rootName(pc, isMinorish(type));
      return `<button class="frow" data-chord="${esc(root)}|${type}">
        <span class="fn">${esc(CHORD_TYPES[type].name)}<small>${esc(chordName(root, type))}</small></span>
        <span class="ff">${esc(formulaText(type))}</span>
        <span class="fnotes">${esc(chordNotes(root, type).join(' '))}</span></button>`;
    }).join('')).join('');
  const root = MAJ_NAMES[pc];
  $('intervalList').innerHTML = `<div class="irow head"><span>Semi</span><span>Interval</span><span>Symbol</span><span>Also</span><span>From ${esc(pretty(root))}</span></div>` +
    INTERVALS.map((iv) => {
      const notes = iv.sym.map((s) => pretty(spell(root, s === '8' ? 'R' : s)));
      const uniq = [...new Set(notes)];
      return `<button class="irow" data-iv="${iv.semi}">
        <span class="semi">${iv.semi}</span>
        <span class="iname">${esc(iv.short)}${iv.alt ? ` / ${esc(iv.alt)}` : ''}<small>${esc(iv.name)}</small></span>
        <span class="isym">${iv.sym.map((s) => esc(s === 'R' ? 'R' : prettySym(s))).join(' ')}</span>
        <span class="iaka">${esc(iv.aka ? prettySym(iv.aka) : '')}</span>
        <span class="inote">${uniq.map(esc).join(' ')}</span></button>`;
    }).join('');
}

function initTheory() {
  buildNotePicker($('theoryRoot'), state.theoryRoot, MAJ_NAMES, (pc) => {
    state.theoryRoot = pc; save(); renderTheory();
  });
  $('formulaList').onclick = (e) => {
    const b = e.target.closest('[data-chord]');
    if (!b) return;
    const [root, type] = b.dataset.chord.split('|');
    openChordSheet(root, type);
  };
  $('intervalList').onclick = (e) => {
    const b = e.target.closest('[data-iv]');
    if (!b) return;
    silence();
    const base = 48 + state.theoryRoot, semi = Number(b.dataset.iv);
    playNote(base, 0, 0.4);
    playNote(base + semi, 0.45, 0.4);
    playNote(base, 1.0, 0.3);
    playNote(base + semi, 1.0, 0.3);
  };
  renderTheory();
}

/* ---------- Start ---------- */

initChords();
initScales();
initKeys();
initNeck();
initTheory();
setTab(state.tab);

/* ---------- Offline support ---------- */

function showVersion() {
  const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
  if (!sw) { $('version').textContent = ''; return; }
  const ch = new MessageChannel();
  ch.port1.onmessage = (e) => { $('version').textContent = `Version ${e.data}`; };
  sw.postMessage('version', [ch.port2]);
}

if ('serviceWorker' in navigator && window.isSecureContext) {
  const sw = navigator.serviceWorker;
  const hadController = !!sw.controller;
  sw.register('sw.js').then((reg) => {
    // iOS keeps the app alive in the background, so also check for updates when it comes back.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) reg.update().catch(() => {});
    });
  }).catch(() => {});
  sw.addEventListener('controllerchange', () => {
    if (!hadController) { showVersion(); return; } // first install: this page is already the latest
    location.reload();                             // a new version took over: use it straight away
  });
  showVersion();
}
