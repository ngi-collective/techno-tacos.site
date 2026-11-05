import * as THREE from 'three';
import { SYSTEM } from './config.js';
import { sandHeight, tunnelBend } from './terrain.js';

const RINGS_PER_HOOP = 5;

// Woven nylon with the team's caution stripes sewn along both sides. The stripes are opaque and the rest lets you see in.
const fabricTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, 512, 512);
  context.fillStyle = 'rgba(226, 231, 232, 0.52)';
  context.fillRect(0, 0, 512, 512);
  context.fillStyle = 'rgba(255, 255, 255, 0.07)';
  for (let i = 0; i < 512; i += 4) context.fillRect(i, 0, 1, 512);
  context.fillStyle = 'rgba(70, 80, 88, 0.07)';
  for (let i = 0; i < 512; i += 4) context.fillRect(0, i, 512, 1);
  // In this map u = 0.25 and 0.75 are the sides at the tube's mid-height, and u = 0.5 is the top. The stripes sit just above mid-height, clear of the sand.
  const width = 512 * 0.12;
  [0.28, 0.72].forEach((center) => {
    const left = 512 * center - width / 2;
    context.fillStyle = '#f4b90f';
    context.fillRect(left, 0, width, 512);
    context.save();
    context.beginPath();
    context.rect(left, 0, width, 512);
    context.clip();
    context.fillStyle = '#1b1b1b';
    for (let y = -128; y < 640; y += 128) {
      context.beginPath();
      context.moveTo(left, y); context.lineTo(left + width, y - 90); context.lineTo(left + width, y - 26); context.lineTo(left, y + 64);
      context.fill();
    }
    context.restore();
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
};

// Each hoop is a little different, so the tunnel does not look machine-straight.
const seededList = (count, seed) => {
  let state = seed;
  return Array.from({ length: count }, () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647 - 0.5;
  });
};

// A wire-hoop fabric tube, like a children's pop-up play tunnel. The fabric is rebuilt every frame, because it bunches up as the tunnel shortens.
export const createFabricTunnel = ({ hoops, around }) => {
  const rings = hoops * RINGS_PER_HOOP + 1;
  const vertexCount = rings * (around + 1);
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3);
  const uvs = new THREE.BufferAttribute(new Float32Array(vertexCount * 2), 2);
  positions.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positions);
  geometry.setAttribute('uv', uvs);
  const index = [];
  for (let i = 0; i < rings - 1; i += 1) {
    for (let j = 0; j < around; j += 1) {
      const a = i * (around + 1) + j;
      const b = a + around + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  geometry.setIndex(index);
  for (let i = 0; i < rings; i += 1) {
    for (let j = 0; j <= around; j += 1) {
      uvs.setXY(i * (around + 1) + j, j / around, i / RINGS_PER_HOOP / 2);
    }
  }

  const fabric = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    map: fabricTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.72,
    emissive: 0xffffff, emissiveIntensity: 0.03,
  }));
  fabric.frustumCulled = false;
  // The outside keeps bright caution colors for people. From inside (back faces), the opaque stripes are a low-contrast gray-tan for hatchlings.
  // three.js draws a see-through two-sided surface in two passes, and FLIP_SIDED marks the pass for the inside. gl_FrontFacing cannot tell them apart.
  fabric.material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      #ifdef FLIP_SIDED
        if (diffuseColor.a > 0.8) {
          float shade = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          diffuseColor.rgb = mix(vec3(0.33, 0.30, 0.26), vec3(shade) * vec3(1.0, 0.95, 0.86), 0.16);
        }
      #endif`);
  };

  const wire = new THREE.MeshStandardMaterial({ color: 0x69747c, roughness: 0.6 });
  const hoopGeometry = new THREE.TorusGeometry(SYSTEM.tunnelRadius, 0.0032, 6, 40);
  const hoopMeshes = Array.from({ length: hoops + 1 }, () => {
    const mesh = new THREE.Mesh(hoopGeometry, wire);
    mesh.castShadow = true;
    return mesh;
  });
  const group = new THREE.Group().add(fabric, ...hoopMeshes);

  const sizes = seededList(hoops + 1, 71).map((value) => 1 + value * 0.05);
  const sideShift = seededList(hoops + 1, 131);
  const heightShift = seededList(hoops + 1, 211);
  const lerpList = (list, ring) => {
    const hoop = Math.min(hoops - 1, Math.floor(ring / RINGS_PER_HOOP));
    const t = ring / RINGS_PER_HOOP - hoop;
    return list[hoop] + (list[hoop + 1] - list[hoop]) * t;
  };

  const centers = Array.from({ length: rings }, () => new THREE.Vector3());
  const tangent = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const WORLD_UP = new THREE.Vector3(0, 1, 0);

  return {
    group,
    update: ({ s, frontZ, length, x, time, lift = 0 }) => {
      const radius = SYSTEM.tunnelRadius * s;
      const spacing = length / hoops;
      const bunched = THREE.MathUtils.clamp(1 - spacing / (radius * 0.9), 0, 1);
      const slack = THREE.MathUtils.clamp(1 - spacing / (radius * 2.5), 0, 1);

      centers.forEach((center, ring) => {
        const z = frontZ - (length * ring) / (rings - 1);
        const cx = x + tunnelBend(z, { frontZ, length, s }) + lerpList(sideShift, ring) * 0.06 * s * (1 - bunched);
        center.set(cx, sandHeight(cx, z) + SYSTEM.tunnelCenterHeight * s + lerpList(heightShift, ring) * 0.02 * s + lift, z);
      });

      centers.forEach((center, ring) => {
        tangent.subVectors(centers[Math.min(rings - 1, ring + 1)], centers[Math.max(0, ring - 1)]).normalize();
        right.crossVectors(tangent, WORLD_UP).normalize();
        up.crossVectors(right, tangent);
        const between = Math.sin((Math.PI * (ring % RINGS_PER_HOOP)) / RINGS_PER_HOOP);
        const size = lerpList(sizes, ring);
        for (let j = 0; j <= around; j += 1) {
          // u = 0 is the bottom of the tube, and u = 0.5 is the top.
          const angle = (j / around) * Math.PI * 2 - Math.PI / 2;
          const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
          const ripple = Math.sin(ring * 0.9 + time * 2.1 + angle * 3) * 0.03 + Math.sin(ring * 2.3 - time * 1.3 + angle * 5) * 0.012 * slack;
          const pull = 1 - 0.05 * between * (1 - bunched) + 0.13 * between * bunched + ripple * between;
          const droop = -0.1 * between * (1 - bunched) * Math.max(0, sin) * radius;
          const r = radius * size * pull;
          positions.setXYZ(
            ring * (around + 1) + j,
            center.x + right.x * cos * r + up.x * (sin * r + droop),
            center.y + right.y * cos * r + up.y * (sin * r + droop),
            center.z + right.z * cos * r + up.z * (sin * r + droop),
          );
        }
      });
      positions.needsUpdate = true;
      geometry.computeVertexNormals();

      hoopMeshes.forEach((mesh, hoop) => {
        const ring = hoop * RINGS_PER_HOOP;
        mesh.position.copy(centers[ring]);
        tangent.subVectors(centers[Math.min(rings - 1, ring + 1)], centers[Math.max(0, ring - 1)]).add(centers[ring]);
        mesh.lookAt(tangent);
        mesh.scale.set(s * sizes[hoop], s * sizes[hoop], s * (hoop === hoops ? 2 : 1));
      });
    },
  };
};
