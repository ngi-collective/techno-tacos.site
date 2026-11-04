// Everything worth tuning live is here. The Quest profile is a starting guess: it is untested on a headset.
export const QUALITY = {
  desktop: { waterTexture: 1024, shadowMap: 2048, maxPixelRatio: 2, buildings: 160 },
  quest: { waterTexture: 256, shadowMap: 1024, maxPixelRatio: 1, buildings: 70 },
};

export const pickQuality = (userAgent) => (/OculusBrowser|Quest/i.test(userAgent) ? QUALITY.quest : QUALITY.desktop);

export const LOOK = {
  exposure: 0.42,
  sunElevation: 13,
  sunAzimuth: 52, // Degrees right of straight ahead, which keeps the sun out of the middle of the view.
  waterColor: 0x0b4a5c,
  fogColor: 0xc9d8e2,
  fogDensity: 0.00016,
};

export const WORLD = {
  skylineZ: -1250,
  start: { x: 0, z: 58 },
  projectSite: { x: 0, z: 28, width: 28, depth: 16 },
  walkSpeed: 7,
  runSpeed: 16,
  eyeHeight: 1.6,
};
