import * as THREE from 'three';
import { sandHeight } from './terrain.js';

const POST = new THREE.MeshStandardMaterial({ color: 0x5b4330, roughness: 0.9 });

const drawLabel = (context, lines, fontSize) => {
  context.fillStyle = '#f6efe0';
  context.fillRect(0, 0, 1024, 640);
  context.strokeStyle = '#c9b48f';
  context.lineWidth = 16;
  context.setLineDash([40, 24]);
  context.strokeRect(36, 36, 952, 568);
  context.fillStyle = '#34424a';
  context.textAlign = 'center';
  context.font = `bold ${fontSize}px system-ui, sans-serif`;
  lines.forEach((line, i) => context.fillText(line, 512, 330 + (i - (lines.length - 1) / 2) * fontSize * 1.3));
};

const labelTexture = (lines, fontSize) => {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 640;
  drawLabel(canvas.getContext('2d'), lines, fontSize);
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

// Give either imageUrl (for example 'team_data/diagrams.png') or label: an array of text lines.
export const createSign = ({ x, z, faceY = 0, imageUrl, label = ['Team picture', 'goes here'], fontSize = 72, width = 5.2, height = 3.25 }) => {
  const texture = imageUrl ? new THREE.TextureLoader().load(imageUrl) : labelTexture(label, fontSize);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const ground = sandHeight(x, z);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false }),
  );
  face.name = 'signFace';
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

// A small sign on one post, for people exploring up close. Its origin is the foot of the post, so it can be moved.
export const createPicket = ({ label, fontSize = 80, width = 0.95, height = 0.6, postHeight = 1.25, faceY = 0 }) => {
  const texture = labelTexture(label, fontSize);
  texture.anisotropy = 8;
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false }),
  );
  face.name = 'signFace';
  // The face sits in front of the post, so the post doesn't cover the words.
  face.position.set(Math.sin(faceY) * 0.06, postHeight - height / 2 + 0.05, Math.cos(faceY) * 0.06);
  face.rotation.y = faceY;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, postHeight), POST);
  pole.position.y = postHeight / 2;
  pole.castShadow = true;
  return new THREE.Group().add(pole, face);
};

// A sign whose text changes. `setLines` redraws only when the lines differ.
export const createBoard = ({ x, z, faceY = 0, fontSize = 60, width = 5.2, height = 3.25 }) => {
  const group = createSign({ x, z, faceY, label: [''], fontSize, width, height });
  const { map } = group.getObjectByName('signFace').material;
  const context = map.image.getContext('2d');
  let current = '';
  return {
    group,
    setLines: (lines) => {
      const next = lines.join('\n');
      if (next === current) return;
      current = next;
      context.setLineDash([]);
      drawLabel(context, lines, fontSize);
      map.needsUpdate = true;
    },
  };
};

// Signs ignore scene lighting, so they need dimming by hand at night.
export const dimSigns = (root, brightness) => {
  root.traverse((node) => {
    if (node.name === 'signFace') node.material.color.setScalar(brightness);
  });
};
