import { clamp } from './config.js';

const KEY_ACTIONS = { Space: 'jump', KeyE: 'collect', KeyQ: 'use', KeyR: 'urrrr' };
export class InputController {
  constructor(canvas, ui) {
    this.canvas = canvas; this.ui = ui; this.keys = new Set(); this.actions = []; this.yaw = 0; this.pitch = 0.28; this.seq = 0;
    this.abort = new AbortController(); const options = { signal: this.abort.signal };
    window.addEventListener('keydown', event => {
      if (event.code === 'Escape') { this.clear(); return; }
      if (!this.enabled()) return;
      if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) event.preventDefault();
      this.keys.add(event.code);
      if (!event.repeat && KEY_ACTIONS[event.code]) this.enqueue(KEY_ACTIONS[event.code]);
    }, options);
    window.addEventListener('keyup', event => this.keys.delete(event.code), options);
    window.addEventListener('blur', () => this.clear(), options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); }, options);
    document.addEventListener('mousemove', event => {
      if (!this.enabled()) return;
      const factor = 0.0023 * this.ui.settings.sensitivity / 100;
      this.yaw -= event.movementX * factor;
      this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));
      this.pitch = clamp(this.pitch + event.movementY * factor, -0.4, 1.05);
    }, options);
    canvas.addEventListener('mousedown', event => { if (event.button === 0 && this.enabled()) this.enqueue('throw'); }, options);
    canvas.addEventListener('click', () => { if (ui.screen === 'hud' && !document.pointerLockElement) this.capture(); }, options);
    canvas.addEventListener('contextmenu', event => event.preventDefault(), options);
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement) { this.clear(); if (ui.screen === 'hud') ui.pause(); }
    }, options);
    document.addEventListener('pointerlockerror', () => ui.toast('Mouse capture was blocked. Click the forest again or check browser permissions.', true), options);
  }
  enabled() { return this.ui.screen === 'hud' && document.pointerLockElement === this.canvas && !document.querySelector('dialog[open]'); }
  enqueue(action) { if (this.actions.length < 6) this.actions.push(action); }
  clear() { this.keys.clear(); this.actions = []; }
  capture() {
    if (this.ui.screen !== 'hud' || document.querySelector('dialog[open]')) return;
    this.ui.audio.unlock();
    try { this.canvas.requestPointerLock()?.catch(() => this.ui.toast('Click the forest to capture your mouse.', true)); }
    catch { this.ui.toast('Mouse capture is unavailable in this browser.', true); }
  }
  packet() {
    const active = this.enabled();
    const side = active ? Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA')) : 0;
    const forward = active ? Number(this.keys.has('KeyS')) - Number(this.keys.has('KeyW')) : 0;
    const length = Math.max(1, Math.hypot(side, forward));
    return { type: 'PLAYER_INPUT', seq: ++this.seq,
      x: clamp((side * Math.cos(this.yaw) + forward * Math.sin(this.yaw)) / length, -1, 1),
      z: clamp((-side * Math.sin(this.yaw) + forward * Math.cos(this.yaw)) / length, -1, 1),
      yaw: this.yaw, pitch: this.pitch, sprint: active && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')),
      actions: active ? this.actions.splice(0, 6) : [] };
  }
  dispose() { this.abort.abort(); this.clear(); }
}
