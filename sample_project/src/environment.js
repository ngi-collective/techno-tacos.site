import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { LOOK } from './config.js';
import { sandHeight, shoreZ } from './terrain.js';

// Azimuth is measured from straight ahead (-z), with positive values to the right.
export const sunDirection = ({ sunElevation, sunAzimuth }) => {
  const elevation = THREE.MathUtils.degToRad(sunElevation);
  const azimuth = THREE.MathUtils.degToRad(sunAzimuth);
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

export const createSand = () => {
  const geometry = new THREE.PlaneGeometry(1000, 300, 320, 120);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, 110);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    position.setY(i, sandHeight(position.getX(i), position.getZ(i)));
  }
  geometry.computeVertexNormals();

  const texture = new THREE.TextureLoader().load('/sample_project/assets/sand.png');
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(70, 21);
  texture.colorSpace = THREE.SRGBColorSpace;

  const sand = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, color: 0xf3e2c0, roughness: 1 }));
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
    uniforms: { time: { value: 0 } },
    vertexShader: `
      varying vec2 vUv; varying vec3 vWorld;
      void main() { vUv = uv; vWorld = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float time; varying vec2 vUv; varying vec3 vWorld;
      void main() {
        float wash = 0.5 + 0.35 * sin(time * 0.55 + vWorld.x * 0.018) + 0.08 * sin(vWorld.x * 0.09 + time * 0.3);
        float lace = 0.5 + 0.5 * sin(vWorld.x * 1.3 + vWorld.z * 2.1 + time) * sin(vWorld.x * 0.47 - vWorld.z * 1.7);
        float edge = smoothstep(wash + 0.03, wash - 0.02, vUv.y);
        float body = smoothstep(wash - 0.34, wash - 0.03, vUv.y);
        float bank = smoothstep(0.0, 0.14, vUv.y);
        gl_FragColor = vec4(vec3(0.98), edge * bank * (0.22 + 0.62 * body * (0.55 + 0.45 * lace)));
      }`,
  });
  return { mesh: new THREE.Mesh(geometry, material), update: (dt) => { material.uniforms.time.value += dt; } };
};
