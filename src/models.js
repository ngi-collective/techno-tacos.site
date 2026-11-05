import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const load = (name) => loader.loadAsync(`assets/models/${name}.glb`);

const colored = (mesh) => {
  const geometry = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrixWorld);
  const { position, normal } = geometry.attributes;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) colors.set([mesh.material.color.r, mesh.material.color.g, mesh.material.color.b], i * 3);
  const flat = new THREE.BufferGeometry();
  flat.setAttribute('position', position);
  flat.setAttribute('normal', normal);
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return flat;
};

// Merges a colored static model into one geometry, length 1 along z, resting on y = 0.
const mergedUnitLength = (scene) => {
  scene.updateMatrixWorld(true);
  const meshes = [];
  scene.traverse((node) => { if (node.isMesh) meshes.push(colored(node)); });
  const geometry = mergeGeometries(meshes);
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const scale = 1 / (max.z - min.z);
  geometry.translate(-(min.x + max.x) / 2, -min.y, -(min.z + max.z) / 2);
  geometry.scale(scale, scale, scale);
  return geometry;
};

export const loadModels = async () => {
  const [turtle, gull, raccoon, person] = await Promise.all(['turtle-backup', 'gull-backup', 'raccoon', 'person'].map(load));
  return { turtle: mergedUnitLength(turtle.scene), gull, raccoon, person };
};
