// crt-transmission.js — permanent alien glyph transmission for the CRT.
//
// The laptop owns the MAKE CONTACT? Y/N decision. On a successful YES it
// dispatches "alien-contact-established"; scene-one listens and calls
// activate() after a short cinematic delay (~380ms, so the signal feels
// like it propagates to another piece of hardware in the room).
//
// Before contact the CRT is dark/inactive. After activate() the screen
// mesh permanently renders the glyph/static transmission and casts
// blue/cyan phosphor light. Nothing resets it except tearing down the
// whole scene. No English, no UI, no buttons — confined to screenMesh.

import * as THREE from "three";

const IDLE = {
  amount: .07, tear: .02, roll: .01, rgb: .015, noise: .08,
  blue: .18, cyan: .02, orange: 0, magenta: 0, structure: .02, glyph: 0,
};

const GLYPHS = {
  amount: .72, tear: .28, roll: .11, rgb: .12, noise: .31,
  blue: 1.0, cyan: 1.15, orange: .26, magenta: .09, structure: .76, glyph: .86,
};

function damp(value, target, lambda, dt) {
  return THREE.MathUtils.lerp(value, target, 1 - Math.exp(-lambda * dt));
}

export function createCRTTransmission({ screenMesh, parent } = {}) {
  if (!screenMesh) throw new Error("createCRTTransmission: screenMesh is required");

  const uniforms = {
    uTime: { value: 0 },
    uAmount: { value: IDLE.amount },
    uTear: { value: IDLE.tear },
    uRoll: { value: IDLE.roll },
    uRGBSplit: { value: IDLE.rgb },
    uNoise: { value: IDLE.noise },
    uStructure: { value: IDLE.structure },
    uGlyph: { value: IDLE.glyph },
    uBlue: { value: IDLE.blue },
    uCyan: { value: IDLE.cyan },
    uOrange: { value: IDLE.orange },
    uMagenta: { value: IDLE.magenta },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    toneMapped: false,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec2 vUv;

      uniform float uTime;
      uniform float uAmount;
      uniform float uTear;
      uniform float uRoll;
      uniform float uRGBSplit;
      uniform float uNoise;
      uniform float uStructure;
      uniform float uGlyph;
      uniform float uBlue;
      uniform float uCyan;
      uniform float uOrange;
      uniform float uMagenta;

      float hash(float n) {
        return fract(sin(n * 91.3458) * 47453.5453);
      }

      float hash2(vec2 p) {
        return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123);
      }

      float noise1(float x) {
        float i = floor(x);
        float f = fract(x);
        f = f*f*(3.0-2.0*f);
        return mix(hash(i), hash(i+1.0), f);
      }

      vec2 curveUV(vec2 uv) {
        vec2 p = uv*2.0 - 1.0;
        p *= 1.0 + dot(p,p)*0.032;
        return p*.5 + .5;
      }

      float glyphBand(vec2 uv, float density, float seed) {
        vec2 g = floor(vec2(uv.x * density, uv.y * 28.0));
        float h = hash2(g + seed);
        float v = step(.62, h);
        float stripe = step(.42, fract(uv.x * density + h * 2.0));
        return v * stripe;
      }

      void main() {
        vec2 uv = curveUV(vUv);

        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
          gl_FragColor = vec4(0.0,0.0,0.0,1.0);
          return;
        }

        float frame = floor(uTime * 24.0);
        float line = floor(uv.y * 190.0);
        float lineRand = hash(line + frame * 17.0);

        float tearGate = pow(lineRand, 8.0) * uTear;
        uv.x += (lineRand - .5) * tearGate * .2;

        float rollPos = fract(uTime * .11);
        float rollBand = 1.0 - smoothstep(0.0, .045, abs(uv.y-rollPos));
        uv.x += rollBand * sin(uv.y*70.0 + uTime*11.0) * .05 * uRoll;

        vec3 col = vec3(.0015, .004, .012);

        float n = hash2(vec2(
          floor(uv.x * 620.0),
          floor(uv.y * 430.0) + frame * 31.0
        ));
        n = pow(n, 3.2);
        col += vec3(n*.18, n*.42, n) * uNoise;

        float top = 1.0 - smoothstep(.34,.53,uv.y);
        float middle = smoothstep(.27,.40,uv.y) * (1.0-smoothstep(.62,.76,uv.y));
        float bottom = smoothstep(.58,.72,uv.y);

        float blueNoise = noise1(uv.y*260.0 + frame*2.0);
        float blueSeg = step(.45, sin(uv.x*250.0 + blueNoise*25.0 + frame*.9));
        blueSeg *= step(.37, blueNoise);
        col += vec3(.02,.14,1.15) * blueSeg * top * uBlue * uAmount;

        float warmNoise = noise1(uv.y*175.0 - uTime*8.0);
        float warmSeg = step(.25, sin(uv.x*175.0 + warmNoise*17.0));
        warmSeg *= step(.50, warmNoise);
        col += vec3(1.25,.12,.025) * warmSeg * middle * uOrange * uAmount;
        col += vec3(.95,.02,.35) * warmSeg * middle * uMagenta * uAmount * .75;

        float cyanNoise = noise1(uv.y*145.0 + frame*1.8);
        float cyanSeg = step(.18, sin(uv.x*140.0 + cyanNoise*22.0 + uTime*7.0));
        cyanSeg *= step(.30, cyanNoise);
        col += vec3(0.0,.78,1.45) * cyanSeg * bottom * uCyan * uAmount;

        float randomBar = step(.945, hash(floor(uv.y*68.0)+frame*4.0));
        col += mix(
          vec3(0.0,.7,1.35),
          vec3(1.4,.05,.18),
          hash(line+frame)
        ) * randomBar * uAmount * 1.4;

        // emerging "language" — numbers/telemetry halfway to logography
        float structured = glyphBand(uv, 22.0 + uStructure*28.0, floor(frame*.14));
        float syntaxLines = step(.72, sin((uv.y*46.0 + floor(uv.x*18.0)*.7) * 3.14159));
        structured *= mix(.25, 1.0, syntaxLines);
        col += vec3(.10,.9,1.5) * structured * uGlyph * .9;

        // chroma offset illusion
        float chroma = sin(uv.y*430.0 + uTime*7.0) * uRGBSplit;
        col.r += max(chroma,0.0)*.8;
        col.b += max(-chroma,0.0)*1.0;

        // scanlines
        float scan = .80 + .20 * sin(uv.y * 980.0);
        col *= scan;

        // phosphor mask
        float triad = mod(floor(uv.x*960.0),3.0);
        if (triad < 1.0) col.r *= 1.08;
        else if (triad < 2.0) col.g *= 1.06;
        else col.b *= 1.10;

        // subtle vertical hum
        col *= .96 + .04*sin(uTime*57.0 + uv.y*5.0);

        // glass vignette
        vec2 c = vUv - .5;
        float vig = 1.0 - smoothstep(.36,.73,length(c));
        col *= mix(.40,1.0,vig);

        // bloom-ish nonlinear lift
        col += col*col*.24*uAmount;

        gl_FragColor = vec4(col,1.0);
      }
    `,
  };

  // Swap the dark-glass material for the transmission material at boot.
  // The mesh stays invisible until activate() — dark/inactive before contact.
  screenMesh.material = material;

  // Phosphor illumination for the scene: near-zero until contact, then a
  // fast ease-in to full glow. Parented to the CRT group so it rides the fall.
  const glow = new THREE.PointLight(0x298dff, 0.05, 7.0, 2.0);
  glow.position.set(-0.18, 0.4, 2.6);
  if (parent) parent.add(glow);
  let glowTarget = 0.05;

  let active = false;

  function activate() {
    if (active) return;
    active = true;
    // Abrupt wake: snap straight to the full transmission state.
    uniforms.uAmount.value = GLYPHS.amount;
    uniforms.uTear.value = GLYPHS.tear;
    uniforms.uRoll.value = GLYPHS.roll;
    uniforms.uRGBSplit.value = GLYPHS.rgb;
    uniforms.uNoise.value = GLYPHS.noise;
    uniforms.uStructure.value = GLYPHS.structure;
    uniforms.uGlyph.value = GLYPHS.glyph;
    uniforms.uBlue.value = GLYPHS.blue;
    uniforms.uCyan.value = GLYPHS.cyan;
    uniforms.uOrange.value = GLYPHS.orange;
    uniforms.uMagenta.value = GLYPHS.magenta;
    glowTarget = 2.2;
    screenMesh.visible = true;
  }

  function update(dt) {
    const t = Math.max(0, Math.min(0.1, Number(dt) || 0.016));
    uniforms.uTime.value += t;
    // Fast ease-in for the phosphor light (~150–300ms). Uniforms are
    // snapped on activate; damping here only guards partial states.
    glow.intensity = damp(glow.intensity, glowTarget, 10, t);
  }

  return { activate, update, get active() { return active; } };
}
