import * as THREE from 'three';
import { sandHeight } from './terrain.js';

const POST = new THREE.MeshStandardMaterial({ color: 0x5b4330, roughness: 0.9 });

const labelTexture = (lines) => {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 640;
  const context = canvas.getContext('2d');
  context.fillStyle = '#f6efe0';
  context.fillRect(0, 0, 1024, 640);
  context.strokeStyle = '#c9b48f';
  context.lineWidth = 16;
  context.setLineDash([40, 24]);
  context.strokeRect(36, 36, 952, 568);
  context.fillStyle = '#5a6a72';
  context.textAlign = 'center';
  context.font = 'bold 72px system-ui, sans-serif';
  lines.forEach((line, i) => context.fillText(line, 512, 300 + (i - (lines.length - 1) / 2) * 96));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const post = (x, z, height) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, height), POST);
  mesh.position.set(x, sandHeight(x, z) + height / 2, z);
  mesh.castShadow = true;
  return mesh;
};

// Give either imageUrl (for example '/team_data/diagrams.png') or label: an array of placeholder lines.
export const createSign = ({ x, z, faceY = 0, imageUrl, label = ['Team picture', 'goes here'], width = 5.2, height = 3.25 }) => {
  const texture = imageUrl ? new THREE.TextureLoader().load(imageUrl) : labelTexture(label);
  texture.colorSpace = THREE.SRGBColorSpace;
  const ground = sandHeight(x, z);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false }),
  );
  face.position.set(x, ground + 1.1 + height / 2, z);
  face.rotation.y = faceY;
  face.castShadow = true;
  const offset = new THREE.Vector3(width / 2 - 0.2, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), faceY);
  const back = new THREE.Vector3(0, 0, -0.04).applyAxisAngle(new THREE.Vector3(0, 1, 0), faceY);
  return new THREE.Group().add(
    face,
    post(x + offset.x + back.x, z + offset.z + back.z, 1.1 + height),
    post(x - offset.x + back.x, z - offset.z + back.z, 1.1 + height),
  );
};

// The roped-off plot for the team's project. Add project objects to `contents`, whose origin is the plot's centre at sand level.
export const createProjectSite = ({ x, z, width, depth }) => {
  const halfW = width / 2;
  const halfD = depth / 2;
  const corners = [[-halfW, -halfD], [halfW, -halfD], [halfW, halfD], [-halfW, halfD]];
  const stakes = corners.map(([dx, dz]) => post(x + dx, z + dz, 1.2));
  const rope = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(
      corners.map(([dx, dz]) => new THREE.Vector3(x + dx, sandHeight(x + dx, z + dz) + 1, z + dz)),
    ),
    new THREE.LineBasicMaterial({ color: 0xfff1c9 }),
  );
  const contents = new THREE.Group();
  contents.position.set(x, sandHeight(x, z), z);
  const placeholder = createSign({ x, z: z + 1, label: ['The team\'s project', 'goes here'], width: 6.4, height: 4 });
  return { group: new THREE.Group().add(...stakes, rope, contents, placeholder), contents, placeholder };
};
