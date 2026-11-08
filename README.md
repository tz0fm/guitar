# Guitar

An offline guitar reference web app for iPhone: chords, scales, keys, the fretboard and
the theory behind them. It holds everything on the classic one-page guitar cheat sheet
(fretboard, scale positions, basic and movable chords, chord formulas, circle of fifths,
chords in every key, chromatic intervals), made interactive, and you can hear every
chord and note. Like the Metronome app, you add it to your Home Screen from Safari,
so it doesn't need the App Store.

## Install on your iPhone

**From the web.** Open **https://tz0fm.github.io/guitar/** in Safari, tap
**Share → Add to Home Screen**, and open it once from the new icon. After that it works offline.

**From your Mac on the local network** (no internet needed):

1. On the Mac: `npm start` (or `node serve.mjs`). Your iPhone needs to be on the same Wi-Fi.
2. On the iPhone, in Safari, open the setup URL the server prints, e.g. `http://YourMac.local:8081`.
3. Follow the steps on that page, then **Share → Add to Home Screen**.

The server uses ports 8444 (HTTPS) and 8081 (setup), so it can run next to the Metronome's.
`.certs/` holds the local certificate authority. It's a copy of the Metronome's CA, so an
iPhone that already trusts "Metronome Local CA" can skip the certificate steps. If you
delete `.certs/`, a new "Guitar Local CA" is created and has to be installed on the phone.
Keep `.certs/ca.key` private (it's in `.gitignore`).

## What's in it

- **Chords**
  - *Open chords*: Major, 6, maj7, 7, m, m6 and m7 in A–G (the chart's "Basic Chords").
  - *Movable shapes*: 21 chord types × 6 voicings (root on the 6th, 5th and 4th string plus
    three alternative voicings). Pick any root and the shapes move to the right fret.
  - Dots can show plain dots, intervals (R, 3, ♭7…) or note names. Red is the root.
    Tap a chord to hear it strummed.
- **Scales**: Ionian (major), Aeolian (natural minor), major and minor pentatonic, major and
  minor blues, in any key, on a vertical neck (frets 0–15). Choose **All** or one of the
  five CAGED positions (1 E, 2 D, 3 C, 4 A, 5 G) as on the chart; the position is shaded and
  everything else fades. Label notes by interval or name, tap a note to hear it, or play
  the position up and down with the notes lighting up.
- **Keys**: circle of fourths and fifths (major, minor and diminished rings). Tap a key to
  see its seven chords (I ii iii IV V vi vii° or i ii° ♭III iv v ♭VI ♭VII), its scale and
  number of sharps/flats, where each chord's root sits on the low E and A strings (the
  chart's "key key", with real fret numbers), and the full "chords in every major/minor
  key" tables. Tap any chord for its shapes.
- **Neck**: every note on the fretboard in standard tuning, with sharps or flats. Tap a note
  to light it up everywhere.
- **Theory**: chord formulas for 24 chord types with the notes from any root, and the
  chromatic intervals table (semitones, names, symbols, compound names). Tap a row to
  hear it.

A few mistakes on the printed chart are corrected: the half-diminished 7 formula (R ♭3 ♭5 ♭7),
augmented (R 3 ♯5), the m3 alias (Aug 2), 13 / ♭13 swapped under M6 / m6, a stray mute
marker on the root string of one 7sus4 shape, and the top note of the root-5 13 chord
(fret 4, not 3).

## Updating the app

Edit the files in `public/`, bump `VERSION` in `public/sw.js`, commit, then publish:

```
npm run check       # checks every chord shape against its formula
git push            # save the source on GitHub
npm run deploy      # publish public/ to GitHub Pages (live within a minute or two)
```

Phones pick up the new version when the app is next opened with internet access.
The running version is shown at the bottom of the Theory tab.

## Files

- `public/data.js`: all chart content as data (chord shapes, scales, formulas, intervals, keys)
- `public/app.js`: theory (note spelling, moving shapes), SVG diagrams, sound, UI
- `public/index.html`, `sw.js`, `manifest.webmanifest`, `icons/`: the app shell and offline support
- `serve.mjs`: local HTTPS server and one-time setup page (Node 18+, no dependencies)
- `tools/check_data.mjs`: validates the chord shapes; `tools/make_icons.py`: regenerates the icons

Sound is a small plucked-string synth (Karplus–Strong) in Web Audio, so there are no audio files.
