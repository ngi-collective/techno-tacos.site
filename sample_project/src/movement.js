import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { WORLD } from './config.js';
import { clampToBeach, sandHeight } from './terrain.js';

const UP = new THREE.Vector3(0, 1, 0);

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

// The camera sits in a rig. Walking moves the rig, so the same code works with a headset's own tracking.
export const createMovement = ({ camera, renderer, scene, overlay, onFirstGesture }) => {
  const rig = new THREE.Group();
  rig.add(camera);
  camera.position.set(0, WORLD.eyeHeight, 0);
  scene.add(rig);

  const place = ({ x, z }) => {
    const spot = clampToBeach({ x, z });
    rig.position.set(spot.x, sandHeight(spot.x, spot.z), spot.z);
  };
  place(WORLD.start);

  const controls = new PointerLockControls(camera, renderer.domElement);
  const keys = new Set();
  addEventListener('keydown', (event) => keys.add(event.code));
  addEventListener('keyup', (event) => keys.delete(event.code));
  addEventListener('blur', () => keys.clear());

  overlay.addEventListener('click', () => {
    onFirstGesture();
    controls.lock();
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

  const look = new THREE.Vector3();
  return {
    rig,
    place,
    update: (dt) => {
      const presenting = renderer.xr.isPresenting;
      if (!presenting && !controls.isLocked) return;
      const input = presenting ? thumbstickInput(renderer.xr.getSession()) : keyboardInput(keys);
      if (!input.forward && !input.strafe) return;
      (presenting ? renderer.xr.getCamera() : camera).getWorldDirection(look);
      look.setY(0).normalize();
      place(step({ x: rig.position.x, z: rig.position.z }, input.forward, input.strafe, look,
        (input.run ? WORLD.runSpeed : WORLD.walkSpeed) * dt));
    },
  };
};
