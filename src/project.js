import * as THREE from 'three';
import { OBSTACLES, SYSTEM } from './config.js';
import { sandUv } from './environment.js';
import { STAKE_FRACTIONS } from './simulation.js';
import { sandHeight, tunnelBend, tunnelFloorHeight } from './terrain.js';
import { createFabricTunnel } from './tunnel.js';

const SEGMENTS = 18;
// The guiding lights sit at the ocean end of the tunnel, so they lead hatchlings out.
const LIGHT_POSITIONS = [0.985, 0.94, 0.89];
const FLOOR_ACROSS = 5;
const LAMP_XS = [-60, -36, -12, 12, 36, 60];
const HOUSE_XS = [-78, -54, -30, -8, 14, 36, 58, 80];

const WOOD = new THREE.MeshStandardMaterial({ color: 0xc08a50, roughness: 0.85 });
const FRAME = new THREE.MeshStandardMaterial({ color: 0x70492a, roughness: 0.9 });
const STEEL = new THREE.MeshStandardMaterial({ color: 0x4d5962, roughness: 0.5, metalness: 0.4 });

const box = (material, w, h, d, x = 0, y = 0, z = 0) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
};

const canvasTexture = (width, height, draw) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
};

const glowTexture = canvasTexture(128, 128, (context) => {
  const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
});

const createGlow = (color, size) => {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, fog: false,
  }));
  sprite.scale.setScalar(size);
  return sprite;
};

const meshMaterial = () => {
  const texture = canvasTexture(128, 128, (context) => {
    context.clearRect(0, 0, 128, 128);
    context.strokeStyle = '#3c4246';
    context.lineWidth = 7;
    context.beginPath();
    for (let i = -128; i < 256; i += 32) {
      context.moveTo(i, 0); context.lineTo(i + 128, 128);
      context.moveTo(i + 128, 0); context.lineTo(i, 128);
    }
    context.stroke();
  });
  texture.repeat.set(8, 4);
  return new THREE.MeshStandardMaterial({ map: texture, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.8 });
};

// Real-size metres: the group is scaled by s. The origin is the nest centre at sand level.
const createNestBox = () => {
  const { boxSize: w, boxHeight: h, tunnelRadius: r, tunnelCenterHeight: cy } = SYSTEM;
  const half = w / 2;
  const group = new THREE.Group();
  const mesh = meshMaterial();
  const posts = [[-half, -half], [half, -half], [half, half], [-half, half]]
    .map(([x, z]) => box(FRAME, 0.05, h + 0.05, 0.05, x, (h - 0.05) / 2, z));

  const panelHeight = h / 2;
  const sidePanels = [
    box(WOOD, 0.015, panelHeight, w, -half, panelHeight / 2),
    box(WOOD, 0.015, panelHeight, w, half, panelHeight / 2),
    box(WOOD, w, panelHeight, 0.015, 0, panelHeight / 2, half),
  ];
  const meshSide = (x, z, rotation) => {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h - panelHeight), mesh);
    plane.position.set(x, panelHeight + (h - panelHeight) / 2, z);
    plane.rotation.y = rotation;
    return plane;
  };

  // The solid tunnel-side wall, with the tunnel-sized hole the team chose.
  const outline = new THREE.Shape()
    .moveTo(-half, -0.1).lineTo(half, -0.1).lineTo(half, h).lineTo(-half, h).closePath();
  outline.holes.push(new THREE.Path().absarc(0, cy, r, 0, Math.PI * 2, true));
  const wall = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: 0.015, bevelEnabled: false, curveSegments: 32 }), WOOD);
  wall.position.z = -half - 0.015;
  wall.castShadow = true;

  const lid = new THREE.Group();
  lid.position.set(0, h, half);
  const lidMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w), mesh);
  lidMesh.rotation.x = -Math.PI / 2;
  lidMesh.position.z = -half;
  lid.add(
    lidMesh,
    box(FRAME, w, 0.03, 0.03, 0, 0, 0),
    box(FRAME, w, 0.03, 0.03, 0, 0, -w),
    box(FRAME, 0.03, 0.03, w, -half, 0, -half),
    box(FRAME, 0.03, 0.03, w, half, 0, -half),
  );

  group.add(...posts, ...sidePanels, meshSide(-half, 0, Math.PI / 2), meshSide(half, 0, Math.PI / 2), meshSide(0, half, 0), wall, lid);
  return { group, lid };
};

const createFloor = (material) => {
  const count = (SEGMENTS + 1) * FLOOR_ACROSS;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  const index = [];
  for (let i = 0; i < SEGMENTS; i += 1) {
    for (let j = 0; j < FLOOR_ACROSS - 1; j += 1) {
      const a = i * FLOOR_ACROSS + j;
      index.push(a, a + 1, a + FLOOR_ACROSS, a + 1, a + FLOOR_ACROSS + 1, a + FLOOR_ACROSS);
    }
  }
  geometry.setIndex(index);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
};

const updateFloor = (mesh, { x, frontZ, length, s, sand }) => {
  const { position, uv } = mesh.geometry.attributes;
  const halfWidth = SYSTEM.tunnelRadius * s * 0.86;
  for (let i = 0; i <= SEGMENTS; i += 1) {
    const z = frontZ - (length * i) / SEGMENTS;
    const center = x + tunnelBend(z, { frontZ, length, s });
    for (let j = 0; j < FLOOR_ACROSS; j += 1) {
      const across = center + ((j / (FLOOR_ACROSS - 1)) * 2 - 1) * halfWidth;
      const edge = j === 0 || j === FLOOR_ACROSS - 1;
      const k = i * FLOOR_ACROSS + j;
      position.setXYZ(k, across, edge ? sandHeight(across, z) + 0.01 : tunnelFloorHeight(across, z, s), z);
      uv.setXY(k, ...sandUv(across, z));
    }
  }
  position.needsUpdate = true;
  uv.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.setDrawRange(0, Math.floor(sand * SEGMENTS) * (FLOOR_ACROSS - 1) * 6);
  mesh.visible = sand > 0;
};

const createTunnel = ({ pointLights, hoops, around }, sandMaterial) => {
  const { guidingLightColor } = SYSTEM;
  const group = new THREE.Group();
  const fabric = createFabricTunnel({ hoops, around });
  group.add(fabric.group);

  const lampMaterial = new THREE.MeshBasicMaterial({ color: guidingLightColor, toneMapped: false });
  const lamps = LIGHT_POSITIONS.map((fraction, i) => {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), lampMaterial);
    const glow = createGlow(guidingLightColor, 1);
    const point = i < pointLights ? new THREE.PointLight(guidingLightColor, 0, 1, 1.4) : null;
    group.add(bulb, glow);
    if (point) group.add(point);
    return { fraction, bulb, glow, point };
  });

  const floor = createFloor(sandMaterial);
  group.add(floor);

  const stakes = STAKE_FRACTIONS.flatMap((fraction, i) => [1, -1].map((side) => {
    const stake = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.005, 0.28), STEEL);
    rod.position.y = -0.1;
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 8, 16), STEEL);
    loop.position.y = 0.06;
    stake.add(rod, loop);
    group.add(stake);
    return { stake, index: i };
  }));

  return { group, fabric, lamps, stakes, floor };
};

const updateTunnel = (tunnel, { s, frontZ, length, x, sand, stakes, lights, night, fullLength, time, lift }) => {
  const { tunnelRadius: r, tunnelCenterHeight: cy } = SYSTEM;
  const shape = { frontZ, length, s };
  const centerX = (z) => x + tunnelBend(z, shape);
  const centerY = (z) => sandHeight(centerX(z), z) + cy * s;
  tunnel.fabric.update({ s, frontZ, length, x, time, lift });
  updateFloor(tunnel.floor, { x, frontZ, length, s, sand });

  tunnel.lamps.forEach(({ fraction, bulb, glow, point }) => {
    const z = frontZ - length * fraction;
    const y = centerY(z) + r * 0.82 * s;
    bulb.position.set(centerX(z), y, z);
    bulb.scale.setScalar(s);
    bulb.visible = lights > 0;
    glow.position.set(centerX(z), y, z);
    glow.scale.setScalar(s * 0.3 * (0.6 + night * 0.4));
    glow.visible = lights > 0;
    glow.material.opacity = lights * (0.35 + 0.65 * night);
    if (point) {
      point.position.set(centerX(z), y, z);
      point.distance = s * 9;
      point.intensity = lights * (0.15 + 0.75 * night) * s;
    }
  });

  tunnel.stakes.forEach(({ stake }, i) => {
    const { fraction, side, down } = stakes[i];
    const z = frontZ - fullLength * fraction;
    const stakeX = x + tunnelBend(z, { frontZ, length: fullLength, s }) + side * (r + 0.03) * s;
    stake.position.set(stakeX, sandHeight(stakeX, z) + (1 - down) * 0.16 * s, z);
    stake.scale.setScalar(s);
    stake.rotation.y = Math.PI / 2;
    stake.visible = length >= fullLength - 0.01;
  });
};

const createNest = () => {
  const group = new THREE.Group();
  const pit = new THREE.Mesh(
    new THREE.CircleGeometry(0.26, 32),
    new THREE.MeshStandardMaterial({ color: 0xa98d5f, roughness: 1 }),
  );
  pit.rotation.x = -Math.PI / 2;
  pit.position.y = 0.012;
  group.add(pit);
  return group;
};

const createMarker = () => {
  const group = new THREE.Group();
  const ribbon = new THREE.MeshStandardMaterial({ color: 0xff6a2a, roughness: 0.7 });
  [[-0.42, -0.42], [0.42, -0.42], [0.42, 0.42], [-0.42, 0.42]].forEach(([x, z]) => {
    group.add(box(FRAME, 0.02, 0.5, 0.02, x, 0.25, z), box(ribbon, 0.1, 0.05, 0.005, x + 0.05, 0.46, z));
  });
  return group;
};

const createObstacle = (kind) => {
  const group = new THREE.Group();
  if (kind === 'hole') {
    const hole = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshStandardMaterial({ color: 0x4e3d27, roughness: 1 }));
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.04;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.14, 8, 28), new THREE.MeshStandardMaterial({ color: 0xd8bd8b, roughness: 1 }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.05;
    group.add(hole, rim);
  } else if (kind === 'castle') {
    const sand = new THREE.MeshStandardMaterial({ color: 0xdcc090, roughness: 1 });
    group.add(box(sand, 1.6, 0.5, 1.6, 0, 0.25));
    [[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6]].forEach(([x, z]) => {
      const tower = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 8), sand);
      tower.position.set(x, 0.75, z);
      tower.castShadow = true;
      group.add(tower);
    });
  } else if (kind === 'chair') {
    const cloth = new THREE.MeshStandardMaterial({ color: 0x2b86c5, roughness: 0.8 });
    const seat = box(cloth, 0.7, 0.05, 0.8, 0, 0.3);
    const back = box(cloth, 0.7, 0.9, 0.05, 0, 0.65, -0.55);
    back.rotation.x = -0.4;
    group.add(seat, back, box(STEEL, 0.05, 0.3, 0.05, -0.32, 0.15, 0.35), box(STEEL, 0.05, 0.3, 0.05, 0.32, 0.15, 0.35), box(STEEL, 0.05, 0.3, 0.05, -0.32, 0.15, -0.35), box(STEEL, 0.05, 0.3, 0.05, 0.32, 0.15, -0.35));
  } else {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0xd2342c, metalness: 0.5, roughness: 0.4 }));
    can.rotation.z = Math.PI / 2;
    can.position.y = 0.1;
    const bag = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.6, flatShading: true }));
    bag.position.set(0.5, 0.25, 0.2);
    group.add(can, bag);
  }
  return group;
};

const createObstacles = () => {
  const group = new THREE.Group();
  OBSTACLES.forEach(({ kind, x, z }) => {
    const obstacle = new THREE.Group().add(createObstacle(kind));
    obstacle.position.set(x, sandHeight(x, z), z);
    group.add(obstacle);
  });
  return group;
};

const houseWindows = () => canvasTexture(256, 256, (context) => {
  context.fillStyle = '#000';
  context.fillRect(0, 0, 256, 256);
  context.fillStyle = '#fff2c8';
  [[30, 40], [150, 40], [30, 150], [150, 150]].forEach(([x, y]) => context.fillRect(x, y, 76, 66));
});

// The houses and streetlights behind the dunes that pull hatchlings the wrong way.
const createShoreLights = () => {
  const group = new THREE.Group();
  const emissiveMap = houseWindows();
  const houseMaterial = new THREE.MeshStandardMaterial({ color: 0xc6b8a6, roughness: 0.8, emissive: 0xffffff, emissiveMap, emissiveIntensity: 0 });
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x6e4238, roughness: 0.8 });
  HOUSE_XS.forEach((x, i) => {
    const z = 84 + (i % 3) * 5;
    const ground = sandHeight(x, z);
    const house = box(houseMaterial, 15, 10, 9, x, ground + 5, z);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(11.5, 5, 4), roofMaterial);
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = 0.7;
    roof.position.set(x, ground + 12.5, z);
    group.add(house, roof);
  });
  const glows = LAMP_XS.map((x) => {
    const z = 76;
    const ground = sandHeight(x, z);
    const pole = box(STEEL, 0.25, 7, 0.25, x, ground + 3.5, z);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff0d0, toneMapped: false }));
    bulb.position.set(x, ground + 7.2, z);
    const glow = createGlow(0xffe0a8, 16);
    glow.position.copy(bulb.position);
    group.add(pole, bulb, glow);
    return glow;
  });
  const fills = [-20, 20].map((x) => {
    const light = new THREE.PointLight(0xffdca0, 0, 110, 1.6);
    light.position.set(x, 18, 72);
    group.add(light);
    return light;
  });
  return { group, houseMaterial, glows, fills };
};

// Obstacle meshes are about 2.8 times real size in their own units.
const OBSTACLE_UNIT = 0.36;

export const createProject = ({ tunnel: tunnelQuality, sandMaterial }) => {
  const nestBox = createNestBox();
  const tunnel = createTunnel(tunnelQuality, sandMaterial);
  const nest = createNest();
  const marker = createMarker();
  const obstacles = createObstacles();
  const shoreLights = createShoreLights();
  const { nest: nestAt } = SYSTEM;
  const ground = sandHeight(nestAt.x, nestAt.z);
  nest.position.set(nestAt.x, ground, nestAt.z);
  marker.position.set(nestAt.x, ground, nestAt.z);
  const lightPanel = box(WOOD, SYSTEM.boxSize, SYSTEM.boxHeight, 0.02);
  const group = new THREE.Group().add(nestBox.group, lightPanel, tunnel.group, nest, marker, obstacles, shoreLights.group);

  return {
    group,
    update: ({ s, mode, pose, night, lidOpen, frontZ, fullLength, time }) => {
      const open = mode === 'open';
      nestBox.group.visible = !open;
      tunnel.group.visible = !open;
      obstacles.visible = open;
      lightPanel.visible = !open;
      nest.scale.setScalar(s);
      marker.scale.setScalar(s);
      obstacles.children.forEach((obstacle) => obstacle.scale.setScalar(s * OBSTACLE_UNIT));

      nestBox.group.scale.setScalar(s);
      nestBox.group.position.set(nestAt.x + pose.boxOffset.x, ground + pose.boxOffset.y, nestAt.z);
      nestBox.lid.rotation.x = lidOpen * 1.9;
      lightPanel.scale.setScalar(s);
      lightPanel.position.set(nestAt.x, ground + pose.panel.y * s, nestAt.z + pose.panel.z * s);
      lightPanel.rotation.x = pose.panel.tilt;

      updateTunnel(tunnel, { s, frontZ: frontZ - pose.tunnelShift, length: pose.length, x: nestAt.x, sand: pose.sand, stakes: pose.stakes, lights: pose.lights, night, fullLength, time, lift: pose.tunnelLift });

      const shore = THREE.MathUtils.smoothstep(night, 0.4, 0.9);
      shoreLights.houseMaterial.emissiveIntensity = shore * 1.4;
      shoreLights.glows.forEach((glow) => { glow.material.opacity = shore; glow.visible = shore > 0; });
      shoreLights.fills.forEach((light) => { light.intensity = shore * 160; });
    },
  };
};
