import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { LOOK } from './config.js';
import { sandHeight, shoreZ } from './terrain.js';

// Azimuth is measured from straight ahead (-z), with positive values to the right.
export const skyDirection = (elevationDegrees, azimuthDegrees) => {
  const elevation = THREE.MathUtils.degToRad(elevationDegrees);
  const azimuth = THREE.MathUtils.degToRad(azimuthDegrees);
  return new THREE.Vector3(
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation),
    -Math.cos(elevation) * Math.cos(azimuth),
  ).normalize();
};

export const createSky = (renderer, sun) => {
  const sky = new Sky();
  sky.scale.setScalar(6000);
  const { uniforms } = sky.material;
  uniforms.turbidity.value = 3.5;
  uniforms.rayleigh.value = 1.4;
  uniforms.mieCoefficient.value = 0.003;
  uniforms.mieDirectionalG.value = 0.78;
  uniforms.sunPosition.value.copy(sun);

  const environmentScene = new THREE.Scene();
  environmentScene.add(sky.clone());
  const generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromScene(environmentScene).texture;
  generator.dispose();
  return { sky, environment };
};

export const createWater = (sun, textureSize) => {
  const normals = new THREE.TextureLoader().load('/sample_project/assets/waternormals.jpg', (texture) => {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  });
  const water = new Water(new THREE.PlaneGeometry(9000, 9000), {
    textureWidth: textureSize,
    textureHeight: textureSize,
    waterNormals: normals,
    sunDirection: sun.clone(),
    sunColor: 0xfff0d8,
    waterColor: LOOK.waterColor,
    distortionScale: 3.2,
    fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  water.material.uniforms.size.value = 0.6;
  return { mesh: water, update: (dt) => { water.material.uniforms.time.value += dt * 0.55; } };
};

const SAND_TILE_METRES = 30;

export const sandUv = (x, z) => [x / SAND_TILE_METRES, z / SAND_TILE_METRES];

const loadSandTexture = (url, isColor) => {
  const texture = new THREE.TextureLoader().load(url);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  if (isColor) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

// One material for the beach and the sand inside the tunnel, so they match.
// Color comes from height above the water, plus noise that keeps the photo from repeating visibly.
export const createSandMaterial = ({ highTide }) => {
  const uniforms = { uWaterLevel: { value: 0 }, uTideLine: { value: highTide + 0.22 } };
  const material = new THREE.MeshStandardMaterial({
    map: loadSandTexture('/assets/textures/sand_diff.jpg', true),
    normalMap: loadSandTexture('/assets/textures/sand_nor.jpg', false),
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 1,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSandWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSandWorld = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vSandWorld;
        uniform float uWaterLevel;
        uniform float uTideLine;
        float sandHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float sandNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(sandHash(i), sandHash(i + vec2(1.0, 0.0)), f.x), mix(sandHash(i + vec2(0.0, 1.0)), sandHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float sandPatches(vec2 p) { return sandNoise(p) * 0.55 + sandNoise(p * 2.3 + 4.1) * 0.3 + sandNoise(p * 5.1 + 9.7) * 0.15; }`)
      .replace('#include <map_fragment>', `
        vec2 sandXZ = vSandWorld.xz;
        float photo = texture2D(map, vMapUv).r * 0.5 + texture2D(map, vMapUv * 0.37 + 0.21).r * 0.3 + texture2D(map, vMapUv * 7.3).r * 0.2;
        float patches = sandPatches(sandXZ * 0.06);
        float grains = sandPatches(sandXZ * 1.7);
        float height = vSandWorld.y - uWaterLevel + (patches - 0.5) * 0.35;
        float wet = 1.0 - smoothstep(0.0, 0.8, height);
        float damp = 1.0 - smoothstep(0.5, 1.7, height);
        vec3 dry = mix(vec3(0.34, 0.22, 0.10), vec3(0.54, 0.38, 0.18), patches);
        dry = mix(dry, vec3(0.44, 0.22, 0.12), smoothstep(0.55, 0.8, sandNoise(sandXZ * 0.21 + 2.0)) * 0.6);
        vec3 sandColor = mix(dry, dry * vec3(0.72, 0.68, 0.62), damp);
        sandColor = mix(sandColor, vec3(0.13, 0.09, 0.055), wet * 0.9);
        float lineEdge = uTideLine + (sandNoise(vec2(sandXZ.x * 0.09, 3.0)) - 0.5) * 0.3;
        sandColor *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.16, abs(vSandWorld.y - lineEdge)));
        sandColor *= 0.55 + photo * 0.9;
        sandColor *= 0.93 + grains * 0.14;
        diffuseColor.rgb *= sandColor;`)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = mix(1.0, 0.16, wet);`);
  };
  return { material, uniforms };
};

export const createSand = (material, [widthSegments, depthSegments]) => {
  const geometry = new THREE.PlaneGeometry(1000, 300, widthSegments, depthSegments);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, 110);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i += 1) {
    const [x, z] = [position.getX(i), position.getZ(i)];
    position.setY(i, sandHeight(x, z));
    uv.setXY(i, ...sandUv(x, z));
  }
  geometry.computeVertexNormals();
  const sand = new THREE.Mesh(geometry, material);
  sand.receiveShadow = true;
  return sand;
};

// A ribbon of foam that follows the shoreline and washes up and down the sand.
export const createFoam = () => {
  const geometry = new THREE.PlaneGeometry(1000, 1, 500, 12);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = shoreZ(x) + position.getY(i) * 11 + 1.5;
    position.setXYZ(i, x, Math.max(0.05, sandHeight(x, z) + 0.05), z);
  }
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 }, brightness: { value: 1 } },
    vertexShader: `
      varying vec2 vUv; varying vec3 vWorld;
      void main() { vUv = uv; vWorld = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float time; uniform float brightness; varying vec2 vUv; varying vec3 vWorld;
      void main() {
        float wash = 0.5 + 0.35 * sin(time * 0.55 + vWorld.x * 0.018) + 0.08 * sin(vWorld.x * 0.09 + time * 0.3);
        float lace = 0.5 + 0.5 * sin(vWorld.x * 1.3 + vWorld.z * 2.1 + time) * sin(vWorld.x * 0.47 - vWorld.z * 1.7);
        float edge = smoothstep(wash + 0.03, wash - 0.02, vUv.y);
        float body = smoothstep(wash - 0.34, wash - 0.03, vUv.y);
        float bank = smoothstep(0.0, 0.14, vUv.y);
        gl_FragColor = vec4(vec3(0.98) * brightness, edge * bank * (0.22 + 0.62 * body * (0.55 + 0.45 * lace)));
      }`,
  });
  return {
    mesh: new THREE.Mesh(geometry, material),
    update: (dt) => { material.uniforms.time.value += dt; },
    setBrightness: (value) => { material.uniforms.brightness.value = value; },
  };
};
