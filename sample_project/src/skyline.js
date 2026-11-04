import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const seededRandom = (seed) => {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
};

const windowsTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  const random = seededRandom(7);
  context.fillStyle = '#000';
  context.fillRect(0, 0, 256, 256);
  for (let y = 4; y < 252; y += 8) {
    for (let x = 4; x < 252; x += 8) {
      context.fillStyle = random() < 0.32 ? '#ffd9a0' : '#0b0d12';
      context.fillRect(x, y, 5, 5);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const building = (random, x, z, height) => {
  const width = 24 + random() * 42;
  const depth = 24 + random() * 30;
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const offset = random();
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, uv.getX(i) * Math.max(1, width / 80) + offset, uv.getY(i) * Math.max(1, height / 80) + offset);
  }
  geometry.translate(x, height / 2, z);
  return geometry;
};

// One merged mesh, so the whole city is a single draw call.
export const createSkyline = (z, count) => {
  const random = seededRandom(42);
  const towers = Array.from({ length: count }, (_, i) => {
    const x = (i / count - 0.5) * 2600 + (random() - 0.5) * 30;
    const downtown = Math.exp(-((x + 180) ** 2) / (2 * 420 ** 2));
    const height = 30 + (40 + random() * 70) + downtown * (90 + random() * random() * 340);
    return building(random, x, z - random() * 140, height);
  });
  const texture = windowsTexture();
  const city = new THREE.Mesh(
    mergeGeometries(towers),
    new THREE.MeshStandardMaterial({
      color: 0x667282, roughness: 0.45, metalness: 0.3,
      emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.32,
    }),
  );
  const land = new THREE.Mesh(
    new THREE.BoxGeometry(5200, 8, 340),
    new THREE.MeshStandardMaterial({ color: 0x4a5a58, roughness: 1 }),
  );
  land.position.set(0, 1, z - 60);
  return new THREE.Group().add(city, land);
};
