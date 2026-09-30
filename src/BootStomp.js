import { clamp } from './config.js';

export function stompStrength(p, now) {
  const fall = clamp(p.peak - p.y, 0, 24);
  const powered = p.urrrUntil > now;
  return { radius: 3.5 + fall * 0.24 + (powered ? 3 : 0), power: 12 + fall * 1.1 + (powered ? 12 : 0) };
}
