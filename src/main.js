import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { LOOK, OBSTACLES, PREDATORS, SPEEDS, SYSTEM, TIMING, WORLD, isHeadset, pickQuality } from './config.js';
import { createCreatures } from './creatures.js';
import { createDayCycle } from './daycycle.js';
import { createDecor } from './decor.js';
import { createFoam, createSand, createSandMaterial, createSky, createWater, skyDirection } from './environment.js';
import { createBoard, createPicket, createSign, dimSigns } from './exhibit.js';
import { boardLines, captionFor, createHud } from './hud.js';
import { loadModels } from './models.js';
import { createMovement } from './movement.js';
import { createProject } from './project.js';
import { createSim, hatchingStart, pickRider, setMode, setupPose, stepWorld, timeline } from './simulation.js';
import { sandHeight, tunnelBend, waterlineZ } from './terrain.js';
import { createTouchControls, fovForAspect, nextPixelRatio } from './touch.js';

const touchScreen = !isHeadset(navigator.userAgent) && matchMedia('(hover: none) and (pointer: coarse)').matches;
const quality = pickQuality(navigator.userAgent, touchScreen);
document.body.classList.toggle('touch', touchScreen);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, quality.maxPixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = LOOK.exposure;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.xr.enabled = true;
document.body.append(renderer.domElement);
if (!touchScreen) document.body.append(VRButton.createButton(renderer, { optionalFeatures: ['local-floor', 'hand-tracking'] }));

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(LOOK.fogColor, LOOK.fogDensity);
const camera = new THREE.PerspectiveCamera(fovForAspect(innerWidth / innerHeight), innerWidth / innerHeight, 0.1, 9000);

const sun = skyDirection(LOOK.sunElevation, LOOK.sunAzimuth);
const { sky, environment } = createSky(renderer, sun);
scene.environment = environment;
scene.add(sky);

const sunlight = new THREE.DirectionalLight(0xffe6c4, 4);
sunlight.position.copy(sun).multiplyScalar(120).add(new THREE.Vector3(0, 0, 50));
sunlight.target.position.set(0, 0, 50);
sunlight.castShadow = true;
sunlight.shadow.mapSize.setScalar(quality.shadowMap);
Object.assign(sunlight.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, far: 300 });
scene.add(sunlight, sunlight.target);

const water = createWater(sun, quality.waterTexture);
const foam = createFoam();
const sandLook = createSandMaterial({ highTide: SYSTEM.highTide });
scene.add(water.mesh, foam.mesh, createSand(sandLook.material, quality.sandDetail), createDecor(quality, SYSTEM.highTide));

const project = createProject({
  tunnel: { pointLights: quality.tunnelPointLights, hoops: quality.tunnelHoops, around: quality.tunnelAround },
  sandMaterial: sandLook.material,
});
scene.add(project.group);

const signs = new THREE.Group();
signs.add(
  createSign({ x: -12, z: 39, faceY: 1.0, label: ['TECHNO TACOS', 'Turtle Tunnel', 'Laurel Park Elementary'], fontSize: 92, width: 5.6, height: 3.5 }),
  createSign({ x: -15, z: 31, faceY: 1.15, imageUrl: 'team_data/diagrams.png', width: 7.2, height: 5.9 }),
  createSign({ x: -16, z: 21, faceY: 1.15, imageUrl: 'team_data/project/one_pager.png', width: 4.4, height: 5.7 }),
);
const tunnelSigns = new THREE.Group();
const sizeLines = ['Placeholder sizes:', 'hatchling 5 cm, tunnel 30 cm,', 'box 1 m'];
const bigSign = createPicket({ label: ['Bigger than real life', ...sizeLines], fontSize: 62, width: 1.1, height: 0.7, faceY: 1.7 });
const realSign = createPicket({ label: ['Real size', ...sizeLines], fontSize: 62, width: 1.1, height: 0.7, faceY: 1.7 });
const scoreboard = createBoard({ x: -13, z: 16, faceY: 1.0, fontSize: 52, width: 5, height: 3.1 });
const thanks = createPicket({
  faceY: 1.97, fontSize: 44, width: 1.25, height: 0.8,
  label: ['Thanks to', 'Poly by Google: turtle, seagull (CC-BY 3.0)', 'Quaternius: raccoon, people (CC0)', 'Poly Haven: sand (CC0)', 'NASA: moon'],
});
thanks.position.set(-9, sandHeight(-9, 33), 33);

const lightPicket = createPicket({ label: ['Guiding light color', 'not confirmed yet:', 'we asked', 'Turtle Beach Rehab'], fontSize: 76, width: 1.1, height: 0.7, faceY: 1.0 });
tunnelSigns.add(lightPicket);

// Stands beside the tunnel's mouth and moves with it as the tide changes.
const mouthPicket = createPicket({ label: ['Tunnel mouth still', 'a risk for hatchlings, but', 'much less than before'], faceY: 0.67 });
tunnelSigns.add(mouthPicket);
signs.add(tunnelSigns, bigSign, realSign, scoreboard.group, thanks);
scene.add(signs);

const listener = new THREE.AudioListener();
camera.add(listener);
const waves = new THREE.PositionalAudio(listener);
waves.position.set(0, 1, 0);
waves.setRefDistance(35);
waves.setLoop(true);
scene.add(waves);
new THREE.AudioLoader().load('sample_project/assets/waves.wav', (buffer) => {
  waves.setBuffer(buffer);
  // On a slow connection the first tap can come before the sound arrives.
  if (started) waves.play();
});

// The story clock starts at the first click, so nobody misses the setup.
let started = false;
const firstGesture = () => {
  if (!started) hud.showMessage(touchScreen ? 'This is real size. Tap Size to make everything bigger.' : 'This is real size. Press B to make everything bigger.', view.time, 8);
  started = true;
  listener.context.resume();
  if (waves.buffer && !waves.isPlaying) waves.play();
};

const overlay = document.getElementById('start');
const touch = touchScreen
  ? createTouchControls({ root: document.getElementById('touch'), surface: renderer.domElement, onButton: (code) => ACTIONS[code]?.() })
  : null;
if (touch) document.getElementById('prompt').textContent = 'Tap to start. Use the stick to walk and drag to look around.';

const movement = createMovement({
  camera, renderer, scene, overlay, onFirstGesture: firstGesture, touch,
});

const hud = createHud(document, { touch: touchScreen });

const fitToWindow = () => {
  camera.aspect = innerWidth / innerHeight;
  camera.fov = fovForAspect(camera.aspect);
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
};
addEventListener('resize', fitToWindow);

const applyDay = createDayCycle({
  scene, renderer, sky, water, foam, sunlight, starCount: quality.stars, onSigns: (value) => dimSigns(signs, value),
});

const { nest, bigScale, highTide, mouthGap, tunnelRadius, boxSize } = SYSTEM;

const environmentFor = (s, tide) => {
  const waterZ = waterlineZ(nest.x, tide);
  const mouthZ = waterZ + mouthGap;
  const frontZ = nest.z - (boxSize / 2) * s;
  const shape = { frontZ, length: frontZ - mouthZ, s };
  return { s, nest, waterZ, mouthZ, frontZ, tide, tunnelRadius, obstacles: OBSTACLES, tunnelX: (z) => nest.x + tunnelBend(z, shape) };
};

// Everything the viewer can change. The frame loop eases the smooth values toward their targets.
// Real size first. The B key makes everything bigger.
const view = { elapsed: 0, s: 1, sTarget: 1, tide: 0, tideTarget: 0, lid: 0, lidTarget: 0, riderId: null, time: 0, speedIndex: SPEEDS.indexOf(1) };
let sim = createSim({ count: quality.hatchlings, predators: PREDATORS, env: environmentFor(view.s, view.tide) });

const models = await loadModels();
const creatures = createCreatures({
  models, hatchlingCount: quality.hatchlings, predatorStates: sim.predators, trackCount: quality.tracks, puffCount: quality.puffs,
});
scene.add(creatures.group);

const skipSetup = () => { view.elapsed = Math.max(view.elapsed, hatchingStart(TIMING)); };

const toggleTunnel = () => {
  skipSetup();
  const mode = sim.mode === 'tunnel' ? 'open' : 'tunnel';
  sim = setMode(sim, mode);
  creatures.clearTracks();
  hud.showMessage(mode === 'open'
    ? 'Turn around: the bright houses behind you pull the hatchlings the wrong way.'
    : 'The tunnel is back: walls keep predators out and the lights lead to the ocean.', view.time);
};

const toggleRide = () => {
  if (movement.isRiding()) {
    movement.stopRide();
    view.riderId = null;
    return;
  }
  skipSetup();
  movement.startRide();
  hud.showMessage(touchScreen ? 'You are riding with a hatchling. Tap Ride to get off.' : 'You are riding with a hatchling. Press F to get off.', view.time);
};

const changeSpeed = (step) => {
  view.speedIndex = Math.max(0, Math.min(SPEEDS.length - 1, view.speedIndex + step));
};

const ACTIONS = {
  Minus: () => changeSpeed(-1),
  NumpadSubtract: () => changeSpeed(-1),
  Equal: () => changeSpeed(1),
  NumpadAdd: () => changeSpeed(1),
  KeyT: toggleTunnel,
  KeyF: toggleRide,
  KeyN: skipSetup,
  KeyL: () => { view.lidTarget = view.lidTarget ? 0 : 1; },
  KeyH: () => {
    view.tideTarget = view.tideTarget ? 0 : highTide;
    hud.showMessage(view.tideTarget ? 'High tide: the tunnel gets shorter so water cannot block the mouth.' : 'Low tide: the tunnel stretches back out.', view.time);
  },
  KeyB: () => {
    view.sTarget = view.sTarget === 1 ? bigScale : 1;
    hud.showMessage(view.sTarget === 1 ? 'Using realistic measurements.' : (touchScreen ? 'Bigger than real life, so you can see it on your screen.' : 'Bigger than real life, so you can see it on the TV.'), view.time);
  },
  KeyR: () => {
    if (movement.isRiding()) toggleRide();
    view.elapsed = 0;
    sim = setMode(sim, 'tunnel');
    creatures.clearTracks();
  },
};

addEventListener('keydown', (event) => {
  if (event.repeat) return;
  ACTIONS[event.code]?.();
});

// On a Quest: first controller's trigger toggles the tunnel, second controller's trigger toggles the ride.
renderer.xr.getController(0).addEventListener('selectstart', toggleTunnel);
renderer.xr.getController(1).addEventListener('selectstart', toggleRide);

const ease = (value, target, rate, dt) => value + (target - value) * Math.min(1, rate * dt);

const viewerPosition = new THREE.Vector3();

const frame = (dt) => {
  view.time += dt;
  if (started) view.elapsed += dt;
  view.s = ease(view.s, view.sTarget, 3, dt);
  view.tide = ease(view.tide, view.tideTarget, 0.8, dt);
  view.lid = ease(view.lid, view.lidTarget, 3, dt);

  const moment = timeline(view.elapsed, TIMING);
  const env = environmentFor(view.s, view.tide);
  const bend = (z, length) => tunnelBend(z, { frontZ: env.frontZ, length, s: view.s });
  const pose = setupPose(moment.units, { s: view.s, nest, frontZ: env.frontZ, mouthZ: env.mouthZ, tunnelRadius, bend });
  const hatching = moment.phase === 'hatching';
  const rate = SPEEDS[view.speedIndex];
  const simDt = hatching ? dt * rate : 0;

  applyDay(moment.night);
  water.mesh.position.y = view.tide;
  sandLook.uniforms.uWaterLevel.value = view.tide;
  foam.mesh.position.set(0, view.tide, env.waterZ - waterlineZ(nest.x, 0));

  if (hatching) sim = stepWorld(sim, simDt, env);

  project.update({ s: view.s, mode: sim.mode, pose, night: moment.night, lidOpen: view.lid, frontZ: env.frontZ, fullLength: env.frontZ - env.mouthZ, time: view.time, viewer: camera.getWorldPosition(viewerPosition) });
  creatures.update({
    sim: hatching ? sim : { ...sim, cycleTime: 0 },
    s: view.s, tide: view.tide, nest, dt, simDt,
    showPredators: hatching,
    showVolunteers: !hatching,
    tools: pose.setupTools,
    pouring: pose.pouring,
    volunteerStates: pose.volunteers,
    tunnelOn: sim.mode === 'tunnel',
    tunnelFrom: env.frontZ,
    tunnelTo: env.mouthZ,
    tunnelX: env.tunnelX,
  });

  bigSign.visible = view.sTarget !== 1;
  realSign.visible = view.sTarget === 1;
  tunnelSigns.visible = sim.mode === 'tunnel';
  const picketX = env.tunnelX(env.mouthZ) + tunnelRadius * view.s + 0.55;
  const picketZ = env.mouthZ + 0.7;
  mouthPicket.position.set(picketX, sandHeight(picketX, picketZ), picketZ);
  const lightZ = (env.frontZ + env.mouthZ) / 2;
  const lightX = env.tunnelX(lightZ) + tunnelRadius * view.s + 0.55;
  lightPicket.position.set(lightX, sandHeight(lightX, lightZ), lightZ);
  const sizeX = nest.x + (boxSize / 2) * view.s + 0.6;
  const sizeZ = nest.z + (boxSize / 2) * view.s + 1.1;
  [bigSign, realSign].forEach((sign) => sign.position.set(sizeX, sandHeight(sizeX, sizeZ), sizeZ));
  // The TV shows the score on screen. A headset cannot, so the sign appears only there.
  scoreboard.group.visible = renderer.xr.isPresenting;

  if (movement.isRiding() && hatching) {
    const rider = pickRider(sim, view.riderId);
    view.riderId = rider?.id ?? null;
    if (rider) movement.follow({ x: rider.x, z: rider.z, s: view.s }, dt);
  }

  hud.setCaption(started ? captionFor(moment, sim.mode) : '');
  hud.setScore(sim.counts);
  hud.setSpeed(rate);
  hud.tick(view.time);
  scoreboard.setLines(boardLines(sim.counts));

  touch?.setActive('KeyT', sim.mode === 'tunnel');
  touch?.setActive('KeyH', view.tideTarget !== 0);
  touch?.setActive('KeyL', view.lidTarget !== 0);
  touch?.setActive('KeyB', view.sTarget !== 1);
  touch?.setActive('KeyF', movement.isRiding());
  touch?.setWalkable(!movement.isRiding());
};

// Per-frame updates. Add a function here for anything that animates.
const FRAMES_PER_CHECK = 90;
let pace = { frames: 0, seconds: 0, skipped: false };
// Phones vary a lot, so each one finds its own resolution. The first window is skipped because it includes shader compiling.
const adjustResolution = (dt) => {
  pace = { ...pace, frames: pace.frames + 1, seconds: pace.seconds + dt };
  if (pace.frames < FRAMES_PER_CHECK) return;
  const next = nextPixelRatio(renderer.getPixelRatio(), pace.seconds / pace.frames);
  if (pace.skipped && next !== renderer.getPixelRatio()) renderer.setPixelRatio(next);
  pace = { frames: 0, seconds: 0, skipped: true };
};

const updates = [water.update, foam.update, movement.update, frame, ...(touchScreen ? [adjustResolution] : [])];

overlay.classList.remove('loading');

let previous = 0;
renderer.setAnimationLoop((time) => {
  const dt = Math.min(0.1, (time - previous) / 1000);
  previous = time;
  updates.forEach((update) => update(dt));
  renderer.render(scene, camera);
});

window.demo = {
  scene, camera, renderer, rig: movement.rig, waves, listener, updates, view, movement, ACTIONS,
  start: firstGesture,
  getSim: () => sim,
};
