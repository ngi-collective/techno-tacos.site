import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sandHeight, shoreZ, waterlineZ } from './terrain.js';

const seeded = (start) => {
  let state = start;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
};

const dummy = new THREE.Object3D();

// Keeps beach clutter out of the tunnel's path.
const besideTunnel = (x) => (Math.abs(x) < 2 ? x + Math.sign(x || 1) * 2 : x);

const instances = (geometry, material, count, place) => {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const color = new THREE.Color();
  for (let i = 0; i < count; i += 1) {
    place(i, dummy, color);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color);
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
};

const SHELL_TONES = [0xf2e6d0, 0xe8c9b0, 0xd9a58a, 0xc9b8a0, 0xf6f1e6];

const createShells = (count, tideLevel) => {
  const random = seeded(11);
  const geometry = new THREE.SphereGeometry(0.06, 7, 5).scale(1, 0.4, 0.75);
  return instances(geometry, new THREE.MeshStandardMaterial({ roughness: 0.55 }), count, (i, node, color) => {
    const x = besideTunnel((random() - 0.5) * 240);
    const z = waterlineZ(x, tideLevel) + (random() - 0.5) * 2.6;
    node.position.set(x, sandHeight(x, z) + 0.015, z);
    node.rotation.set(0, random() * 6.28, 0);
    node.scale.setScalar(0.5 + random() * 1.3);
    color.set(SHELL_TONES[Math.floor(random() * SHELL_TONES.length)]);
  });
};

const createSeaweed = (count, tideLevel) => {
  const random = seeded(23);
  const geometry = new THREE.BoxGeometry(0.1, 0.025, 0.7, 1, 1, 5);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    position.setX(i, position.getX(i) + Math.sin(position.getZ(i) * 7) * 0.05);
  }
  geometry.computeVertexNormals();
  return instances(geometry, new THREE.MeshStandardMaterial({ roughness: 0.6 }), count, (i, node, color) => {
    const x = besideTunnel((random() - 0.5) * 240);
    const z = waterlineZ(x, tideLevel) + (random() - 0.5) * 1.2;
    node.position.set(x, sandHeight(x, z) + 0.02, z);
    node.rotation.set(0, random() * 6.28, 0);
    node.scale.setScalar(0.6 + random() * 1.1);
    color.setHSL(0.12 + random() * 0.1, 0.55, 0.035 + random() * 0.05);
  });
};

const createGrass = (count) => {
  const random = seeded(37);
  const blade = (angle, lean, height) => new THREE.ConeGeometry(0.035, height, 4, 1)
    .translate(0, height / 2, 0).rotateX(lean).rotateY(angle);
  const geometry = mergeGeometries([0, 1.1, 2.3, 3.4, 4.6, 5.5].map((angle, i) => blade(angle, 0.22 + (i % 3) * 0.1, 0.65 + (i % 2) * 0.3)));
  return instances(geometry, new THREE.MeshStandardMaterial({ roughness: 0.85 }), count, (i, node, color) => {
    const x = (random() - 0.5) * 300;
    const z = shoreZ(x) + 62 + random() * 90;
    node.position.set(x, sandHeight(x, z) - 0.02, z);
    node.rotation.set(0, random() * 6.28, 0);
    node.scale.setScalar(0.7 + random() * 1.1);
    color.setHSL(0.2 + random() * 0.07, 0.42, 0.26 + random() * 0.16);
  });
};

export const createDecor = ({ shells, seaweed, grass }, highTide) => {
  const tideLevel = highTide + 0.22;
  return new THREE.Group().add(createShells(shells, tideLevel), createSeaweed(seaweed, tideLevel), createGrass(grass));
};
