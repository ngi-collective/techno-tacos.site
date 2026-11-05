import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createGlow } from './effects.js';
import { sandHeight } from './terrain.js';

const HOUSES = [
  { x: -86, z: 112, width: 13, depth: 9, floors: 2, siding: 0xd9c9a8, roof: 0x5c4a42, shutter: 0x2f5d73, turn: 0.1 },
  { x: -62, z: 106, width: 11, depth: 8, floors: 1, siding: 0x9db8c4, roof: 0x4b4f55, shutter: 0xf2efe6, turn: -0.08 },
  { x: -40, z: 111, width: 14, depth: 9, floors: 2, siding: 0xf0ead8, roof: 0x7a4a3a, shutter: 0x3f6b4f, turn: 0.05 },
  { x: -17, z: 105, width: 12, depth: 8, floors: 2, siding: 0xe3b9a0, roof: 0x4b4f55, shutter: 0xf2efe6, turn: -0.12 },
  { x: 6, z: 110, width: 13, depth: 9, floors: 1, siding: 0xb7c9a9, roof: 0x5c4a42, shutter: 0x6a4a35, turn: 0.09 },
  { x: 29, z: 105, width: 14, depth: 9, floors: 2, siding: 0xf3e3b5, roof: 0x7a4a3a, shutter: 0x2f5d73, turn: -0.04 },
  { x: 53, z: 111, width: 11, depth: 8, floors: 2, siding: 0xa9bcd6, roof: 0x4b4f55, shutter: 0xf2efe6, turn: 0.11 },
  { x: 77, z: 106, width: 13, depth: 9, floors: 1, siding: 0xe6d3c4, roof: 0x5c4a42, shutter: 0x3f6b4f, turn: -0.07 },
];
const LAMP_XS = [-72, -50, -28, -6, 17, 41, 65];
const LAMP_Z = 98;

const PILING_HEIGHT = 1.9;
const FLOOR_HEIGHT = 2.9;
const TRIM = 0xf4f1e8;

// Every piece carries its color and metres-based texture coordinates, so one merged mesh can draw all the houses.
const withColor = (geometry, hex) => {
  const color = new THREE.Color(hex);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) colors.set([color.r, color.g, color.b], i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
};

const planarUvs = (geometry) => {
  const { position, normal } = geometry.attributes;
  const uvs = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    const [x, y, z] = [position.getX(i), position.getY(i), position.getZ(i)];
    const [nx, nz] = [Math.abs(normal.getX(i)), Math.abs(normal.getZ(i))];
    if (nx > 0.5) uvs.set([z, y], i * 2);
    else if (nz > 0.5 && Math.abs(normal.getY(i)) < 0.5) uvs.set([x, y], i * 2);
    else uvs.set([x, z], i * 2);
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geometry;
};

const block = (width, height, depth, x, y, z, hex) => withColor(
  planarUvs(new THREE.BoxGeometry(width, height, depth).translate(x, y, z).toNonIndexed()),
  hex,
);

// A flat piece from corner points, wound so it faces outward.
const flat = (points, hex) => {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  geometry.computeVertexNormals();
  return withColor(planarUvs(geometry), hex);
};

const quad = (a, b, c, d, hex) => flat([a, b, c, a, c, d], hex);

const onWall = (matrix, geometries) => geometries.map((geometry) => geometry.applyMatrix4(matrix));

const wallMatrix = (angle, along, height, distance) => new THREE.Matrix4()
  .makeRotationY(angle)
  .multiply(new THREE.Matrix4().makeTranslation(along, height, -distance));

// One window at the local origin, on a wall facing -z.
const createWindow = (width, height, shutter) => ({
  pane: block(width, height, 0.03, 0, 0, -0.02, 0xffffff),
  trim: [
    block(width + 0.16, 0.08, 0.1, 0, height / 2 + 0.04, -0.04, TRIM),
    block(width + 0.24, 0.09, 0.16, 0, -height / 2 - 0.04, -0.06, TRIM),
    block(0.08, height, 0.1, -width / 2 - 0.04, 0, -0.04, TRIM),
    block(0.08, height, 0.1, width / 2 + 0.04, 0, -0.04, TRIM),
    block(0.04, height, 0.05, 0, 0, -0.05, TRIM),
    block(width, 0.04, 0.05, 0, 0, -0.05, TRIM),
    block(0.34, height + 0.1, 0.05, -width / 2 - 0.27, 0, -0.03, shutter),
    block(0.34, height + 0.1, 0.05, width / 2 + 0.27, 0, -0.03, shutter),
  ],
});

// `lit` decides which windows glow.
const createHouse = ({ width, depth, floors, siding, roof, shutter }, lit) => {
  const parts = { siding: [], roof: [], trim: [], litPane: [], darkPane: [] };
  const wallHeight = floors * FLOOR_HEIGHT;
  const top = PILING_HEIGHT + wallHeight;
  const [halfW, halfD] = [width / 2, depth / 2];
  const rise = depth * 0.36;
  const eave = 0.55;
  const ridge = top + rise;

  parts.siding.push(block(width, wallHeight, depth, 0, PILING_HEIGHT + wallHeight / 2, 0, siding));

  // Gable ends close the triangle under the roof.
  parts.siding.push(
    flat([[halfW, top, halfD], [halfW, top, -halfD], [halfW, ridge, 0]], siding),
    flat([[-halfW, top, -halfD], [-halfW, top, halfD], [-halfW, ridge, 0]], siding),
  );

  // The roof runs along the width, with overhanging eaves.
  const [roofX, eaveZ, eaveY] = [halfW + eave, halfD + eave, top - eave * (rise / halfD)];
  parts.roof.push(
    quad([-roofX, eaveY, -eaveZ], [-roofX, ridge, 0], [roofX, ridge, 0], [roofX, eaveY, -eaveZ], roof),
    quad([roofX, eaveY, eaveZ], [roofX, ridge, 0], [-roofX, ridge, 0], [-roofX, eaveY, eaveZ], roof),
  );
  parts.trim.push(
    block(width + eave * 2 + 0.1, 0.16, 0.1, 0, eaveY - 0.06, -eaveZ, TRIM),
    block(width + eave * 2 + 0.1, 0.16, 0.1, 0, eaveY - 0.06, eaveZ, TRIM),
    block(width + eave * 2 + 0.06, 0.12, 0.3, 0, ridge + 0.02, 0, roof),
  );

  // Corner boards and a band between floors.
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => {
    parts.trim.push(block(0.2, wallHeight, 0.2, sx * (halfW - 0.05), PILING_HEIGHT + wallHeight / 2, sz * (halfD - 0.05), TRIM));
  });
  if (floors > 1) parts.trim.push(block(width + 0.1, 0.14, depth + 0.1, 0, PILING_HEIGHT + FLOOR_HEIGHT, 0, TRIM));

  // Pilings raise the house above the sand, as beach houses are built.
  const buried = 1.4;
  const pilingLength = PILING_HEIGHT + buried;
  [-0.45, -0.15, 0.15, 0.45].forEach((fx) => [-0.45, 0.45].forEach((fz) => {
    parts.trim.push(block(0.32, pilingLength, 0.32, fx * width, PILING_HEIGHT - pilingLength / 2, fz * depth, 0x7c6a58));
  }));
  parts.trim.push(block(width + 0.1, 0.3, depth + 0.1, 0, PILING_HEIGHT - 0.1, 0, 0x8c7a66));

  // Windows on every wall. A seeded list decides which rooms have their lights on.
  let windowIndex = 0;
  const addWindow = (matrix) => {
    const { pane, trim } = createWindow(1.15, 1.45, shutter);
    parts[lit(windowIndex) ? 'litPane' : 'darkPane'].push(pane.applyMatrix4(matrix));
    parts.trim.push(...onWall(matrix, trim));
    windowIndex += 1;
  };
  const floorY = (floor) => PILING_HEIGHT + FLOOR_HEIGHT * floor + 1.55;
  const frontSpots = [-0.35, 0.35].map((f) => f * width);
  for (let floor = 0; floor < floors; floor += 1) {
    frontSpots.forEach((along) => addWindow(wallMatrix(0, along, floorY(floor), halfD)));
    if (floor > 0) addWindow(wallMatrix(0, 0, floorY(floor), halfD));
    frontSpots.forEach((along) => addWindow(wallMatrix(Math.PI, along, floorY(floor), halfD)));
    [-0.22, 0.22].forEach((f) => {
      addWindow(wallMatrix(Math.PI / 2, f * depth, floorY(floor), halfW));
      addWindow(wallMatrix(-Math.PI / 2, f * depth, floorY(floor), halfW));
    });
  }
  if (rise > 2) addWindow(wallMatrix(Math.PI / 2, 0, top + rise * 0.32, halfW));

  // Front door with a small roof over it.
  parts.trim.push(
    block(1.3, 2.3, 0.08, 0, PILING_HEIGHT + 1.15, -halfD - 0.03, TRIM),
    block(1.05, 2.1, 0.1, 0, PILING_HEIGHT + 1.05, -halfD - 0.06, shutter),
    block(0.1, 0.1, 0.06, 0.38, PILING_HEIGHT + 1.05, -halfD - 0.13, 0xc9a24a),
  );

  // Deck, railings, and stairs down to the sand.
  const deckDepth = 2.4;
  const deckZ = -halfD - deckDepth / 2;
  parts.trim.push(block(width * 0.8, 0.16, deckDepth, 0, PILING_HEIGHT, deckZ, 0xb7a58c));
  const railFront = deckZ - deckDepth / 2 + 0.05;
  const deckHalf = width * 0.4;
  for (let i = 0; i <= 8; i += 1) {
    const x = -deckHalf + (i / 8) * deckHalf * 2;
    if (Math.abs(x) > 0.8) parts.trim.push(block(0.1, 1, 0.1, x, PILING_HEIGHT + 0.5, railFront, TRIM));
    if (i % 2 === 0) parts.trim.push(block(0.26, pilingLength, 0.26, x, PILING_HEIGHT - pilingLength / 2, railFront, 0x7c6a58));
  }
  [-1, 1].forEach((side) => {
    parts.trim.push(
      block(deckHalf - 0.8, 0.09, 0.14, side * (deckHalf + 0.8) / 2, PILING_HEIGHT + 1.02, railFront, TRIM),
      block(0.14, 0.09, deckDepth, side * deckHalf, PILING_HEIGHT + 1.02, deckZ, TRIM),
    );
  });
  for (let step = 0; step < 6; step += 1) {
    parts.trim.push(block(1.5, 0.12, 0.4, 0, PILING_HEIGHT - 0.3 * step - 0.2, railFront - 0.3 - step * 0.36, 0xb7a58c));
  }
  // The two side boards that carry the steps.
  const stairRun = 5 * 0.36;
  const stairDrop = 5 * 0.3;
  const stairLength = Math.hypot(stairRun, stairDrop) + 0.7;
  [-1, 1].forEach((side) => {
    const board = block(0.1, 0.24, stairLength, 0, 0, 0, 0x9c8a72);
    board.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.atan2(stairDrop, stairRun)));
    board.applyMatrix4(new THREE.Matrix4().makeTranslation(side * 0.78, PILING_HEIGHT - 0.2 - stairDrop / 2, railFront - 0.3 - stairRun / 2));
    parts.trim.push(board);
  });

  // Chimney, with a cap.
  parts.trim.push(
    block(0.9, rise + 1.2, 0.9, halfW * 0.55, top + (rise + 1.2) / 2, depth * 0.1, 0x8e5a48),
    block(1.08, 0.14, 1.08, halfW * 0.55, top + rise + 1.26, depth * 0.1, 0x5f4034),
  );

  return parts;
};

const lineTexture = (draw) => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, 256, 256);
  draw(context);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
};

const sidingTexture = () => lineTexture((context) => {
  for (let y = 0; y < 256; y += 42.67) {
    context.fillStyle = 'rgba(40, 35, 30, 0.42)';
    context.fillRect(0, y, 256, 5);
    context.fillStyle = 'rgba(255, 255, 255, 0.5)';
    context.fillRect(0, y + 5, 256, 4);
  }
});

const shingleTexture = () => lineTexture((context) => {
  for (let row = 0; row < 6; row += 1) {
    const y = row * 42.67;
    context.fillStyle = `rgba(0, 0, 0, ${0.08 + (row % 3) * 0.05})`;
    context.fillRect(0, y, 256, 42.67);
    context.fillStyle = 'rgba(0, 0, 0, 0.5)';
    context.fillRect(0, y, 256, 4);
    for (let x = (row % 2) * 16; x < 256; x += 32) context.fillRect(x, y, 3, 42.67);
  }
});

const mergedMesh = (pieces, material) => {
  const mesh = new THREE.Mesh(mergeGeometries(pieces), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

// The houses behind the dunes, and the streetlights beside them. Their light pulls hatchlings the wrong way.
export const createShoreLights = () => {
  const collected = { siding: [], roof: [], trim: [], litPane: [], darkPane: [] };
  let seed = 41;
  const lit = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 < 0.72;
  };
  HOUSES.forEach((house) => {
    const matrix = new THREE.Matrix4()
      .makeTranslation(house.x, sandHeight(house.x, house.z), house.z)
      .multiply(new THREE.Matrix4().makeRotationY(house.turn));
    const parts = createHouse(house, lit);
    Object.keys(collected).forEach((key) => collected[key].push(...parts[key].map((geometry) => geometry.applyMatrix4(matrix))));
  });

  const litPanes = new THREE.MeshStandardMaterial({ color: 0x2d3b45, roughness: 0.25, emissive: 0xffd392, emissiveIntensity: 0 });
  const group = new THREE.Group().add(
    mergedMesh(collected.siding, new THREE.MeshStandardMaterial({ map: sidingTexture(), vertexColors: true, roughness: 0.85 })),
    mergedMesh(collected.roof, new THREE.MeshStandardMaterial({ map: shingleTexture(), vertexColors: true, roughness: 0.95, side: THREE.DoubleSide })),
    mergedMesh(collected.trim, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 })),
    mergedMesh(collected.litPane, litPanes),
    mergedMesh(collected.darkPane, new THREE.MeshStandardMaterial({ color: 0x2d3b45, roughness: 0.25 })),
  );

  const steel = new THREE.MeshStandardMaterial({ color: 0x4d5962, roughness: 0.5, metalness: 0.4 });
  const lampGlows = LAMP_XS.map((x) => {
    const ground = sandHeight(x, LAMP_Z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 8), steel);
    pole.position.set(x, ground + 4, LAMP_Z);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff0d0, toneMapped: false }));
    bulb.position.set(x, ground + 8.1, LAMP_Z);
    const glow = createGlow(0xffd9a0, 7);
    glow.position.copy(bulb.position);
    group.add(pole, bulb, glow);
    return glow;
  });

  // Soft pools of light rising over the roofs. The sky glow itself is in daycycle.js.
  const roofGlows = HOUSES.map((house) => {
    const glow = createGlow(0xffb976, 75);
    glow.position.set(house.x, sandHeight(house.x, house.z) + 16, house.z);
    group.add(glow);
    return glow;
  });

  const fills = [-30, 30].map((x) => {
    const light = new THREE.PointLight(0xffdca0, 0, 150, 1.5);
    light.position.set(x, 30, 96);
    group.add(light);
    return light;
  });

  return {
    group,
    update: (shore) => {
      litPanes.emissiveIntensity = shore * 2.4;
      lampGlows.forEach((glow) => { glow.material.opacity = shore; glow.visible = shore > 0; });
      roofGlows.forEach((glow) => { glow.material.opacity = shore * 0.16; glow.visible = shore > 0; });
      fills.forEach((light) => { light.intensity = shore * 280; });
    },
  };
};
