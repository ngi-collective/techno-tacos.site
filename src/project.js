import * as THREE from 'three';
import { OBSTACLES, SYSTEM } from './config.js';
import { createGlow } from './effects.js';
import { createShoreLights } from './houses.js';
import { sandUv } from './environment.js';
import { BEAM_REACH, beamBrightness, GUIDING_LIGHTS, STAKE_FRACTIONS } from './simulation.js';
import { sandHeight, tunnelBend, tunnelFloorHeight } from './terrain.js';
import { createFabricTunnel } from './tunnel.js';

const SEGMENTS = 18;
const FLOOR_ACROSS = 5;

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

// A thin cone that starts at the lamp and fades to nothing, length 1 along +z. Additive light fades by going black.
const createBeamGeometry = () => {
  const geometry = new THREE.CylinderGeometry(0.06, 0.014, 1, 12, 6, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  const { position } = geometry.attributes;
  const color = new THREE.Color(SYSTEM.guidingLightColor);
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    const left = (1 - position.getZ(i)) ** 1.5;
    colors.set([color.r * left, color.g * left, color.b * left], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
};

const createTunnel = ({ pointLights, hoops, around }, sandMaterial) => {
  const { guidingLightColor } = SYSTEM;
  const group = new THREE.Group();
  const fabric = createFabricTunnel({ hoops, around });
  group.add(fabric.group);

  // Focused lamps: a lit face toward the box, a dark hood toward the ocean, and a thin visible beam. The local +z axis points along the beam.
  const lampHood = new THREE.MeshStandardMaterial({ color: 0x23282c, roughness: 0.7 });
  const beamGeometry = createBeamGeometry();
  const lamps = GUIDING_LIGHTS.map((fraction, i) => {
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.03, 16).rotateX(Math.PI / 2).translate(0, 0, -0.015), lampHood);
    const faceMaterial = new THREE.MeshBasicMaterial({ color: guidingLightColor, toneMapped: false });
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.02, 16), faceMaterial);
    face.position.z = 0.002; // Just in front of the hood's end, so the two surfaces never share a depth.
    const lamp = new THREE.Group().add(hood, face);
    const beamMesh = new THREE.Mesh(beamGeometry, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
    }));
    const glow = createGlow(guidingLightColor, 1);
    const beam = i < pointLights ? new THREE.SpotLight(guidingLightColor, 0, 1, 0.22, 0.6, 1.3) : null;
    group.add(lamp, beamMesh, glow);
    if (beam) group.add(beam, beam.target);
    return { fraction, lamp, faceMaterial, beamMesh, glow, beam };
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

const updateTunnel = (tunnel, { s, frontZ, length, x, sand, stakes, lights, night, fullLength, time, lift, viewer }) => {
  const { tunnelRadius: r, tunnelCenterHeight: cy } = SYSTEM;
  const shape = { frontZ, length, s };
  const centerX = (z) => x + tunnelBend(z, shape);
  const centerY = (z) => sandHeight(centerX(z), z) + cy * s;
  tunnel.fabric.update({ s, frontZ, length, x, time, lift });
  updateFloor(tunnel.floor, { x, frontZ, length, s, sand });

  tunnel.lamps.forEach(({ fraction, lamp, faceMaterial, beamMesh, glow, beam }) => {
    const z = frontZ - length * fraction;
    const position = { x: centerX(z), y: centerY(z) + r * 0.78 * s, z };
    const targetZ = Math.min(frontZ, z + BEAM_REACH * s);
    const target = new THREE.Vector3(centerX(targetZ), sandHeight(centerX(targetZ), targetZ) + 0.02 * s, targetZ);
    const toTarget = target.clone().sub(new THREE.Vector3(position.x, position.y, z));
    const reach = toTarget.length();
    const axis = toTarget.clone().normalize();

    lamp.position.set(position.x, position.y, z);
    lamp.scale.setScalar(s);
    lamp.lookAt(target);
    lamp.visible = lights > 0;

    const seen = beamBrightness(viewer, position, axis);
    const shine = lights * (0.35 + 0.65 * night);
    faceMaterial.color.set(SYSTEM.guidingLightColor).multiplyScalar(0.14 + 0.86 * seen);

    beamMesh.position.copy(lamp.position);
    beamMesh.quaternion.copy(lamp.quaternion);
    beamMesh.scale.set(s, s, reach);
    // The thin beam is for people watching from outside. From inside the tunnel it would fill the view.
    const outside = THREE.MathUtils.clamp((Math.abs(viewer.x - centerX(viewer.z)) - r * s) / (2 * s), 0, 1);
    const pastEnds = viewer.z > frontZ + s || viewer.z < frontZ - length - s;
    beamMesh.visible = reach > 0.01 && lights > 0 && (outside > 0 || pastEnds);
    beamMesh.material.opacity = shine * 0.28 * (pastEnds ? 1 : outside);

    glow.position.set(position.x, position.y, z).addScaledVector(axis, 0.022 * s);
    glow.scale.setScalar(s * 0.24 * (0.6 + night * 0.4));
    glow.visible = lights > 0 && seen > 0;
    glow.material.opacity = shine * seen;

    if (beam) {
      beam.position.set(position.x, position.y, z);
      beam.target.position.copy(target);
      beam.distance = s * 7;
      beam.intensity = lights * (0.3 + 1.2 * night) * s;
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
    update: ({ s, mode, pose, night, lidOpen, frontZ, fullLength, time, viewer }) => {
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

      updateTunnel(tunnel, { s, frontZ: frontZ - pose.tunnelShift, length: pose.length, x: nestAt.x, sand: pose.sand, stakes: pose.stakes, lights: pose.lights, night, fullLength, time, lift: pose.tunnelLift, viewer });

      shoreLights.update(THREE.MathUtils.smoothstep(night, 0.4, 0.9));
    },
  };
};
