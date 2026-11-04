import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { SYSTEM } from './config.js';
import { createPuffs, createTracks } from './effects.js';
import { eggSlot, strokePush } from './simulation.js';
import { sandHeight, tunnelFloorHeight } from './terrain.js';

const REAL_LENGTH = { crab: 0.14, raccoon: 0.6, bird: 0.45 };
const SHIRTS = [0xe8741a, 0xd8b21c];
const dummy = new THREE.Object3D();
const scratch = new THREE.Vector3();
const scratchQuat = new THREE.Quaternion();
const standard = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
const shadowed = (mesh) => { mesh.castShadow = true; return mesh; };

// --- Turtle: the flippers bend in the vertex shader, so every hatchling can be one instance of one model.
// Sizes come from measuring the model at length 1. Front flippers hinge at the shoulder, back flippers at the hip beside the tail.
const turtleMaterial = () => {
  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.5, 0.72, 0.62), vertexColors: true, roughness: 0.65, emissive: 0x16321f, emissiveIntensity: 0.35 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aStroke;
        // A flipper bends more toward its tip, and the tip trails behind, so it flexes like a paddle.
        vec3 flexFlipper(vec2 q, vec2 hinge, float cycle, float strength, float reach) {
          vec2 d = q - hinge;
          float along = clamp(length(d) / reach, 0.0, 1.0);
          float angle = strength * cos(cycle * 6.28318 - along * 1.2) * (0.35 + 0.9 * along);
          vec2 turned = vec2(d.x * cos(angle) - d.y * sin(angle), d.x * sin(angle) + d.y * cos(angle));
          float lift = max(0.0, sin(cycle * 6.28318 - along * 0.8)) * along * 0.045;
          return vec3(turned + hinge, lift);
        }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float flipperSide = position.x < 0.0 ? -1.0 : 1.0;
        vec2 mirrored = vec2(position.x * flipperSide, position.z);
        float sideCycle = aStroke + (flipperSide > 0.0 ? 0.0 : 0.5);
        float frontPart = smoothstep(-0.14, -0.1, position.z) * smoothstep(0.2, 0.27, mirrored.x);
        float backPart = (1.0 - smoothstep(-0.31, -0.27, position.z)) * smoothstep(0.09, 0.15, mirrored.x);
        vec3 frontFlex = flexFlipper(mirrored, vec2(0.22, 0.13), sideCycle, 0.6, 0.3);
        vec3 backFlex = flexFlipper(mirrored, vec2(0.13, -0.3), sideCycle + 0.5, 0.7, 0.32);
        vec2 flexed = mix(mix(mirrored, frontFlex.xy, frontPart), backFlex.xy, backPart);
        transformed.x = flexed.x * flipperSide;
        transformed.z = flexed.y;
        transformed.y += frontFlex.z * frontPart + backFlex.z * backPart;`);
  };
  return material;
};

const createTurtles = (geometry, count) => {
  const stroke = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  stroke.setUsage(THREE.DynamicDrawUsage);
  const shared = geometry.clone();
  shared.setAttribute('aStroke', stroke);
  const mesh = new THREE.InstancedMesh(shared, turtleMaterial(), count);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  return { mesh, stroke };
};

// --- Hatched eggs: the bottom of the shell with a jagged edge, and two loose pieces beside it.
const EGG_RADIUS = 0.022;

const createCrackedShell = () => {
  const cup = new THREE.SphereGeometry(EGG_RADIUS, 14, 7, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.6).toNonIndexed();
  const position = cup.attributes.position;
  const rimHeight = EGG_RADIUS * Math.cos(Math.PI * 0.4);
  for (let i = 0; i < position.count; i += 1) {
    if (Math.abs(position.getY(i) - rimHeight) < 0.0001) {
      const around = Math.atan2(position.getZ(i), position.getX(i));
      position.setY(i, rimHeight + (Math.round(around * 2.2) % 2 === 0 ? 0.008 : -0.002));
    }
  }
  const piece = (x, z, turn) => new THREE.CircleGeometry(0.009, 3).rotateX(-Math.PI / 2 + 0.3).rotateY(turn).translate(x, -EGG_RADIUS * 0.8, z).toNonIndexed();
  const geometry = mergeGeometries([cup, piece(0.032, 0.01, 0.5), piece(-0.018, 0.031, 2.1)]);
  geometry.computeVertexNormals();
  return geometry;
};

// --- Crab: built here, with two-part legs that scuttle.
const createCrab = () => {
  const group = new THREE.Group();
  const shell = standard(0xc9502a, { roughness: 0.5 });
  const dark = standard(0x7c2d17);
  const body = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 10).scale(1.25, 0.5, 0.85), shell));
  body.position.y = 0.3;
  group.add(body);
  const legs = [-1, 1].flatMap((side) => [-0.22, -0.05, 0.12, 0.28].map((z, i) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.38, 0.28, z);
    hip.rotation.y = side * (z * 0.9);
    const upper = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.34, 6).rotateZ(Math.PI / 2).translate(side * 0.17, 0, 0), dark));
    const knee = new THREE.Group();
    knee.position.x = side * 0.34;
    const lower = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, 0.34, 6).rotateZ(Math.PI / 2).translate(side * 0.17, 0, 0), dark));
    knee.rotation.z = side * -0.9;
    knee.add(lower);
    hip.add(upper, knee);
    group.add(hip);
    return { hip, side, offset: i * 1.6 + (side > 0 ? 0 : 0.8) };
  }));
  [-1, 1].forEach((side) => {
    const arm = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.3, 6).rotateZ(side * 1.1), shell));
    arm.position.set(side * 0.48, 0.36, 0.36);
    const claw = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8).scale(1.2, 0.7, 1), shell));
    claw.position.set(side * 0.58, 0.42, 0.48);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), standard(0x101010));
    eye.position.set(side * 0.13, 0.52, 0.3);
    group.add(arm, claw, eye);
  });
  return { group, legs };
};

const updateCrab = ({ legs }, time, moving) => {
  legs.forEach(({ hip, side, offset }) => {
    const phase = time * 14 + offset;
    hip.rotation.z = side * (-0.25 + (moving ? Math.max(0, Math.sin(phase)) * 0.4 : 0));
    hip.rotation.x = moving ? Math.cos(phase) * 0.25 : 0;
  });
};

// --- Raccoon and people: skinned models with their own clips.
const heightOf = (object) => {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object, true).getSize(new THREE.Vector3());
};

const createClipPlayer = (model, clips, prefix) => {
  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map(clips.map((clip) => [clip.name.split('|').pop().replace(prefix, ''), mixer.clipAction(clip)]));
  let current = null;
  return {
    mixer,
    play: (name, timeScale = 1) => {
      const next = actions.get(name);
      if (current !== next) {
        next.reset().fadeIn(0.25).play();
        if (current) current.fadeOut(0.25);
        current = next;
      }
      next.timeScale = timeScale;
    },
  };
};

const createRaccoon = (gltf) => {
  const model = cloneSkinned(gltf.scene);
  model.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.frustumCulled = false;
    node.material = node.material.clone();
    node.material.emissive = new THREE.Color(0xffffff);
    node.material.emissiveMap = node.material.map;
    node.material.emissiveIntensity = 0.1;
  });
  const size = heightOf(model);
  const length = Math.max(size.x, size.z);
  const group = new THREE.Group().add(model);
  const player = createClipPlayer(model, gltf.animations, '');
  player.play('Walk');
  return { group, player, unit: 1 / length };
};

// --- Seagull: wings flex in the shader. It glides, then flaps a few times.
const createBird = (gltf) => {
  const source = gltf.scene.getObjectByProperty('isMesh', true);
  const material = source.material.clone();
  const uniforms = { uFlap: { value: 0 } };
  const geometry = source.geometry.clone();
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
  geometry.translate(-center.x, -center.y, -center.z);
  const span = Math.max(max.x - min.x, max.z - min.z);
  geometry.scale(1 / span, 1 / span, 1 / span);
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uFlap;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.y += uFlap * pow(abs(position.z), 1.4) * 1.4;`);
  };
  const mesh = shadowed(new THREE.Mesh(geometry, material));
  mesh.rotation.y = -Math.PI / 2; // The model faces +x. Everything else here faces +z.
  const group = new THREE.Group().add(mesh);
  return { group, uniforms };
};

// --- Tools the volunteers hold.
const createMallet = () => {
  const wood = standard(0x8a5a2b);
  const steel = standard(0x4d5962, { metalness: 0.3 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 8).translate(0, 0.5, 0), wood);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.22).translate(0, 1, 0), steel);
  return new THREE.Group().add(handle, head);
};

const createBucket = () => {
  const blue = standard(0x2d78b8);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.55, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0x2d78b8, side: THREE.DoubleSide, roughness: 0.6 }));
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.26, 14).rotateX(Math.PI / 2).translate(0, -0.27, 0), blue);
  const sand = new THREE.Mesh(new THREE.CircleGeometry(0.31, 14).rotateX(-Math.PI / 2).translate(0, 0.17, 0), standard(0xd8bd8c));
  return new THREE.Group().add(body, bottom, sand);
};

const attachToBone = (bone, prop, worldSize) => {
  const parentScale = bone.getWorldScale(scratch).x;
  prop.scale.setScalar(worldSize / parentScale);
  bone.add(prop);
};

// Turns a bone so that the line to its child points along a world direction. Runs after the clip has posed the skeleton.
const aimBone = (bone, child, worldDirection, weight) => {
  bone.parent.getWorldQuaternion(scratchQuat);
  const wanted = worldDirection.clone().applyQuaternion(scratchQuat.clone().invert()).normalize();
  const current = child.position.clone().normalize().applyQuaternion(bone.quaternion);
  const turn = new THREE.Quaternion().setFromUnitVectors(current, wanted);
  const target = turn.multiply(bone.quaternion);
  bone.quaternion.slerp(target, weight);
  bone.updateMatrixWorld(true);
};

const createVolunteer = (gltf, shirt) => {
  const model = cloneSkinned(gltf.scene);
  model.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.frustumCulled = false;
    if (node.material.name === 'Shirt') {
      node.material = node.material.clone();
      node.material.color.set(shirt);
    }
  });
  const group = new THREE.Group().add(model);
  const player = createClipPlayer(model, gltf.animations, 'Man_');
  player.play('Idle');
  player.mixer.update(0);
  const height = heightOf(model).y;
  const bone = (name) => model.getObjectByName(name);
  const arms = {
    left: { upper: bone('UpperArmL'), lower: bone('LowerArmL'), hand: bone('PalmL') },
    right: { upper: bone('UpperArmR'), lower: bone('LowerArmR'), hand: bone('PalmR') },
  };
  const mallet = createMallet();
  const bucket = createBucket();
  bucket.scale.setScalar(0.5);
  mallet.rotation.set(Math.PI / 2, 0, 0);
  attachToBone(arms.right.hand, mallet, 0.3 * height);
  const body = bone('Body');
  const posedBones = [
    arms.left.upper, arms.left.lower, arms.right.upper, arms.right.lower,
    bone('Abdomen'), bone('Torso'), bone('UpperLegL'), bone('LowerLegL'), bone('UpperLegR'), bone('LowerLegR'),
  ];
  return {
    group, model, player, arms, mallet, bucket, body, height, unit: 1 / height,
    restPose: posedBones.map((posed) => ({ posed, rest: posed.quaternion.clone() })),
    spine: { waist: bone('Abdomen'), chest: bone('Torso') },
    legs: [
      { upper: bone('UpperLegL'), lower: bone('LowerLegL') },
      { upper: bone('UpperLegR'), lower: bone('LowerLegR') },
    ],
    bodyRest: body.position.clone(),
    weights: { left: 0, right: 0 }, lastHands: { left: null, right: null }, previous: new THREE.Vector2(), facing: 0,
  };
};

const WORLD_UP = new THREE.Vector3(0, 1, 0);

// Turns a bone around a world axis, on top of whatever the clip did.
const turnBone = (bone, worldAxis, angle) => {
  bone.parent.getWorldQuaternion(scratchQuat);
  const localAxis = worldAxis.clone().applyQuaternion(scratchQuat.clone().invert()).normalize();
  bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(localAxis, angle));
  bone.updateMatrixWorld(true);
};

const CROUCH_KNEE = 0.75;
const LEAN_WAIST = 0.55;
const LEAN_CHEST = 0.4;

// Bends at the waist and knees. The feet are separate bones, so dropping the body keeps them on the sand.
const poseBend = (volunteer, amount) => {
  const { group, spine, legs, body, height } = volunteer;
  const facing = new THREE.Vector3(Math.sin(group.rotation.y), 0, Math.cos(group.rotation.y));
  const forwardTurn = new THREE.Vector3().crossVectors(WORLD_UP, facing);
  const knee = CROUCH_KNEE * amount;
  const drop = group.scale.x * height * 0.5 * (1 - Math.cos(knee)) * 1.15;
  const origin = body.parent.getWorldPosition(new THREE.Vector3());
  const lowered = body.parent.worldToLocal(origin.clone().add(new THREE.Vector3(0, -drop, 0)));
  body.position.add(lowered);
  body.updateMatrixWorld(true);
  legs.forEach(({ upper, lower }) => {
    turnBone(upper, forwardTurn, -knee);
    turnBone(lower, forwardTurn, knee * 1.9);
  });
  turnBone(spine.waist, forwardTurn, LEAN_WAIST * amount);
  turnBone(spine.chest, forwardTurn, LEAN_CHEST * amount);
};

const HAND_SPEED = 5;

const poseArms = (volunteer, state, ctx) => {
  const { arms, weights } = volunteer;
  ['left', 'right'].forEach((side) => {
    const hand = state.hands[side];
    weights[side] = THREE.MathUtils.clamp(weights[side] + (hand ? HAND_SPEED : -HAND_SPEED) * ctx.dt, 0, 1);
    if (hand) volunteer.lastHands[side] = hand;
    const target = hand ?? volunteer.lastHands[side];
    if (weights[side] === 0 || !target) return;
    const shoulder = arms[side].upper.getWorldPosition(new THREE.Vector3());
    const point = new THREE.Vector3(target.x, sandHeight(target.x, target.z) + target.y, target.z);
    const direction = point.sub(shoulder).normalize();
    aimBone(arms[side].upper, arms[side].lower, direction, weights[side]);
    aimBone(arms[side].lower, arms[side].hand, direction, weights[side]);
  });
};

const turnToward = (from, to, maxStep) => {
  const gap = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + Math.max(-maxStep, Math.min(maxStep, gap));
};

const setSize = (volunteer, s) => {
  volunteer.group.scale.setScalar(SYSTEM.personHeight * s * volunteer.unit);
};

// Everything that moves on its own. Drawn from simulation data: this file decides nothing about the story.
export const createCreatures = ({ models, hatchlingCount, predatorStates, trackCount, puffCount }) => {
  const group = new THREE.Group();
  const turtles = createTurtles(models.turtle, hatchlingCount);
  const eggs = new THREE.InstancedMesh(new THREE.SphereGeometry(EGG_RADIUS, 14, 10), new THREE.MeshStandardMaterial({ color: 0xf6f1e4, roughness: 0.7 }), hatchlingCount);
  eggs.frustumCulled = false;
  const shells = new THREE.InstancedMesh(createCrackedShell(), new THREE.MeshStandardMaterial({ color: 0xf3ecdc, roughness: 0.75, side: THREE.DoubleSide }), hatchlingCount);
  shells.frustumCulled = false;
  shells.castShadow = true;
  const tracks = createTracks(trackCount);
  const puffs = createPuffs(puffCount);
  group.add(turtles.mesh, eggs, shells, tracks.mesh, puffs.mesh);

  const predators = new Map(predatorStates.map((p) => {
    const built = p.kind === 'crab' ? createCrab() : p.kind === 'raccoon' ? createRaccoon(models.raccoon) : createBird(models.gull);
    group.add(built.group);
    return [p.id, built];
  }));

  const volunteers = SHIRTS.map((shirt) => createVolunteer(models.person, shirt));
  group.add(...volunteers.flatMap((v) => [v.group, v.bucket]));

  const strokeSeen = new Map();

  const surfaceY = (h, ctx) => {
    const { tunnelFrom, tunnelTo, s } = ctx;
    const inside = ctx.tunnelOn && h.z < tunnelFrom && h.z > tunnelTo && Math.abs(h.x - ctx.tunnelX(h.z)) < SYSTEM.tunnelRadius * s * 0.8;
    return (inside ? tunnelFloorHeight(h.x, h.z, s) : sandHeight(h.x, h.z)) + 0.012;
  };

  const emitStroke = (h, y, ctx) => {
    const size = SYSTEM.hatchlingLength * ctx.s;
    [-1, 1].forEach((side) => {
      const out = side * size * 0.45;
      const [cx, cz] = [Math.cos(h.heading), -Math.sin(h.heading)];
      const [x, z] = [h.x + cx * out, h.z + cz * out];
      tracks.add({ x, y: y + 0.004, z, heading: h.heading, size });
      for (let i = 0; i < 2; i += 1) {
        puffs.add({
          x, y: y + size * 0.05, z,
          vx: cx * side * size * 2.2 + (Math.random() - 0.5) * size * 2,
          vy: size * (2.5 + Math.random() * 3),
          vz: cz * side * size * 2.2 + (Math.random() - 0.5) * size * 2,
          size: size * 0.05,
        });
      }
    });
  };

  const updateHatchling = (h, index, ctx) => {
    const { s, tide } = ctx;
    const hidden = h.state === 'gone' || h.state === 'egg';
    const size = hidden ? 0.0001 : SYSTEM.hatchlingLength * s;
    const sink = h.state === 'stuck' && h.stuckKind === 'hole' ? 0.6 * size : 0;
    const carrier = h.state === 'carried' ? ctx.predatorById.get(h.carrier) : null;
    const reach = carrier ? REAL_LENGTH[carrier.kind] * s * 0.5 : 0;
    const shownX = carrier ? h.x + Math.sin(carrier.heading) * reach : h.x;
    const shownZ = carrier ? h.z + Math.cos(carrier.heading) * reach : h.z;
    const y = carrier ? sandHeight(h.x, h.z) + (carrier.kind === 'bird' ? Math.max(0, carrier.y - reach * 0.4) : reach * 0.42)
      : h.state === 'swim' ? Math.max(tide + 0.01, sandHeight(h.x, h.z) + 0.01)
        : surfaceY(h, ctx) - sink;
    const push = h.state === 'crawl' ? strokePush(h.gait) : 0;
    const rock = h.state === 'crawl' && h.rest === 0 ? Math.sin(h.gait * Math.PI * 2) * 0.1 : 0;
    const ahead = 0.3;
    const slope = h.state === 'crawl' ? Math.atan2(sandHeight(h.x, h.z + ahead * Math.cos(h.heading)) - sandHeight(h.x, h.z), ahead) : 0;
    dummy.position.set(shownX, y + push * 0.012 * size, shownZ);
    dummy.rotation.set(-slope - push * 0.03, h.heading, rock, 'YXZ');
    dummy.scale.setScalar(size);
    dummy.updateMatrix();
    turtles.mesh.setMatrixAt(index, dummy.matrix);
    turtles.stroke.setX(index, h.gait);
    if (h.state === 'crawl' && !hidden && strokeSeen.get(h.id) !== h.strokes) emitStroke(h, y, ctx);
    strokeSeen.set(h.id, h.strokes);
  };

  const updateEgg = (h, index, ctx) => {
    const { s, cycleTime, count, nest, nestY } = ctx;
    const slot = eggSlot(index, count);
    const whole = h.state === 'egg';
    const size = whole ? s : 0.0001;
    const shake = h.birth - cycleTime < 1.4 ? Math.sin(cycleTime * 26) * 0.003 * s : 0;
    dummy.position.set(nest.x + slot.x * s + shake, nestY + slot.y * s, nest.z + slot.z * s);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(size);
    dummy.updateMatrix();
    eggs.setMatrixAt(index, dummy.matrix);
    // Once a hatchling is out, its egg stays behind as a broken shell, until the next group of eggs arrives.
    dummy.position.set(nest.x + slot.x * s, nestY + (slot.y * 0.55 + EGG_RADIUS * 0.45) * s, nest.z + slot.z * s);
    dummy.rotation.set(Math.sin(index * 1.7) * 0.5, index * 2.4, Math.cos(index * 2.3) * 0.5);
    dummy.scale.setScalar(whole ? 0.0001 : s);
    dummy.updateMatrix();
    shells.setMatrixAt(index, dummy.matrix);
  };

  const updatePredator = (p, ctx) => {
    const built = predators.get(p.id);
    built.group.visible = ctx.showPredators;
    if (!ctx.showPredators) return;
    const scale = REAL_LENGTH[p.kind] * ctx.s;
    const hunting = p.target !== null || p.carrying !== null;
    const ground = sandHeight(p.x, p.z);
    if (p.kind === 'crab') {
      built.group.position.set(p.x, ground, p.z);
      built.group.rotation.y = p.heading + Math.PI / 2;
      built.group.scale.setScalar(scale);
      updateCrab(built, ctx.simTime + p.index, true);
    } else if (p.kind === 'raccoon') {
      built.group.position.set(p.x, ground, p.z);
      built.group.rotation.y = p.heading;
      built.group.scale.setScalar(scale * built.unit);
      built.player.play(hunting ? 'Run' : 'Walk', hunting ? 1.1 : 0.9);
      built.player.mixer.update(ctx.simDt);
    } else {
      const swoop = Math.max(-0.7, Math.min(0.5, (p.y - (built.previousY ?? p.y)) * 3));
      built.previousY = p.y;
      const cycle = (ctx.simTime * 0.3 + p.index * 0.4) % 1;
      const flapping = p.carrying !== null || cycle > 0.6;
      built.uniforms.uFlap.value = flapping ? Math.sin(ctx.simTime * 10) * (p.carrying !== null ? 1 : 0.8) : 0.08;
      built.group.position.set(p.x, ground + Math.max(0.5 * scale, p.y), p.z);
      built.group.rotation.set(-swoop, p.heading, Math.sin(ctx.simTime * 0.7 + p.index) * 0.12, 'YXZ');
      built.group.scale.setScalar(scale);
    }
  };

  const updateVolunteer = (volunteer, state, ctx) => {
    const { group: model, player, previous, mallet, bucket, body, bodyRest } = volunteer;
    model.visible = ctx.showVolunteers;
    bucket.visible = ctx.showVolunteers && ctx.tools && volunteer === volunteers[0];
    if (!ctx.showVolunteers) return;
    setSize(volunteer, ctx.s);
    const [dx, dz] = [state.x - previous.x, state.z - previous.y];
    const moved = Math.hypot(dx, dz);
    const walking = moved > 0.0005 && ctx.dt > 0;
    const wanted = state.face
      ? Math.atan2(state.face.x - state.x, state.face.z - state.z)
      : walking ? Math.atan2(dx, dz) : volunteer.facing;
    volunteer.facing = turnToward(volunteer.facing, wanted, 5 * ctx.dt);
    previous.set(state.x, state.z);
    model.position.set(state.x, sandHeight(state.x, state.z), state.z);
    model.rotation.y = volunteer.facing;
    const speed = ctx.dt > 0 ? moved / ctx.dt : 0;
    // Walking backward plays the walk clip in reverse, as when carrying furniture.
    const forward = walking ? (dx * Math.sin(volunteer.facing) + dz * Math.cos(volunteer.facing)) / moved : 1;
    if (state.hammering) player.play('SwordSlash', 2.2);
    else if (state.walking && speed > 0.02) player.play('Walk', (forward < -0.2 ? -1 : 1) * Math.max(0.5, Math.min(1.8, speed / (ctx.s * 0.8))));
    else player.play('Idle');
    // Bones the clip does not move would keep last frame's bend, so everything starts from rest.
    volunteer.restPose.forEach(({ posed, rest }) => posed.quaternion.copy(rest));
    body.position.copy(bodyRest);
    player.mixer.update(ctx.dt);
    model.updateMatrixWorld(true);
    mallet.visible = ctx.tools;
    if (state.bend > 0.001) poseBend(volunteer, Math.min(1, state.bend));
    model.updateMatrixWorld(true);
    poseArms(volunteer, state, ctx);
    if (bucket.visible) {
      volunteer.arms.left.hand.getWorldPosition(scratch);
      const size = SYSTEM.personHeight * ctx.s * 0.14;
      const reach = (volunteer.weights.left);
      bucket.scale.setScalar(size);
      bucket.position.set(scratch.x, scratch.y - size * 0.45, scratch.z);
      bucket.rotation.set(0, 0, reach * (state.x > ctx.nest.x ? 0.9 : -0.9));
    }
    if (ctx.pouring && volunteer === volunteers[0]) {
      scratch.copy(bucket.position);
      puffs.add({
        x: scratch.x, y: scratch.y, z: scratch.z,
        vx: (Math.random() - 0.5) * 0.1 * ctx.s, vy: -ctx.s * 0.3, vz: (Math.random() - 0.5) * 0.1 * ctx.s,
        size: 0.014 * ctx.s,
      });
    }
  };

  return {
    group,
    clearTracks: tracks.clear,
    update: ({ sim, s, tide, nest, showPredators, showVolunteers, tools, pouring, volunteerStates, dt, simDt, tunnelOn, tunnelFrom, tunnelTo, tunnelX }) => {
      const ctx = {
        s, tide, dt, simDt, simTime: sim.time, predatorById: new Map(sim.predators.map((p) => [p.id, p])), nest, nestY: sandHeight(nest.x, nest.z), cycleTime: sim.cycleTime, count: sim.count,
        showPredators, showVolunteers, tools, pouring, tunnelOn, tunnelFrom, tunnelTo, tunnelX,
      };
      sim.hatchlings.forEach((h, i) => { updateHatchling(h, i, ctx); updateEgg(h, i, ctx); });
      turtles.mesh.instanceMatrix.needsUpdate = true;
      turtles.stroke.needsUpdate = true;
      eggs.instanceMatrix.needsUpdate = true;
      shells.instanceMatrix.needsUpdate = true;
      sim.predators.forEach((p) => updatePredator(p, ctx));
      volunteers.forEach((v, i) => updateVolunteer(v, volunteerStates[i], ctx));
      tracks.update(simDt);
      puffs.update(dt);
    },
  };
};
