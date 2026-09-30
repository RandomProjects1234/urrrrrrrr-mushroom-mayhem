import '../styles/style.css';
import { Game } from './Game.js';
import { UI } from './UI.js';
import { AudioManager } from './AudioManager.js';

const audio = new AudioManager();
const ui = new UI(audio);
try {
  new Game(ui, audio);
} catch (error) {
  const message = document.createElement('div'); message.className = 'webgl-error';
  message.textContent = `The forest could not start. Try a modern browser with WebGL 2 and hardware acceleration enabled. ${error.message}`;
  document.body.append(message);
  console.error(error);
}
