import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/Simulation.js';
import { CONFIG } from '../src/config.js';
import { validateInput, validateMessage, normalizeRoom, generateRoom } from '../src/Protocol.js';
import { terrainHeight } from '../src/WorldLayout.js';
import { movePlayer } from '../src/Physics.js';
import { RemotePlayer } from '../src/RemotePlayer.js';

function seeded() {
  let n = 42;
  return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 2 ** 32; };
}
function setup() {
  const events = [];
  const sim = new Simulation({ random: seeded(), onEvent: e => events.push(e) });
  const host = sim.addPlayer('host', 'Thrifted Host');
  const guest = sim.addPlayer('guest', '<b>Boots</b>');
  sim.start(); return { sim, host, guest, events };
}
const input = (seq, overrides = {}) => ({ type: 'PLAYER_INPUT', seq, x: 0, z: 0, yaw: 0, pitch: 0, sprint: false, actions: [], ...overrides });
function advance(sim, seconds) { for (let i = 0; i < Math.ceil(seconds * 60); i++) sim.step(1 / 60); }

test('real room codes normalize, are human-friendly, and have sufficient variation', () => {
  assert.equal(normalizeRoom(' urrrr-x7k2ab '), 'URRRR-X7K2AB');
  assert.equal(normalizeRoom('URRRR-X7K2AB'), 'URRRR-X7K2AB');
  assert.equal(normalizeRoom('x7k2ab'), 'URRRR-X7K2AB');
  assert.equal(normalizeRoom('URRRR-IL0O11'), null);
  assert.equal(normalizeRoom('<script>'), null);
  const codes = new Set(Array.from({ length: 300 }, generateRoom));
  assert.equal(codes.size, 300);
  for (const code of codes) assert.equal(normalizeRoom(code), code);
});
test('input validation rejects forged outcomes, bad numbers, action floods, and wrong directions', () => {
  assert.ok(validateInput(input(1)));
  for (const bad of [{ x: NaN }, { z: Infinity }, { yaw: 20 }, { x: 2 }, { seq: -1 },
    { sprint: 'yes' }, { actions: ['kill'] }, { actions: Array(7).fill('throw') }]) assert.equal(validateInput(input(1, bad)), false);
  assert.equal(validateMessage({ type: 'PLAYER_DAMAGE', player: 'host', health: 0 }, true), false);
  assert.equal(validateMessage({ type: 'JOIN', version: 1, name: 'x'.repeat(19) }, true), false);
  assert.equal(validateMessage(null, false), false);
});
test('host accepts inputs by connection identity, rejects replays, and clears stale movement', () => {
  const { sim, host, guest } = setup();
  const guestX = guest.x;
  assert.ok(sim.acceptInput('host', input(1, { x: 1 })));
  assert.equal(sim.acceptInput('host', input(1, { x: -1 })), false);
  assert.equal(sim.acceptInput('nonexistent', input(2)), false);
  advance(sim, 0.4);
  assert.ok(host.vx > 0); assert.equal(guest.x, guestX);
  advance(sim, 1.5); assert.equal(host.input.x, 0); assert.ok(host.vx < 0.1);
});
test('movement is normalized, gravity lands, walls collide, and void deaths respawn', () => {
  const { sim, host } = setup();
  Object.assign(host, { x: -23, z: 9.8, y: terrainHeight(-23, 9.8), grounded: true, vx: 0, vz: 0 });
  for (let i = 0; i < 100; i++) movePlayer(host, { x: 0, z: -1, yaw: 0, sprint: true }, 1 / 60, sim.time);
  assert.ok(host.z >= 7.5);
  Object.assign(host, { x: 0, z: 0, y: 8, vy: 0, grounded: false });
  advance(sim, 1); assert.ok(host.grounded); assert.ok(Math.abs(host.y - terrainHeight(0, 0)) < 0.01);
  host.y = -20; sim.step(1 / 60); assert.equal(host.health, 0);
  advance(sim, 3.1); assert.equal(host.health, 3); assert.equal(host.tnt, 3);
});
test('throw cooldowns and global TNT/ammunition limits are authoritative', () => {
  const { sim, host } = setup();
  host.tnt = 10;
  sim.acceptInput(host.id, input(1, { actions: Array(6).fill('throw') })); sim.step(1 / 60);
  assert.equal(sim.tnt.size, 1); assert.equal(host.tnt, 9);
  host.throwAt = 0;
  for (let i = 0; i < CONFIG.maxTNT; i++) sim.tnt.set(`dummy${i}`, { id: `dummy${i}` });
  const previous = host.tnt; sim.action(host, 'throw'); assert.equal(host.tnt, previous);
});
test('TNT detonates, launches players, damages, chains barrels, and awards eliminations', () => {
  const { sim, host, guest, events } = setup();
  sim.time = 4; host.x = -8; host.z = 0;
  Object.assign(guest, { x: 0, y: 0, z: 0, health: 1, immuneUntil: 0 });
  sim.pickups.clear(); sim.spawnPickup('barrel', 1, 0);
  const t = { id: 'blast', x: 0, y: 0.5, z: 0, owner: host.id, giant: false, bounce: true, chain: 0 };
  sim.tnt.set(t.id, t); sim.explode(t);
  assert.equal(guest.health, 0); assert.ok(guest.vy > 20); assert.equal(host.stats.kills, 1);
  assert.ok(host.score >= 150); assert.ok([...sim.tnt.values()].some(t => t.chain === 1));
  advance(sim, 0.3); assert.ok(events.filter(e => e.type === 'TNT_EXPLODE').length >= 2);
});
test('all mushroom effects work and spawn counts stay bounded', () => {
  const { sim, host } = setup();
  for (const type of ['giant', 'bounce']) {
    host.held = type; sim.action(host, 'use'); assert.equal(host.nextBlast, type); assert.equal(host.held, null);
  }
  host.held = 'speed'; sim.action(host, 'use'); assert.ok(host.speedUntil > sim.time);
  host.held = 'urrrr'; sim.action(host, 'use'); assert.ok(host.meter >= 55);
  sim.pickups.clear(); host.held = 'mushroom'; sim.action(host, 'use'); assert.equal(sim.pickups.size, 10);
  host.held = 'mystery'; sim.action(host, 'use'); assert.equal(host.held, null);
  for (let i = 0; i < 200; i++) sim.spawnRandom('mushroom');
  assert.ok([...sim.pickups.values()].filter(p => p.kind === 'mushroom').length <= CONFIG.maxMushrooms);
});
test('collect uses actual distance, cannot replace held mushrooms, and caps ammo', () => {
  const { sim, host } = setup(); sim.pickups.clear();
  Object.assign(host, { x: 0, y: 0, z: 0 });
  sim.spawnPickup('mushroom', 20, 0, 1, 'bounce'); sim.collect(host); assert.equal(host.held, null);
  sim.spawnPickup('mushroom', 0, 0, 1, 'speed'); sim.collect(host); assert.equal(host.held, 'speed');
  sim.spawnPickup('mushroom', 0, 0, 1, 'giant'); sim.collect(host); assert.equal(host.held, 'speed');
  sim.spawnPickup('ammo', 0, 0, 1); host.tnt = 9; sim.collect(host); assert.equal(host.tnt, 10);
});
test('airborne stomp creates a shockwave and only grounded jumps do not stomp', () => {
  const { sim, host, events } = setup();
  Object.assign(host, { x: 0, y: 0, z: 0 });
  sim.action(host, 'jump'); assert.ok(host.vy > 0); assert.equal(host.stomping, false);
  advance(sim, 0.3); sim.action(host, 'jump'); assert.equal(host.stomping, true);
  advance(sim, 0.5); assert.ok(events.some(e => e.type === 'BOOT_STOMP')); assert.equal(host.stats.stomps, 1);
});
test('URRRR requires a full meter, regenerates TNT, and expires after ten seconds', () => {
  const { sim, host } = setup();
  sim.action(host, 'urrrr'); assert.equal(host.urrrUntil, 0);
  host.meter = 100; host.tnt = 0; sim.action(host, 'urrrr');
  assert.equal(host.meter, 0); assert.equal(host.urrrUntil, 10);
  advance(sim, 1); assert.ok(host.tnt >= 2); assert.equal(host.stats.urrr, 1);
  advance(sim, 9.2); assert.ok(host.urrrUntil < sim.time);
});
test('five-minute rounds, awards, disconnect removal, and replay reset correctly', () => {
  const { sim, host, guest, events } = setup();
  host.score = 700; sim.time = sim.endsAt - 0.01; sim.step(1 / 60);
  assert.equal(sim.phase, 'results'); assert.equal(sim.results.players[0].id, host.id);
  assert.equal(sim.results.awards.length, 7); assert.ok(events.some(e => e.type === 'MATCH_END'));
  sim.removePlayer(guest.id); sim.start(); assert.equal(sim.round, 2); assert.equal(host.score, 0);
  assert.equal(host.health, 3); assert.equal(host.stats.throws, 0); assert.equal(sim.endsAt - sim.time, 300);
  assert.equal(sim.players.size, 1);
});
test('all host-generated packets and events satisfy the client protocol', () => {
  const { sim, host, events } = setup();
  host.held = 'mushroom'; sim.action(host, 'use'); sim.action(host, 'throw');
  host.meter = 100; sim.action(host, 'urrrr'); advance(sim, 3);
  sim.finish();
  for (const message of [sim.snapshot(), sim.worldState(), ...events]) {
    assert.ok(validateMessage(message, false), `Invalid outbound ${message.type}: ${JSON.stringify(message)}`);
  }
});
test('remote interpolation crosses the yaw seam smoothly and limits extrapolation', () => {
  const remote = new RemotePlayer();
  const state = { health: 3, x: 0, y: 0, z: 0, vx: 10, vy: 0, vz: 0, yaw: 3.1 };
  remote.push(state, 0); remote.push({ ...state, x: 1, yaw: -3.1 }, 0.1);
  const sample = remote.sample(0.15);
  assert.ok(Math.abs(sample.x - 0.5) < 1e-6); assert.ok(Math.abs(sample.yaw) > 3);
  assert.ok(remote.sample(10).x <= 1.81);
});
test('eight-player chaos stays finite and bounded over a full round', () => {
  const sim = new Simulation({ random: seeded() });
  for (let i = 0; i < 8; i++) sim.addPlayer(`p${i}`, `Boot ${i}`);
  assert.equal(sim.addPlayer('overflow', 'Ninth'), null); sim.start();
  for (let tick = 0; tick < 60 * 301; tick++) {
    if (tick % 3 === 0) for (const p of sim.players.values()) {
      const angle = tick * 0.03 + Number(p.id.slice(1));
      sim.acceptInput(p.id, input(tick + 1, { x: Math.sin(angle), z: Math.cos(angle), yaw: Math.atan2(Math.sin(angle), Math.cos(angle)),
        actions: tick % 60 === 0 ? ['throw', 'jump', 'collect', 'use', 'urrrr'] : [] }));
    }
    sim.step(1 / 60);
    assert.ok(sim.tnt.size <= CONFIG.maxTNT);
    assert.ok(sim.pickups.size <= CONFIG.maxMushrooms + 32);
    if (tick % 60 === 0) assert.ok(validateMessage(sim.snapshot(), false));
  }
  assert.equal(sim.phase, 'results'); assert.equal(sim.results.players.length, 8);
});
