import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { NetworkManager } from '../src/NetworkManager.js';
import { Simulation } from '../src/Simulation.js';

// In-memory PeerJS transport fixture tests application lifecycle without opening
// a browser or contacting signaling. Production always defaults to actual PeerJS.
const registry = new Map();
const flush = () => new Promise(resolve => setImmediate(resolve));
class TestConnection extends EventEmitter {
  constructor(peer, label) {
    super(); this.peer = peer; this.label = label; this.open = false; this.dataChannel = { bufferedAmount: 0 };
  }
  send(message) {
    if (!this.open) throw new Error('closed');
    const data = JSON.parse(JSON.stringify(message));
    queueMicrotask(() => { if (this.other.open) this.other.emit('data', data); });
  }
  close() {
    if (!this.open) return;
    this.open = false; this.emit('close');
    if (this.other?.open) { this.other.open = false; this.other.emit('close'); }
  }
}
class TestPeer extends EventEmitter {
  constructor(id) {
    super(); this.id = id || `guest-${crypto.randomUUID()}`; this.connections = []; this.destroyed = false;
    queueMicrotask(() => {
      if (registry.has(this.id)) { this.emit('error', { type: 'unavailable-id' }); return; }
      registry.set(this.id, this); this.emit('open', this.id);
    });
  }
  connect(id, options) {
    const outgoing = new TestConnection(id, options.label); this.connections.push(outgoing);
    queueMicrotask(() => {
      const target = registry.get(id);
      if (!target) { this.emit('error', { type: 'peer-unavailable' }); return; }
      const incoming = new TestConnection(this.id, options.label); target.connections.push(incoming);
      outgoing.other = incoming; incoming.other = outgoing;
      target.emit('connection', incoming);
      outgoing.open = true; incoming.open = true;
      incoming.emit('open'); outgoing.emit('open');
    });
    return outgoing;
  }
  reconnect() {}
  destroy() {
    this.destroyed = true; if (registry.get(this.id) === this) registry.delete(this.id);
    this.connections.forEach(connection => connection.close());
  }
}
async function room(t, count = 2) {
  const host = new NetworkManager({ PeerImpl: TestPeer });
  const guests = Array.from({ length: count }, () => new NetworkManager({ PeerImpl: TestPeer }));
  t.after(() => { host.close(); guests.forEach(guest => guest.close()); });
  const result = await host.host('Host');
  const sim = new Simulation(); sim.addPlayer(result.id, 'Host');
  host.on('join', ({ id, name }) => sim.addPlayer(id, name));
  host.on('joined', () => host.broadcast({ type: 'LOBBY_STATE', players: [...sim.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color })) }));
  host.on('left', id => sim.removePlayer(id));
  host.on('input', ({ id, input }) => sim.acceptInput(id, input));
  await Promise.all(guests.map((guest, i) => guest.join(`Guest ${i}`, result.room)));
  await flush(); return { host, guests, sim, result };
}
test('host/join handshake synchronizes lobby and binds inputs to their actual connection', async t => {
  const { host, guests, sim } = await room(t);
  assert.equal(host.connections.size, 2); assert.equal(sim.players.size, 3);
  sim.start();
  const guest = guests[0], hostPlayer = sim.players.get(host.id);
  guest.send({ type: 'PLAYER_INPUT', id: host.id, seq: 1, x: 1, z: 0, yaw: 0, pitch: 0, sprint: false, actions: ['throw'] });
  guest.send({ type: 'PLAYER_DAMAGE', player: host.id, health: 0 });
  await flush(); sim.step(1 / 60);
  assert.equal(hostPlayer.tnt, 3); assert.equal(hostPlayer.health, 3);
  assert.equal(sim.players.get(guest.id).tnt, 2);
  assert.equal([...sim.tnt.values()][0].owner, guest.id);
  let snapshot;
  guests[1].on('message', message => { snapshot = message; });
  host.broadcast(sim.snapshot()); await flush();
  assert.equal(snapshot.type, 'PLAYER_STATE'); assert.equal(snapshot.players.length, 3);
});
test('guest disconnect removes the player; closing host reports host-left to remaining guests', async t => {
  const { host, guests, sim } = await room(t);
  guests[0].close(); await flush(); assert.equal(sim.players.size, 2);
  let left = false; guests[1].on('hostLeft', () => { left = true; });
  host.close(); await flush(); assert.ok(left);
});
test('unknown rooms fail promptly with the required room-not-found message', async t => {
  const guest = new NetworkManager({ PeerImpl: TestPeer }); t.after(() => guest.close());
  await assert.rejects(guest.join('Guest', 'URRRR-ABC234'), /COULD NOT FIND THAT URRRRRRRR/);
});
test('running matches reject new players and leave the existing match intact', async t => {
  const { host, sim, result } = await room(t, 0); sim.start();
  const late = new NetworkManager({ PeerImpl: TestPeer }); t.after(() => late.close());
  await assert.rejects(late.join('Late', result.room), /Match in progress/);
  assert.equal(sim.players.size, 1); assert.equal(host.connections.size, 0);
});
test('host event bursts do not trip guest-side client rate limits', async t => {
  const { host, guests } = await room(t, 1); let received = 0;
  guests[0].on('message', () => received++);
  for (let i = 1; i <= 220; i++) host.broadcast({ type: 'PICKUP_REMOVE', event: i, at: 0, id: `m${i}` });
  await flush(); assert.equal(received, 220); assert.equal(host.connections.size, 1);
});
test('repeated malformed client messages close just that connection', async t => {
  const { host, guests, sim } = await room(t, 2);
  for (let i = 0; i < 10; i++) guests[0].send({ type: 'SPAWN_TNT', arbitrary: 'forged' });
  await flush(); assert.equal(host.connections.size, 1); assert.equal(sim.players.size, 2);
});
