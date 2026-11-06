# Ipek's Games

Educational web games for Ipek, learning in Turkish and English.
Every game works on phones, tablets and desktops, is played by touch, and always open in English and can be switched to Turkish (TR) with the
EN/TR toggle (Letter Islands is Turkish only).

**Play:** https://sguven.github.io/ipek-games/

## Games

| Folder | Game | What it practises |
|---|---|---|
| `minik-kasif/` | Little Explorer Ipek | Counting, colours, shapes |
| `unicorn/` | Ipek & Sparkle's Rainbow | Patterns, more or less, shadows |
| `kelebek/` | Ipek's Butterfly Garden | Catching, colour hunt, counting, teaching a robot |
| `araba/` | Ipek's Car Trip | 3D ride (dragon or car) over the highway bridge, around Köprüköy village and back across the historic Çeşnigir Bridge |
| `cesnigir/` | Ipek's Çeşnigir Tour | Stand-alone 3D tour of the Çeşnigir Bridge |
| `yardim/` | Ipek's Helping Village | Helping friends, sharing fairly, tidying up |
| `harf/` | Ipek's Letter Islands | Reading and writing Turkish letter by letter, the first-grade way (Turkish only) |
| `boyama/` | Ipek's Coloring Book | Painting with colours, brush and stamps; saving pictures |
| `zeka/` | Ipek's Brain Games | Memory cards, jigsaws, robot paths, odd one out, ordering |

Folder names are Turkish because they are part of each game's web address.
`index.html` at the root is the home page with a card for each game.

## How it's built

- Each game is a single self-contained `index.html` (HTML, CSS and JavaScript), with its own
  `manifest.webmanifest` so it can be added to a home screen.
- Recorded voice lines live in each game's `audio/` folder, listed in `audio/manifest.json`.
- `zeka/index.html` is generated: `zeka/build.py` combines `zeka/src.html` with the jigsaw
  pictures and sound engine from the Coloring Book. Edit `src.html`, then run
  `python3 zeka/build.py`.
- The site is published with GitHub Pages from the root of `main`; there's no build step for the
  other games.

## Tests

Automated Playwright tests play each game by touch at several phone, tablet and desktop sizes and
check layout, sound, rewards, both languages and console errors.

```bash
cd tests
npm install
npm test                  # main test run + butterfly garden
node run-tests.js --quick # faster pass
node run-tests.js --game=minik-kasif
node araba-test.js        # each game also has its own test file
```

Screenshots from a run are written to `tests/out/` (git-ignored).
