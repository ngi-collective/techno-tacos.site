import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QUALITY, pickQuality } from '../src/config.js';
import { TOUCH_BUTTONS, fovForAspect, lookAfterDrag, nextPixelRatio, stickInput } from '../src/touch.js';

test('stick does nothing inside the deadzone', () => {
  assert.deepEqual(stickInput(2, -2, 48), { forward: 0, strafe: 0, run: false });
});

test('stick pushed up walks forward, and right strafes right', () => {
  assert.equal(stickInput(0, -24, 48).forward, 0.5);
  assert.equal(stickInput(24, 0, 48).strafe, 0.5);
});

test('stick speed tops out at the edge, and pulling well past it runs', () => {
  const edge = stickInput(0, -48, 48);
  assert.equal(edge.forward, 1);
  assert.equal(edge.run, false);
  const past = stickInput(0, -70, 48);
  assert.equal(past.forward, 1);
  assert.equal(past.run, true);
});

test('dragging right looks right, dragging up looks up, and pitch stops short of straight up and down', () => {
  assert.ok(lookAfterDrag({ yaw: 0, pitch: 0 }, 100, 0).yaw < 0);
  assert.ok(lookAfterDrag({ yaw: 0, pitch: 0 }, 0, -100).pitch > 0);
  assert.equal(lookAfterDrag({ yaw: 0, pitch: 0 }, 0, 100000).pitch, -1.45);
  assert.equal(lookAfterDrag({ yaw: 0, pitch: 0 }, 0, -100000).pitch, 1.45);
});

test('field of view stays the same in landscape and widens, with a limit, when upright', () => {
  assert.equal(fovForAspect(16 / 9), 65);
  assert.equal(fovForAspect(1), 65);
  assert.ok(fovForAspect(0.8) > 65);
  assert.equal(fovForAspect(0.4), 90);
});

test('resolution drops on slow frames, stops at the floor, and holds on fast frames', () => {
  assert.equal(nextPixelRatio(1.5, 1 / 60), 1.5);
  assert.ok(Math.abs(nextPixelRatio(1.5, 1 / 15) - 1.2) < 1e-9);
  assert.equal(nextPixelRatio(0.75, 1 / 15), 0.75);
});

test('headsets, touch screens and desktops each get their own quality', () => {
  assert.equal(pickQuality('Mozilla OculusBrowser', true), QUALITY.quest);
  assert.equal(pickQuality('Mozilla iPhone', true), QUALITY.mobile);
  assert.equal(pickQuality('Mozilla Macintosh', false), QUALITY.desktop);
});

test('every touch button has a label and a distinct key', () => {
  assert.equal(new Set(TOUCH_BUTTONS.map(([code]) => code)).size, TOUCH_BUTTONS.length);
  assert.ok(TOUCH_BUTTONS.every(([, label]) => label.length > 0));
});
