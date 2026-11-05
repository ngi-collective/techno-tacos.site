import * as THREE from 'three';
import { LOOK } from './config.js';
import { createGlow } from './effects.js';
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

// Deep blue over the black night sky, because the sky shader goes black once the sun is below the horizon.
// The houses behind the dunes (+z) light up the sky over them: orange at the horizon, fading as it climbs.
const createNightDome = () => new THREE.Mesh(
  new THREE.SphereGeometry(2900, 48, 32),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: { opacity: { value: 0 } },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float opacity;
      varying vec3 vDirection;
      void main() {
        vec3 direction = normalize(vDirection);
        float toward = max(0.0, dot(normalize(direction.xz + vec2(0.0001)), vec2(0.0, 1.0)));
        float height = max(0.0, direction.y);
        float glow = pow(toward, 2.6) * (exp(-height * 5.5) * 0.85 + exp(-height * 1.9) * 0.32);
        vec3 sky = vec3(0.0034, 0.0110, 0.0369);
        vec3 ember = mix(vec3(0.62, 0.24, 0.07), vec3(0.30, 0.13, 0.17), smoothstep(0.0, 0.42, height));
        gl_FragColor = vec4(sky + ember * glow, opacity);
        #include <colorspace_fragment>
      }`,
  }),
);

// Flattens NASA's map of the moon into the round face we see from Earth. Pure apart from reading the two pixel arrays.
const nearSidePixels = (map, mapWidth, mapHeight, size) => {
  const face = new Uint8ClampedArray(size * size * 4);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const x = ((column + 0.5) / size) * 2 - 1;
      const y = 1 - ((row + 0.5) / size) * 2;
      const fromCentre = Math.hypot(x, y);
      if (fromCentre <= 1) {
        const z = Math.sqrt(Math.max(0, 1 - fromCentre * fromCentre));
        const longitude = Math.atan2(x, z);
        const latitude = Math.asin(y);
        const mapX = Math.floor((longitude / (Math.PI * 2) + 0.5) * (mapWidth - 1));
        const mapY = Math.floor((0.5 - latitude / Math.PI) * (mapHeight - 1));
        const from = (mapY * mapWidth + mapX) * 4;
        const to = (row * size + column) * 4;
        face.set([map[from], map[from + 1], map[from + 2], Math.min(255, (1 - fromCentre) * size)], to);
      }
    }
  }
  return face;
};

// NASA's map of the real moon. See team_data/project/credits.md.
const moonTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  new THREE.ImageLoader().load('assets/textures/moon.jpg', (image) => {
    const source = document.createElement('canvas');
    source.width = image.width;
    source.height = image.height;
    const sourceContext = source.getContext('2d');
    sourceContext.drawImage(image, 0, 0);
    const pixels = sourceContext.getImageData(0, 0, image.width, image.height).data;
    canvas.getContext('2d').putImageData(new ImageData(nearSidePixels(pixels, image.width, image.height, 512), 512, 512), 0, 0);
    texture.needsUpdate = true;
  });
  return texture;
};

const MOON_DISTANCE = 4000;
const MOON_RADIUS = 190;
const MOON_BRIGHTNESS = 1.9; // The map is true gray rock. A moon in a dark sky looks much brighter.

// The moon and its halos always face the viewer, so it stays round anywhere on screen.
const createMoon = (direction) => {
  const disc = new THREE.Sprite(new THREE.SpriteMaterial({
    map: moonTexture(), color: new THREE.Color(MOON_BRIGHTNESS, MOON_BRIGHTNESS, MOON_BRIGHTNESS),
    fog: false, toneMapped: false, transparent: true, depthWrite: false, opacity: 0,
  }));
  disc.scale.setScalar(MOON_RADIUS * 2);
  const halo = createGlow(0xdfe8ff, MOON_RADIUS * 4);
  const wideHalo = createGlow(0xaec4f2, MOON_RADIUS * 12);
  wideHalo.renderOrder = 1;
  halo.renderOrder = 2;
  disc.renderOrder = 3;
  const group = new THREE.Group().add(wideHalo, halo, disc);
  group.position.copy(direction).multiplyScalar(MOON_DISTANCE);
  return {
    group,
    setBrightness: (value) => {
      disc.material.opacity = value;
      halo.material.opacity = value * 0.85;
      wideHalo.material.opacity = value * 0.32;
      group.visible = value > 0;
    },
  };
};

export const createDayCycle = ({ scene, renderer, sky, water, foam, sunlight, onSigns, starCount }) => {
  const moonDirection = skyDirection(LOOK.moonElevation, LOOK.moonAzimuth);
  const moonlight = new THREE.DirectionalLight(0xa9c0e6, 0);
  moonlight.position.copy(moonDirection).multiplyScalar(120);
  const stars = createStars(starCount);
  const moon = createMoon(moonDirection);
  const dome = createNightDome();
  dome.renderOrder = -1;
  scene.add(moonlight, dome, stars, moon.group);

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
    moon.setBrightness(state.stars);
    dome.material.uniforms.opacity.value = state.stars;
    stars.visible = dome.visible = state.stars > 0;
    foam.setBrightness(state.foam);
    onSigns(state.signs);
  };
};

