import { CONFIG, MUSHROOMS, clamp } from './config.js';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const text = (value, max = 100) => typeof value === 'string' && value.length <= max;
const id = value => text(value, 100) && /^[a-zA-Z0-9_-]+$/.test(value);
const position = value => record(value) && finite(value.x, -100, 100) && finite(value.y, -100, 200) && finite(value.z, -100, 100);
const actions = new Set(['jump', 'throw', 'collect', 'use', 'urrrr']);
const mushroom = value => value === null || Object.hasOwn(MUSHROOMS, value);

export function validateInput(value) {
  return record(value) && Number.isSafeInteger(value.seq) && value.seq >= 0 && value.seq <= 1e9
    && finite(value.x, -1, 1) && finite(value.z, -1, 1)
    && finite(value.yaw, -Math.PI, Math.PI) && finite(value.pitch, -1.1, 1.1)
    && typeof value.sprint === 'boolean' && Array.isArray(value.actions)
    && value.actions.length <= 6 && value.actions.every(action => actions.has(action));
}
export function validatePlayer(p) {
  return position(p) && id(p.id) && text(p.name, 18) && Number.isInteger(p.color) && finite(p.color, 0, 0xffffff)
    && ['vx', 'vy', 'vz'].every(key => finite(p[key], -80, 80))
    && finite(p.yaw, -Math.PI, Math.PI) && finite(p.health, 0, 3) && finite(p.score, 0, 1e8)
    && finite(p.tnt, 0, 10) && finite(p.meter, 0, 100) && mushroom(p.held) && mushroom(p.nextBlast)
    && ['urrrUntil', 'speedUntil', 'respawnAt', 'immuneUntil'].every(key => finite(p[key], 0, 1e9))
    && typeof p.grounded === 'boolean' && typeof p.stomping === 'boolean';
}
export function validateItem(p) {
  return position(p) && id(p.id) && ['mushroom', 'ammo', 'barrel'].includes(p.kind)
    && Object.hasOwn(MUSHROOMS, p.type) && finite(p.vy, -100, 100);
}
export function validateMessage(message, receivingAsHost) {
  if (!record(message) || !text(message.type, 30)) return false;
  // Bound decoded JSON too. PeerJS/WebRTC transport allocation is outside this application.
  try { if (JSON.stringify(message).length > 64000) return false; } catch { return false; }
  if (message.type === 'PING' || message.type === 'PONG' || message.type === 'LEAVE') return true;
  if (receivingAsHost) {
    if (message.type === 'JOIN') return message.version === 1 && text(message.name, 18);
    return message.type === 'PLAYER_INPUT' && validateInput(message);
  }
  if (message.type === 'JOIN_ACCEPTED') return id(message.id) && text(message.room, 20);
  if (message.type === 'REJECT') return text(message.reason, 160);
  if (message.type === 'LOBBY_STATE') return Array.isArray(message.players) && message.players.length <= CONFIG.maxPlayers
    && message.players.every(p => id(p.id) && text(p.name, 18) && finite(p.color, 0, 0xffffff));
  if (message.type === 'PLAYER_STATE') return Number.isSafeInteger(message.seq)
    && finite(message.time, 0, 1e9) && finite(message.remaining, 0, CONFIG.roundSeconds)
    && ['lobby', 'playing', 'results'].includes(message.phase) && Number.isInteger(message.round)
    && Array.isArray(message.players) && message.players.length <= CONFIG.maxPlayers && message.players.every(validatePlayer)
    && Array.isArray(message.tnt) && message.tnt.length <= CONFIG.maxTNT
    && message.tnt.every(t => position(t) && id(t.id) && finite(t.fuse, 0, 1e9)
      && typeof t.giant === 'boolean' && typeof t.bounce === 'boolean');
  if (message.type === 'WORLD_STATE') return Number.isInteger(message.round) && Array.isArray(message.items)
    && message.items.length <= CONFIG.maxMushrooms + 32 && message.items.every(validateItem);
  if (!Number.isSafeInteger(message.event) || !finite(message.at, 0, 1e9)) return false;
  switch (message.type) {
    case 'MATCH_START': return Number.isInteger(message.round);
    case 'MATCH_END': return record(message.results) && Array.isArray(message.results.players)
      && message.results.players.length <= CONFIG.maxPlayers && message.results.players.every(p => id(p.id)
        && text(p.name, 18) && finite(p.color, 0, 0xffffff) && finite(p.score, 0, 1e8) && finite(p.kills, 0, 1e7))
      && Array.isArray(message.results.awards) && message.results.awards.length <= 8
      && message.results.awards.every(a => Array.isArray(a) && a.length === 2 && a.every(v => text(v, 100)));
    case 'PICKUP_ADD': return validateItem(message.item);
    case 'PICKUP_REMOVE': return id(message.id);
    case 'PICKUP_BOUNCE': return id(message.id) && finite(message.vy, 0, 100) && finite(message.y, -100, 200);
    case 'TNT_EXPLODE': case 'BOOT_STOMP': return position(message) && finite(message.radius, 0, 30);
    case 'JUMP': case 'PLAYER_LAUNCH': case 'URRRR_ACTIVATE': case 'MUSHROOM_PICKUP': case 'MUSHROOM_USE':
      return position(message) && id(message.player);
    case 'SPAWN_TNT': case 'PLAYER_RESPAWN': return id(message.player);
    case 'PLAYER_DAMAGE': return id(message.player) && finite(message.health, 0, 3);
    case 'ELIMINATION': return id(message.player) && (message.killer === null || id(message.killer)) && text(message.cause, 30);
    default: return false;
  }
}
export function normalizeRoom(value) {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase().replace(/^URRRR-?/, '').replace(/[\s-]/g, '');
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code) ? `URRRR-${code}` : null;
}
export function generateRoom() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `URRRR-${[...bytes].map(value => alphabet[value % alphabet.length]).join('')}`;
}
export function sanitizeAxis(value) { return clamp(Number.isFinite(value) ? value : 0, -1, 1); }
