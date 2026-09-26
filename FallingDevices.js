/* ============================================================
   FallingDevices — Scene 1: ONE fast drop, then a HARD FREEZE.

   The three machines spawn above the frame and fall ballistically
   (Earth-like gravity, real elapsed time). Displayed transforms are
   sampled at ~24fps during the fall for a cinematic cadence; the
   camera stays smooth throughout.

   At the freeze instant the current transforms are captured, every
   body is parked, and the physics world is destroyed. The frozen
   poses then drive the meshes directly, forever:

     PRE_DROP → FALLING → FROZEN (terminal; never loops back)

   There is no slow-motion sink, no wrap/respawn, no second drop.
   After FROZEN the objects are a sculpture: untouchable, unmoving.
   Only the camera moves (OrbitControls, wired up in the page).
   ============================================================ */
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

const STEP = 1 / 60;          // physics runs full-rate, display-independent
const SAMPLE_24 = 1 / 24;     // ...but poses are sampled at film cadence

export class FallingDevices {
  constructor({ scene, camera, renderer }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    this.world = null;
    this.devices = [];

    this.state = "PRE_DROP";
    this.simClock = 0;
    this.acc = 0;
    this.sampleAcc = 0;

    this.gravity = -12;
    this.freezeY = -0.5;
    this.leadName = "tv";
    this.onFreeze = null;
  }

  async init(deviceDefinitions, options = {}) {
    await RAPIER.init();

    this.gravity = options.gravity ?? -12;
    this.freezeY = options.freezeY ?? -0.5;
    this.leadName = options.leadName ?? "tv";
    this.onFreeze = typeof options.onFreeze === "function" ? options.onFreeze : null;

    this.world = new RAPIER.World({ x: 0, y: this.gravity, z: 0 });
    this.world.timestep = STEP;

    this.devices = deviceDefinitions.map((definition) => {
      definition.object.visible = false;
      return { ...definition, body: null, spawned: false, frozenPose: null };
    });

    this.state = "PRE_DROP";
    this.simClock = 0;
    this.acc = 0;
    this.sampleAcc = 0;
    console.log("[sculpture] PRE_DROP — devices staged above frame");
  }

  getState() {
    return this.state;
  }

  deviceByName(name) {
    return this.devices.find((d) => d.name === name);
  }

  spawnDevice(device) {
    if (device.spawned) return;

    const { position, rotation, velocity, angularVelocity } = device;

    device.object.visible = true;

    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rotation.x, rotation.y, rotation.z)
    );
    device.object.position.set(position.x, position.y, position.z);
    device.object.quaternion.copy(q);
    device.object.updateMatrixWorld();

    // Pure ballistic bodies: no colliders (nothing to hit in the void),
    // no damping — heavy electronics in free fall.
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setLinvel(velocity.x, velocity.y, velocity.z)
      .setAngvel({ x: angularVelocity.x, y: angularVelocity.y, z: angularVelocity.z })
      .setLinearDamping(0)
      .setAngularDamping(0)
      .setCanSleep(false)
      .setCcdEnabled(false);

    device.body = this.world.createRigidBody(bodyDesc);

    device.object.traverse((child) => {
      child.userData.physicsDevice = device;
    });

    device.spawned = true;
  }

  update(frameDt) {
    if (this.state === "FROZEN") return;
    if (!this.world) return;

    this.acc = Math.min(this.acc + frameDt, 0.12);
    while (this.acc >= STEP) {
      this.stepSim(STEP);
      this.acc -= STEP;
      if (this.state === "FROZEN") break;
    }

    // Cinematic 24fps sampling: physics runs at full rate, the visible
    // sculpture updates at film cadence. Camera motion stays smooth.
    if (this.state === "FALLING") {
      this.sampleAcc += frameDt;
      if (this.sampleAcc >= SAMPLE_24) {
        this.sampleAcc = 0;
        this.syncMeshes();
      }
    }
  }

  stepSim(dt) {
    this.simClock += dt;

    let anySpawned = false;
    for (const device of this.devices) {
      if (!device.spawned && this.simClock >= device.delay) {
        this.spawnDevice(device);
      }
      if (device.spawned) anySpawned = true;
    }

    if (anySpawned && this.state === "PRE_DROP") {
      this.state = "FALLING";
      console.log("[sculpture] FALL START — falling at real speed");
    }

    this.world.step();

    // The lead (lowest, heaviest) device reaching its mark ends the fall.
    // Same gravity + same initial velocity for all three, so the spawn
    // offsets ARE the frozen composition.
    const lead = this.deviceByName(this.leadName);
    if (this.state === "FALLING" && lead && lead.body) {
      if (lead.body.translation().y <= this.freezeY) {
        this.hardFreeze();
      }
    }
  }

  hardFreeze() {
    if (this.state === "FROZEN") return;
    console.log("[sculpture] FREEZE TRIGGERED");

    // Capture the exact transforms at this instant — the render loop
    // uses these directly from now on. Physics never touches them again.
    this.syncMeshes();
    for (const device of this.devices) {
      device.frozenPose = {
        p: device.object.position.clone(),
        q: device.object.quaternion.clone(),
      };
      if (device.body) {
        try {
          device.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          device.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          device.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
        } catch {
          // already gone — the poses above are what matter
        }
      }
      device.body = null;
    }

    // Sever the simulation entirely. No stepping, no settling, no wakeups.
    try {
      this.world.free();
    } catch {
      // ignore teardown errors
    }
    this.world = null;
    this.state = "FROZEN";
    console.log("[sculpture] PHYSICS DISABLED — SCULPTURE LOCKED");

    if (this.onFreeze) {
      try {
        this.onFreeze(this.getCenter());
      } catch {
        // host wiring errors must not unfreeze anything
      }
    }
  }

  getCenter() {
    const c = new THREE.Vector3();
    let n = 0;
    for (const d of this.devices) {
      if (d.spawned) {
        c.add(d.object.position);
        n++;
      }
    }
    return n ? c.multiplyScalar(1 / n) : new THREE.Vector3(0, 2, 0);
  }

  /* Kept for the screen-focus code: after the Scene-1 freeze this is a
     harmless no-op (bodies are parked and the world is gone). */
  setFrozen(name, freeze) {
    if (!this.world) return;
    const device = this.deviceByName(name);
    if (!device || !device.body) return;
    try {
      device.body.setBodyType(
        freeze ? RAPIER.RigidBodyType.Fixed : RAPIER.RigidBodyType.Dynamic,
        true
      );
    } catch {
      // ignore
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
