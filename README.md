# obsolete technology

Three obsolete machines — a console TV, a CRT monitor, a laptop — fall
forever through an empty void in deep slow motion. Click any screen to
step inside and use it. ESC steps back out.

- `index.html` — the three devices, their working screens, staging, camera.
  The CRT runs `solitaire-win2000.html` fullscreen as a live overlay page;
  click anywhere on the monitor to step in and play it.
- `FallingDevices.js` — the Rapier physics controller (staged slow-fall,
  screen-focus freeze, invisible top/bottom wrap).
- `solitaire-win2000.html` — a complete Klondike game that runs live on
  the CRT, always on while the monitor has power.

Run it with any static server (ES modules + CDN imports require http):

```bash
python3 -m http.server -d . 8123
# open http://127.0.0.1:8123/index.html
```

Dependencies load from CDN: `three@0.180.0`, `@dimforge/rapier3d-compat@0.14.0`.
