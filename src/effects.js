import * as THREE from 'three';

const dummy = new THREE.Object3D();

const glowTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

let sharedGlow = null;

export const createGlow = (color, size) => {
  sharedGlow ??= glowTexture();
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sharedGlow, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, fog: false,
  }));
  sprite.scale.setScalar(size);
  return sprite;
};

const TRACK_SECONDS = 22;
const PUFF_SECONDS = 0.8;

// Flipper prints: a ring buffer of marks that thin out as they age.
export const createTracks = (count) => {
  const material = new THREE.MeshBasicMaterial({ color: 0x4a3620, transparent: true, opacity: 0.2, depthWrite: false });
  const mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(0.5, 10).rotateX(-Math.PI / 2), material, count);
  mesh.frustumCulled = false;
  const marks = Array.from({ length: count }, () => ({ age: Infinity, x: 0, y: 0, z: 0, heading: 0, size: 0 }));
  let next = 0;
  return {
    mesh,
    add: (mark) => {
      marks[next] = { ...mark, age: 0 };
      next = (next + 1) % count;
    },
    clear: () => marks.forEach((mark) => { mark.age = Infinity; }),
    update: (dt) => {
      marks.forEach((mark, i) => {
        mark.age += dt;
        const left = mark.age >= TRACK_SECONDS ? 0 : 1 - mark.age / TRACK_SECONDS;
        dummy.position.set(mark.x, mark.y, mark.z);
        dummy.rotation.set(0, mark.heading, 0);
        dummy.scale.set(mark.size * 0.34 * left, 1, mark.size * 0.2);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
};

// Small sand grains kicked up by flippers and poured from the bucket.
export const createPuffs = (count) => {
  const material = new THREE.MeshStandardMaterial({ color: 0xd8bd8c, roughness: 1 });
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), material, count);
  mesh.frustumCulled = false;
  const grains = Array.from({ length: count }, () => ({ age: Infinity, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0 }));
  let next = 0;
  return {
    mesh,
    add: (grain) => {
      grains[next] = { ...grain, age: 0 };
      next = (next + 1) % count;
    },
    update: (dt) => {
      grains.forEach((grain, i) => {
        grain.age += dt;
        const alive = grain.age < PUFF_SECONDS;
        if (alive) {
          grain.vy -= 5 * dt;
          grain.x += grain.vx * dt;
          grain.y += grain.vy * dt;
          grain.z += grain.vz * dt;
        }
        dummy.position.set(grain.x, grain.y, grain.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(alive ? grain.size * (1 - grain.age / PUFF_SECONDS) : 0.00001);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
};
