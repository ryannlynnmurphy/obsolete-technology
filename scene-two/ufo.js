import * as THREE from "three";

/* Industrial UFO — ported from Downloads/cinematic_industrial_ufo.html.
   Single lathed silhouette, machined dome, architectural hull detail,
   recessed underside with a gradient emitter disc inside the aperture.
   Demo-only parts (renderer, camera, RectAreaLights, room dust, haze
   sprites, composer + finishing pass, loop, resize) are NOT copied —
   this only builds the asset. Warm machine lights are parented to the
   craft so they ride the flight rig. */

function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function makeIndustrialMaps(seed = 19, size = 512) {
  const rand = mulberry32(seed);

  const roughCanvas = document.createElement("canvas");
  const bumpCanvas = document.createElement("canvas");
  roughCanvas.width = roughCanvas.height = size;
  bumpCanvas.width = bumpCanvas.height = size;

  const rctx = roughCanvas.getContext("2d");
  const bctx = bumpCanvas.getContext("2d");

  const roughImage = rctx.createImageData(size, size);
  const bumpImage = bctx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const machining = 0.5 + 0.5 * Math.sin(y * 0.34) * 0.055;
    const broad = 0.5 + 0.5 * Math.sin(y * 0.028 + 1.3) * 0.10;

    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n = rand();
      const scratch = rand() > 0.997 ? rand() * 0.35 : 0;
      const rough = 172 + (n - 0.5) * 30 + (machining - 0.5) * 70 + (broad - 0.5) * 24 - scratch * 90;
      const bump = 128 + (n - 0.5) * 18 + (machining - 0.5) * 26 - scratch * 46;
      const rv = Math.max(70, Math.min(235, rough));
      const bv = Math.max(78, Math.min(185, bump));
      roughImage.data[i + 0] = rv;
      roughImage.data[i + 1] = rv;
      roughImage.data[i + 2] = rv;
      roughImage.data[i + 3] = 255;
      bumpImage.data[i + 0] = bv;
      bumpImage.data[i + 1] = bv;
      bumpImage.data[i + 2] = bv;
      bumpImage.data[i + 3] = 255;
    }
  }

  rctx.putImageData(roughImage, 0, 0);
  bctx.putImageData(bumpImage, 0, 0);

  // Directional micro-scratches: visible only when a highlight catches them.
  bctx.globalAlpha = 0.18;
  bctx.strokeStyle = "#dddddd";
  bctx.lineWidth = 0.45;
  for (let i = 0; i < 260; i++) {
    const y = rand() * size;
    const x = rand() * size;
    const len = 7 + rand() * 80;
    bctx.beginPath();
    bctx.moveTo(x, y);
    bctx.lineTo(Math.min(size, x + len), y + (rand() - 0.5) * 1.4);
    bctx.stroke();
  }

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  for (const tex of [roughnessMap, bumpMap]) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4.2, 1.5);
    tex.anisotropy = 8;
  }
  roughnessMap.colorSpace = THREE.NoColorSpace;
  bumpMap.colorSpace = THREE.NoColorSpace;
  return { roughnessMap, bumpMap };
}

export const EMITTER_BASE_OPACITY = 0.78;
// Correct outward normals expose these reflections; keep the emitter
// warm without clipping the metal around it to white.
export const WARM_BOUNCE_BASE = 48;
export const WARM_CORE_BASE = 24;
export const WARM_SIDE_BASE = 10;

export function buildUFO() {
  const hullMaps = makeIndustrialMaps(29);
  const domeMaps = makeIndustrialMaps(71);
  domeMaps.roughnessMap.repeat.set(2.7, 1.25);
  domeMaps.bumpMap.repeat.set(2.7, 1.25);

  const hullMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x4a5054),
    metalness: 0.92,
    roughness: 0.58,
    roughnessMap: hullMaps.roughnessMap,
    bumpMap: hullMaps.bumpMap,
    bumpScale: 0.025
  });
  const domeMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x555c60),
    metalness: 0.90,
    roughness: 0.64,
    roughnessMap: domeMaps.roughnessMap,
    bumpMap: domeMaps.bumpMap,
    bumpScale: 0.018
  });
  const jointMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x1d2225),
    metalness: 0.82,
    roughness: 0.80,
    roughnessMap: hullMaps.roughnessMap,
    bumpMap: hullMaps.bumpMap,
    bumpScale: 0.035
  });
  const undersideMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x272c2f),
    metalness: 0.88,
    roughness: 0.72,
    roughnessMap: hullMaps.roughnessMap,
    bumpMap: hullMaps.bumpMap,
    bumpScale: 0.025
  });
  const seamMaterial = new THREE.LineBasicMaterial({
    color: 0x101315, transparent: true, opacity: 0.56,
    depthWrite: false, blending: THREE.NormalBlending
  });
  const edgeCatchMaterial = new THREE.LineBasicMaterial({
    color: 0x7b858a, transparent: true, opacity: 0.11, depthWrite: false
  });

  const ufo = new THREE.Group();
  ufo.rotation.set(0.018, -0.09, -0.014);
  ufo.position.set(0, 0.2, 0);

  // PASS 1: SILHOUETTE — one lathed cross-section; rim, saucer, transition
  // and belly read as one mass. Central underside left open for the assembly.
  const hullProfile = [
    [0.00, 1.42], [1.30, 1.40], [3.20, 1.31], [5.70, 1.16],
    [8.50, 0.94], [11.20, 0.68], [13.40, 0.45], [14.85, 0.25],
    [14.92, 0.08], [14.58, -0.02], [14.62, -0.16], [15.36, -0.30],
    [16.18, -0.46], [16.72, -0.73], [16.84, -1.04], [16.67, -1.33],
    [16.22, -1.57], [15.20, -1.79], [13.55, -1.99], [11.30, -2.22],
    [8.80, -2.52], [6.75, -2.79], [5.30, -3.02], [4.30, -3.17]
  ].map(([r, y]) => new THREE.Vector2(r, y));
  // Lathe profiles must trace the outside from bottom to top. Reversing
  // this top-to-bottom profile fixes culling without changing the shape.
  // Keep LatheGeometry's analytic normals, including its closed seam.
  const hullGeo = new THREE.LatheGeometry(hullProfile.reverse(), 256);
  const hull = new THREE.Mesh(hullGeo, hullMaterial);
  hull.castShadow = true;
  hull.receiveShadow = true;
  ufo.add(hull);

  // Narrow dark collar inside the silhouette's recessed joint.
  const jointProfile = [
    [14.55, 0.035], [14.87, -0.025], [14.92, -0.145], [14.61, -0.185]
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const jointGeo = new THREE.LatheGeometry(jointProfile.reverse(), 256);
  const joint = new THREE.Mesh(jointGeo, jointMaterial);
  joint.renderOrder = 1;
  ufo.add(joint);

  // PASS 2: DOME — custom lathed profile with a wide, low-rooted transition.
  const domeProfile = [
    [5.20, 1.24], [5.06, 1.52], [4.76, 1.89], [4.28, 2.36],
    [3.65, 2.89], [2.90, 3.45], [2.02, 3.91], [1.08, 4.20],
    [0.30, 4.31], [0.00, 4.32]
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const domeGeo = new THREE.LatheGeometry(domeProfile, 192);
  const dome = new THREE.Mesh(domeGeo, domeMaterial);
  dome.castShadow = true;
  dome.receiveShadow = true;
  ufo.add(dome);

  // Broad, machined base shoulder around the dome.
  const shoulderProfile = [
    [4.25, 1.33], [5.15, 1.27], [5.62, 1.16], [5.43, 1.08], [4.10, 1.14]
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const shoulderGeo = new THREE.LatheGeometry(shoulderProfile.reverse(), 192);
  const shoulder = new THREE.Mesh(shoulderGeo, jointMaterial);
  shoulder.castShadow = true;
  shoulder.receiveShadow = true;
  ufo.add(shoulder);

  // LARGE-SCALE ARCHITECTURAL HULL DETAIL
  const upperProfileSamples = [
    [0.0, 1.42], [1.3, 1.40], [3.2, 1.31], [5.7, 1.16],
    [8.5, 0.94], [11.2, 0.68], [13.4, 0.45], [14.85, 0.25]
  ];
  function upperHullY(r) {
    for (let i = 0; i < upperProfileSamples.length - 1; i++) {
      const a = upperProfileSamples[i];
      const b = upperProfileSamples[i + 1];
      if (r >= a[0] && r <= b[0]) {
        const t = (r - a[0]) / (b[0] - a[0]);
        return THREE.MathUtils.lerp(a[1], b[1], t);
      }
    }
    return upperProfileSamples.at(-1)[1];
  }
  function surfacePoint(r, theta, lift = 0.012) {
    return new THREE.Vector3(
      Math.cos(theta) * r,
      upperHullY(r) + lift,
      Math.sin(theta) * r
    );
  }
  function makeRadialSeam(angle, r0, r1, kink = 0) {
    const pts = [];
    const steps = 42;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const r = THREE.MathUtils.lerp(r0, r1, t);
      const bend = Math.sin(t * Math.PI) * kink;
      pts.push(surfacePoint(r, angle + bend, 0.018));
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts), seamMaterial);
    ufo.add(line);
    return line;
  }
  function makeArcSeam(r, a0, a1, wobble = 0) {
    const pts = [];
    const steps = 72;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = THREE.MathUtils.lerp(a0, a1, t);
      const rr = r + Math.sin(t * Math.PI * 2.0) * wobble;
      pts.push(surfacePoint(rr, a, 0.020));
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts), seamMaterial);
    ufo.add(line);
    return line;
  }
  [
    [-2.60, 5.5, 13.2, 0.018], [-1.96, 6.1, 14.0, -0.013],
    [-1.22, 5.8, 12.7, 0.020], [-0.48, 6.2, 14.1, -0.015],
    [0.29, 5.7, 13.4, 0.012], [1.08, 6.0, 14.0, -0.018],
    [1.86, 5.4, 12.9, 0.016], [2.55, 6.1, 14.1, -0.010]
  ].forEach(args => makeRadialSeam(...args));
  makeArcSeam(7.15, -2.82, -1.64, 0.08);
  makeArcSeam(9.65, -1.33, -0.18, 0.06);
  makeArcSeam(11.65, 0.35, 1.48, 0.07);
  makeArcSeam(8.55, 1.70, 2.78, 0.05);

  // Gigantic inset plates subtly vary roughness and value.
  function makeSectorPlate(r0, r1, a0, a1, material, segments = 38) {
    const positions = [];
    const uvs = [];
    const indices = [];
    // Follow every bend in the hull instead of bridging it with one flat
    // strip, which can sink through the surface. Match the lathe's UVs so
    // roughness and machining do not collapse to a single texture pixel.
    const radii = [r0, ...upperProfileSamples.map(p => p[0]).filter(r => r > r0 && r < r1), r1];
    const stride = radii.length;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const a = THREE.MathUtils.lerp(a0, a1, t);
      for (const r of radii) {
        const p = surfacePoint(r, a, 0.010);
        positions.push(p.x, p.y, p.z);
        let j = 0;
        while(j < upperProfileSamples.length - 2 && r > upperProfileSamples[j + 1][0]) j++;
        const fraction = (r - upperProfileSamples[j][0]) /
          (upperProfileSamples[j + 1][0] - upperProfileSamples[j][0]);
        uvs.push((Math.PI / 2 - a) / (Math.PI * 2), 1 - (j + fraction) / (hullProfile.length - 1));
      }
    }
    for (let i = 0; i < segments; i++) {
      for(let j = 0; j < stride - 1; j++){
        const k = i * stride + j;
        indices.push(k, k + stride, k + 1, k + 1, k + stride, k + stride + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.renderOrder = 0;
    ufo.add(mesh);
    return mesh;
  }
  const plateMaterialA = hullMaterial.clone();
  plateMaterialA.color = new THREE.Color(0x474d50);
  plateMaterialA.roughness = 0.64;
  plateMaterialA.polygonOffset = true;
  plateMaterialA.polygonOffsetFactor = -1;
  plateMaterialA.polygonOffsetUnits = -1;
  const plateMaterialB = hullMaterial.clone();
  plateMaterialB.color = new THREE.Color(0x4d5356);
  plateMaterialB.roughness = 0.56;
  plateMaterialB.polygonOffset = true;
  plateMaterialB.polygonOffsetFactor = -1;
  plateMaterialB.polygonOffsetUnits = -1;
  makeSectorPlate(8.2, 11.1, -2.47, -1.82, plateMaterialA);
  makeSectorPlate(10.1, 13.4, -0.88, -0.27, plateMaterialB);
  makeSectorPlate(7.5, 10.8, 0.78, 1.31, plateMaterialA);
  makeSectorPlate(10.4, 13.7, 1.95, 2.50, plateMaterialB);

  // Nearly invisible long highlight catch around the forged rim.
  const rimPoints = [];
  for (let i = 0; i <= 190; i++) {
    const a = THREE.MathUtils.lerp(-2.8, -0.10, i / 190);
    rimPoints.push(new THREE.Vector3(Math.cos(a) * 16.77, -0.83, Math.sin(a) * 16.77));
  }
  ufo.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(rimPoints), edgeCatchMaterial));

  // UNDERSIDE — RECESSED, HEAVY, SIMPLE
  function lathedPart(profile, material, segments = 160) {
    const points = profile.map(([r, y]) => new THREE.Vector2(r, y));
    const geo = new THREE.LatheGeometry(points.reverse(), segments);
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    ufo.add(mesh);
    return mesh;
  }
  // Cavity wall + nested structural lip.
  lathedPart([[4.32, -3.14], [4.17, -3.30], [3.90, -3.48], [3.42, -3.58]], jointMaterial);
  lathedPart([[3.44, -3.57], [3.22, -3.69], [2.96, -3.76], [2.70, -3.72]], undersideMaterial);

  // Dark aperture.
  const aperture = new THREE.Mesh(
    new THREE.CircleGeometry(2.72, 128),
    new THREE.MeshStandardMaterial({
      color: 0x090a0a, metalness: 0.72, roughness: 0.92, side: THREE.DoubleSide
    })
  );
  aperture.rotation.x = Math.PI / 2;
  aperture.position.y = -3.74;
  ufo.add(aperture);

  // Deep warm emitter — physically "inside" the opening.
  const emitterCanvas = document.createElement("canvas");
  emitterCanvas.width = emitterCanvas.height = 256;
  const ectx = emitterCanvas.getContext("2d");
  const grad = ectx.createRadialGradient(128, 128, 6, 128, 128, 126);
  grad.addColorStop(0.00, "#fff3cf");
  grad.addColorStop(0.12, "#ffc873");
  grad.addColorStop(0.38, "#c55c24");
  grad.addColorStop(0.67, "#4a1709");
  grad.addColorStop(1.00, "#050201");
  ectx.fillStyle = grad;
  ectx.fillRect(0, 0, 256, 256);
  const emitterTex = new THREE.CanvasTexture(emitterCanvas);
  emitterTex.colorSpace = THREE.SRGBColorSpace;
  const emitterMat = new THREE.MeshBasicMaterial({
    map: emitterTex, transparent: true, opacity: EMITTER_BASE_OPACITY,
    side: THREE.DoubleSide, depthWrite: false
  });
  const emitter = new THREE.Mesh(new THREE.CircleGeometry(2.30, 128), emitterMat);
  emitter.rotation.x = Math.PI / 2;
  emitter.position.y = -3.80;
  ufo.add(emitter);

  // Heavy internal collar blocking most of the emitter from direct view.
  lathedPart([[2.54, -3.71], [2.38, -3.88], [1.86, -4.02], [1.52, -4.00]], jointMaterial);

  // Warm machine lights, parented to the craft so they ride the rig.
  const warmBounce = new THREE.PointLight(0xff7b32, WARM_BOUNCE_BASE, 20, 2.0);
  warmBounce.position.set(0.2, -5.05, 1.0);
  ufo.add(warmBounce);
  const warmCore = new THREE.PointLight(0xffa052, WARM_CORE_BASE, 9.0, 2.0);
  warmCore.position.set(-0.25, -4.0, 0.1);
  ufo.add(warmCore);
  // Weak off-axis warm irregularity: breaks perfect emitter symmetry.
  const warmSide = new THREE.PointLight(0xc94d20, WARM_SIDE_BASE, 8, 2.0);
  warmSide.position.set(-2.2, -4.15, 1.0);
  ufo.add(warmSide);

  return { ufo, emitterMat, warmBounce, warmCore, warmSide };
}
