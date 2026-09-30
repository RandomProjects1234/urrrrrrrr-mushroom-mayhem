import { clamp } from './config.js';
import { TouchControls } from './TouchControls.js';

const KEY_ACTIONS = { Space: 'jump', KeyE: 'collect', KeyQ: 'use', KeyR: 'urrrr' };
export class InputController {
  constructor(canvas, ui) {
    this.canvas = canvas; this.ui = ui; this.keys = new Set(); this.actions = []; this.yaw = 0; this.pitch = 0.28; this.seq = 0;
    this.touch = new TouchControls(this, ui);
    this.abort = new AbortController(); const options = { signal: this.abort.signal };
    window.addEventListener('keydown', event => {
      if (event.code === 'Escape') { this.clear(); if (ui.touchMode) ui.pause(); return; }
      if (!this.enabled()) return;
      if (ui.touchMode && event.target?.closest?.('[data-touch-action]')) return;
      if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) event.preventDefault();
      this.keys.add(event.code);
      if (!event.repeat && KEY_ACTIONS[event.code]) this.enqueue(KEY_ACTIONS[event.code]);
    }, options);
    window.addEventListener('keyup', event => this.keys.delete(event.code), options);
    window.addEventListener('blur', () => this.clear(), options);
    window.addEventListener('resize', () => this.clear(), options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); }, options);
    document.addEventListener('mousemove', event => {
      if (!this.enabled() || ui.touchMode) return;
      this.rotateCamera(event.movementX, event.movementY);
    }, options);
    canvas.addEventListener('mousedown', event => { if (event.button === 0 && !ui.touchMode && this.enabled()) this.enqueue('throw'); }, options);
    canvas.addEventListener('click', () => { if (!ui.touchMode && ui.screen === 'hud' && !document.pointerLockElement) this.capture(); }, options);
    canvas.addEventListener('contextmenu', event => event.preventDefault(), options);
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && !ui.touchMode) { this.clear(); if (ui.screen === 'hud') ui.pause(); }
    }, options);
    document.addEventListener('pointerlockerror', () => ui.toast('Mouse capture was blocked. Click the forest again or check browser permissions.', true), options);
  }
  enabled() {
    return this.ui.screen === 'hud' && !this.ui.controlsBlocked && !document.querySelector('dialog[open]')
      && (this.ui.touchMode || document.pointerLockElement === this.canvas);
  }
  rotateCamera(dx, dy, multiplier = 1) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const factor = 0.0023 * this.ui.settings.sensitivity / 100 * multiplier;
    this.yaw = Math.atan2(Math.sin(this.yaw - dx * factor), Math.cos(this.yaw - dx * factor));
    this.pitch = clamp(this.pitch + dy * factor, -0.4, 1.05);
  }
  enqueue(action) { if (this.actions.length < 6) this.actions.push(action); }
  clear() { this.keys.clear(); this.actions = []; this.touch.clear(); }
  capture() {
    if (this.ui.screen !== 'hud' || document.querySelector('dialog[open]')) return;
    this.ui.audio.unlock();
    if (this.ui.touchMode) return;
    try { this.canvas.requestPointerLock()?.catch(() => this.ui.toast('Click the forest to capture your mouse.', true)); }
    catch { this.ui.toast('Mouse capture is unavailable in this browser.', true); }
  }
  packet() {
    const active = this.enabled();
    if (!active) this.clear();
    const side = !active ? 0 : this.ui.touchMode ? this.touch.x : Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
    const forward = !active ? 0 : this.ui.touchMode ? this.touch.z : Number(this.keys.has('KeyS')) - Number(this.keys.has('KeyW'));
    const length = Math.max(1, Math.hypot(side, forward));
    return { type: 'PLAYER_INPUT', seq: ++this.seq,
      x: clamp((side * Math.cos(this.yaw) + forward * Math.sin(this.yaw)) / length, -1, 1),
      z: clamp((-side * Math.sin(this.yaw) + forward * Math.cos(this.yaw)) / length, -1, 1),
      yaw: this.yaw, pitch: this.pitch, sprint: active && (this.ui.touchMode ? this.touch.sprint : this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')),
      actions: active ? this.actions.splice(0, 6) : [] };
  }
  dispose() { this.clear(); this.touch.dispose(); this.abort.abort(); }
}
