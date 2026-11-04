import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSim, hatchingStart, pickRider, setMode, setupPose, SETUP_STEPS, stakeWalk, stepWorld, strokePush, timeline } from '../src/simulation.js';
import { sandHeight, tunnelBend, tunnelFloorHeight } from '../src/terrain.js';

const TIMING = { setupStepSeconds: [7, 8, 8, 10, 10, 14, 6], sunsetSeconds: 14 };
const env = {
  s: 3, nest: { x: 0, z: 24 }, waterZ: 2.5, mouthZ: 3.5, frontZ: 22.5,
  obstacles: [{ kind: 'hole', x: -6, z: 35, radius: 0.4 }, { kind: 'chair', x: 10, z: 35, radius: 0.35 }],
  tunnelX: (z) => tunnelBend(z, { frontZ: 22.5, length: 19, s: 3 }),
};
const predators = { crab: 4, raccoon: 1, bird: 2 };
const newSim = () => createSim({ count: 36, predators, env });

// Runs until `cycles` hatchling groups have finished. Returns the sim just after the last one.
const run = (start, seconds) => {
  let sim = start;
  for (let t = 0; t < seconds; t += 1 / 30) sim = stepWorld(sim, 1 / 30, env);
  return sim;
};

test('timeline moves from setup to sunset to hatching', () => {
  assert.equal(timeline(0, TIMING).phase, 'setup');
  assert.equal(timeline(16, TIMING).step, 2);
  assert.equal(timeline(63 + 1, TIMING).phase, 'sunset');
  assert.equal(timeline(hatchingStart(TIMING), TIMING).phase, 'hatching');
  assert.equal(timeline(hatchingStart(TIMING), TIMING).night, 1);
});

test('setup ends with the box placed, tunnel stretched, sand in and lights on', () => {
  const pose = setupPose(SETUP_STEPS.length, { s: 3, nest: env.nest, frontZ: env.frontZ, mouthZ: env.mouthZ, tunnelRadius: 0.15 });
  assert.ok(Math.abs(pose.boxOffset.x) < 1e-9);
  assert.ok(Math.abs(pose.boxOffset.y) < 1e-9);
  assert.ok(Math.abs(pose.panel.z - 0.53) < 1e-9);
  assert.equal(pose.panel.tilt, 0);
  assert.equal(pose.tunnelShift, 0);
  assert.equal(pose.length, env.frontZ - env.mouthZ);
  assert.deepEqual([pose.sand, pose.lights], [1, 1]);
  assert.ok(pose.stakes.every((stake) => stake.down === 1));
});

test('setup starts with the box aside and the lights off', () => {
  const pose = setupPose(0, { s: 3, nest: env.nest, frontZ: env.frontZ, mouthZ: env.mouthZ, tunnelRadius: 0.15 });
  assert.ok(pose.boxOffset.x < 0);
  assert.equal(pose.lights, 0);
  assert.ok(Math.abs(pose.panel.tilt - Math.PI / 2) < 1e-9, 'the panel starts flat on the sand');
});

test('with the tunnel, no hatchling gets lost and most reach the ocean', () => {
  const { counts } = run(newSim(), 110);
  assert.equal(counts.tunnel.lost, 0);
  assert.ok(counts.tunnel.ocean >= 28, `ocean ${counts.tunnel.ocean}`);
});

test('without the tunnel, most hatchlings are lost or caught', () => {
  const { counts } = run(setMode(newSim(), 'open'), 90);
  assert.ok(counts.open.lost + counts.open.caught > counts.open.ocean * 2, JSON.stringify(counts.open));
  assert.ok(counts.open.caught > 0, 'predators catch hatchlings');
  assert.ok(counts.open.lost > 0, 'hatchlings get lost');
});

test('the plain beach loses far more hatchlings than the tunnel', () => {
  const tunnel = run(newSim(), 130).counts.tunnel;
  const open = run(setMode(newSim(), 'open'), 130).counts.open;
  assert.ok(open.lost + open.caught > (tunnel.lost + tunnel.caught) * 3);
});

test('stepping does not change the previous state', () => {
  const sim = newSim();
  const copy = structuredClone(sim);
  stepWorld(sim, 1, env);
  assert.deepEqual(sim, copy);
});

test('the same seed gives the same result', () => {
  assert.deepEqual(run(newSim(), 20), run(newSim(), 20));
});

test('a new group of hatchlings starts after the last group finishes', () => {
  const sim = run(newSim(), 130);
  assert.ok(sim.counts.tunnel.ocean > 0);
  assert.ok(sim.hatchlings.some((h) => h.state !== 'gone'));
});

test('the rider stays on the same hatchling while it moves', () => {
  const sim = run(newSim(), 6);
  const first = pickRider(sim, null);
  assert.equal(pickRider(sim, first.id).id, first.id);
});

test('a crawling hatchling only moves while its flippers push', () => {
  let sim = run(newSim(), 8);
  const id = sim.hatchlings.find((h) => h.state === 'crawl').id;
  for (let i = 0; i < 300; i += 1) {
    const before = sim.hatchlings[id];
    sim = stepWorld(sim, 1 / 30, env);
    const after = sim.hatchlings[id];
    if (after.state !== 'crawl') break;
    if (before.rest > 0 && after.rest >= 0) assert.equal(after.z, before.z, 'rests without sliding');
    if (strokePush(after.gait) === 0 && after.rest === 0 && before.gait === after.gait) assert.equal(after.z, before.z);
  }
});

test('the flippers push with an average strength of 1', () => {
  const samples = Array.from({ length: 2000 }, (_, i) => strokePush(i / 2000));
  assert.ok(Math.abs(samples.reduce((a, b) => a + b, 0) / 2000 - 1) < 0.01);
});

test('the first hatchling reaches the water in about half a minute', () => {
  let sim = newSim();
  let seconds = 0;
  // Any hatchling counts, because a bird can catch one at the mouth.
  while (!sim.hatchlings.some((h) => h.state === 'swim') && seconds < 200) {
    sim = stepWorld(sim, 1 / 30, env);
    seconds += 1 / 30;
  }
  assert.ok(seconds > 20 && seconds < 45, `took ${seconds}`);
});

test('the stake walk reaches each stake in order, then the mouth', () => {
  assert.equal(stakeWalk(0).along, 0);
  assert.ok(Math.abs(stakeWalk(1).along - 1) < 1e-9);
  const hammers = Array.from({ length: 100 }, (_, i) => stakeWalk(i / 100).hammer).filter((value) => value !== null);
  assert.deepEqual([...new Set(hammers)], [0, 1, 2]);
});

test('the tunnel floor is always above the beach', () => {
  for (let z = 4; z < 23; z += 0.37) {
    for (const s of [1, 3]) assert.ok(tunnelFloorHeight(0.1, z, s) > sandHeight(0.1, z));
  }
});

test('setup distances grow with the scene scale', () => {
  const small = setupPose(1.5, { s: 1, nest: env.nest, frontZ: 23.5, mouthZ: env.mouthZ, tunnelRadius: 0.15 });
  const big = setupPose(1.5, { s: 3, nest: env.nest, frontZ: env.frontZ, mouthZ: env.mouthZ, tunnelRadius: 0.15 });
  assert.ok(Math.abs(big.boxOffset.x / small.boxOffset.x - 3) < 1e-9);
});

test('the tunnel leaves the box straight and bends gently along its length', () => {
  const shape = { frontZ: 22.5, length: 19, s: 3 };
  assert.equal(tunnelBend(22.5, shape), 0);
  const bends = Array.from({ length: 50 }, (_, i) => tunnelBend(22.5 - 0.38 * i, shape));
  assert.ok(Math.max(...bends.map(Math.abs)) > 0.2);
  assert.ok(Math.max(...bends.map(Math.abs)) < 0.6);
});

test('hatchlings stay inside the curved tunnel', () => {
  let sim = newSim();
  const radius = 0.15 * env.s;
  for (let i = 0; i < 30 * 90; i += 1) {
    sim = stepWorld(sim, 1 / 30, env);
    sim.hatchlings
      .filter((h) => h.state === 'crawl' && h.z < env.frontZ - 3 && h.z > env.mouthZ)
      .forEach((h) => assert.ok(Math.abs(h.x - env.tunnelX(h.z)) < radius, `x ${h.x} at z ${h.z}`));
  }
});

const setupArgs = { s: 3, nest: env.nest, frontZ: env.frontZ, mouthZ: env.mouthZ, tunnelRadius: 0.15 };
const sampleSetup = (from, to, read) => Array.from({ length: 400 }, (_, i) => read(setupPose(from + ((to - from) * i) / 399, setupArgs)));

test('the box is carried above the marker posts and never passes through them', () => {
  for (const pose of sampleSetup(1, 2, (p) => p)) {
    const away = Math.abs(pose.boxOffset.x);
    if (away > 0.001 && away < 0.92 * 3) assert.ok(pose.boxOffset.y >= 0.5 * 3, `height ${pose.boxOffset.y} at ${away}`);
  }
});

test('volunteers bend over to pick up the box, the panel and the tunnel', () => {
  const bendAt = (u, who) => setupPose(u, setupArgs).volunteers[who].bend;
  assert.equal(bendAt(0.5, 0), 0);
  assert.ok(bendAt(1.14, 0) > 0.9 && bendAt(1.14, 1) > 0.9, 'both lift the box');
  assert.ok(bendAt(1.5, 0) < 0.01, 'upright while carrying');
  assert.ok(bendAt(2.42, 0) > 0.9, 'one picks up the panel');
  assert.ok(bendAt(3.48, 0) > 0.9 && bendAt(3.48, 1) > 0.9, 'both pick up the tunnel');
});

test('carriers walk beside the box, clear of the nest and the marker posts', () => {
  for (const pose of sampleSetup(1, 2, (p) => p)) {
    pose.volunteers.forEach((volunteer, i) => {
      assert.ok(Math.abs(volunteer.x - (env.nest.x + pose.boxOffset.x)) < 1e-6);
      assert.ok(Math.abs(volunteer.z - (env.nest.z + (i === 0 ? 1 : -1) * 0.78 * 3)) < 1e-6);
    });
  }
});

test('the second volunteer walks around the waiting box, not through it', () => {
  sampleSetup(0, 1, (p) => p.volunteers[1]).forEach(({ x, z }) => {
    const insideBox = x > -6.3 && x < -3.3 && z > 22.5 && z < 25.5;
    assert.ok(!insideBox, `at ${x}, ${z}`);
  });
});

test('at real size, nobody has to walk faster than a quick walk during setup', () => {
  const nest = env.nest;
  const args = { s: 1, nest, frontZ: nest.z - 0.5, mouthZ: 3.5, tunnelRadius: 0.15 };
  const secondsPerStep = TIMING.setupStepSeconds;
  [4, 5].forEach((step) => {
    let fastest = 0;
    let before = setupPose(step, args).volunteers;
    for (let i = 1; i <= 200; i += 1) {
      const now = setupPose(step + i / 200, args).volunteers;
      now.forEach((v, who) => {
        fastest = Math.max(fastest, Math.hypot(v.x - before[who].x, v.z - before[who].z) / (secondsPerStep[step] / 200));
      });
      before = now;
    }
    assert.ok(fastest < 3.8, `step ${step + 1}: ${fastest.toFixed(2)} m/s`);
  });
});

test('volunteers keep walking away during the sunset', () => {
  const during = timeline(63 + 7, TIMING);
  assert.equal(during.units, 7.5);
  assert.equal(timeline(hatchingStart(TIMING), TIMING).units, 8);
  const [at7, at8] = [7, 8].map((u) => setupPose(u, setupArgs).volunteers[0]);
  assert.ok(Math.hypot(at8.x - at7.x, at8.z - at7.z) > 5);
});
