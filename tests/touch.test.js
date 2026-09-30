import test from 'node:test';
import assert from 'node:assert/strict';
import { InputController } from '../src/InputController.js';
import { joystickAxes } from '../src/TouchControls.js';
import { validateInput } from '../src/Protocol.js';

function fire(element, type, values = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { pointerId: 1, pointerType: 'touch', button: 0, clientX: 63, clientY: 63, ...values });
  element.dispatchEvent(event); return event;
}
class Element extends EventTarget {
  constructor(id, action) {
    super(); this.id = id; this.dataset = action ? { touchAction: action } : {}; this.style = {};
    this.disabled = false; this.pointers = new Set(); this.attributes = new Map();
    const classes = new Set();
    this.classList = { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) };
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.id === 'touch-knob' ? 48 : 126, height: 126 }; }
  setPointerCapture(pointer) { this.pointers.add(pointer); }
  hasPointerCapture(pointer) { return this.pointers.has(pointer); }
  releasePointerCapture(pointer) { this.pointers.delete(pointer); fire(this, 'lostpointercapture', { pointerId: pointer }); }
  setAttribute(key, value) { this.attributes.set(key, value); }
  getAttribute(key) { return this.attributes.get(key); }
}
function controls(t, touchMode = true) {
  const original = { document: globalThis.document, window: globalThis.window };
  const elements = new Map();
  for (const id of ['touch-joystick', 'touch-knob', 'touch-look-zone', 'arena']) elements.set(id, new Element(id));
  for (const [id, action] of [['touch-sprint', 'sprint'], ['touch-jump', 'jump'], ['touch-throw', 'throw'],
    ['touch-collect', 'collect'], ['touch-use', 'use'], ['touch-urrrr', 'urrrr']]) elements.set(id, new Element(id, action));
  const buttons = [...elements.values()].filter(element => element.dataset.touchAction);
  const document = new EventTarget(); document.hidden = false; document.pointerLockElement = null; document.modal = false;
  document.getElementById = id => elements.get(id);
  document.querySelectorAll = () => buttons;
  document.querySelector = () => document.modal ? {} : null;
  const window = new EventTarget();
  globalThis.document = document; globalThis.window = window;
  let captures = 0, pauses = 0, sounds = 0;
  const canvas = elements.get('arena'); canvas.requestPointerLock = () => { captures++; };
  const ui = { screen: 'hud', touchMode, controlsBlocked: false, settings: { sensitivity: 100 },
    audio: { unlock: () => { sounds++; } }, toast() {}, pause: () => { pauses++; document.modal = true; } };
  const input = new InputController(canvas, ui);
  t.after(() => { input.dispose(); globalThis.document = original.document; globalThis.window = original.window; });
  return { input, ui, canvas, document, window, get: id => elements.get(id),
    stats: () => ({ captures, pauses, sounds }) };
}

test('touch joystick has a dead zone, proportional speed, and normalized diagonal limits', () => {
  assert.deepEqual(joystickAxes(1, 1, 40), { x: 0, z: 0 });
  const half = joystickAxes(20, 0, 40); assert.ok(half.x > 0 && half.x < 0.5); assert.equal(half.z, 0);
  const diagonal = joystickAxes(1000, -1000, 40);
  assert.ok(diagonal.x > 0 && diagonal.z < 0); assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z) - 1) < 1e-8);
  assert.deepEqual(joystickAxes(NaN, 0, 40), { x: 0, z: 0 });
  assert.deepEqual(joystickAxes(10, 0, 0), { x: 0, z: 0 });
});
test('two thumbs move and aim independently while a third contact throws real input actions', t => {
  const { input, get, stats } = controls(t);
  fire(get('touch-joystick'), 'pointerdown');
  fire(get('touch-joystick'), 'pointermove', { clientY: -100 });
  fire(get('touch-look-zone'), 'pointerdown', { pointerId: 2, clientX: 200 });
  fire(get('touch-look-zone'), 'pointermove', { pointerId: 2, clientX: 280, clientY: 90 });
  fire(get('touch-throw'), 'pointerdown', { pointerId: 3 });
  const packet = input.packet();
  assert.ok(packet.x > 0); assert.ok(packet.z < 0); assert.ok(packet.yaw < 0); assert.ok(packet.pitch > 0.28);
  assert.deepEqual(packet.actions, ['throw']); assert.ok(validateInput(packet));
  assert.ok(stats().sounds >= 3); assert.equal(stats().captures, 0);
  fire(get('touch-look-zone'), 'pointercancel', { pointerId: 2 });
  assert.equal(input.touch.lookPointer, null); assert.ok(input.packet().z < 0);
  fire(get('touch-joystick'), 'pointerup'); assert.equal(input.packet().z, 0);
});
test('joystick keeps its owning pointer, and cancellation or capture loss stops movement', t => {
  const { input, get } = controls(t); const stick = get('touch-joystick');
  fire(stick, 'pointerdown'); fire(stick, 'pointermove', { clientX: 300 });
  fire(stick, 'pointerdown', { pointerId: 2, clientX: -100 });
  fire(stick, 'pointerup', { pointerId: 2 }); assert.ok(input.packet().x > 0);
  fire(stick, 'pointercancel'); assert.equal(input.packet().x, 0); assert.equal(stick.pointers.size, 0);
  fire(stick, 'pointerdown'); fire(stick, 'pointermove', { clientX: 300 });
  stick.releasePointerCapture(1); assert.equal(input.packet().x, 0);
});
test('touch buttons queue each gameplay action once and ignore compatibility clicks and disabled controls', t => {
  const { input, get } = controls(t);
  for (const id of ['touch-jump', 'touch-throw', 'touch-collect', 'touch-use', 'touch-urrrr']) {
    const button = get(id); fire(button, 'pointerdown'); fire(button, 'pointerup'); fire(button, 'click', { detail: 1 });
  }
  assert.deepEqual(input.packet().actions, ['jump', 'throw', 'collect', 'use', 'urrrr']);
  assert.deepEqual(input.packet().actions, []);
  const jump = get('touch-jump'); jump.disabled = true; fire(jump, 'pointerdown'); assert.deepEqual(input.packet().actions, []);
  jump.disabled = false; fire(jump, 'click', { detail: 0 }); assert.deepEqual(input.packet().actions, ['jump']);
});
test('RUN toggles sprint and clears along with contacts when the game loses focus', t => {
  const { input, get, window } = controls(t); const run = get('touch-sprint');
  fire(run, 'pointerdown'); fire(run, 'pointerup'); assert.ok(input.packet().sprint); assert.equal(run.getAttribute('aria-pressed'), 'true');
  fire(run, 'pointerdown'); fire(run, 'pointerup'); assert.equal(input.packet().sprint, false);
  fire(run, 'pointerdown'); fire(get('touch-joystick'), 'pointerdown', { pointerId: 2, clientY: -100 });
  fire(window, 'blur'); const packet = input.packet();
  assert.equal(packet.sprint, false); assert.equal(packet.z, 0); assert.equal(input.touch.stickPointer, null);
  assert.equal(run.getAttribute('aria-pressed'), 'false'); assert.equal(input.touch.buttonPointers.size, 0);
});
test('pause, respawn blocking, screen changes, rotation, and hidden pages do not retain held inputs', t => {
  const { input, get, ui, document, window } = controls(t); const stick = get('touch-joystick');
  const move = () => { fire(stick, 'pointerdown'); fire(stick, 'pointermove', { clientY: -100 }); };
  move(); document.modal = true; assert.equal(input.packet().z, 0); document.modal = false;
  assert.equal(input.packet().z, 0); move(); ui.controlsBlocked = true; assert.equal(input.packet().z, 0);
  ui.controlsBlocked = false; move(); ui.screen = 'results'; assert.equal(input.packet().z, 0);
  ui.screen = 'hud'; move(); fire(window, 'resize'); assert.equal(input.packet().z, 0);
  move(); document.hidden = true; fire(document, 'visibilitychange'); assert.equal(input.touch.stickPointer, null);
  assert.equal(input.packet().z, 0);
});
test('touch camera clamps extreme swipes and does not request pointer lock', t => {
  const { input, get, stats } = controls(t); input.capture(); assert.equal(stats().captures, 0);
  fire(get('touch-look-zone'), 'pointerdown');
  fire(get('touch-look-zone'), 'pointermove', { clientX: 100000, clientY: 100000 });
  const packet = input.packet(); assert.ok(validateInput(packet)); assert.equal(packet.pitch, 1.05);
  fire(get('touch-look-zone'), 'pointermove', { clientX: -100000, clientY: -100000 }); assert.equal(input.packet().pitch, -0.4);
});
test('desktop movement, mouse aiming, and throwing still require pointer lock', t => {
  const { input, ui, canvas, document, window, stats } = controls(t, false);
  fire(window, 'keydown', { code: 'KeyW' }); assert.equal(input.packet().z, 0);
  input.capture(); assert.equal(stats().captures, 1); document.pointerLockElement = canvas;
  fire(window, 'keydown', { code: 'KeyW' }); fire(window, 'keydown', { code: 'ShiftLeft' });
  fire(window, 'keydown', { code: 'Space', repeat: false }); fire(canvas, 'mousedown');
  fire(document, 'mousemove', { movementX: 50, movementY: 20 });
  const packet = input.packet(); assert.ok(packet.z < 0); assert.ok(packet.sprint); assert.ok(packet.yaw < 0);
  assert.deepEqual(packet.actions, ['jump', 'throw']); assert.ok(validateInput(packet));
  ui.touchMode = true; fire(canvas, 'mousedown'); assert.deepEqual(input.packet().actions, []);
});
