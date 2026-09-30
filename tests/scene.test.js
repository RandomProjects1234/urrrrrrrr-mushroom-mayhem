import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Assets } from '../src/Assets.js';
import { World } from '../src/World.js';
import { Player } from '../src/Player.js';
import { Effects } from '../src/Effects.js';

test('procedural scene batches cleanly, animates bounded entities, and disposes resources', () => {
  const originalDocument = globalThis.document;
  // Canvas text fixture only. No browser, WebGL session, or interactive game is opened.
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, fillText() {} }) }) };
  const originalError = console.error; const errors = [];
  console.error = (...args) => errors.push(args.join(' '));
  let assets, world, player, effects;
  try {
    const scene = new THREE.Scene(); assets = new Assets(); world = new World(scene, assets);
    let meshes = 0; world.root.traverse(node => { if (node.isMesh) meshes++; });
    assert.equal(errors.length, 0, errors.join('\n')); assert.ok(meshes < 65, `Static draw calls too high: ${meshes}`);
    const item = { id: 'm1', kind: 'mushroom', type: 'giant', x: 0, y: 0.45, z: 0, vy: 0 };
    world.setItems([item]); world.update(1 / 60, 1);
    assert.equal(world.items.size, 1); assert.ok(world.items.get('m1').root.position.y > 0);
    world.updateTNT([{ id: 't1', x: 0, y: 2, z: 1, giant: false, bounce: false, fuse: 2 }], 1, 1 / 60);
    assert.equal(world.tnt.size, 1); world.updateTNT([], 1, 1 / 60); assert.equal(world.tnt.size, 0);
    const state = { id: 'p1', name: 'Boots', color: 0xc3ee80, x: 0, y: 0, z: 0, yaw: 0, vx: 8, vz: 0,
      health: 3, grounded: true, urrrUntil: 10, immuneUntil: 0, stomping: false };
    player = new Player(assets, state); scene.add(player.root); player.update(state, 0.2, 1);
    assert.ok(player.boots.every(boot => boot.scale.x > 1.5));
    player.update({ ...state, health: 0 }, 0.1, 2); assert.equal(player.root.visible, false);
    effects = new Effects(scene, assets); effects.burst(0, 1, 0, 0xffffff, 1000);
    assert.equal(effects.particles.length, 280); effects.update(0.02); assert.equal(effects.mesh.count, 280);
    for (let i = 0; i < 30; i++) effects.explosion({ x: 0, y: 1, z: 0, radius: 6 }, i % 2 === 0);
    assert.ok(effects.waves.length <= 18); assert.ok(effects.marks.length <= 12);
    effects.clear(); assert.equal(effects.waves.length, 0); world.setItems([]); assert.equal(world.items.size, 0);
  } finally {
    effects?.dispose(); player?.dispose(); world?.dispose(); assets?.dispose();
    globalThis.document = originalDocument; console.error = originalError;
  }
});
