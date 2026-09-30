import { clamp } from './config.js';

export function joystickAxes(dx, dy, radius, deadZone = 0.12) {
  if (![dx, dy, radius].every(Number.isFinite) || radius <= 0) return { x: 0, z: 0 };
  const distance = Math.hypot(dx, dy);
  const amount = clamp(distance / radius, 0, 1);
  if (amount <= deadZone) return { x: 0, z: 0 };
  const strength = (amount - deadZone) / (1 - deadZone);
  return { x: dx / distance * strength, z: dy / distance * strength };
}

export class TouchControls {
  constructor(input, ui) {
    this.input = input; this.ui = ui; this.x = 0; this.z = 0; this.sprint = false;
    this.stickPointer = null; this.lookPointer = null; this.buttonPointers = new Map();
    this.stick = document.getElementById('touch-joystick');
    this.knob = document.getElementById('touch-knob');
    this.lookZone = document.getElementById('touch-look-zone');
    this.sprintButton = document.getElementById('touch-sprint');
    this.buttons = [...document.querySelectorAll('[data-touch-action]')];
    this.abort = new AbortController();
    const options = { signal: this.abort.signal, passive: false };

    this.stick.addEventListener('pointerdown', event => {
      if (!this.enabled() || this.stickPointer !== null || event.button !== 0) return;
      event.preventDefault(); this.ui.audio.unlock();
      this.stickPointer = event.pointerId;
      const rect = this.stick.getBoundingClientRect();
      this.center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      this.radius = Math.max(1, (rect.width - this.knob.getBoundingClientRect().width) / 2 - 5);
      this.capture(this.stick, event.pointerId); this.stick.classList.add('held'); this.moveStick(event);
    }, options);
    this.stick.addEventListener('pointermove', event => {
      if (event.pointerId !== this.stickPointer) return;
      event.preventDefault();
      if (!this.enabled()) { this.clear(); return; }
      this.moveStick(event);
    }, options);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.stick.addEventListener(type, event => {
        if (event.pointerId !== this.stickPointer) return;
        this.releaseStick();
      }, options);
    }

    this.lookZone.addEventListener('pointerdown', event => {
      if (!this.enabled() || this.lookPointer !== null || event.button !== 0) return;
      event.preventDefault(); this.ui.audio.unlock();
      this.lookPointer = event.pointerId; this.look = { x: event.clientX, y: event.clientY };
      this.capture(this.lookZone, event.pointerId);
    }, options);
    this.lookZone.addEventListener('pointermove', event => {
      if (event.pointerId !== this.lookPointer) return;
      event.preventDefault();
      if (!this.enabled()) { this.clear(); return; }
      this.input.rotateCamera(event.clientX - this.look.x, event.clientY - this.look.y, 1.4);
      this.look = { x: event.clientX, y: event.clientY };
      this.lookZone.classList.add('used');
    }, options);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.lookZone.addEventListener(type, event => {
        if (event.pointerId !== this.lookPointer) return;
        const pointer = this.lookPointer; this.lookPointer = null; this.release(this.lookZone, pointer);
      }, options);
    }

    for (const button of this.buttons) {
      button.addEventListener('pointerdown', event => {
        if (!this.enabled() || button.disabled || event.button !== 0 || this.buttonPointers.has(button)) return;
        event.preventDefault(); event.stopPropagation();
        this.buttonPointers.set(button, event.pointerId); this.capture(button, event.pointerId);
        button.classList.add('held'); this.activate(button.dataset.touchAction);
      }, options);
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        button.addEventListener(type, event => {
          if (this.buttonPointers.get(button) !== event.pointerId) return;
          this.buttonPointers.delete(button); button.classList.remove('held'); this.release(button, event.pointerId);
        }, options);
      }
      // Keyboard/assistive activation only; a touch's following click must not fire twice.
      button.addEventListener('click', event => {
        if (event.detail === 0 && this.enabled() && !button.disabled) this.activate(button.dataset.touchAction);
      }, options);
    }
  }
  enabled() { return this.ui.touchMode && this.input.enabled(); }
  capture(element, pointer) { try { element.setPointerCapture(pointer); } catch { /* The browser may already have cancelled this contact. */ } }
  release(element, pointer) {
    if (pointer === null) return;
    try { if (element.hasPointerCapture(pointer)) element.releasePointerCapture(pointer); } catch { /* Already released. */ }
  }
  moveStick(event) {
    const dx = event.clientX - this.center.x, dy = event.clientY - this.center.y;
    Object.assign(this, joystickAxes(dx, dy, this.radius));
    const factor = Math.min(1, this.radius / (Math.hypot(dx, dy) || 1));
    this.knob.style.transform = `translate(${dx * factor}px, ${dy * factor}px)`;
  }
  activate(action) {
    this.ui.audio.unlock();
    if (action === 'sprint') {
      this.sprint = !this.sprint;
      this.sprintButton.setAttribute('aria-pressed', String(this.sprint));
    } else this.input.enqueue(action);
  }
  releaseStick() {
    const pointer = this.stickPointer; this.stickPointer = null;
    this.x = 0; this.z = 0; this.knob.style.transform = 'translate(0px, 0px)';
    this.stick.classList.remove('held'); this.release(this.stick, pointer);
  }
  clear() {
    this.releaseStick();
    const pointer = this.lookPointer; this.lookPointer = null; this.release(this.lookZone, pointer);
    for (const [button, pointer] of this.buttonPointers) {
      this.buttonPointers.delete(button); button.classList.remove('held'); this.release(button, pointer);
    }
    this.sprint = false; this.sprintButton.setAttribute('aria-pressed', 'false');
  }
  dispose() { this.clear(); this.abort.abort(); }
}
