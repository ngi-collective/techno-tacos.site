// Pure terrain functions, shared by the sand mesh, the foam, the walking code and anything placed on the beach.
const smoothstep = (min, max, value) => {
  const t = Math.min(1, Math.max(0, (value - min) / (max - min)));
  return t * t * (3 - 2 * t);
};

export const shoreZ = (x) => 8 * Math.sin(x / 70) + 3 * Math.sin(x / 23 + 1);

export const sandHeight = (x, z) => {
  const fromShore = z - shoreZ(x);
  const slope = fromShore < 0 ? fromShore * 0.1 : 2.6 * smoothstep(0, 18, fromShore) + Math.max(0, fromShore - 18) * 0.05;
  const dunes = smoothstep(70, 170, fromShore) * (7 + 3 * Math.sin(x / 37) * Math.cos(z / 29));
  const ripples = smoothstep(4, 20, fromShore) * 0.07 * Math.sin(x / 3.1 + z / 4.3);
  const sidesDrop = Math.max(0, Math.abs(x) - 380) * 0.09;
  return Math.max(-4, slope + dunes + ripples - sidesDrop);
};

export const clampToBeach = ({ x, z }) => {
  const clampedX = Math.min(360, Math.max(-360, x));
  return { x: clampedX, z: Math.min(190, Math.max(shoreZ(clampedX) - 1, z)) };
};
