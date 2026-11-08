'use strict';
// Everything on the guitar cheat sheet, as data. app.js draws all diagrams from this.
//
// Strings are numbered 0..5 from low E to high E. A shape is a 6-character string
// (or array) with one entry per string: 'x' = muted, 0 = open, n = fret.
//   r: the string with the root dot (red on the chart)
//   b: barres as [fret, fromString, toString]

/* ---------- Chord types and formulas ---------- */

// Every chord type in the app. `f` is the formula (chart's "Chord Name / Formula" table).
// `sym` is the suffix after the root (C + 'maj7' = Cmaj7).
const CHORD_TYPES = {
  maj:    { name: 'Major',               sym: '',        f: ['R', '3', '5'] },
  6:      { name: 'Major 6',             sym: '6',       f: ['R', '3', '5', '6'] },
  maj7:   { name: 'Major 7',             sym: 'maj7',    f: ['R', '3', '5', '7'] },
  maj9:   { name: 'Major 9',             sym: 'maj9',    f: ['R', '3', '5', '7', '9'] },
  maj11:  { name: 'Major 11',            sym: 'maj11',   f: ['R', '3', '5', '7', '9', '11'] },
  maj13:  { name: 'Major 13',            sym: 'maj13',   f: ['R', '3', '5', '7', '9', '11', '13'] },
  sus2:   { name: 'Sus 2',               sym: 'sus2',    f: ['R', '2', '5'] },
  sus4:   { name: 'Sus 4',               sym: 'sus4',    f: ['R', '4', '5'] },
  7:      { name: 'Dominant 7',          sym: '7',       f: ['R', '3', '5', 'b7'] },
  9:      { name: 'Dominant 9',          sym: '9',       f: ['R', '3', '5', 'b7', '9'] },
  11:     { name: 'Dominant 11',         sym: '11',      f: ['R', '3', '5', 'b7', '9', '11'] },
  13:     { name: 'Dominant 13',         sym: '13',      f: ['R', '3', '5', 'b7', '9', '11', '13'] },
  '7sus4':{ name: 'Dom 7 Sus 4',         sym: '7sus4',   f: ['R', '4', '5', 'b7'] },
  m:      { name: 'Minor',               sym: 'm',       f: ['R', 'b3', '5'] },
  m6:     { name: 'Minor 6',             sym: 'm6',      f: ['R', 'b3', '5', '6'] },
  m7:     { name: 'Minor 7',             sym: 'm7',      f: ['R', 'b3', '5', 'b7'] },
  mM7:    { name: 'Minor (M7)',          sym: 'm(maj7)', f: ['R', 'b3', '5', '7'] },
  m9:     { name: 'Minor 9',             sym: 'm9',      f: ['R', 'b3', '5', 'b7', '9'] },
  m11:    { name: 'Minor 11',            sym: 'm11',     f: ['R', 'b3', '5', 'b7', '9', '11'] },
  dim:    { name: 'Diminished',          sym: '°',       f: ['R', 'b3', 'b5'] },
  dim7:   { name: 'Diminished 7',        sym: '°7',      f: ['R', 'b3', 'b5', 'bb7'] },
  m7b5:   { name: '(Half) Diminished 7', sym: 'ø7',      f: ['R', 'b3', 'b5', 'b7'] },
  aug:    { name: 'Augmented',           sym: '+',       f: ['R', '3', '#5'] },
  aug7:   { name: 'Augmented 7',         sym: '+7',      f: ['R', '3', '#5', 'b7'] },
};

// The formula table, grouped as on the chart.
const FORMULA_GROUPS = [
  { name: 'Major', types: ['maj', '6', 'maj7', 'maj9', 'maj11', 'maj13'] },
  { name: 'Suspended', types: ['sus2', 'sus4'] },
  { name: 'Dominant', types: ['7', '9', '11', '13', '7sus4'] },
  { name: 'Minor', types: ['m', 'm6', 'm7', 'mM7', 'm9', 'm11'] },
  { name: 'Diminished', types: ['dim', 'dim7', 'm7b5'] },
  { name: 'Augmented', types: ['aug', 'aug7'] },
];

/* ---------- Basic (open) chords: 7 types x keys A–G ---------- */

const BASIC_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const BASIC_ROWS = [
  { type: 'maj',  group: 'Major' },
  { type: '6',    group: 'Major' },
  { type: 'maj7', group: 'Major' },
  { type: '7',    group: 'Dominant' },
  { type: 'm',    group: 'Minor' },
  { type: 'm6',   group: 'Minor' },
  { type: 'm7',   group: 'Minor' },
];
const BASIC_CHORDS = {
  maj: {
    A: { s: 'x02220', r: 1 },
    B: { s: 'x24442', r: 1, b: [[2, 1, 5]] },
    C: { s: 'x32010', r: 1 },
    D: { s: 'xx0232', r: 2 },
    E: { s: '022100', r: 0 },
    F: { s: '133211', r: 0, b: [[1, 0, 5]] },
    G: { s: '320003', r: 0 },
  },
  6: {
    A: { s: 'x02222', r: 1, b: [[2, 2, 5]] },
    B: { s: 'x24444', r: 1, b: [[4, 2, 5]] },
    C: { s: 'x32210', r: 1 },
    D: { s: 'xx0202', r: 2 },
    E: { s: '022120', r: 0 },
    F: { s: 'xx3231', r: 2 },
    G: { s: '320000', r: 0 },
  },
  maj7: {
    A: { s: 'x02120', r: 1 },
    B: { s: 'x24342', r: 1, b: [[2, 1, 5]] },
    C: { s: 'x32000', r: 1 },
    D: { s: 'xx0222', r: 2, b: [[2, 3, 5]] },
    E: { s: '02110x', r: 0 },
    F: { s: 'xx3210', r: 2 },
    G: { s: '320002', r: 0 },
  },
  7: {
    A: { s: 'x02020', r: 1 },
    B: { s: 'x21202', r: 1 },
    C: { s: 'x32310', r: 1 },
    D: { s: 'xx0212', r: 2 },
    E: { s: '020100', r: 0 },
    F: { s: '131211', r: 0, b: [[1, 0, 5]] },
    G: { s: '320001', r: 0 },
  },
  m: {
    A: { s: 'x02210', r: 1 },
    B: { s: 'x24432', r: 1, b: [[2, 1, 5]] },
    C: { s: 'x3101x', r: 1 },
    D: { s: 'xx0231', r: 2 },
    E: { s: '022000', r: 0 },
    F: { s: '133111', r: 0, b: [[1, 0, 5]] },
    G: { s: '355333', r: 0, b: [[3, 0, 5]] },
  },
  m6: {
    A: { s: 'x02212', r: 1 },
    B: { s: 'x20102', r: 1 },
    C: { s: 'x31213', r: 1, b: [[1, 2, 4]] },
    D: { s: 'xx0201', r: 2 },
    E: { s: '022020', r: 0 },
    F: { s: 'xx0111', r: 5, b: [[1, 3, 5]] },
    G: { s: '3x2333', r: 0, b: [[3, 3, 5]] },
  },
  m7: {
    A: { s: 'x02010', r: 1 },
    B: { s: 'x20202', r: 1 },
    C: { s: 'x31313', r: 1, b: [[1, 2, 4]] },
    D: { s: 'xx0211', r: 2, b: [[1, 4, 5]] },
    E: { s: '020000', r: 0 },
    F: { s: '131111', r: 0, b: [[1, 0, 5]] },
    G: { s: '353333', r: 0, b: [[3, 0, 5]] },
  },
};

/* ---------- Movable chords: 21 types x 6 voicings ---------- */

// Frets are relative: 1 = the first fret of the shape. The app slides the shape to any root.
// Voicing order: root on 6th string, root on 5th, root on 4th, then three alternative voicings.
const VOICING_NAMES = ['Root 6', 'Root 5', 'Root 4', 'Alternative 1', 'Alternative 2', 'Alternative 3'];
const MOVABLE_GROUPS = [
  { name: 'Major', types: ['maj', '6', 'maj7', 'maj9', 'maj13'] },
  { name: 'Suspended', types: ['sus2', 'sus4'] },
  { name: 'Dominant', types: ['7', '9', '13', '7sus4'] },
  { name: 'Minor', types: ['m', 'm6', 'm7', 'mM7', 'm9', 'm11'] },
  { name: 'Diminished', types: ['dim', 'dim7'] },
  { name: 'Augmented', types: ['aug', 'aug7'] },
];
const MOVABLE_CHORDS = {
  maj: [
    { s: '133211', r: 0, b: [[1, 0, 5]] },
    { s: 'x13331', r: 1, b: [[1, 1, 5]] },
    { s: 'xx1343', r: 2 },
    { s: 'xxx331', r: 3 },
    { s: 'xxx121', r: 4 },
    { s: 'xxx211', r: 5, b: [[1, 4, 5]] },
  ],
  6: [
    { s: '1x3231', r: 0, b: [[1, 0, 5]] },
    { s: 'x13333', r: 1, b: [[3, 2, 5]] },
    { s: 'xx1313', r: 2, b: [[1, 2, 5]] },
    { s: '2x132x', r: 0 },
    { s: 'x2414x', r: 1 },
    { s: 'xx3231', r: 2 },
  ],
  maj7: [
    { s: '1x221x', r: 0 },
    { s: 'x13231', r: 1, b: [[1, 1, 5]] },
    { s: 'xx1333', r: 2, b: [[3, 3, 5]] },
    { s: '1322xx', r: 0 },
    { s: 'x43111', r: 1, b: [[1, 3, 5]] },
    { s: 'xx4321', r: 2 },
  ],
  maj9: [
    { s: '21312x', r: 0, b: [[1, 1, 3]] },
    { s: 'x2132x', r: 1 },
    { s: 'xx1331', r: 2, b: [[1, 2, 5]] },
    { s: 'x41111', r: 1, b: [[1, 2, 5]] },
    { s: 'x21322', r: 1, b: [[2, 4, 5]] },
    { s: 'x11113', r: 3, b: [[1, 1, 4]] },
  ],
  maj13: [
    { s: '1x223x', r: 0 },
    { s: 'x1x233', r: 1 },
    { s: 'x31333', r: 2, b: [[3, 3, 5]] },
    { s: '211121', r: 0, b: [[1, 1, 5]] },
    { s: 'x43311', r: 1, b: [[1, 4, 5]] },
    { s: 'x21344', r: 1, b: [[4, 4, 5]] },
  ],
  sus2: [
    { s: '411xxx', r: 0, b: [[1, 1, 2]] },
    { s: 'x411xx', r: 1, b: [[1, 2, 3]] },
    { s: 'xx1341', r: 2, b: [[1, 2, 5]] },
    { s: 'xxx311', r: 3, b: [[1, 4, 5]] },
    { s: 'xxx341', r: 4 },
    { s: 'xxx122', r: 5, b: [[2, 4, 5]] },
  ],
  sus4: [
    { s: '441xxx', r: 0 },
    { s: 'x441xx', r: 1 },
    { s: 'xx442x', r: 2 },
    { s: 'xxx341', r: 3 },
    { s: 'xxx122', r: 4, b: [[2, 4, 5]] },
    { s: 'xxx311', r: 5, b: [[1, 4, 5]] },
  ],
  7: [
    { s: '131211', r: 0, b: [[1, 0, 5]] },
    { s: 'x13131', r: 1, b: [[1, 1, 5]] },
    { s: 'xx1323', r: 2 },
    { s: '1x121x', r: 0 },
    { s: 'xx1112', r: 3, b: [[1, 2, 4]] },
    { s: 'xx2313', r: 4 },
  ],
  9: [
    { s: '131213', r: 0, b: [[1, 0, 4]] },
    { s: 'x21222', r: 1, b: [[2, 3, 5]] },
    { s: 'xx2132', r: 2 },
    { s: '21212x', r: 0, b: [[1, 1, 3]] },
    { s: 'x11112', r: 3, b: [[1, 1, 4]] },
    { s: 'x12122', r: 5, b: [[1, 1, 3]] },
  ],
  13: [
    { s: '131231', r: 0, b: [[1, 0, 5]] },
    { s: 'x21224', r: 1, b: [[2, 3, 4]] }, // chart shows the top dot at fret 3 (a ♭13); 13 is fret 4
    { s: 'x31321', r: 2, b: [[1, 2, 5]] },
    { s: '1x123x', r: 0 },
    { s: 'x1221x', r: 4, b: [[1, 1, 4]] },
    { s: 'xx1231', r: 5, b: [[1, 2, 5]] },
  ],
  '7sus4': [
    { s: '131311', r: 0, b: [[1, 0, 5]] },
    { s: 'x13141', r: 1, b: [[1, 1, 5]] },
    { s: 'xx1324', r: 2 },
    { s: 'x3331x', r: 1 },
    { s: 'x1112x', r: 2, b: [[1, 1, 3]] },
    { s: 'xx2233', r: 3, b: [[2, 2, 3], [3, 4, 5]] },
  ],
  m: [
    { s: '133111', r: 0, b: [[1, 0, 5]] },
    { s: 'x13321', r: 1, b: [[1, 1, 5]] },
    { s: 'xx1342', r: 2 },
    { s: 'xxx321', r: 3 },
    { s: 'xxx231', r: 4 },
    { s: 'xx1444', r: 5, b: [[4, 3, 5]] },
  ],
  m6: [
    { s: '2x1222', r: 0, b: [[2, 3, 5]] },
    { s: 'x31213', r: 1, b: [[1, 2, 4]] },
    { s: 'xx1312', r: 2, b: [[1, 2, 4]] },
    { s: '3123xx', r: 0 },
    { s: 'x2413x', r: 1 },
    { s: 'xx3131', r: 2, b: [[1, 3, 5]] },
  ],
  m7: [
    { s: '131111', r: 0, b: [[1, 0, 5]] },
    { s: 'x13121', r: 1, b: [[1, 1, 5]] },
    { s: 'xx1322', r: 2, b: [[2, 4, 5]] },
    { s: '1x111x', r: 0, b: [[1, 2, 4]] },
    { s: 'x13124', r: 1, b: [[1, 1, 3]] },
    { s: 'x31313', r: 1, b: [[1, 2, 4]] },
  ],
  mM7: [
    { s: '13211x', r: 0, b: [[1, 0, 4]] },
    { s: 'x1322x', r: 1 },
    { s: 'xx1332', r: 2 },
    { s: '3143xx', r: 0 },
    { s: 'x3144x', r: 1 },
    { s: 'xx2214', r: 3 },
  ],
  m9: [
    { s: '131113', r: 0, b: [[1, 0, 4]] },
    { s: 'x31333', r: 1, b: [[3, 3, 5]] },
    { s: 'xx3143', r: 2 },
    { s: '1x1113', r: 0, b: [[1, 2, 4]] },
    { s: '3132xx', r: 0 },
    { s: '33133x', r: 1, b: [[3, 3, 4]] },
  ],
  m11: [
    { s: '111111', r: 0, b: [[1, 0, 5]] },
    { s: 'x11121', r: 1, b: [[1, 1, 5]] },
    { s: 'x11122', r: 2, b: [[1, 1, 3]] },
    { s: '111124', r: 1, b: [[1, 0, 3]] },
    { s: '331311', r: 1, b: [[1, 2, 5], [3, 0, 1]] },
    { s: '3x1311', r: 4, b: [[1, 2, 5]] },
  ],
  dim: [
    { s: '2xx212', r: 0 },
    { s: 'x1232x', r: 1 },
    { s: 'xx421x', r: 2 },
    { s: 'xxx431', r: 3 },
    { s: 'xxx131', r: 4, b: [[1, 3, 5]] },
    { s: 'xxx212', r: 5 },
  ],
  dim7: [
    { s: '2x121x', r: 0, b: [[1, 2, 4]] },
    { s: 'x2313x', r: 1 },
    { s: 'xx1212', r: 2 },
    { s: '2312xx', r: 0 },
    { s: 'x312x2', r: 1 },
    { s: 'x23131', r: 5, b: [[1, 3, 5]] },
  ],
  aug: [
    { s: '1432xx', r: 0 },
    { s: 'x3211x', r: 1, b: [[1, 3, 4]] },
    { s: 'xx3221', r: 2 },
    { s: '4321xx', r: 0 },
    { s: 'xxx221', r: 3 },
    { s: 'xx2114', r: 4, b: [[1, 3, 4]] },
  ],
  aug7: [
    { s: '1x122x', r: 0 },
    { s: 'x1413x', r: 1, b: [[1, 1, 3]] },
    { s: 'xx1423', r: 2 },
    { s: '1412xx', r: 0, b: [[1, 0, 2]] },
    { s: 'x1x132', r: 1 },
    { s: 'x1211x', r: 4, b: [[1, 1, 4]] },
  ],
};

/* ---------- Scales ---------- */

// `degrees` = the chart's chip row: the 7 reference degrees (grey when not in the scale)
// with blue notes added. `pos` = fret windows of the five CAGED positions, in frets relative
// to the root of the (relative) major scale on the low E string.
const POS_STD = { 1: [-1, 2], 2: [1, 5], 3: [4, 7], 4: [6, 9], 5: [9, 12] };
const SCALES = [
  {
    id: 'ionian', roman: 'I', name: 'Ionian Mode', sub: 'Major Scale', minor: false,
    notes: ['R', '2', '3', '4', '5', '6', '7'],
    degrees: ['R', '2', '3', '4', '5', '6', '7'],
    pos: { 1: [-1, 2], 2: [2, 5], 3: [4, 7], 4: [6, 9], 5: [9, 12] },
  },
  {
    id: 'aeolian', roman: 'vi', name: 'Aeolian Mode', sub: 'Natural Minor Scale', minor: true,
    notes: ['R', '2', 'b3', '4', '5', 'b6', 'b7'],
    degrees: ['R', '2', 'b3', '4', '5', 'b6', 'b7'],
    pos: { 1: [-1, 2], 2: [1, 5], 3: [4, 7], 4: [6, 9], 5: [8, 12] },
  },
  {
    id: 'majpent', name: 'Major Pentatonic', sub: 'Scale', minor: false,
    notes: ['R', '2', '3', '5', '6'],
    degrees: ['R', '2', '3', '4', '5', '6', '7'],
    pos: POS_STD,
  },
  {
    id: 'minpent', name: 'Minor Pentatonic', sub: 'Scale', minor: true,
    notes: ['R', 'b3', '4', '5', 'b7'],
    degrees: ['R', '2', 'b3', '4', '5', 'b6', 'b7'],
    pos: POS_STD,
  },
  {
    id: 'majblues', name: 'Major Blues', sub: 'Scale', minor: false,
    notes: ['R', '2', 'b3', '3', '5', '6'], blue: ['b3'],
    degrees: ['R', '2', 'b3', '3', '4', '5', '6', '7'],
    pos: { 1: [-1, 3], 2: [1, 5], 3: [4, 8], 4: [6, 10], 5: [9, 12] },
  },
  {
    id: 'minblues', name: 'Minor Blues', sub: 'Scale', minor: true,
    notes: ['R', 'b3', '4', 'b5', '5', 'b7'], blue: ['b5'],
    degrees: ['R', '2', 'b3', '4', 'b5', '5', 'b6', 'b7'],
    pos: POS_STD,
  },
];
// Chart order of the positions along the neck, with the CAGED shape each is named after.
const POSITIONS = [
  { n: 1, shape: 'E' }, { n: 2, shape: 'D' }, { n: 3, shape: 'C' }, { n: 4, shape: 'A' }, { n: 5, shape: 'G' },
];

/* ---------- Chromatic intervals ---------- */

const INTERVALS = [
  { semi: 0,  short: 'P1',     name: 'Perfect unison',            sym: ['R'] },
  { semi: 1,  short: 'm2',     name: 'Minor 2nd',                 sym: ['b2'], aka: 'b9' },
  { semi: 2,  short: 'M2',     name: 'Major 2nd',                 sym: ['2'], aka: '9' },
  { semi: 3,  short: 'm3',     alt: 'Aug 2', name: 'Minor 3rd',   sym: ['b3'], aka: '#9' },
  { semi: 4,  short: 'M3',     name: 'Major 3rd',                 sym: ['3'] },
  { semi: 5,  short: 'P4',     name: 'Perfect 4th',               sym: ['4'], aka: '11' },
  { semi: 6,  short: 'Aug 4',  alt: 'Dim 5', name: 'Tritone',     sym: ['#4', 'b5'], aka: '#11' },
  { semi: 7,  short: 'P5',     name: 'Perfect 5th',               sym: ['5'] },
  { semi: 8,  short: 'm6',     alt: 'Aug 5', name: 'Minor 6th',   sym: ['#5', 'b6'], aka: 'b13' },
  { semi: 9,  short: 'M6',     alt: 'Dim 7', name: 'Major 6th',   sym: ['6', 'bb7'], aka: '13' },
  { semi: 10, short: 'm7',     name: 'Minor 7th',                 sym: ['b7'] },
  { semi: 11, short: 'M7',     name: 'Major 7th',                 sym: ['7'] },
  { semi: 12, short: 'Octave', name: 'Octave',                    sym: ['8'], aka: '(1)' },
];

/* ---------- Keys ---------- */

// The 13 rows of the chart's "Chords in every major/minor key" tables, in circle order.
const MAJOR_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
const MINOR_KEYS = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'Eb', 'Bb', 'F', 'C', 'G', 'D'];
const MAJOR_DEGREES = [
  { roman: 'I', type: 'maj', q: 'Major' }, { roman: 'ii', type: 'm', q: 'minor' },
  { roman: 'iii', type: 'm', q: 'minor' }, { roman: 'IV', type: 'maj', q: 'Major' },
  { roman: 'V', type: 'maj', q: 'Major' }, { roman: 'vi', type: 'm', q: 'minor' },
  { roman: 'vii°', type: 'dim', q: 'dim' },
];
const MINOR_DEGREES = [
  { roman: 'i', type: 'm', q: 'minor' }, { roman: 'ii°', type: 'dim', q: 'dim' },
  { roman: '♭III', type: 'maj', q: 'Major' }, { roman: 'iv', type: 'm', q: 'minor' },
  { roman: 'v', type: 'm', q: 'minor' }, { roman: '♭VI', type: 'maj', q: 'Major' },
  { roman: '♭VII', type: 'maj', q: 'Major' },
];
// "Key key": where each chord of the key sits on the low E (0) and A (1) strings,
// in frets relative to the tonic on the low E string.
const KEY_MAP = {
  major: [
    { roman: 'ii', s: 1, d: -3 }, { roman: 'vi', s: 0, d: -3 },
    { roman: 'iii', s: 1, d: -1 }, { roman: 'vii°', s: 0, d: -1 },
    { roman: 'IV', s: 1, d: 0 }, { roman: 'I', s: 0, d: 0, home: true },
    { roman: 'V', s: 1, d: 2 },
  ],
  minor: [
    { roman: 'iv', s: 1, d: 0 }, { roman: 'i', s: 0, d: 0, home: true },
    { roman: 'v', s: 1, d: 2 }, { roman: 'ii°', s: 0, d: 2 },
    { roman: '♭VI', s: 1, d: 3 }, { roman: '♭III', s: 0, d: 3 },
    { roman: '♭VII', s: 1, d: 5 },
  ],
};
