# obsolete technology

Scene 1: three obsolete machines — a console TV, a CRT monitor, a laptop —
drop fast out of the dark like they were thrown from a three-story window,
then freeze mid-air and hang there as a sculpture. One drop per load; the
freeze is permanent (physics is severed, poses are captured).

- Orbit 360° around the frozen sculpture (enabled the instant it locks).
- Click any screen to step inside and use it (Softie on the CRT, the
  workstation on the laptop, static on the TV). ESC steps back out.
  The objects themselves can never be moved.

- `index.html` — the three devices, their working screens, staging, camera.
  The CRT runs `softie-os.html` (the Softie desktop, booting with Solitaire
  maximized) as a live overlay page; click anywhere on the monitor to step
  in and use it.
- `FallingDevices.js` — the drop controller: ballistic fall at ~Earth
  gravity sampled at 24fps display cadence, then a hard freeze at
  PRE_DROP → FALLING → FROZEN (terminal; no loop, no respawn).
- `FallingDevices.js` — the drop controller: ballistic fall at ~Earth
  gravity sampled at 24fps display cadence, then a hard freeze at
  PRE_DROP → FALLING → FROZEN (terminal; no loop, no respawn).
- `solitaire-win2000.html` — a complete Klondike game, hosted inside Softie
  via `solitaire-app.html`.
- `softie-os.html` — the Softie desktop: taskbar, window manager, rx.pdf
  viewer, Ryann Paint, Solitaire, shutdown sequence, and old-machine
  latency (roughly every 3rd/4th/5th action hesitates with a blue activity
  indicator; file/shortcut moves hang briefly, then catch up).
- `solitaire-app.html` — borderless host so the Klondike build lives inside
  a Softie window. `ryann-paint.html` — a small paint program for Softie.
- `softie-crt-effect.js` — subtle Three.js CRT glass over the screen: faint
  reflection, near-invisible scanlines, tiny brightness breathing, and a
  small redraw dip only when Softie itself reports latency.
- `softie-os-bridge.js` — connects Softie to the sculpture (latency sync,
  computer-mode enter/exit). See `SCULPTURE-INTEGRATION.md`.

Run it with any static server (ES modules + CDN imports require http):

```bash
python3 -m http.server -d . 8123
# open http://127.0.0.1:8123/index.html
```

Dependencies load from CDN: `three@0.180.0`, `@dimforge/rapier3d-compat@0.14.0`.
