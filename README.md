# Personal Site

beasley.dev: a scroll-driven WebGL experience. It's a static site with no build step.

- `index.html`: markup, preloader, import map (Three.js from jsDelivr)
- `css/style.css`: layout, HUD, fallbacks
- `js/main.js`: 3D scene, scroll camera, post effects, currency-collecting game
- `js/props.js`: markets globe (live forex sessions, trade arcs), currency coins, price panels, AI lattice, skyline window shader
- `js/audio.js`: generative Web Audio soundtrack, which changes with each section
- `js/terminal.js`: interactive terminal
- `js/game.js`: Bull Run, the arcade game unlocked by collecting all 7 major currencies
- `models/environment.glb`: skyline, towers, server stack, risk gauge, jet (built by `blender/build_environment.py`)
- `models/land-dots.json`: globe land dots baked from Natural Earth by `tools/build_land_dots.py`

Rebuild the models after editing the Blender script:

```
/Applications/Blender.app/Contents/MacOS/Blender -b -P blender/build_environment.py
```

Run locally with `python3 -m http.server` and open http://localhost:8000.
Without WebGL (or if the CDN is blocked) the page falls back to a static layout after 9s.
