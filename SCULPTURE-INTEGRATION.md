# Softie — sculpture + subtle CRT integration

This package turns the Solitaire screen into the Softie desktop and adds a restrained Three.js CRT layer over the screen. The effect is intentionally quiet: faint glass, almost invisible scanlines/phosphor texture, tiny brightness breathing, and a small redraw dip only when Softie itself hits one of its contrived old-computer latency moments.

## Files

- `softie-os.html` — desktop, taskbar, window manager, rx.pdf, Ryann Paint, Solitaire, shutdown sequence, and old-machine latency.
- `solitaire-app.html` — the existing Solitaire build adapted to live inside Softie.
- `ryann-paint.html` — Ryann Paint.
- `softie-os-bridge.js` — connects the HTML computer to the Three.js sculpture.
- `softie-crt-effect.js` — Three.js CRT glass/phosphor overlay.

Keep these files together.

## Load Softie into the screen

Wherever the sculpture currently loads Solitaire directly, use:

```js
screenIframe.src = './softie-os.html?sculpture=1';
```

## Add the subtle CRT layer

`screenMesh` should be the Three.js mesh aligned with the visible monitor screen. A `PlaneGeometry` works best; the helper gives the glass an extremely small convex bulge automatically.

```js
import { createSoftieCRTEffect } from './softie-crt-effect.js';
import { wireSoftieOS } from './softie-os-bridge.js';

const crtEffect = createSoftieCRTEffect({
  THREE,
  screenMesh,
  camera,

  // Deliberately restrained defaults. I would leave these alone first.
  strength: 1,
  curvature: 0.0075,
  glassOffset: 0.0018
});

const computer = wireSoftieOS({
  iframe: screenIframe,
  controls,
  crtEffect,
  onEnter() {
    document.body.classList.add('computer-mode');
  },
  onExit() {
    document.body.classList.remove('computer-mode');
  }
});
```

Then update the CRT once per Three.js frame:

```js
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  crtEffect.update(delta);
  renderer.render(scene, camera);
}

animate();
```

When the user clicks the monitor/screen, enter computer mode as before:

```js
computer.enterComputerMode();
```

Pressing `Esc` inside Softie exits back to sculpture navigation.

## Latency is synchronized automatically

Softie already decides that roughly every 3rd, 4th, or 5th eligible action should hesitate. When that happens it now posts `latency-start` and `latency-end` messages to the sculpture. The bridge forwards those events into `crtEffect`.

That means the CRT does **not** randomly glitch on its own. It only reacts when the computer itself is already hesitating.

During one of those moments the Three.js screen:

- dims by only a few percent,
- shifts the phosphor/scanline layer by a fraction of a visual pixel,
- gets one very faint redraw band,
- then settles immediately.

There is no RGB split, static burst, VHS tearing, hard flicker, or cyberpunk glitching.

## If the iframe is a CSS3D layer

The Three.js WebGL canvas needs to remain visually above the CSS3D screen so the glass can actually appear over Softie. A common arrangement is:

```js
css3dRenderer.domElement.style.position = 'absolute';
css3dRenderer.domElement.style.inset = '0';
css3dRenderer.domElement.style.zIndex = '0';

renderer.domElement.style.position = 'absolute';
renderer.domElement.style.inset = '0';
renderer.domElement.style.zIndex = '1';
renderer.domElement.style.pointerEvents = 'none';
```

Use a transparent WebGL renderer in that setup:

```js
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});
renderer.setClearColor(0x000000, 0);
```

If your existing sculpture already layers the bezel/monitor geometry over the HTML screen correctly, keep your current renderer arrangement and just add the CRT effect.

## Tuning

If it is perceptibly an "effect", reduce `strength` first:

```js
strength: 0.72
```

If the glass is too flat, raise `curvature` only slightly:

```js
curvature: 0.010
```

Avoid raising the shader opacity directly. The goal is for the viewer to think "old monitor" without consciously noticing why.
