import * as THREE from "three";

/* Scene 2 atmospheric beam — deliberately restrained.
   This is not a graphic sci-fi cone. It is a weak warm-white source
   becoming visible only because it catches suspended haze.
   Rebuilt to replace the old stacked-shell / core-column / shaft-plane /
   1500-particle tractor beam, which read as synthetic. */

export function makeFogTexture(size = 512) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(size * 0.5, size * 0.46, 0, size * 0.5, size * 0.5, size * 0.5);
  g.addColorStop(0.00, "rgba(255,248,232,0.82)");
  g.addColorStop(0.18, "rgba(255,239,211,0.34)");
  g.addColorStop(0.48, "rgba(255,224,185,0.11)");
  g.addColorStop(0.78, "rgba(255,216,176,0.025)");
  g.addColorStop(1.00, "rgba(255,216,176,0.0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function clamp01(v) { return Math.min(1, Math.max(0, v)); }
function smoothstep01(v) {
  v = clamp01(v);
  return v * v * (3 - 2 * v);
}

export function buildAtmosphericBeam() {
  const group = new THREE.Group();

  // One very soft volumetric shell. The shader breaks up the silhouette so
  // it feels like light in air rather than a solid transparent cone.
  const beamGeo = new THREE.CylinderGeometry(0.82, 4.15, 10.8, 64, 28, true);
  beamGeo.translate(0, -5.4, 0);

  const beamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uColor: { value: new THREE.Color(0xffedcf) }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vLocal;
      void main() {
        vUv = uv;
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying vec3 vLocal;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float valueNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      void main() {
        // uv.y = 1 near the top emitter, 0 toward the bottom of this shell.
        float topToBottom = 1.0 - vUv.y;
        float sourceFade = smoothstep(0.0, 0.10, topToBottom);
        float distanceFade = 1.0 - smoothstep(0.46, 1.0, topToBottom);

        // Low-frequency drift keeps the edge from looking mathematically perfect.
        float n1 = valueNoise(vec2(vUv.x * 3.0, vUv.y * 2.2 + uTime * 0.025));
        float n2 = valueNoise(vec2(vUv.x * 8.0 + 4.0, vUv.y * 5.0 - uTime * 0.018));
        float breakup = mix(0.64, 1.0, n1) * mix(0.82, 1.0, n2);

        // Very low total opacity on purpose — the void stays near-black.
        float alpha = 0.008 * sourceFade * distanceFade * breakup * uOpacity;
        gl_FragColor = vec4(uColor, alpha);
      }
    `
  });

  const beamVolume = new THREE.Mesh(beamGeo, beamMat);
  group.add(beamVolume);

  // Soft camera-facing haze. No hard edge, no visible "card" border.
  const fogTexture = makeFogTexture();
  const fogSprites = [];
  const fogSettings = [
    { y: -1.0, sx: 3.4, sy: 2.8, o: 0.028 },
    { y: -2.7, sx: 4.8, sy: 3.9, o: 0.021 },
    { y: -4.7, sx: 6.2, sy: 4.8, o: 0.013 },
    { y: -6.9, sx: 7.6, sy: 5.5, o: 0.007 }
  ];
  fogSettings.forEach((cfg, i) => {
    const mat = new THREE.SpriteMaterial({
      map: fogTexture,
      color: i < 2 ? 0xfff1d8 : 0xffe6c2,
      transparent: true,
      opacity: cfg.o,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set((i % 2 ? 0.16 : -0.10), cfg.y, -0.05 * i);
    sprite.scale.set(cfg.sx, cfg.sy, 1);
    sprite.userData.baseOpacity = cfg.o;
    sprite.userData.baseX = sprite.position.x;
    fogSprites.push(sprite);
    group.add(sprite);
  });

  // Sparse suspended particulate: enough to sell atmosphere, never glitter.
  const dustCount = 32;
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    const t = Math.random();
    const y = -0.35 - t * 8.7;
    const radius = 0.45 + t * 3.25;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    dustPositions[i * 3 + 0] = Math.cos(a) * r;
    dustPositions[i * 3 + 1] = y;
    dustPositions[i * 3 + 2] = Math.sin(a) * r * 0.72;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dustMat = new THREE.PointsMaterial({
    color: 0xffefd6,
    size: 0.040,
    transparent: true,
    opacity: 0.10,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });
  group.add(new THREE.Points(dustGeo, dustMat));

  return { group, beamMat, fogSprites, dustMat, fogTexture };
}

/* Master power control owned by the scene timeline.
   power: 1 = full atmosphere, 0 = light has left the fog.
   The lower haze leads the fade so it reads as dissipation,
   not a switch. t is the global elapsed time (for micro-drift). */
export function setBeamPower(beam, power, t) {
  const shutdown = 1.0 - clamp01(power);

  beam.beamMat.uniforms.uTime.value = t;
  beam.beamMat.uniforms.uOpacity.value = clamp01(power);

  beam.fogSprites.forEach((sprite, i) => {
    const reverseIndex = beam.fogSprites.length - 1 - i;
    const localDelay = reverseIndex * 0.075;
    const localShutdown = smoothstep01(
      (shutdown - localDelay) / Math.max(0.001, 1.0 - localDelay)
    );
    const breathing = 1.0 + Math.sin(t * 0.34 + i * 1.7) * 0.020;
    sprite.material.opacity = sprite.userData.baseOpacity * (1.0 - localShutdown) * breathing;
    sprite.position.x = sprite.userData.baseX + Math.sin(t * 0.13 + i) * 0.025;
  });

  beam.dustMat.opacity = 0.035 * Math.pow(clamp01(power), 1.8);
  beam.group.visible = power > 0.003;
}
