import { CONFIG, clamp } from './config.js';
import { SOLIDS, PLATFORMS, PADS, TREES, groundHeight, terrainHeight } from './WorldLayout.js';

export function movePlayer(p, input, dt, now) {
  const oldY = p.y;
  const speed = (input.sprint ? CONFIG.sprint : CONFIG.speed)
    * (p.speedUntil > now ? 1.85 : 1) * (p.urrrUntil > now ? 1.4 : 1);
  const len = Math.max(1, Math.hypot(input.x, input.z));
  const acceleration = p.grounded ? 13 : 3.5;
  const blend = 1 - Math.exp(-acceleration * dt);
  p.vx += (input.x / len * speed - p.vx) * blend;
  p.vz += (input.z / len * speed - p.vz) * blend;
  p.vy -= CONFIG.gravity * dt;
  p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
  p.yaw = input.yaw;
  p.peak = Math.max(p.peak, p.y);

  for (const box of [...SOLIDS, ...PLATFORMS]) {
    if (oldY >= box.y - 0.25 || p.y >= box.y || p.y + CONFIG.playerHeight < -0.2) continue;
    const dx = p.x - box.x, dz = p.z - box.z;
    const overlapX = box.w / 2 + CONFIG.playerRadius - Math.abs(dx);
    const overlapZ = box.d / 2 + CONFIG.playerRadius - Math.abs(dz);
    if (overlapX > 0 && overlapZ > 0) {
      if (overlapX < overlapZ) { p.x += Math.sign(dx || 1) * overlapX; p.vx *= -0.1; }
      else { p.z += Math.sign(dz || 1) * overlapZ; p.vz *= -0.1; }
    }
  }
  for (const tree of TREES) {
    if (p.y > terrainHeight(tree.x, tree.z) + tree.height || p.y < -3) continue;
    const dx = p.x - tree.x, dz = p.z - tree.z;
    const distance = Math.hypot(dx, dz), min = tree.radius + CONFIG.playerRadius;
    if (distance < min) {
      p.x = tree.x + (dx / (distance || 1) || 1) * min;
      p.z = tree.z + dz / (distance || 1) * min;
    }
  }
  const floor = groundHeight(p.x, p.z, Math.max(oldY, p.y));
  let landed = false;
  if (p.y <= floor && p.vy <= 0 && oldY >= floor - 0.6) {
    landed = !p.grounded;
    p.y = floor; p.vy = 0; p.grounded = true;
    const pad = PADS.find(pad => Math.hypot(p.x - pad.x, p.z - pad.z) < 1.6);
    if (pad) { p.vy = 22; p.grounded = false; }
  } else p.grounded = false;
  p.vx = clamp(p.vx, -70, 70); p.vz = clamp(p.vz, -70, 70); p.vy = clamp(p.vy, -65, 65);
  return landed;
}

export function impulse(p, source, radius, power, bounce = false) {
  const dx = p.x - source.x, dz = p.z - source.z;
  const distance = Math.hypot(dx, p.y + 1 - source.y, dz);
  if (distance > radius) return false;
  const strength = power * (0.35 + 0.65 * (1 - distance / radius));
  const length = Math.hypot(dx, dz) || 1;
  p.vx = clamp(p.vx + (dx / length || 0.3) * strength, -70, 70);
  p.vz = clamp(p.vz + (dz / length || 0.3) * strength, -70, 70);
  p.vy = clamp(Math.max(p.vy, strength * (bounce ? 2 : 0.9)), -65, 65);
  p.grounded = false;
  return true;
}
