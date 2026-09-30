import Peer from 'peerjs';
import { cleanName, CONFIG } from './config.js';
import { generateRoom, normalizeRoom, validateMessage } from './Protocol.js';

const peerId = room => `urrrrrrrr-mayhem-v1-${room.toLowerCase()}`;

export class NetworkManager {
  constructor({ PeerImpl = Peer } = {}) {
    this.PeerImpl = PeerImpl;
    this.listeners = new Map(); this.connections = new Map(); this.allConnections = new Set();
    this.isHost = false; this.closing = false; this.generation = 0;
  }
  on(type, callback) { this.listeners.set(type, callback); }
  emit(type, data) { this.listeners.get(type)?.(data); }
  options() {
    // PeerJS Cloud provides signaling; game simulation stays in the host browser.
    // Supply your own ICE/TURN settings here if your group needs restrictive-NAT support.
    return { secure: true, debug: 0 };
  }
  async host(name) {
    this.close(); this.closing = false; this.isHost = true; this.name = cleanName(name);
    const generation = this.generation;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (generation !== this.generation) throw new Error('Room creation cancelled.');
      this.room = generateRoom();
      try {
        this.peer = new this.PeerImpl(peerId(this.room), this.options());
        await this.waitForPeer(this.peer);
        if (generation !== this.generation) throw new Error('Room creation cancelled.');
        this.id = this.peer.id;
        this.peer.on('connection', connection => this.attach(connection));
        this.installPeerEvents(); this.startHeartbeat();
        return { id: this.id, room: this.room };
      } catch (error) {
        this.peer?.destroy();
        if (error.type !== 'unavailable-id' || attempt === 3) throw error;
      }
    }
  }
  async join(name, room) {
    const normalized = normalizeRoom(room);
    if (!normalized) throw new Error('Enter the six-character room code, such as URRRR-X7K2AB.');
    this.close(); this.closing = false; this.isHost = false; this.room = normalized; this.name = cleanName(name);
    const generation = this.generation;
    this.peer = new this.PeerImpl(undefined, this.options());
    await this.waitForPeer(this.peer);
    if (generation !== this.generation) throw new Error('Joining cancelled.');
    this.id = this.peer.id;
    this.installPeerEvents();
    const connection = this.peer.connect(peerId(this.room), { reliable: true, serialization: 'json', label: 'mayhem-v1' });
    this.hostConnection = connection; this.lastHostRx = performance.now();
    this.attach(connection);
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => finish(new Error('COULD NOT FIND THAT URRRRRRRR. Check the code and your network.')), 15000);
      const finish = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer); this.joinFinish = null;
        if (error) reject(error); else { this.startHeartbeat(); resolve({ id: this.id, room: this.room }); }
      };
      this.joinFinish = finish;
      connection.on('open', () => this.sendTo(connection, { type: 'JOIN', version: 1, name: this.name }));
      connection.on('error', () => finish(new Error('COULD NOT FIND THAT URRRRRRRR. Connection failed.')));
    });
  }
  waitForPeer(peer) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Signaling service timed out. Check your internet connection.')), 14000);
      peer.once('open', () => { clearTimeout(timer); resolve(); });
      peer.once('error', error => { clearTimeout(timer); reject(error); });
    });
  }
  installPeerEvents() {
    this.peer.on('error', error => {
      if (this.closing) return;
      if (this.joinFinish) this.joinFinish(new Error('COULD NOT FIND THAT URRRRRRRR. The room may have closed.'));
      else if (!['peer-unavailable', 'unavailable-id'].includes(error.type)) {
        this.emit('warning', 'Signaling connection interrupted. Existing player connections may still work.');
      }
    });
    this.peer.on('disconnected', () => {
      if (!this.closing && !this.peer.destroyed) {
        try { this.peer.reconnect(); } catch { this.emit('warning', 'Could not reconnect to the signaling service.'); }
      }
    });
  }
  attach(connection) {
    if (typeof connection.peer !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(connection.peer)) {
      connection.close(); return;
    }
    if (this.isHost && (this.allConnections.size >= CONFIG.maxPlayers - 1 || connection.label !== 'mayhem-v1')) {
      connection.on('open', () => { this.sendTo(connection, { type: 'REJECT', reason: 'This forest is full (8 players maximum).' }); setTimeout(() => connection.close(), 200); });
      setTimeout(() => connection.close(), 1000); return;
    }
    this.allConnections.add(connection);
    const record = { connection, joined: false, lastRx: performance.now(), tokens: 100, tokenAt: performance.now(), bad: 0 };
    const handshake = this.isHost ? setTimeout(() => { if (!record.joined) connection.close(); }, 10000) : null;
    connection.on('data', data => {
      if (this.closing) return;
      const now = performance.now();
      record.tokens = Math.min(100, record.tokens + (now - record.tokenAt) * 0.08); record.tokenAt = now;
      if ((this.isHost && --record.tokens < 0) || !validateMessage(data, this.isHost)) {
        if (++record.bad > 8) connection.close(); return;
      }
      record.lastRx = now;
      if (!this.isHost) this.lastHostRx = now;
      if (data.type === 'PING') { this.sendTo(connection, { type: 'PONG' }); return; }
      if (data.type === 'PONG') return;
      if (data.type === 'LEAVE') { connection.close(); return; }
      if (this.isHost) {
        if (data.type === 'JOIN' && !record.joined) {
          if (this.connections.has(connection.peer)) { this.reject(connection, 'This player is already connected.'); return; }
          const accepted = this.listeners.get('join')?.({ id: connection.peer, name: cleanName(data.name) });
          if (!accepted) { this.reject(connection, 'Match in progress or room full. Join the next lobby.'); return; }
          record.joined = true; clearTimeout(handshake);
          this.connections.set(connection.peer, record);
          this.sendTo(connection, { type: 'JOIN_ACCEPTED', id: connection.peer, room: this.room });
          this.emit('joined', connection.peer);
        } else if (record.joined && data.type === 'PLAYER_INPUT') this.emit('input', { id: connection.peer, input: data });
      } else {
        if (connection !== this.hostConnection) return;
        if (data.type === 'REJECT') { this.joinFinish?.(new Error(data.reason)); return; }
        if (data.type === 'JOIN_ACCEPTED') {
          if (data.id !== this.id || data.room !== this.room) return;
          record.joined = true; this.joinFinish?.(); return;
        }
        if (record.joined) this.emit('message', data);
      }
    });
    connection.on('close', () => {
      clearTimeout(handshake); this.allConnections.delete(connection);
      if (this.closing) return;
      if (this.isHost) {
        if (this.connections.get(connection.peer)?.connection === connection) {
          this.connections.delete(connection.peer); this.emit('left', connection.peer);
        }
      } else if (connection === this.hostConnection) {
        if (this.joinFinish) this.joinFinish(new Error('COULD NOT FIND THAT URRRRRRRR. The host closed the room.'));
        else this.emit('hostLeft');
      }
    });
    connection.on('error', () => { if (this.isHost) connection.close(); });
  }
  reject(connection, reason) {
    this.sendTo(connection, { type: 'REJECT', reason }); setTimeout(() => connection.close(), 300);
  }
  sendTo(connection, message) {
    if (!connection?.open) return;
    // Do not accumulate stale snapshots on a struggling connection.
    if (message.type === 'PLAYER_STATE' && connection.dataChannel?.bufferedAmount > 64000) return;
    try { connection.send(message); } catch { connection.close(); }
  }
  send(message) { this.sendTo(this.hostConnection, message); }
  broadcast(message) { for (const { connection } of this.connections.values()) this.sendTo(connection, message); }
  startHeartbeat() {
    clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => {
      const now = performance.now();
      if (this.isHost) {
        for (const record of this.connections.values()) {
          if (now - record.lastRx > 18000) record.connection.close();
          else this.sendTo(record.connection, { type: 'PING' });
        }
      } else if (now - this.lastHostRx > 18000) this.emit('hostLeft');
      else this.send({ type: 'PING' });
    }, 3000);
  }
  close() {
    this.closing = true; this.generation++; clearInterval(this.heartbeat);
    this.joinFinish?.(new Error('Joining cancelled.'));
    for (const connection of this.allConnections) connection.close();
    this.allConnections.clear(); this.connections.clear();
    this.peer?.destroy(); this.peer = null; this.hostConnection = null;
  }
}
