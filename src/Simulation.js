import { CONFIG, COLORS, MUSHROOMS, cleanName, emptyInput } from './config.js';
import { SPAWNS, terrainHeight, groundHeight, validPickupPoint } from './WorldLayout.js';
import { movePlayer, impulse } from './Physics.js';
import { createTNT, stepTNT } from './TNT.js';
import { stompStrength } from './BootStomp.js';
import { addChaos, activateUrrrr } from './UrrrrMode.js';
import { useMushroom } from './Mushroom.js';

export class Simulation {
  constructor({ random = Math.random, onEvent = () => {} } = {}) {
    this.random = random; this.onEvent = onEvent;
    this.players = new Map(); this.tnt = new Map(); this.pickups = new Map();
    this.time = 0; this.round = 0; this.phase = 'lobby'; this.serial = 0;
    this.eventSequence = 0; this.stateSequence = 0; this.endsAt = 0;
  }
  emit(type, payload = {}) {
    this.onEvent({ type, ...payload, event: ++this.eventSequence, at: this.time });
  }
  addPlayer(id, name) {
    if (this.players.has(id) || this.players.size >= CONFIG.maxPlayers || this.phase !== 'lobby') return null;
    const available = COLORS.filter(color => ![...this.players.values()].some(p => p.color === color));
    const p = { id, name: cleanName(name), color: available[Math.floor(this.random() * available.length)],
      input: emptyInput(), actions: [], seq: -1, inputAt: this.time,
      score: 0, health: 3, tnt: 3, held: null, nextBlast: null, meter: 0,
      speedUntil: 0, urrrUntil: 0, respawnAt: 0, immuneUntil: 0,
      throwAt: 0, collectAt: 0, jumpAt: 0, stompAt: 0, regenAt: 0,
      lastAttacker: null, hitAt: -100, lastCause: '',
      stats: { urrr: 0, throws: 0, mushrooms: 0, stomps: 0, kills: 0, flight: 0, deaths: 0, chains: 0 },
    };
    this.spawn(p); this.players.set(id, p); return p;
  }
  removePlayer(id) { this.players.delete(id); }
  spawn(p) {
    const point = SPAWNS[Math.floor(this.random() * SPAWNS.length)];
    Object.assign(p, { x: point.x, z: point.z, y: terrainHeight(point.x, point.z),
      vx: 0, vy: 0, vz: 0, yaw: 0, grounded: true, peak: 0, stomping: false,
      health: 3, tnt: 3, respawnAt: 0, immuneUntil: this.time + CONFIG.invulnerability,
      input: emptyInput(), actions: [], inputAt: this.time, lastAttacker: null,
      hitAt: -100, held: null, nextBlast: null, speedUntil: 0, urrrUntil: 0 });
    p.peak = p.y;
  }
  start() {
    if (this.phase === 'playing' || !this.players.size) return false;
    this.phase = 'playing'; this.round++; this.endsAt = this.time + CONFIG.roundSeconds;
    this.pickups.clear(); this.tnt.clear(); this.growAt = this.time + 3; this.survivalAt = this.time + 10;
    for (const p of this.players.values()) {
      p.score = 0; p.meter = 0;
      for (const key of Object.keys(p.stats)) p.stats[key] = 0;
      this.spawn(p);
    }
    for (let i = 0; i < 30; i++) this.spawnRandom('mushroom');
    for (let i = 0; i < 12; i++) this.spawnRandom('ammo');
    for (let i = 0; i < 10; i++) this.spawnRandom('barrel');
    this.emit('MATCH_START', { round: this.round });
    return true;
  }
  acceptInput(id, input) {
    const p = this.players.get(id);
    if (!p || input.seq <= p.seq || this.phase !== 'playing') return false;
    p.seq = input.seq; p.inputAt = this.time;
    p.input = { x: input.x, z: input.z, yaw: input.yaw, pitch: input.pitch, sprint: input.sprint };
    if (p.health > 0) p.actions.push(...input.actions.slice(0, 6));
    p.actions = p.actions.slice(-12);
    return true;
  }
  step(dt) {
    this.time += dt;
    if (this.phase !== 'playing') return;
    if (this.time >= this.endsAt) { this.finish(); return; }
    for (const p of this.players.values()) {
      if (p.health <= 0) {
        if (this.time >= p.respawnAt) { this.spawn(p); this.emit('PLAYER_RESPAWN', { player: p.id }); }
        continue;
      }
      if (this.time - p.inputAt > CONFIG.inputTimeout) { p.input = emptyInput(); p.actions.length = 0; }
      for (const action of p.actions.splice(0)) this.action(p, action);
      const landed = movePlayer(p, p.input, dt, this.time);
      if (!p.grounded) p.stats.flight += dt;
      if (landed && p.stomping) this.stomp(p);
      if (p.grounded) { p.peak = p.y; p.stomping = false; }
      if (p.y < -16 || Math.hypot(p.x, p.z) > 65) this.eliminate(p, p.lastAttacker, 'THE VOID');
      if (p.urrrUntil > this.time && this.time >= p.regenAt) {
        p.regenAt = this.time + 0.7; p.tnt = Math.min(10, p.tnt + 1);
        this.spawnPickup('mushroom', p.x + (this.random() - 0.5) * 10,
          p.z + (this.random() - 0.5) * 10, p.y + 12);
        for (const other of this.players.values()) {
          if (other.id !== p.id && other.health > 0 && Math.hypot(p.x - other.x, p.z - other.z) < 3 && other.grounded) {
            other.vy = 9; other.grounded = false;
          }
        }
      }
    }
    for (const t of [...this.tnt.values()]) {
      stepTNT(t, dt);
      if (t.fuse <= this.time || t.y < -12 || Math.hypot(t.x, t.z) > 80) this.explode(t);
    }
    for (const item of this.pickups.values()) {
      if (item.kind === 'barrel') continue;
      const floor = groundHeight(item.x, item.z, item.y + 0.5) + 0.45;
      if (item.y > floor || item.vy > 0) { item.vy -= CONFIG.gravity * dt; item.y += item.vy * dt; }
      if (item.y < floor) { item.y = floor; item.vy = 0; }
      if (item.y < -15) this.removePickup(item.id);
    }
    if (this.time >= this.growAt) {
      this.growAt = this.time + 3;
      for (let i = 0; i < 3; i++) this.spawnRandom('mushroom');
      if ([...this.pickups.values()].filter(p => p.kind === 'ammo').length < 12) this.spawnRandom('ammo');
      if ([...this.pickups.values()].filter(p => p.kind === 'barrel').length < 8) this.spawnRandom('barrel');
    }
    if (this.time >= this.survivalAt) {
      this.survivalAt = this.time + 10;
      for (const p of this.players.values()) if (p.health > 0) p.score += 5;
    }
  }
  action(p, action) {
    if (action === 'jump' && this.time >= p.jumpAt) {
      if (p.grounded) {
        p.vy = CONFIG.jump * (p.urrrUntil > this.time ? 1.65 : 1); p.grounded = false;
        p.peak = p.y; p.jumpAt = this.time + 0.22;
        this.emit('JUMP', { player: p.id, x: p.x, y: p.y, z: p.z });
      } else if (!p.stomping && this.time >= p.stompAt && p.y - groundHeight(p.x, p.z, p.y) > 0.65) {
        p.stomping = true; p.vy = -38; p.stompAt = this.time + 1;
      }
    }
    if (action === 'throw' && p.tnt > 0 && this.time >= p.throwAt && this.tnt.size < CONFIG.maxTNT) {
      p.throwAt = this.time + 0.55; p.tnt--; p.stats.throws++;
      const t = createTNT(`t${++this.serial}`, p, this.time); this.tnt.set(t.id, t);
      this.emit('SPAWN_TNT', { player: p.id });
    }
    if (action === 'collect' && this.time >= p.collectAt) { p.collectAt = this.time + 0.2; this.collect(p); }
    if (action === 'use') useMushroom(p, this);
    if (action === 'urrrr' && activateUrrrr(p, this.time)) {
      this.emit('URRRR_ACTIVATE', { player: p.id, x: p.x, y: p.y, z: p.z });
    }
  }
  collect(p) {
    const near = [...this.pickups.values()].filter(item => item.kind !== 'barrel'
      && Math.hypot(item.x - p.x, item.y - p.y - 1, item.z - p.z) < 2.6
      && (item.kind !== 'ammo' || p.tnt < 10) && (item.kind !== 'mushroom' || !p.held));
    near.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    const item = near[0]; if (!item) return;
    if (item.kind === 'ammo') p.tnt = Math.min(10, p.tnt + 3);
    else { p.held = item.type; p.stats.mushrooms++; p.score += 15; addChaos(p, 12); }
    this.removePickup(item.id);
    this.emit('MUSHROOM_PICKUP', { player: p.id, kind: item.kind, x: item.x, y: item.y, z: item.z });
  }
  stomp(p) {
    const { radius, power } = stompStrength(p, this.time);
    p.stats.stomps++; p.score += 8; addChaos(p, 14);
    this.blast({ x: p.x, y: p.y, z: p.z }, radius, power, p.id, 'BOOT STOMP', false, 1, true);
    this.emit('BOOT_STOMP', { player: p.id, x: p.x, y: p.y, z: p.z, radius });
  }
  explode(t) {
    if (!this.tnt.delete(t.id)) return;
    const radius = t.giant ? 10 : 5.7;
    const owner = this.players.get(t.owner);
    if (owner) { owner.score += 10 + t.chain * 12; owner.stats.chains += t.chain > 0 ? 1 : 0; addChaos(owner, 9 + t.chain * 5); }
    this.blast(t, radius, t.giant ? 32 : 23, t.owner, 'TNT', t.bounce, t.giant ? 2 : 1, false, t.chain);
    this.emit('TNT_EXPLODE', { x: t.x, y: t.y, z: t.z, radius, bounce: t.bounce, player: t.owner });
  }
  blast(source, radius, power, ownerId, cause, bounce, damage, excludeOwner, chain = 0) {
    const owner = this.players.get(ownerId);
    for (const p of this.players.values()) {
      if (p.health <= 0 || (excludeOwner && p.id === ownerId)) continue;
      if (!impulse(p, source, radius, power, bounce)) continue;
      addChaos(p, 6);
      if (p.id !== ownerId && owner) { addChaos(owner, 6); owner.score += 10; p.lastAttacker = ownerId; p.hitAt = this.time; }
      p.lastCause = cause;
      this.emit('PLAYER_LAUNCH', { player: p.id, x: p.x, y: p.y, z: p.z });
      if (p.immuneUntil > this.time) continue;
      p.health -= damage; p.immuneUntil = this.time + 0.6;
      this.emit('PLAYER_DAMAGE', { player: p.id, health: Math.max(0, p.health) });
      if (p.health <= 0) this.eliminate(p, ownerId, cause);
    }
    for (const t of this.tnt.values()) {
      if (Math.hypot(t.x - source.x, t.y - source.y, t.z - source.z) < radius + 0.5) {
        t.fuse = Math.min(t.fuse, this.time + 0.12); t.chain = Math.max(t.chain, Math.min(chain + 1, 12));
        if (ownerId) t.owner = ownerId;
      }
    }
    for (const item of [...this.pickups.values()]) {
      if (Math.hypot(item.x - source.x, item.y - source.y, item.z - source.z) >= radius) continue;
      if (item.kind === 'barrel') {
        if (this.tnt.size >= CONFIG.maxTNT) continue;
        this.removePickup(item.id);
        const t = { id: `t${++this.serial}`, x: item.x, y: item.y, z: item.z,
          vx: 0, vy: 6, vz: 0, fuse: this.time + 0.16, owner: ownerId,
          giant: false, bounce: false, chain: Math.min(chain + 1, 12) };
        this.tnt.set(t.id, t);
      } else { item.vy = power * 0.7; this.emit('PICKUP_BOUNCE', { id: item.id, vy: item.vy, y: item.y }); }
    }
  }
  eliminate(p, killerId, cause) {
    if (p.respawnAt > this.time) return;
    const killer = this.players.get(killerId);
    const credited = killer && killer !== p && (cause !== 'THE VOID' || this.time - p.hitAt < 8);
    if (credited) { killer.score += 150; killer.stats.kills++; addChaos(killer, 20); }
    else p.score = Math.max(0, p.score - 20);
    p.health = 0; p.respawnAt = this.time + CONFIG.respawnSeconds; p.stats.deaths++;
    p.urrrUntil = 0; p.actions.length = 0; p.stomping = false;
    this.emit('ELIMINATION', { player: p.id, killer: credited ? killer.id : null, cause });
  }
  spawnRandom(kind) {
    for (let tries = 0; tries < 20; tries++) {
      const x = (this.random() - 0.5) * 60, z = (this.random() - 0.5) * 60;
      if (validPickupPoint(x, z)) return this.spawnPickup(kind, x, z);
    }
    return null;
  }
  spawnPickup(kind, x, z, y, type) {
    const count = [...this.pickups.values()].filter(p => p.kind === kind).length;
    if (count >= (kind === 'mushroom' ? CONFIG.maxMushrooms : 16) || !validPickupPoint(x, z)) return null;
    const types = Object.keys(MUSHROOMS);
    const item = { id: `m${++this.serial}`, kind, type: type || types[Math.floor(this.random() * types.length)],
      x, z, y: y ?? groundHeight(x, z) + 0.45, vy: 0 };
    this.pickups.set(item.id, item); this.emit('PICKUP_ADD', { item: { ...item } }); return item;
  }
  removePickup(id) { if (this.pickups.delete(id)) this.emit('PICKUP_REMOVE', { id }); }
  playerState(p) {
    const small = value => Math.round(value * 1000) / 1000;
    return { id: p.id, name: p.name, color: p.color, x: small(p.x), y: small(p.y), z: small(p.z),
      vx: small(p.vx), vy: small(p.vy), vz: small(p.vz), yaw: p.yaw, health: p.health, score: p.score,
      tnt: p.tnt, held: p.held, nextBlast: p.nextBlast, meter: p.meter,
      urrrUntil: p.urrrUntil, speedUntil: p.speedUntil, respawnAt: p.respawnAt,
      immuneUntil: p.immuneUntil, grounded: p.grounded, stomping: p.stomping, seq: p.seq };
  }
  snapshot() {
    return { type: 'PLAYER_STATE', seq: ++this.stateSequence, time: this.time,
      remaining: Math.max(0, this.endsAt - this.time), phase: this.phase, round: this.round,
      players: [...this.players.values()].map(p => this.playerState(p)),
      tnt: [...this.tnt.values()].map(t => ({ id: t.id, x: Math.round(t.x * 1000) / 1000,
        y: Math.round(t.y * 1000) / 1000, z: Math.round(t.z * 1000) / 1000,
        fuse: t.fuse, giant: t.giant, bounce: t.bounce })) };
  }
  worldState() { return { type: 'WORLD_STATE', round: this.round, items: [...this.pickups.values()].map(p => ({ ...p })) }; }
  finish() {
    this.phase = 'results';
    this.results = this.scoreboard();
    this.emit('MATCH_END', { results: this.results });
  }
  scoreboard() {
    const players = [...this.players.values()].sort((a, b) => b.score - a.score);
    const best = key => [...players].sort((a, b) => b.stats[key] - a.stats[key])[0]?.name || 'Nobody. Somehow.';
    return { players: players.map(p => ({ id: p.id, name: p.name, color: p.color, score: p.score, kills: p.stats.kills })),
      awards: [
        ['BIGGEST URRRRRRRR', best('urrr')], ['TNT ENTHUSIAST', best('throws')],
        ['MUSHROOM ADDICT', best('mushrooms')], ['THRIFT STORE LEGEND', players[0]?.name],
        ['BOOT DESTROYER', best('stomps')], ['MOST TIME SPENT FLYING', best('flight')],
        ['MOST CONFUSED', best('deaths')],
      ] };
  }
}
