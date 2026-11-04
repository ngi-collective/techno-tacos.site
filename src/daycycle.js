import * as THREE from 'three';
import { LOOK } from './config.js';
import { skyDirection } from './environment.js';

const lerp = THREE.MathUtils.lerp;
const smooth = THREE.MathUtils.smoothstep;

const SUNSET_ELEVATION = 5;
const NIGHT_ELEVATION = -9;
const DAY_SUN = new THREE.Color(0xffe6c4);
const SUNSET_SUN = new THREE.Color(0xff9455);
const DAY_FOG = new THREE.Color(LOOK.fogColor);
const SUNSET_FOG = new THREE.Color(0xd8a58c);
const NIGHT_FOG = new THREE.Color(0x0a1420);
const DAY_GLINT = new THREE.Color(0xfff0d8);
const SUNSET_GLINT = new THREE.Color(0xffa870);
const MOON_GLINT = new THREE.Color(0x8fa6c8);
const DAY_WATER = new THREE.Color(LOOK.waterColor);
const NIGHT_WATER = new THREE.Color(0x03151f);

// Pure: the sky's numbers for a value of `night`, where 0 is day, 0.5 is sunset and 1 is night.
export const skyState = (night) => {
  const elevation = night < 0.5
    ? lerp(LOOK.sunElevation, SUNSET_ELEVATION, night / 0.5)
    : lerp(SUNSET_ELEVATION, NIGHT_ELEVATION, (night - 0.5) / 0.5);
  return {
    elevation,
    sunIntensity: night < 0.5 ? lerp(4, 3.5, night / 0.5) : lerp(3.5, 0, smooth(night, 0.5, 0.8)),
    moonIntensity: smooth(night, 0.6, 1) * 1.1,
    environment: lerp(1, 0.08, smooth(night, 0.3, 0.9)),
    exposure: lerp(LOOK.exposure, LOOK.nightExposure, smooth(night, 0.5, 1)),
    stars: smooth(night, 0.65, 1),
    foam: lerp(1, 0.22, smooth(night, 0.4, 0.95)),
    signs: lerp(1, 0.42, smooth(night, 0.4, 0.95)),
    moonGlint: smooth(night, 0.6, 0.9),
  };
};

const createStars = (count) => {
  const positions = new Float32Array(count * 3);
  let seed = 99;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < count; i += 1) {
    const direction = skyDirection(4 + Math.asin(random()) * (172 / Math.PI), random() * 360);
    positions.set([direction.x * 4000, direction.y * 4000, direction.z * 4000], i * 3);
  }
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({
    color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false, toneMapped: false,
  }));
};

// Deep blue over the black night sky. The sky shader goes black once the sun is below the horizon.
const createNightDome = () => new THREE.Mesh(
  new THREE.SphereGeometry(2900, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0x0b1b36, side: THREE.BackSide, transparent: true, opacity: 0, fog: false, depthWrite: false, toneMapped: false }),
);

const createMoon = (direction) => {
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(55, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xf2f0e6, fog: false, toneMapped: false, transparent: true, opacity: 0 }),
  );
  moon.position.copy(direction).multiplyScalar(4000);
  return moon;
};

export const createDayCycle = ({ scene, renderer, sky, water, foam, sunlight, onSigns, starCount }) => {
  const moonDirection = skyDirection(LOOK.moonElevation, LOOK.moonAzimuth);
  const moonlight = new THREE.DirectionalLight(0xa9c0e6, 0);
  moonlight.position.copy(moonDirection).multiplyScalar(120);
  const stars = createStars(starCount);
  const moon = createMoon(moonDirection);
  const dome = createNightDome();
  dome.renderOrder = -1;
  scene.add(moonlight, dome, stars, moon);

  const { uniforms } = water.mesh.material;
  const glint = new THREE.Vector3();
  const color = new THREE.Color();
  let current = -1;

  return (night) => {
    if (night === current) return;
    current = night;
    const state = skyState(night);
    const sun = skyDirection(state.elevation, LOOK.sunAzimuth);

    sky.material.uniforms.sunPosition.value.copy(sun);
    sunlight.position.copy(sun).multiplyScalar(120).add(new THREE.Vector3(0, 0, 50));
    sunlight.intensity = state.sunIntensity;
    sunlight.color.copy(DAY_SUN).lerp(SUNSET_SUN, smooth(night, 0.1, 0.5));
    moonlight.intensity = state.moonIntensity;
    scene.environmentIntensity = state.environment;
    renderer.toneMappingExposure = state.exposure;

    const fog = night < 0.5
      ? color.copy(DAY_FOG).lerp(SUNSET_FOG, night / 0.5)
      : color.copy(SUNSET_FOG).lerp(NIGHT_FOG, smooth(night, 0.5, 0.9));
    scene.fog.color.copy(fog);

    glint.copy(sun).lerp(moonDirection, state.moonGlint).normalize();
    uniforms.sunDirection.value.copy(glint);
    uniforms.sunColor.value.copy(DAY_GLINT).lerp(SUNSET_GLINT, smooth(night, 0.1, 0.5)).lerp(MOON_GLINT, state.moonGlint);
    uniforms.waterColor.value.copy(DAY_WATER).lerp(NIGHT_WATER, smooth(night, 0.4, 0.95));

    stars.material.opacity = state.stars;
    moon.material.opacity = state.stars;
    dome.material.opacity = state.stars;
    stars.visible = moon.visible = dome.visible = state.stars > 0;
    foam.setBrightness(state.foam);
    onSigns(state.signs);
  };
};

