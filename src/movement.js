import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { WORLD } from './config.js';
import { clampToBeach, sandHeight } from './terrain.js';
import { lookAfterDrag } from './touch.js';

const UP = new THREE.Vector3(0, 1, 0);
const RIDE_NEAR = 0.02;
const WALK_NEAR = 0.1;

// Pure: turns forward/strafe input and a flat look direction into a new x and z.
const step = ({ x, z }, forward, strafe, look, distance) => {
  const right = new THREE.Vector3().crossVectors(look, UP);
  return {
    x: x + (look.x * forward + right.x * strafe) * distance,
    z: z + (look.z * forward + right.z * strafe) * distance,
  };
};

const keyboardInput = (keys) => ({
  forward: (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0),
  strafe: (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
  run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
});

const thumbstickInput = (session) => {
  const axes = [...(session?.inputSources ?? [])].map((source) => source.gamepad?.axes ?? []).find((a) => a.length >= 4);
  if (!axes) return { forward: 0, strafe: 0, run: false };
  const deadzone = (value) => (Math.abs(value) < 0.15 ? 0 : value);
  return { forward: -deadzone(axes[3]), strafe: deadzone(axes[2]), run: false };
};

const setNear = (camera, near) => {
  camera.near = near;
  camera.updateProjectionMatrix();
};

const lookAtStart = (camera, from, to) => {
  camera.rotation.set(-0.05, Math.atan2(from.x - to.x, from.z - to.z), 0, 'YXZ');
};

// The camera sits in a rig. Walking moves the rig, so the same code works with a headset's own tracking.
export const createMovement = ({ camera, renderer, scene, overlay, onFirstGesture, touch = null }) => {
  const rig = new THREE.Group();
  rig.add(camera);
  camera.position.set(0, WORLD.eyeHeight, 0);
  scene.add(rig);

  const place = ({ x, z }) => {
    const spot = clampToBeach({ x, z });
    rig.position.set(spot.x, sandHeight(spot.x, spot.z), spot.z);
  };
  place(WORLD.start);
  lookAtStart(camera, WORLD.start, WORLD.lookAt);

  const controls = new PointerLockControls(camera, renderer.domElement);
  const keys = new Set();
  addEventListener('keydown', (event) => keys.add(event.code));
  addEventListener('keyup', (event) => keys.delete(event.code));
  addEventListener('blur', () => keys.clear());

  overlay.addEventListener('click', () => {
    if (overlay.classList.contains('loading')) return;
    onFirstGesture();
    // Phones have no pointer lock, so the overlay just goes away.
    if (touch) overlay.classList.add('hidden');
    else controls.lock();
  });
  touch?.onLook((dx, dy) => {
    const { yaw, pitch } = lookAfterDrag({ yaw: camera.rotation.y, pitch: camera.rotation.x }, dx, dy);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  });
  controls.addEventListener('lock', () => overlay.classList.add('hidden'));
  controls.addEventListener('unlock', () => {
    keys.clear();
    if (!renderer.xr.isPresenting) overlay.classList.remove('hidden');
  });
  renderer.xr.addEventListener('sessionstart', () => {
    onFirstGesture();
    overlay.classList.add('hidden');
  });
  renderer.xr.addEventListener('sessionend', () => {
    camera.position.set(0, WORLD.eyeHeight, 0);
    overlay.classList.remove('hidden');
  });

  let riding = false;
  const ridePosition = new THREE.Vector3();
  const startRide = () => {
    riding = true;
    camera.rotation.set(-0.2, 0, 0, 'YXZ');
    setNear(camera, RIDE_NEAR);
  };
  const stopRide = () => {
    riding = false;
    camera.position.y = WORLD.eyeHeight;
    setNear(camera, WALK_NEAR);
    place(WORLD.start);
    lookAtStart(camera, WORLD.start, WORLD.lookAt);
  };

  // Follows from behind the hatchling at `x`, `z`. The camera's height comes from the sand under the camera, since the beach slopes.
  const follow = ({ x, z, s }, dt) => {
    const eye = 0.11 * s;
    const presenting = renderer.xr.isPresenting;
    if (!presenting) camera.position.y = eye;
    const behind = z + 0.6 * s;
    const ground = sandHeight(x, behind);
    ridePosition.set(x, presenting ? ground + eye - WORLD.eyeHeight : ground, behind);
    rig.position.lerp(ridePosition, Math.min(1, dt * 6));
  };

  const look = new THREE.Vector3();
  return {
    rig,
    place,
    startRide,
    stopRide,
    follow,
    isRiding: () => riding,
    update: (dt) => {
      if (riding) return;
      const presenting = renderer.xr.isPresenting;
      if (!presenting && !touch && !controls.isLocked) return;
      const input = presenting ? thumbstickInput(renderer.xr.getSession()) : touch?.input() ?? keyboardInput(keys);
      if (!input.forward && !input.strafe) return;
      (presenting ? renderer.xr.getCamera() : camera).getWorldDirection(look);
      look.setY(0).normalize();
      place(step({ x: rig.position.x, z: rig.position.z }, input.forward, input.strafe, look,
        (input.run ? WORLD.runSpeed : WORLD.walkSpeed) * dt));
    },
  };
};
