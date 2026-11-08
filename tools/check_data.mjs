#!/usr/bin/env node
// Sanity-checks the chord shapes in public/data.js against their formulas:
// every note of every shape must belong to the chord, and the marked root string must
// sound the root. Catches transcription mistakes. Usage: node tools/check_data.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = fs.readFileSync(path.join(root, 'public/data.js'), 'utf8');
const names = ['CHORD_TYPES', 'BASIC_KEYS', 'BASIC_ROWS', 'BASIC_CHORDS', 'MOVABLE_GROUPS', 'MOVABLE_CHORDS', 'SCALES'];
const ctx = {};
vm.runInNewContext(`${src}\n;globalThis.__out = { ${names.join(', ')} };`, ctx);
const D = ctx.__out;

const OPEN = [4, 9, 2, 7, 11, 4]; // pitch classes of E A D G B E
const NAT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const DEG = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 9: 2, 11: 5, 13: 9 };
const semis = (sym) => {
  if (sym === 'R') return 0;
  const m = /^([b#]*)(\d+)$/.exec(sym);
  const acc = [...m[1]].reduce((a, c) => a + (c === '#' ? 1 : -1), 0);
  return (((DEG[m[2]] + acc) % 12) + 12) % 12;
};
const parse = (s) => [...s].map((c) => (c === 'x' ? null : Number(c)));

let errors = 0, checked = 0;
function check(label, shape, rootPc, type, rootString) {
  const allowed = new Set(D.CHORD_TYPES[type].f.map(semis));
  const frets = parse(shape.s);
  const found = new Set();
  frets.forEach((f, i) => {
    if (f === null) return;
    const iv = (((OPEN[i] + f - rootPc) % 12) + 12) % 12;
    found.add(iv);
    if (!allowed.has(iv)) { console.log(`✗ ${label}: string ${i + 1} (from low E) is not in the chord (interval ${iv})`); errors++; }
  });
  const rs = frets[rootString];
  if (rs === null || (((OPEN[rootString] + rs - rootPc) % 12) + 12) % 12 !== 0) {
    console.log(`✗ ${label}: marked root string ${rootString} is not the root`); errors++;
  }
  if (!found.has(0)) { console.log(`✗ ${label}: no root`); errors++; }
  for (const [fret, a, b] of shape.b || []) {
    if (a > b || frets[a] !== fret || frets.slice(a, b + 1).some((f) => f !== null && f < fret)) { console.log(`✗ ${label}: barre ${fret} ${a}-${b} does not match the shape`); errors++; }
  }
  checked++;
}

for (const { type } of D.BASIC_ROWS) {
  for (const key of D.BASIC_KEYS) {
    const sh = D.BASIC_CHORDS[type][key];
    check(`open ${key}${D.CHORD_TYPES[type].sym}`, sh, NAT[key], type, sh.r);
  }
}
for (const g of D.MOVABLE_GROUPS) {
  for (const type of g.types) {
    D.MOVABLE_CHORDS[type].forEach((sh, v) => {
      // Place the shape with its first fret at fret 1: the root is whatever note the root string plays.
      const f = parse(sh.s)[sh.r];
      const rootPc = (OPEN[sh.r] + f) % 12;
      check(`movable ${type} #${v + 1}`, sh, rootPc, type, sh.r);
    });
  }
}
console.log(errors ? `\n${errors} problem(s) in ${checked} shapes` : `All ${checked} chord shapes match their formulas.`);
process.exit(errors ? 1 : 0);
