// The turtle story as pure functions: no three.js, no DOM. Every function returns new data, so test/simulation.test.js can run it.
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const approach = (value, target, maxStep) => value + Math.max(-maxStep, Math.min(maxStep, target - value));

const BIRTH_SPREAD = 14;
const CYCLE_PAUSE = 4;
const SWIM_DISTANCE = 14;
const SWIM_SPEED = 1.2;
const STROKE_SECONDS = 0.95;
const SWIM_STROKE_SECONDS = 0.5;
const OPEN_OCEAN_SHARE = 0.15; // Share of hatchlings on the plain beach that still head for the water.
const EXPOSED_CHANCE = 0.08; // Chance a hatchling leaving the tunnel mouth attracts a bird.
const LOST_DISTANCE = 30;
const STUCK_SECONDS = 2.5;
const CARRY_SECONDS = 3;
// Predator speeds and reach are at the big scale of 3, and shrink with the scene.
const SPEED = { crab: 2.4, raccoon: 3.6, bird: 9 };
const SIGHT = { crab: 10, raccoon: 18, bird: 40 };
const REACH = { crab: 0.45, raccoon: 0.7, bird: 0.7 };
const scaled = (value, env) => value * (env.s / 3);
const BIRD_HEIGHT = 11;

export const seededRandom = (seed) => {
  let state = seed;
  return {
    next: () => {
      state = (state * 16807) % 2147483647;
      return state / 2147483647;
    },
    seed: () => state,
  };
};

export const SETUP_STEPS = [
  'Find the marked nest',
  'Place the box over it',
  'Clip on the light panel',
  'Attach the tunnel through the hole',
  'Stretch the tunnel to the waterline',
  'Add sand inside and hammer in the stakes',
  'Turn on the guiding lights',
];

const setupSeconds = (steps) => steps.reduce((total, seconds) => total + seconds, 0);

export const hatchingStart = ({ setupStepSeconds, sunsetSeconds }) => setupSeconds(setupStepSeconds) + sunsetSeconds;

// `units` counts setup steps, and keeps going from 7 to 8 during the sunset while the volunteers walk away.
export const timeline = (elapsed, { setupStepSeconds, sunsetSeconds }) => {
  const setupEnd = setupSeconds(setupStepSeconds);
  if (elapsed < setupEnd) {
    let left = elapsed;
    let step = 0;
    while (left >= setupStepSeconds[step]) {
      left -= setupStepSeconds[step];
      step += 1;
    }
    return { phase: 'setup', units: step + left / setupStepSeconds[step], step, night: 0 };
  }
  const night = clamp01((elapsed - setupEnd) / sunsetSeconds);
  return { phase: night < 1 ? 'sunset' : 'hatching', units: SETUP_STEPS.length + night, step: SETUP_STEPS.length, night };
};

// Keyframes are { u, x, z }, sorted by u. Between two frames the volunteer walks with an eased pace.
const keyframesAt = (frames, units) => {
  const next = frames.findIndex((frame) => frame.u > units);
  if (next === -1) return { ...frames[frames.length - 1], walking: false };
  if (next === 0) return { ...frames[0], walking: false };
  const [from, to] = [frames[next - 1], frames[next]];
  const t = clamp01((units - from.u) / (to.u - from.u));
  return { x: lerp(from.x, to.x, ease(t)), z: lerp(from.z, to.z, ease(t)), walking: from.x !== to.x || from.z !== to.z };
};

// Fractions along the tunnel, measured from the box.
export const STAKE_FRACTIONS = [0.15, 0.5, 0.85];
const HAMMER_SHARE = 0.14;

// Pure: where a volunteer is during the sand-and-stakes step, walking from the box to the mouth and stopping at each stake.
export const stakeWalk = (t) => {
  const stops = STAKE_FRACTIONS;
  const walkShare = 1 - HAMMER_SHARE * stops.length;
  let clock = 0;
  let from = 0;
  for (let i = 0; i < stops.length; i += 1) {
    const walk = (stops[i] - from) * walkShare;
    if (t < clock + walk) return { along: from + ((t - clock) / walk) * (stops[i] - from), hammer: null, hammered: i, swing: 0 };
    clock += walk;
    if (t < clock + HAMMER_SHARE) return { along: stops[i], hammer: i, hammered: i, swing: (t - clock) / HAMMER_SHARE };
    clock += HAMMER_SHARE;
    from = stops[i];
  }
  const last = stops[stops.length - 1];
  return { along: last + clamp01((t - clock) / ((1 - last) * walkShare)) * (1 - last), hammer: null, hammered: stops.length, swing: 0 };
};

const rampUp = (units, from, to) => ease(clamp01((units - from) / (to - from)));

// 0 outside a window, 1 in the middle of it, with eased edges.
const bump = (units, start, full, release, end) => rampUp(units, start, full) * (1 - rampUp(units, release, end));

const MARKER_CLEARANCE = 0.6; // Times the scene scale. The nest's marker posts are 0.5 tall.
const CARRY_GAP = 0.78; // How far a carrier stands from the box's centre, times the scene scale. They walk side by side, so neither steps on the nest or the marker posts.

// `units` counts setup steps: 2.5 means halfway through the third step. Everything here is pure, and all heights are above the sand.
export const setupPose = (units, { s, nest, frontZ, mouthZ, tunnelRadius, boxHeight = 0.85, bend = () => 0 }) => {
  // Step 2: bend, lift clear of the marker posts, carry, lower over the nest.
  const boxLift = bump(units, 1.18, 1.3, 1.75, 1.92) * MARKER_CLEARANCE * s;
  const travel = rampUp(units, 1.3, 1.75);
  const boxX = -(1 - travel) * 1.6 * s;
  const stepOneBend = bump(units, 1, 1.1, 1.18, 1.3) + bump(units, 1.75, 1.85, 1.92, 2);

  // Step 3: the panel lies on the sand. One volunteer stands it up and presses it onto the box.
  const panelUp = rampUp(units, 2.45, 2.6);
  const panelPress = rampUp(units, 2.7, 2.9);
  const panelTilt = (Math.PI / 2) * (1 - panelUp);
  const panelZ = lerp(lerp(0.99, 0.62, panelUp), 0.53, panelPress);
  const panelY = lerp(0.012, boxHeight / 2, panelUp);
  const panelEdge = {
    y: (panelY + (boxHeight / 2) * Math.cos(panelTilt)) * s,
    z: nest.z + (panelZ + (boxHeight / 2) * Math.sin(panelTilt)) * s,
  };

  // Step 4: both pick up the bunched tunnel and carry it to the hole.
  const carried = rampUp(units, 3.6, 3.9);
  const tunnelLift = bump(units, 3.5, 3.6, 3.88, 3.97) * 0.3 * s;
  const collapsed = 1.5 + s * 0.2;
  const stretch = rampUp(units, 4, 5);
  const length = lerp(collapsed, frontZ - mouthZ, stretch);
  const startShift = s * 2 + 2;
  const tunnelShift = (1 - carried) * startShift;
  const tunnelCenterZ = frontZ - tunnelShift - collapsed / 2;

  const radius = tunnelRadius * s;
  const side = radius + 0.3 * s;
  const fullLength = frontZ - mouthZ;
  const mouthNow = frontZ - length;
  const firstCarryZ = frontZ - startShift - collapsed / 2;
  const lastCarryZ = frontZ - collapsed / 2;
  const alongZ = (fraction) => frontZ - fullLength * fraction;
  const centerAt = (z) => nest.x + bend(z, fullLength);

  const walk = stakeWalk(clamp01(units - 5));
  const inStakes = units >= 5 && units < 6;
  const hammering = inStakes && walk.hammer !== null;

  const oneFrames = [
    { u: 0, x: -6, z: nest.z + 17 }, { u: 1, x: nest.x - 1.6 * s, z: nest.z + CARRY_GAP * s },
    { u: 2, x: nest.x, z: nest.z + CARRY_GAP * s },
    { u: 2.25, x: nest.x, z: nest.z + 1.67 * s }, { u: 2.45, x: nest.x, z: nest.z + 1.67 * s },
    { u: 2.7, x: nest.x, z: nest.z + 0.95 * s }, { u: 3, x: nest.x, z: nest.z + 0.95 * s },
    { u: 3.1, x: nest.x + 0.95 * s, z: nest.z + 0.95 * s }, { u: 3.22, x: nest.x + 0.95 * s, z: nest.z - 0.72 * s },
    { u: 3.35, x: nest.x + side, z: firstCarryZ }, { u: 3.6, x: nest.x + side, z: firstCarryZ },
    { u: 3.9, x: nest.x + side, z: lastCarryZ }, { u: 4, x: nest.x + side, z: lastCarryZ },
    { u: 4.5, x: nest.x + side, z: frontZ }, { u: 5, x: nest.x + side, z: frontZ },
  ];
  const twoFrames = [
    { u: 0, x: -1, z: nest.z + 19 }, { u: 0.72, x: nest.x - 0.87 * s, z: nest.z + CARRY_GAP * s }, { u: 0.88, x: nest.x - 0.87 * s, z: nest.z - CARRY_GAP * s },
    { u: 1, x: nest.x - 1.6 * s, z: nest.z - CARRY_GAP * s },
    { u: 2, x: nest.x, z: nest.z - CARRY_GAP * s }, { u: 3, x: nest.x, z: nest.z - CARRY_GAP * s },
    { u: 3.35, x: nest.x - side, z: firstCarryZ },
    { u: 3.6, x: nest.x - side, z: firstCarryZ }, { u: 3.9, x: nest.x - side, z: lastCarryZ }, { u: 4, x: nest.x - side, z: lastCarryZ },
  ];

  const carrying = units >= 1 && units < 2;
  const carryWalking = units > 1.3 && units < 1.75;

  const placeOne = () => {
    if (carrying) return { x: nest.x + boxX, z: nest.z + CARRY_GAP * s, walking: carryWalking };
    if (inStakes) return { x: centerAt(alongZ(walk.along)) + side, z: alongZ(walk.along), walking: walk.hammer === null };
    if (units >= 6) return keyframesAt([{ u: 6, x: centerAt(mouthZ) + side, z: mouthZ }, { u: 8, x: 34, z: 8 }], units);
    return keyframesAt(oneFrames, units);
  };
  const placeTwo = () => {
    if (carrying) return { x: nest.x + boxX, z: nest.z - CARRY_GAP * s, walking: carryWalking };
    if (units >= 4 && units < 5) return { x: nest.x + bend(mouthNow, length) - side, z: mouthNow - 0.1 * s, walking: true };
    if (inStakes) return { x: centerAt(alongZ(1 - walk.along)) - side, z: alongZ(1 - walk.along), walking: walk.hammer === null };
    if (units >= 6) return keyframesAt([{ u: 6, x: centerAt(frontZ) - side, z: frontZ }, { u: 6.5, x: nest.x - s * 0.9, z: nest.z }, { u: 8, x: -6, z: nest.z + 30 }], units);
    return keyframesAt(twoFrames, units);
  };

  const onBox = units >= 1.04 && units < 1.97;
  const boxHand = (sideOfBox, across) => ({ x: nest.x + boxX + across * 0.3 * s, y: boxLift + 0.3 * s, z: nest.z + sideOfBox * 0.5 * s });
  const onPanel = units >= 2.3 && units < 2.92;
  const panelHand = (across) => ({ x: nest.x + across * 0.3 * s, y: panelEdge.y, z: panelEdge.z });
  const onTunnel = units >= 3.4 && units < 3.97;
  const tunnelHand = (across) => ({ x: nest.x, y: tunnelLift + 0.2 * s, z: tunnelCenterZ + across * 0.2 * s });
  const lifting = units < 3.6;
  const toolBend = bump(units, 4.82, 4.9, 4.93, 5);
  const tunnelBendAmount = bump(units, 3.35, 3.47, 3.5, 3.6) + bump(units, 3.88, 3.94, 3.97, 4);

  const oneHands = () => {
    if (onBox) return { left: boxHand(1, 1), right: boxHand(1, -1) };
    if (onPanel) return { left: panelHand(-1), right: panelHand(1) };
    if (onTunnel) return lifting ? { left: tunnelHand(-1), right: tunnelHand(1) } : { left: null, right: tunnelHand(0) };
    if (inStakes && !hammering) return { left: { x: centerAt(alongZ(walk.along)), y: 0.32 * s, z: alongZ(walk.along) }, right: null };
    return { left: null, right: null };
  };
  const twoHands = () => {
    if (onBox) return { left: boxHand(-1, -1), right: boxHand(-1, 1) };
    if (onTunnel) return lifting ? { left: tunnelHand(1), right: tunnelHand(-1) } : { left: tunnelHand(0), right: null };
    if (units >= 4 && units < 5) return { left: null, right: { x: nest.x + bend(mouthNow, length), y: 0.2 * s, z: mouthNow } };
    return { left: null, right: null };
  };

  // They face the box to lift and lower it, and turn to walk forward between those.
  const facingBox = (units >= 1 && units < 1.27) || (units >= 1.76 && units < 2);
  const oneFace = () => {
    if (facingBox) return { x: nest.x + boxX, z: nest.z };
    if (units >= 2.25 && units < 3) return { x: nest.x, z: nest.z };
    if (units >= 3.35 && units < 3.6) return { x: nest.x, z: tunnelCenterZ };
    return null;
  };
  const twoFace = () => {
    if (facingBox) return { x: nest.x + boxX, z: nest.z };
    if (units >= 2 && units < 3) return { x: nest.x, z: nest.z };
    if (units >= 3.35 && units < 3.6) return { x: nest.x, z: tunnelCenterZ };
    return null;
  };

  const sharedBend = stepOneBend + tunnelBendAmount + toolBend;
  const hammerBend = hammering ? 0.55 : 0;
  const volunteers = [
    {
      ...placeOne(), hands: oneHands(), face: oneFace(), hammering,
      bend: sharedBend + bump(units, 2.25, 2.38, 2.45, 2.6) + hammerBend + (inStakes && !hammering ? 0.2 : 0),
    },
    {
      ...placeTwo(), hands: twoHands(), face: twoFace(), hammering,
      bend: sharedBend + hammerBend,
    },
  ];

  const stakeDown = (i) => (walk.hammer === i ? ease(walk.swing) : (units >= 5 && walk.hammered > i) || units >= 6 ? 1 : 0);

  return {
    boxOffset: { x: boxX, y: boxLift },
    panel: { y: panelY, z: panelZ, tilt: panelTilt },
    tunnelShift,
    tunnelLift,
    length,
    sand: units < 5 ? 0 : walk.along,
    pouring: inStakes && !hammering,
    stakes: STAKE_FRACTIONS.flatMap((fraction, i) => [
      { fraction, side: 1, down: stakeDown(i) },
      { fraction: STAKE_FRACTIONS[STAKE_FRACTIONS.length - 1 - i], side: -1, down: stakeDown(i) },
    ]),
    lights: rampUp(units, 6, 7),
    setupTools: units >= 4.92 && units < 6,
    volunteers,
  };
};

// A nest-shaped pile, in metres at real size.
export const eggSlot = (id, count) => {
  const t = (id + 0.5) / count;
  const angle = id * 2.399963;
  const radius = Math.sqrt(t) * 0.2;
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, y: 0.02 + (1 - t) * 0.05 };
};

const newHatchlings = (rng, count, mode) => Array.from({ length: count }, (_, id) => {
  const birth = (id / count) * BIRTH_SPREAD + rng.next() * 0.6;
  const lane = (rng.next() - 0.5) * 2;
  const speed = 0.6 + rng.next() * 0.2;
  const wobble = rng.next() * Math.PI * 2;
  const plan = mode === 'open' && rng.next() > OPEN_OCEAN_SHARE ? 'lights' : 'ocean';
  const strokesLeft = 3 + Math.floor(rng.next() * 3);
  return { id, state: 'egg', birth, lane, speed, wobble, plan, x: 0, y: 0, z: 0, heading: Math.PI, exposed: false, rolled: false, timer: 0, stuckKind: null, gait: 0, rest: 0, strokes: 0, strokesLeft };
});

const patrolPoint = (kind, index, time, env) => {
  if (kind === 'crab') {
    const side = index % 2 ? 1 : -1;
    const t = Math.sin(time * 0.25 + index * 1.7) * 0.5 + 0.5;
    const z = lerp(env.mouthZ + 1, env.frontZ - 0.5, t);
    return { x: env.tunnelX(z) + side * (env.s * 0.15 + 1 + 0.4 * Math.sin(time * 0.7 + index)), y: 0, z };
  }
  if (kind === 'raccoon') {
    const angle = time * 0.3 + index * 2.1;
    const radius = env.s * 0.75 + 1.2;
    return { x: env.nest.x + Math.cos(angle) * radius, y: 0, z: env.nest.z + Math.sin(angle) * radius };
  }
  const angle = time * 0.35 + index * 3;
  const radius = 14 + index * 4;
  return { x: env.nest.x + Math.cos(angle) * radius, y: BIRD_HEIGHT, z: (env.nest.z + env.mouthZ) / 2 + Math.sin(angle) * radius };
};

const newPredators = (counts, env) => Object.entries(counts).flatMap(([kind, count]) =>
  Array.from({ length: count }, (_, index) => ({
    id: `${kind}-${index}`, kind, index, ...patrolPoint(kind, index, 0, env), heading: 0, target: null, carrying: null, timer: 0,
  })));

export const createSim = ({ seed = 12345, count, predators, env }) => {
  const rng = seededRandom(seed);
  const hatchlings = newHatchlings(rng, count, 'tunnel');
  const empty = { ocean: 0, lost: 0, caught: 0 };
  return {
    seed: rng.seed(), count, mode: 'tunnel', time: 0, cycleTime: 0, pause: 0, hatchlings,
    predators: newPredators(predators, env),
    counts: { tunnel: empty, open: empty },
  };
};

const startCycle = (sim, mode) => {
  const rng = seededRandom(sim.seed);
  const hatchlings = newHatchlings(rng, sim.count, mode);
  return {
    ...sim, seed: rng.seed(), mode, cycleTime: 0, pause: 0, hatchlings,
    predators: sim.predators.map((p) => ({ ...p, target: null, carrying: null, timer: 0 })),
  };
};

export const setMode = (sim, mode) => startCycle(sim, mode);

const canHunt = (p, h, mode) => {
  if (h.state !== 'crawl' && h.state !== 'stuck' && h.state !== 'swim') return false;
  if (mode === 'tunnel') return p.kind === 'bird' && h.exposed;
  return p.kind === 'bird' || h.state !== 'swim';
};

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const moveToward = (p, goal, speed, dt) => {
  const gap = distance(p, goal);
  if (gap < 0.001) return { x: p.x, z: p.z, heading: p.heading };
  const step = Math.min(gap, speed * dt);
  const [dx, dz] = [(goal.x - p.x) / gap, (goal.z - p.z) / gap];
  return { x: p.x + dx * step, z: p.z + dz * step, heading: Math.atan2(dx, dz) };
};

const stepPredators = (sim, dt, env) => {
  const claimed = new Set();
  const grabs = new Map();
  const releases = new Set();
  const byId = new Map(sim.hatchlings.map((h) => [h.id, h]));

  const predators = sim.predators.map((p) => {
    const patrol = patrolPoint(p.kind, p.index, sim.time, env);
    if (p.carrying !== null) {
      const timer = p.timer - dt;
      const moved = moveToward(p, patrol, scaled(SPEED[p.kind], env), dt);
      const y = approach(p.y, patrol.y, 6 * dt);
      if (timer > 0) return { ...p, ...moved, y, timer };
      releases.add(p.carrying);
      return { ...p, ...moved, y, timer: 0, carrying: null, target: null };
    }

    const current = byId.get(p.target);
    const keep = current && !claimed.has(current.id) && canHunt(p, current, sim.mode) ? current : null;
    const candidates = keep ? [keep] : sim.hatchlings.filter((h) => !claimed.has(h.id) && canHunt(p, h, sim.mode) && distance(p, h) < SIGHT[p.kind]);
    const prey = candidates.reduce((best, h) => (!best || distance(p, h) < distance(p, best) ? h : best), null);
    if (!prey) {
      const moved = moveToward(p, patrol, scaled(SPEED[p.kind], env) * 0.5, dt);
      return { ...p, ...moved, y: approach(p.y, patrol.y, 6 * dt), target: null };
    }

    claimed.add(prey.id);
    const moved = moveToward(p, prey, scaled(SPEED[p.kind], env), dt);
    const gap = distance(moved, prey);
    const y = p.kind === 'bird' ? approach(p.y, Math.min(BIRD_HEIGHT, gap * 0.8), 14 * dt) : 0;
    if (gap < scaled(REACH[p.kind], env) && y < 1) {
      grabs.set(prey.id, p.id);
      return { ...p, ...moved, y, target: null, carrying: prey.id, timer: CARRY_SECONDS };
    }
    return { ...p, ...moved, y, target: prey.id };
  });
  return { predators, grabs, releases };
};

// How hard the flippers push at a point in the stroke. Each side takes a turn, so it pulses twice per stroke, and it averages 1.
export const strokePush = (phase) => (Math.PI / 2) * Math.abs(Math.sin(Math.PI * 2 * phase));

// Pure: advances the flippers. A hatchling rests after a few strokes, and only moves while pushing.
const stepGait = (h, dt, rng) => {
  if (h.rest > 0) return { gait: h.gait, rest: Math.max(0, h.rest - dt), strokes: h.strokes, strokesLeft: h.strokesLeft, push: 0 };
  const advanced = h.gait + dt / STROKE_SECONDS;
  if (advanced < 1) return { gait: advanced, rest: 0, strokes: h.strokes, strokesLeft: h.strokesLeft, push: strokePush(advanced) };
  const strokesLeft = h.strokesLeft - 1;
  return strokesLeft > 0
    ? { gait: advanced - 1, rest: 0, strokes: h.strokes + 1, strokesLeft, push: strokePush(advanced - 1) }
    : { gait: 0, rest: 0.4 + rng.next() * 0.9, strokes: h.strokes + 1, strokesLeft: 3 + Math.floor(rng.next() * 3), push: 0 };
};

const crawlToOcean = (h, dt, ctx, rng) => {
  const { env, mode, time } = ctx;
  const spread = mode === 'tunnel' ? 0.09 * env.s : 3;
  const centerX = mode === 'tunnel' ? env.tunnelX(h.z) : env.nest.x;
  const targetX = centerX + h.lane * spread + Math.sin(time * 3 + h.wobble) * 0.01 * env.s;
  const gait = stepGait(h, dt, rng);
  const { push, ...gaitState } = gait;
  const x = approach(h.x, targetX, Math.max(0.2, env.s * 0.12) * push * dt);
  const z = h.z - h.speed * push * dt;
  const leaving = !h.rolled && z < env.mouthZ;
  const exposed = h.exposed || (leaving && rng.next() < EXPOSED_CHANCE);
  const next = { ...h, ...gaitState, x, z, heading: push > 0 ? Math.atan2(x - h.x, z - h.z) : h.heading, exposed, rolled: h.rolled || leaving };
  return z <= env.waterZ ? { ...next, state: 'swim' } : next;
};

const crawlToLights = (h, dt, ctx, rng) => {
  const { env, time } = ctx;
  const goal = { x: env.nest.x + h.lane * 20, z: env.nest.z + LOST_DISTANCE };
  const gap = distance(h, goal);
  const wander = Math.sin(time * 1.4 + h.wobble) * 0.5;
  const base = Math.atan2(goal.x - h.x, goal.z - h.z) + wander;
  const { push, ...gaitState } = stepGait(h, dt, rng);
  const step = h.speed * 1.6 * push * dt;
  const next = { ...h, ...gaitState, x: h.x + Math.sin(base) * step, z: h.z + Math.cos(base) * step, heading: push > 0 ? base : h.heading };
  if (gap < 1.5) return { ...next, state: 'gone', event: 'lost' };
  const hit = env.obstacles.find((o) => distance(next, o) < (o.radius + 0.1) * env.s);
  return hit ? { ...next, state: 'stuck', timer: STUCK_SECONDS, stuckKind: hit.kind } : next;
};

const stepHatchling = (h, dt, ctx, rng) => {
  if (h.state === 'gone' || h.state === 'carried') return h;
  if (h.state === 'egg') {
    if (ctx.cycleTime < h.birth) return h;
    const slot = eggSlot(h.id, ctx.count);
    return { ...h, state: 'crawl', x: ctx.env.nest.x + slot.x * ctx.env.s, z: ctx.env.nest.z + slot.z * ctx.env.s };
  }
  if (h.state === 'swim') {
    const z = h.z - SWIM_SPEED * dt;
    const gait = (h.gait + dt / SWIM_STROKE_SECONDS) % 1;
    return z < ctx.env.waterZ - SWIM_DISTANCE ? { ...h, z, gait, state: 'gone', event: 'ocean' } : { ...h, z, gait };
  }
  if (h.state === 'stuck') {
    const timer = h.timer - dt;
    return timer <= 0 ? { ...h, timer: 0, state: 'gone', event: 'lost' } : { ...h, timer };
  }
  return h.plan === 'lights' ? crawlToLights(h, dt, ctx, rng) : crawlToOcean(h, dt, ctx, rng);
};

const addCount = (counts, mode, event) => ({
  ...counts, [mode]: { ...counts[mode], [event]: counts[mode][event] + 1 },
});

export const stepWorld = (sim, dt, env) => {
  const rng = seededRandom(sim.seed);
  const { predators, grabs, releases } = stepPredators(sim, dt, env);
  const predatorById = new Map(predators.map((p) => [p.id, p]));
  const ctx = { env, mode: sim.mode, time: sim.time, cycleTime: sim.cycleTime, count: sim.count };

  let counts = sim.counts;
  const hatchlings = sim.hatchlings.map((h) => {
    if (releases.has(h.id)) return { ...h, state: 'gone', carrier: null };
    if (grabs.has(h.id)) {
      counts = addCount(counts, sim.mode, 'caught');
      return { ...h, state: 'carried', carrier: grabs.get(h.id) };
    }
    if (h.state === 'carried') {
      const carrier = predatorById.get(h.carrier);
      return { ...h, x: carrier.x, y: carrier.y, z: carrier.z };
    }
    const { event, ...next } = stepHatchling(h, dt, ctx, rng);
    if (event) counts = addCount(counts, sim.mode, event);
    return next;
  });

  const stepped = { ...sim, seed: rng.seed(), time: sim.time + dt, cycleTime: sim.cycleTime + dt, predators, hatchlings, counts };
  if (hatchlings.some((h) => h.state !== 'gone')) return stepped;
  const pause = sim.pause + dt;
  return pause > CYCLE_PAUSE ? startCycle({ ...stepped, pause: 0 }, sim.mode) : { ...stepped, pause };
};

// The hatchling the ride-along camera follows: keep the current one while it is still moving.
export const pickRider = (sim, currentId) => {
  const active = (h) => h.state === 'crawl' || h.state === 'swim';
  const current = sim.hatchlings.find((h) => h.id === currentId && active(h));
  return current ?? sim.hatchlings.find(active) ?? null;
};
