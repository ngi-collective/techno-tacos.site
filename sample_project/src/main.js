import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { LOOK, WORLD, pickQuality } from './config.js';
import { createFoam, createSand, createSky, createWater, sunDirection } from './environment.js';
import { createProjectSite, createSign } from './exhibit.js';
import { createMovement } from './movement.js';
import { createSkyline } from './skyline.js';

const quality = pickQuality(navigator.userAgent);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, quality.maxPixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = LOOK.exposure;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.xr.enabled = true;
document.body.append(renderer.domElement, VRButton.createButton(renderer, { optionalFeatures: ['local-floor', 'hand-tracking'] }));

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(LOOK.fogColor, LOOK.fogDensity);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 9000);

const sun = sunDirection(LOOK);
const { sky, environment } = createSky(renderer, sun);
scene.environment = environment;
scene.add(sky);

const sunlight = new THREE.DirectionalLight(0xffe6c4, 5);
sunlight.position.copy(sun).multiplyScalar(120).add(new THREE.Vector3(0, 0, 50));
sunlight.target.position.set(0, 0, 50);
sunlight.castShadow = true;
sunlight.shadow.mapSize.setScalar(quality.shadowMap);
Object.assign(sunlight.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, far: 300 });
scene.add(sunlight, sunlight.target);

const water = createWater(sun, quality.waterTexture);
const foam = createFoam();
scene.add(water.mesh, foam.mesh, createSand(), createSkyline(WORLD.skylineZ, quality.buildings));

// The team's project goes in `site.contents`. Remove `site.placeholder` from its parent once it is there.
const site = createProjectSite(WORLD.projectSite);
scene.add(site.group);

// Swap `label` for imageUrl: '/team_data/your-picture.png' to show real pictures.
scene.add(
  createSign({ x: -22, z: 36, faceY: 0.35 }),
  createSign({ x: 22, z: 36, faceY: -0.35 }),
);

const listener = new THREE.AudioListener();
camera.add(listener);
const waves = new THREE.PositionalAudio(listener);
waves.position.set(0, 1, 0);
waves.setRefDistance(35);
waves.setLoop(true);
scene.add(waves);
new THREE.AudioLoader().load('/sample_project/assets/waves.wav', (buffer) => waves.setBuffer(buffer));

const startAudio = () => {
  listener.context.resume();
  if (waves.buffer && !waves.isPlaying) waves.play();
};

const movement = createMovement({
  camera, renderer, scene, overlay: document.getElementById('start'), onFirstGesture: startAudio,
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Per-frame updates. Add a function here for anything that animates.
const updates = [water.update, foam.update, movement.update];

let previous = 0;
renderer.setAnimationLoop((time) => {
  const dt = Math.min(0.1, (time - previous) / 1000);
  previous = time;
  updates.forEach((update) => update(dt));
  renderer.render(scene, camera);
});

window.demo = { scene, camera, renderer, rig: movement.rig, site, waves, listener, updates };
