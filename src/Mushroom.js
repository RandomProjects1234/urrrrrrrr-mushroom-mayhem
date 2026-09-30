import { MUSHROOMS } from './config.js';
import { addChaos } from './UrrrrMode.js';

export function useMushroom(p, sim) {
  if (!p.held) return;
  let type = p.held; p.held = null;
  if (type === 'mystery') {
    const types = Object.keys(MUSHROOMS).filter(key => key !== 'mystery');
    type = types[Math.floor(sim.random() * types.length)];
  }
  if (type === 'giant' || type === 'bounce') p.nextBlast = type;
  if (type === 'speed') p.speedUntil = sim.time + 8;
  if (type === 'urrrr') addChaos(p, 55);
  if (type === 'mushroom') {
    for (let i = 0; i < 10; i++) {
      const angle = i / 10 * Math.PI * 2;
      sim.spawnPickup('mushroom', p.x + Math.cos(angle) * 4, p.z + Math.sin(angle) * 4,
        p.y + 4, ['giant', 'bounce', 'speed', 'urrrr'][i % 4]);
    }
  }
  p.score += 30; addChaos(p, 8);
  sim.emit('MUSHROOM_USE', { player: p.id, kind: type, x: p.x, y: p.y + 1, z: p.z });
}
