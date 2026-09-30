import { clamp } from './config.js';

export function addChaos(p, amount) { p.meter = clamp(p.meter + amount, 0, 100); }
export function activateUrrrr(p, now) {
  if (p.meter < 100 || p.urrrUntil > now) return false;
  p.meter = 0; p.urrrUntil = now + 10; p.regenAt = now;
  p.stats.urrr += 1;
  return true;
}
