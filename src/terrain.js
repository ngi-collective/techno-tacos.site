// Pure terrain functions, shared by the sand mesh, the foam, the walking code and anything placed on the beach.
const smoothstep = (min, max, value) => {
  const t = Math.min(1, Math.max(0, (value - min) / (max - min)));
  return t * t * (3 - 2 * t);
};

export const shoreZ = (x) => 8 * Math.sin(x / 70) + 3 * Math.sin(x / 23 + 1);

// A line of sand dunes between the beach and the houses. It wanders and changes height, as real dunes do.
const duneRidge = (x, fromShore) => {
  const wander = 5 * Math.sin(x / 47) + 2 * Math.sin(x / 17 + 2);
  const along = fromShore - wander;
  const height = 5 + 1 * Math.sin(x / 31) + 0.6 * Math.sin(x / 13 + 1);
  return height * smoothstep(60, 80, along) * (1 - smoothstep(84, 100, along));
};

export const sandHeight = (x, z) => {
  const fromShore = z - shoreZ(x);
  const slope = fromShore < 0 ? fromShore * 0.1 : 2.6 * smoothstep(0, 18, fromShore) + Math.max(0, fromShore - 18) * 0.05;
  const dunes = smoothstep(115, 200, fromShore) * (7 + 3 * Math.sin(x / 37) * Math.cos(z / 29));
  // The sand is smooth along the tunnel's path, so the tunnel never pokes through a ripple.
  const ripples = smoothstep(4, 20, fromShore) * smoothstep(8, 14, Math.abs(x)) * 0.07 * Math.sin(x / 3.1 + z / 4.3);
  const sidesDrop = Math.max(0, Math.abs(x) - 380) * 0.09;
  return Math.max(-4, slope + dunes + ripples + duneRidge(x, fromShore) - sidesDrop);
};

// The z where the sand meets water at a given water height. The sand rises with z near the shore, so bisection finds it.
export const waterlineZ = (x, level) => {
  let low = shoreZ(x) - 30;
  let high = shoreZ(x) + 40;
  for (let i = 0; i < 24; i += 1) {
    const middle = (low + high) / 2;
    if (sandHeight(x, middle) < level) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
};

// The top of the sand the volunteers add inside the tunnel, with soft bumps. It sits above the beach, so anything on it must use this height.
export const tunnelFloorHeight = (x, z, s) =>
  sandHeight(x, z) + 0.05 + 0.01 * s + (Math.sin(x * 7.3 / s + z * 1.9) + Math.sin(z * 3.7 - x * 4.1 / s)) * 0.004 * s;

// How far the tunnel's centre sits from a straight line at z. Fabric does not lie straight, so it makes a gentle S, and the bend relaxes when the tunnel is short.
export const tunnelBend = (z, { frontZ, length, s }) => {
  const along = Math.min(1, Math.max(0, (frontZ - z) / length));
  const room = Math.min(1, length / (s * 6));
  return 0.18 * s * room * Math.sin(Math.PI * along * 1.5) * smoothstep(0, 0.12, along);
};

export const clampToBeach = ({ x, z }) => {
  const clampedX = Math.min(360, Math.max(-360, x));
  return { x: clampedX, z: Math.min(190, Math.max(shoreZ(clampedX) - 1, z)) };
};
