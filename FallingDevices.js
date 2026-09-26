/* ============================================================
   FallingDevices — staged slow-fall.

   The event: the TV drops hard and gets farther ahead, the CRT
   and laptop follow. Slow motion engages only once all three are
   inside the frame — then everything sinks at ~4% speed, spaced
   apart, forever (wrap top/bottom, invisible).

   Clicking a screen steps inside that machine (handled in the
   page); the focused body freezes so its screen is stable.
   Bodies are never dragged — they stay where the fall takes them.
   ============================================================ */
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function smoothstep(min, max, value) {
  const x = clamp((value - min) / (max - min), 0, 1);
  return x * x * (3 - 2 * x);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

const STEP = 1 / 60;          // real-time pacing, display independent
const FULL_GRAVITY = -13;

/* Deep slow motion, with restraint: visible drift, not a still. */
const SINK_SCALE = 0.04;
const STRETCH_LEN = 2.5;

/* Slow-mo trigger: everyone spawned, last arrival in frame,
   leader still above the bottom. Frame-relative, not timed. */
const FRAME_TOP = 11;
const FRAME_BOTTOM = -6;

/* Wrap band — both outside the visible frame. */
const WRAP_TOP = 13;
const WRAP_BOTTOM = -8;

export class FallingDevices {
  constructor({ scene, camera, renderer }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    this.world = null;
    this.devices = [];

    this.simClock = 0;
    this.acc = 0;
    this.stretchStart = -1;
  }

  async init(deviceDefinitions) {
    await RAPIER.init();

    this.world = new RAPIER.World({ x: 0, y: FULL_GRAVITY, z: 0 });
    this.world.timestep = STEP;

    this.devices = deviceDefinitions.map((definition) => {
      definition.object.visible = false;
      return { ...definition, body: null, spawned: false };
    });

    this.simClock = 0;
    this.acc = 0;
    this.stretchStart = -1;
  }

  deviceByName(name) {
    return this.devices.find((d) => d.name === name);
  }

  spawnDevice(device) {
    if (device.spawned) return;

    const { position, rotation, velocity, angularVelocity, colliders, mass } = device;

    device.object.visible = true;

    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rotation.x, rotation.y, rotation.z)
    );
    device.object.position.set(position.x, position.y, position.z);
    device.object.quaternion.copy(q);
    device.object.updateMatrixWorld();

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setLinvel(velocity.x, velocity.y, velocity.z)
      .setAngvel({ x: angularVelocity.x, y: angularVelocity.y, z: angularVelocity.z })
      .setLinearDamping(0.05)
      .setAngularDamping(2.0)
      .setCanSleep(false)
      .setCcdEnabled(false);

    device.body = this.world.createRigidBody(bodyDesc);

    /* Split mass across colliders by volume so compound
       bodies (open laptop lid, TV legs) weigh correctly. */
    let volume = 0;
    for (const c of colliders) volume += (c.h[0] * 2) * (c.h[1] * 2) * (c.h[2] * 2);
    const density = mass / Math.max(volume, 1e-6);

    for (const c of colliders) {
      const colliderDesc = RAPIER.ColliderDesc.cuboid(c.h[0], c.h[1], c.h[2])
        .setTranslation(c.p[0], c.p[1], c.p[2])
        .setRotation({ x: c.q[0], y: c.q[1], z: c.q[2], w: c.q[3] })
        .setDensity(density)
        .setFriction(0.6)
        .setRestitution(0.1);
      this.world.createCollider(colliderDesc, device.body);
    }

    /* Map meshes back to the device for picking. */
    device.object.traverse((child) => {
      child.userData.physicsDevice = device;
    });

    device.spawned = true;
  }

  update(frameDt) {
    if (!this.world) return;

    this.acc = Math.min(this.acc + frameDt, 0.12);
    while (this.acc >= STEP) {
      this.stepSim(STEP);
      this.acc -= STEP;
    }

    this.syncMeshes();
  }

  stepSim(dt) {
    this.simClock += dt;

    for (const device of this.devices) {
      if (!device.spawned && this.simClock >= device.delay) {
        this.spawnDevice(device);
      }
    }

    /* The trigger: all in frame before time stretches. */
    if (this.stretchStart < 0 && this.devices.every((d) => d.spawned)) {
      const ys = this.devices.map((d) => d.body.translation().y);
      const topY = Math.max(...ys);
      const botY = Math.min(...ys);
      if (topY < FRAME_TOP && botY > FRAME_BOTTOM) {
        this.stretchStart = this.simClock;
      }
    }

    const phase = this.stretchStart < 0
      ? 0
      : smoothstep(this.stretchStart, this.stretchStart + STRETCH_LEN, this.simClock);

    /* Drop regime -> sink regime, blended through the stretch. */
    this.world.timestep = STEP * lerp(1, SINK_SCALE, phase);
    for (const device of this.devices) {
      if (!device.body) continue;
      device.body.setLinearDamping(lerp(device.dropDamp, device.fallDamp, phase));
      device.body.setGravityScale(lerp(device.dropG, 1, phase), false);
    }

    /* Wrap below-frame to above-frame, motion intact (never a frozen
       focused one). */
    for (const device of this.devices) {
      if (!device.body || device.frozen) continue;
      const p = device.body.translation();
      if (p.y < WRAP_BOTTOM) {
        device.body.setTranslation({ x: p.x, y: WRAP_TOP, z: p.z }, true);
      }
    }

    this.world.step();
  }

  /* Freeze / release a body for screen focus. A frozen body holds
     perfectly still so its screen is stable to use. */
  setFrozen(name, freeze) {
    const device = this.deviceByName(name);
    if (!device || !device.body) return;
    device.frozen = freeze;
    if (freeze) {
      device.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      device.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      device.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
    } else {
      device.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    }
  }

  syncMeshes() {
    for (const device of this.devices) {
      if (!device.body) continue;
      const p = device.body.translation();
      const r = device.body.rotation();
      device.object.position.set(p.x, p.y, p.z);
      device.object.quaternion.set(r.x, r.y, r.z, r.w);
      device.object.updateMatrixWorld();
    }
  }

  destroy() {
    if (this.world) {
      this.world.free();
      this.world = null;
    }
    this.devices = [];
  }
}
