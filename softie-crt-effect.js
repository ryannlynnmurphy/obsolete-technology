// softie-crt-effect.js — subtle Three.js CRT glass over the Softie screen.
// Intent: "old CRT", not "glitch shader". No RGB split, static, tearing,
// VHS bars, or random flicker. The overlay only dips when Softie itself
// reports a latency event (every ~3rd/4th/5th eligible action).
//
// Usage:
//   import { createSoftieCRTEffect } from './softie-crt-effect.js';
//   const crtEffect = createSoftieCRTEffect({ THREE, screenMesh, camera });
//   // per frame: crtEffect.update(delta);
//   // on Softie latency: crtEffect.triggerLag();

export function createSoftieCRTEffect(options = {}) {
  const {
    THREE,
    screenMesh,
    camera,
    strength = 1,
    curvature = 0.0075,
    glassOffset = 0.0018,
  } = options;

  if (!THREE) throw new Error('createSoftieCRTEffect: THREE is required');
  if (!screenMesh) throw new Error('createSoftieCRTEffect: screenMesh is required');

  const s = Math.max(0, Math.min(2, Number(strength) || 1));
  const parent = screenMesh.parent || null;

  const basePos = screenMesh.position.clone();
  const baseQuat = screenMesh.quaternion.clone();
  const baseScale = screenMesh.scale.clone();

  // Clone geometry so we can add an extremely small convex bulge
  // without touching the original screen geometry.
  let glassGeo;
  try {
    glassGeo = screenMesh.geometry.clone();
    if (curvature > 0 && glassGeo?.attributes?.position) {
      glassGeo.computeBoundingBox();
      const bb = glassGeo.boundingBox;
      const size = new THREE.Vector3();
      bb.getSize(size);
      const pos = glassGeo.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const nx = size.x > 0 ? v.x / (size.x / 2) : 0;
        const ny = size.y > 0 ? v.y / (size.y / 2) : 0;
        const d = Math.max(0, 1 - (nx * nx * 0.85 + ny * ny * 0.9));
        v.z += curvature * d * d;
      }
      pos.needsUpdate = true;
      glassGeo.computeVertexNormals();
    }
  } catch {
    glassGeo = screenMesh.geometry;
  }

  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.065 * s,
    roughness: 0.22,
    metalness: 0,
    transmission: 0.08,
    thickness: 0.06,
    clearcoat: 0.8,
    clearcoatRoughness: 0.18,
    ior: 1.46,
    reflectivity: 0.22,
    depthWrite: false,
  });

  const glass = new THREE.Mesh(glassGeo, glassMaterial);
  glass.position.copy(basePos);
  glass.quaternion.copy(baseQuat);
  glass.scale.copy(baseScale);
  // Nudge along the screen's local +z (out toward the viewer).
  glass.translateZ(glassOffset);
  glass.renderOrder = 10;
  glass.raycast = () => {};
  if (parent) parent.add(glass);

  // Faint fake room reflection — a diagonal patch of light that drifts
  // by a few pixels as the viewing angle changes. 4.5% opacity max.
  const reflectionMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uViewShift: { value: new THREE.Vector2(0, 0) },
      uOpacity: { value: 0.045 * s },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform vec2 uViewShift;
      uniform float uOpacity;
      void main() {
        vec2 uv = vUv + uViewShift;
        float diagonal = uv.y - (0.82 - uv.x * 0.16);
        float reflection = exp(-pow(diagonal * 8.0, 2.0));
        reflection *= smoothstep(0.9, 0.15, distance(uv, vec2(0.32, 0.75)));
        gl_FragColor = vec4(vec3(0.92, 0.96, 1.0), reflection * uOpacity);
      }
    `,
  });

  const reflection = new THREE.Mesh(glassGeo.clone(), reflectionMaterial);
  reflection.position.copy(glass.position);
  reflection.quaternion.copy(glass.quaternion);
  reflection.scale.copy(glass.scale);
  reflection.translateZ(0.0008);
  reflection.renderOrder = 11;
  reflection.raycast = () => {};
  if (parent) parent.add(reflection);

  // Almost-invisible scanline / phosphor texture. Only resolves when
  // close to the monitor.
  const scanCanvas = document.createElement('canvas');
  scanCanvas.width = 4;
  scanCanvas.height = 4;
  const sctx = scanCanvas.getContext('2d');
  sctx.clearRect(0, 0, 4, 4);
  sctx.fillStyle = 'rgba(0,0,0,0.55)';
  sctx.fillRect(0, 3, 4, 1);
  sctx.fillStyle = 'rgba(255,255,255,0.28)';
  sctx.fillRect(0, 0, 4, 1);
  const scanTex = new THREE.CanvasTexture(scanCanvas);
  scanTex.wrapS = THREE.RepeatWrapping;
  scanTex.wrapT = THREE.RepeatWrapping;
  scanTex.repeat.set(1, 220);
  scanTex.magFilter = THREE.NearestFilter;

  const scanMaterial = new THREE.MeshBasicMaterial({
    map: scanTex,
    transparent: true,
    opacity: 0.05 * s,
    depthWrite: false,
    toneMapped: false,
  });
  const scan = new THREE.Mesh(glassGeo.clone(), scanMaterial);
  scan.position.copy(glass.position);
  scan.quaternion.copy(glass.quaternion);
  scan.scale.copy(glass.scale);
  scan.translateZ(0.0004);
  scan.renderOrder = 12;
  scan.raycast = () => {};
  if (parent) parent.add(scan);

  // Screen material dimming baseline (works for MeshBasicMaterial map
  // screens and MeshStandardMaterial screens alike).
  const screenMat = screenMesh.material || null;
  const hasEmissive =
    !!screenMat && typeof screenMat.emissiveIntensity === 'number';
  const baseEmissive = hasEmissive ? screenMat.emissiveIntensity : 1;
  const baseColor = screenMat?.color ? screenMat.color.clone() : null;

  let lag = 0; // 0..1, set to 1 on Softie latency-start, decays fast
  let time = Math.random() * 100;

  function triggerLag() {
    lag = 1;
  }

  function endLag() {
    // Settle quickly instead of snapping — the tail of update() finishes it.
    lag = Math.min(lag, 0.35);
  }

  const _localCam = camera ? new THREE.Vector3() : null;

  function update(delta = 0.016) {
    const dt = Math.max(0, Math.min(0.1, Number(delta) || 0.016));
    time += dt;

    // Fast exponential decay → ~100–180ms visible dip.
    lag = THREE.MathUtils.lerp(lag, 0, 1 - Math.pow(0.001, dt));
    if (lag < 0.001) lag = 0;

    // Tiny brightness breathing: ±~1.2%, slow. Should not be consciously noticed.
    const breathe = Math.sin(time * 0.8) * 0.012 * s;

    // Latency dip: brightness −3.5% max, shift ~0.0015 world units max.
    const dim = lag * 0.035 * s + breathe;
    const shift = lag * 0.0015 * s;

    // Move only the overlay layers — never the hit-tested screenMesh.
    glass.position.set(basePos.x, basePos.y + shift, basePos.z);
    glass.translateZ(0); // keep base offset baked via initial translate
    // Re-apply the glass offset along local z after the y shift:
    glass.position.copy(basePos);
    glass.position.y += shift;
    glass.quaternion.copy(baseQuat);
    glass.translateZ(glassOffset);

    reflection.position.copy(glass.position);
    reflection.quaternion.copy(glass.quaternion);
    reflection.translateZ(0.0008);

    scan.position.copy(glass.position);
    scan.quaternion.copy(glass.quaternion);
    scan.translateZ(0.0004);
    // Phosphor layer drifts a fraction of a visual pixel during lag.
    if (scanTex.offset) scanTex.offset.y = (lag * 0.0012) % 1;

    if (screenMat) {
      if (hasEmissive) {
        screenMat.emissiveIntensity = baseEmissive * (1 - dim);
      } else if (baseColor && 'color' in screenMat) {
        const k = 1 - dim;
        screenMat.color.setRGB(baseColor.r * k, baseColor.g * k, baseColor.b * k);
      }
    }
    // One very faint redraw band during lag: lift scanline opacity slightly.
    scanMaterial.opacity = (0.05 + lag * 0.03) * s;

    // Camera-relative reflection drift (absurdly small on purpose).
    if (camera && _localCam && screenMesh.parent) {
      try {
        _localCam.copy(camera.position);
        screenMesh.worldToLocal(_localCam);
        reflectionMaterial.uniforms.uViewShift.value.set(
          THREE.MathUtils.clamp(_localCam.x * 0.002, -0.025, 0.025),
          THREE.MathUtils.clamp(_localCam.y * 0.001, -0.015, 0.015)
        );
      } catch {
        // Never let the effect break the sculpture render loop.
      }
    }
  }

  function setStrength(next) {
    const ns = Math.max(0, Math.min(2, Number(next) || 0));
    glassMaterial.opacity = 0.065 * ns;
    reflectionMaterial.uniforms.uOpacity.value = 0.045 * ns;
    scanMaterial.opacity = 0.05 * ns;
  }

  function dispose() {
    for (const m of [glass, reflection, scan]) {
      try {
        parent?.remove(m);
        m.geometry?.dispose?.();
      } catch {
        // ignore teardown errors
      }
    }
    glassMaterial.dispose();
    reflectionMaterial.dispose();
    scanMaterial.dispose();
    scanTex.dispose();
    if (screenMat) {
      if (hasEmissive) screenMat.emissiveIntensity = baseEmissive;
      else if (baseColor && screenMat.color) screenMat.color.copy(baseColor);
    }
  }

  return {
    update,
    triggerLag,
    latencyStart: triggerLag,
    latencyEnd: endLag,
    setStrength,
    dispose,
    glass,
    reflection,
    get lag() {
      return lag;
    },
  };
}
