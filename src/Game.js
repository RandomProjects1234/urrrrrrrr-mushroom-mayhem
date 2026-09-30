import * as THREE from 'three';
import { CONFIG } from './config.js';
import { terrainHeight } from './WorldLayout.js';
import { Assets } from './Assets.js';
import { World } from './World.js';
import { Player } from './Player.js';
import { RemotePlayer } from './RemotePlayer.js';
import { Effects } from './Effects.js';
import { Simulation } from './Simulation.js';
import { NetworkManager } from './NetworkManager.js';
import { InputController } from './InputController.js';

export class Game {
  constructor(ui, audio) {
    this.ui = ui; this.audio = audio; this.canvas = document.getElementById('arena');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0xc0aeb7);
    this.scene.fog = new THREE.Fog(0xc0aeb7, 48, 115);
    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 180);
    this.scene.add(new THREE.HemisphereLight(0xfff3d4, 0x746181, 2.3));
    const sun = new THREE.DirectionalLight(0xffe5be, 2.5); sun.position.set(-16, 40, 25);
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 100 });
    sun.shadow.bias = -0.0008; this.sun = sun; this.scene.add(sun);
    this.assets = new Assets(); this.world = new World(this.scene, this.assets); this.effects = new Effects(this.scene, this.assets);
    this.network = new NetworkManager(); this.input = new InputController(this.canvas, ui);
    this.characters = new Map(); this.state = null; this.sim = null; this.localId = null; this.practice = false;
    this.clockOffset = 0; this.stateSeq = -1; this.eventSeq = -1; this.shake = 0; this.hudAt = 0;
    this.menuPlayer = new Player(this.assets, { name: 'THRIFTED. OBVIOUSLY.', color: 0xc4ec8c, x: 9, y: terrainHeight(9, 18), z: 18 }, true);
    this.menuPlayer.root.scale.setScalar(2.25); this.scene.add(this.menuPlayer.root);
    this.menuPlayer.boots.forEach(boot => boot.scale.setScalar(1.4));
    this.cameraTarget = new THREE.Vector3(); this.followPosition = new THREE.Vector3(); this.followReady = false;
    this.bind(); this.applySettings(ui.settings);
    this.lastFrame = performance.now(); this.lastTick = this.lastFrame; this.lastNetwork = 0; this.lastWorld = 0; this.accumulator = 0;
    this.tickTimer = setInterval(() => this.tick(), 1000 / CONFIG.simHz);
    this.animation = requestAnimationFrame(time => this.render(time));
  }
  bind() {
    this.ui.on('host', name => this.createRoom(name));
    this.ui.on('join', data => this.joinRoom(data));
    this.ui.on('practice', name => this.createPractice(name));
    this.ui.on('start', () => this.start());
    this.ui.on('leave', () => this.leave());
    this.ui.on('capture', () => this.input.capture());
    this.ui.on('release', () => this.input.clear());
    this.ui.on('settings', settings => this.applySettings(settings));
    this.network.on('join', ({ id, name }) => this.sim?.addPlayer(id, name));
    this.network.on('joined', () => this.broadcastLobby());
    this.network.on('input', ({ id, input }) => this.sim?.acceptInput(id, input));
    this.network.on('left', id => {
      const name = this.sim?.players.get(id)?.name;
      this.sim?.removePlayer(id);
      if (this.sim?.phase === 'lobby') this.broadcastLobby();
      else if (this.sim) { const state = this.sim.snapshot(); this.applyState(state); this.network.broadcast(state); }
      if (name) this.ui.toast(`${name} left the forest.`);
    });
    this.network.on('hostLeft', () => { this.leave(); this.ui.toast('HOST LEFT THE GAME', true); });
    this.network.on('warning', message => this.ui.toast(message, true));
    this.network.on('message', message => this.receive(message));
    this.resizeHandler = () => this.resize(); window.addEventListener('resize', this.resizeHandler);
    this.unloadHandler = () => this.network.close(); window.addEventListener('pagehide', this.unloadHandler);
    this.canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault(); this.ui.toast('Graphics context lost. Reload this page to restore the forest.', true);
    });
  }
  createSim() {
    this.sim = new Simulation({ onEvent: event => { this.network.broadcast(event); this.receive(event); } });
  }
  async createRoom(name) {
    this.ui.busy(true);
    try {
      const { id } = await this.network.host(name);
      this.practice = false; this.localId = id; this.hostId = id; this.createSim(); this.sim.addPlayer(id, name);
      this.broadcastLobby();
    } catch (error) { this.network.close(); this.ui.toast(`Could not host: ${error.message}`, true); }
    finally { this.ui.busy(false); }
  }
  async joinRoom({ name, room }) {
    this.ui.busy(true, true);
    try {
      this.practice = false; this.sim = null; this.localId = null;
      await this.network.join(name, room);
      this.localId = this.network.id; this.hostId = this.network.hostConnection.peer;
      // LOBBY_STATE can arrive before the awaited join promise resumes.
      if (this.lobbyState) this.updateLobby(this.lobbyState);
    } catch (error) { this.network.close(); this.ui.toast(error.message, true); }
    finally { this.ui.busy(false, true); }
  }
  createPractice(name) {
    this.network.close(); this.network.isHost = true;
    this.practice = true; this.localId = 'practice-host'; this.hostId = this.localId;
    this.createSim(); this.sim.addPlayer(this.localId, name); this.broadcastLobby();
  }
  broadcastLobby() {
    if (!this.sim) return;
    const message = { type: 'LOBBY_STATE', players: [...this.sim.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color })) };
    this.network.broadcast(message); this.updateLobby(message);
  }
  updateLobby(message) {
    this.lobbyState = message;
    this.localId ||= this.network.id; this.hostId ||= this.network.hostConnection?.peer;
    this.ui.lobby(message.players, this.network.room, this.network.isHost, this.localId, this.hostId, this.practice);
  }
  start() {
    if (!this.network.isHost || !this.sim || !this.sim.start()) return;
    const world = this.sim.worldState(), state = this.sim.snapshot();
    this.network.broadcast(world); this.receive(world); this.network.broadcast(state); this.applyState(state);
  }
  receive(message) {
    if (message.type === 'LOBBY_STATE') { this.updateLobby(message); return; }
    if (message.type === 'PLAYER_STATE') { this.applyState(message); return; }
    if (message.type === 'WORLD_STATE') { this.world.setItems(message.items); return; }
    if (message.event <= this.eventSeq) return;
    this.eventSeq = message.event;
    const local = message.player === this.localId;
    const name = this.state?.players.find(p => p.id === message.player)?.name || 'Someone';
    const player = this.state?.players.find(p => p.id === this.localId);
    const distance = player && Number.isFinite(message.x) ? Math.hypot(player.x - message.x, player.z - message.z) : 0;
    const volume = Math.max(0, 1 - distance / 45);
    switch (message.type) {
      case 'MATCH_START':
        this.clearCharacters(); this.effects.clear(); this.world.clearDynamic(); this.state = null;
        this.menuPlayer.root.visible = false; this.followReady = false; this.input.clear();
        this.ui.show('hud'); this.ui.feed(this.ui.touchMode ? 'MOVE with the left stick. SWIPE right to aim. JUMP twice to stomp.'
          : 'THE MAYHEM HAS BEGUN. E collects. Q consumes. Space twice stomps.');
        break;
      case 'MATCH_END': this.input.clear(); this.ui.results(message.results, this.network.isHost); this.audio.play('end'); break;
      case 'PICKUP_ADD': this.world.createItem(message.item); break;
      case 'PICKUP_REMOVE': {
        const item = this.world.items.get(message.id); item?.root.removeFromParent(); this.world.items.delete(message.id); break;
      }
      case 'PICKUP_BOUNCE': {
        const item = this.world.items.get(message.id); if (item) { item.vy = message.vy; item.y = message.y; } break;
      }
      case 'TNT_EXPLODE': case 'BOOT_STOMP':
        this.effects.explosion(message, message.type === 'BOOT_STOMP');
        this.audio.play(message.type === 'BOOT_STOMP' ? 'stomp' : 'explosion', volume);
        this.shake = Math.min(1, this.shake + volume * 0.45); break;
      case 'MUSHROOM_PICKUP': case 'MUSHROOM_USE':
        this.effects.burst(message.x, message.y + 1, message.z, 0xc5f88c, 15, 6);
        this.audio.play('pickup', local ? 1 : volume * 0.4); break;
      case 'URRRR_ACTIVATE':
        this.ui.feed(`${name} HAS LOST ALL COMMON SENSE. URRRR MODE!`);
        this.audio.play('urrrr', volume); this.effects.burst(message.x, message.y + 1, message.z, 0xff9fb7, 45, 12);
        if (local) this.ui.urrrBanner(); break;
      case 'JUMP': if (local) this.audio.play('jump'); break;
      case 'PLAYER_LAUNCH': if (local) this.audio.play('launch'); break;
      case 'PLAYER_DAMAGE': if (local) this.shake = Math.min(1, this.shake + 0.25); break;
      case 'ELIMINATION': {
        if (local) this.input.clear();
        const killer = this.state?.players.find(p => p.id === message.killer)?.name;
        this.ui.feed(killer ? `${killer} yeeted ${name}. ${message.cause}.` : `${name} had a disagreement with ${message.cause}.`); break;
      }
      case 'PLAYER_RESPAWN': if (local) { this.followReady = false; this.ui.feed('FRESH BOOTS. SAME BAD DECISIONS.'); } break;
    }
  }
  applyState(state) {
    if (state.seq <= this.stateSeq) return;
    this.stateSeq = state.seq; this.state = state;
    this.clockOffset = state.time - performance.now() / 1000;
    const ids = new Set(state.players.map(p => p.id));
    for (const [id, character] of this.characters) if (!ids.has(id)) { character.visual.dispose(); this.characters.delete(id); }
    for (const p of state.players) {
      if (!this.characters.has(p.id)) {
        const visual = new Player(this.assets, p, p.id === this.localId); this.scene.add(visual.root);
        this.characters.set(p.id, { visual, buffer: new RemotePlayer() });
      }
      this.characters.get(p.id).buffer.push(p, state.time);
    }
  }
  tick() {
    const now = performance.now(), elapsed = (now - this.lastTick) / 1000; this.lastTick = now;
    if (this.sim) {
      this.accumulator += elapsed;
      let steps = 0;
      while (this.accumulator >= 1 / CONFIG.simHz && steps++ < 8) {
        this.sim.step(1 / CONFIG.simHz); this.accumulator -= 1 / CONFIG.simHz;
      }
      // Keep the five-minute clock honest even if the host's browser throttles a hidden tab.
      if (this.accumulator > 0.2) { this.sim.time += this.accumulator; this.accumulator = 0; }
    } else this.accumulator = 0;
    if (now - this.lastNetwork >= 1000 / CONFIG.networkHz) {
      this.lastNetwork = now;
      if (this.ui.screen === 'hud') {
        const input = this.input.packet();
        if (this.sim) this.sim.acceptInput(this.localId, input); else this.network.send(input);
      }
      if (this.sim && this.sim.phase !== 'lobby' && (this.sim.phase === 'playing' || this.state?.phase !== this.sim.phase)) {
        const state = this.sim.snapshot(); this.applyState(state); this.network.broadcast(state);
      }
    }
    if (this.sim?.phase === 'playing' && now - this.lastWorld > 8000) {
      this.lastWorld = now; this.network.broadcast(this.sim.worldState());
    }
  }
  render(now) {
    const dt = Math.min((now - this.lastFrame) / 1000, 0.05); this.lastFrame = now;
    const time = this.sim ? this.sim.time : now / 1000 + this.clockOffset;
    const playing = this.ui.screen === 'hud';
    this.menuPlayer.root.visible = this.ui.screen === 'menu';
    let local;
    for (const [id, character] of this.characters) {
      const state = this.sim ? this.sim.players.get(id) : character.buffer.sample(time, id === this.localId);
      if (!state) continue;
      const renderState = id === this.localId && playing ? { ...state, yaw: this.input.yaw } : state;
      character.visual.update(renderState, dt, time);
      character.visual.root.visible &&= playing;
      if (id === this.localId) local = state;
    }
    this.world.update(dt, time, this.sim?.phase === 'playing' ? [...this.sim.pickups.values()] : null);
    this.world.updateTNT(this.state?.tnt || [], time, dt); this.effects.update(dt);
    if (playing && local) {
      this.cameraTarget.set(local.x, Math.max(local.y, -4) + 1.5, local.z);
      if (!this.followReady) { this.followPosition.copy(this.cameraTarget); this.followReady = true; }
      this.followPosition.lerp(this.cameraTarget, 1 - Math.exp(-dt * 12));
      const distance = 7.3;
      const offset = new THREE.Vector3(Math.sin(this.input.yaw) * Math.cos(this.input.pitch) * distance,
        Math.sin(this.input.pitch) * distance + 1.8, Math.cos(this.input.yaw) * Math.cos(this.input.pitch) * distance);
      this.camera.position.copy(this.followPosition).add(offset);
      this.camera.position.y = Math.max(this.camera.position.y, terrainHeight(this.camera.position.x, this.camera.position.z) + 0.6);
      // Shorten camera when a solid building/platform occludes the player.
      const direction = offset.clone().normalize();
      const ray = new THREE.Raycaster(this.followPosition, direction, 0.4, offset.length());
      const hits = ray.intersectObject(this.world.root, true);
      if (hits[0]) this.camera.position.copy(this.followPosition).addScaledVector(direction, Math.max(1.2, hits[0].distance - 0.35));
      if (!this.ui.settings.reduceMotion) {
        const amount = this.shake + (local.urrrUntil > time ? 0.04 : 0);
        this.camera.position.x += (Math.random() - 0.5) * amount;
        this.camera.position.y += (Math.random() - 0.5) * amount;
      }
      this.camera.lookAt(this.followPosition);
      if (local.urrrUntil > time && Math.random() < dt * 18) this.effects.burst(local.x, local.y + 1, local.z, 0xc9f899, 2, 4);
    } else {
      this.camera.position.set(26 + Math.sin(now * 0.00013) * 2, 12, 34);
      this.camera.lookAt(6, 4, 9);
      if (this.menuPlayer.root.visible) {
        this.menuPlayer.body.rotation.y = -0.65 + Math.sin(now * 0.0004) * 0.12;
        this.menuPlayer.body.position.y = Math.sin(now * 0.0018) * 0.045;
      }
    }
    this.shake *= Math.exp(-dt * 5);
    if (playing && this.state && now - this.hudAt > 100) {
      this.hudAt = now;
      const nearby = local && [...this.world.items.values()].filter(item => item.kind !== 'barrel'
        && Math.hypot(item.x - local.x, item.y - local.y - 1, item.z - local.z) < 2.6
        && (item.kind !== 'ammo' || local.tnt < 10) && (item.kind !== 'mushroom' || !local.held))
        .sort((a, b) => Math.hypot(a.x - local.x, a.z - local.z) - Math.hypot(b.x - local.x, b.z - local.z))[0];
      this.ui.updateHUD({ ...this.state, remaining: Math.max(0, this.state.remaining - Math.max(0, time - this.state.time)) }, this.localId, time, nearby);
    }
    this.renderer.render(this.scene, this.camera);
    this.animation = requestAnimationFrame(next => this.render(next));
  }
  applySettings(settings) {
    this.renderer.shadowMap.enabled = settings.quality === 'high';
    this.resize();
  }
  resize() {
    this.renderer.setPixelRatio(this.ui.settings.quality === 'low' ? 0.8 : Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight); this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
  }
  clearCharacters() { for (const { visual } of this.characters.values()) visual.dispose(); this.characters.clear(); }
  leave() {
    this.network.close(); this.sim = null; this.state = null; this.localId = null; this.hostId = null; this.lobbyState = null;
    this.stateSeq = -1; this.eventSeq = -1; this.clockOffset = 0; this.practice = false;
    this.clearCharacters(); this.world.clearDynamic(); this.effects.clear(); this.input.clear();
    this.ui.show('menu');
  }
  dispose() {
    this.leave(); clearInterval(this.tickTimer); cancelAnimationFrame(this.animation);
    window.removeEventListener('resize', this.resizeHandler); window.removeEventListener('pagehide', this.unloadHandler);
    this.input.dispose(); this.menuPlayer.dispose(); this.effects.dispose(); this.world.dispose();
    this.sun.shadow.dispose(); this.assets.dispose(); this.renderer.dispose(); this.audio.dispose();
  }
}
