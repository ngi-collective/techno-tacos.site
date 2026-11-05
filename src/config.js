// Everything worth tuning live is here. The Quest profile is a starting guess: it is untested on a headset.
export const QUALITY = {
  desktop: { waterTexture: 1024, shadowMap: 2048, maxPixelRatio: 2, hatchlings: 36, stars: 1500, tunnelPointLights: 3, tunnelHoops: 30, tunnelAround: 28, sandDetail: [640, 300], tracks: 500, puffs: 200, shells: 350, seaweed: 200, grass: 500 },
  // A starting guess for phones and tablets. The frame loop also lowers the resolution if frames run slow.
  mobile: { waterTexture: 256, shadowMap: 1024, maxPixelRatio: 1.5, hatchlings: 20, stars: 600, tunnelPointLights: 1, tunnelHoops: 20, tunnelAround: 20, sandDetail: [400, 160], tracks: 150, puffs: 60, shells: 120, seaweed: 70, grass: 180 },
  quest: { waterTexture: 256, shadowMap: 1024, maxPixelRatio: 1, hatchlings: 14, stars: 400, tunnelPointLights: 1, tunnelHoops: 14, tunnelAround: 18, sandDetail: [320, 120], tracks: 100, puffs: 50, shells: 80, seaweed: 50, grass: 120 },
};

export const isHeadset = (userAgent) => /OculusBrowser|Quest/i.test(userAgent);

export const pickQuality = (userAgent, touch) => {
  if (isHeadset(userAgent)) return QUALITY.quest;
  return touch ? QUALITY.mobile : QUALITY.desktop;
};

export const LOOK = {
  exposure: 0.34,
  nightExposure: 0.8,
  sunElevation: 38,
  sunAzimuth: 52, // Degrees right of straight ahead, which keeps the sun out of the middle of the view.
  moonElevation: 14,
  moonAzimuth: -18, // Over the ocean, nearly opposite the houses behind the dunes.
  waterColor: 0x0b4a5c,
  fogColor: 0xc9d8e2,
  fogDensity: 0.00016,
};

export const WORLD = {
  start: { x: 15, z: 23 },
  lookAt: { x: 3, z: 14.6 },
  walkSpeed: 7,
  runSpeed: 16,
  eyeHeight: 1.6,
};

// Real sizes in metres are team placeholders until the team measures its prototype.
export const SYSTEM = {
  nest: { x: 0, z: 24 },
  boxSize: 1,
  boxHeight: 0.85,
  tunnelRadius: 0.15,
  tunnelCenterHeight: 0.075, // Option B: the circle sits part-way into the sand, so the floor is level with the beach.
  hatchlingLength: 0.05,
  bigScale: 3,
  personHeight: 1.8,
  highTide: 0.8,
  mouthGap: 1,
  guidingLightColor: 0xffa52e,
};

// Seconds per setup step, long enough that people 1.8 m tall can walk the tunnel.
export const TIMING = { setupStepSeconds: [7, 8, 8, 10, 10, 14, 6], sunsetSeconds: 14 };

export const SPEEDS = [0.25, 0.5, 1, 2, 4];

export const PREDATORS = { crab: 4, raccoon: 1, bird: 2 };

// Radius in metres at real size. The simulation multiplies it by the scene scale.
export const OBSTACLES = [
  { kind: 'hole', x: -6, z: 35, radius: 0.4 },
  { kind: 'hole', x: 7, z: 42, radius: 0.4 },
  { kind: 'hole', x: -14, z: 44, radius: 0.4 },
  { kind: 'castle', x: 3, z: 34, radius: 0.42 },
  { kind: 'castle', x: -10, z: 49, radius: 0.42 },
  { kind: 'chair', x: 10, z: 35, radius: 0.35 },
  { kind: 'chair', x: -3, z: 45, radius: 0.35 },
  { kind: 'trash', x: -12, z: 32, radius: 0.25 },
  { kind: 'trash', x: 14, z: 46, radius: 0.25 },
  { kind: 'trash', x: 1, z: 50, radius: 0.25 },
];
