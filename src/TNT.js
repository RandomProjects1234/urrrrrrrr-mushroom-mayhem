import { groundHeight } from './WorldLayout.js';

export function createTNT(id, p, now) {
  const direction = { x: -Math.sin(p.input.yaw), z: -Math.cos(p.input.yaw) };
  const boost = p.nextBlast; p.nextBlast = null;
  return { id, x: p.x + direction.x * 1.2, y: p.y + 1.7, z: p.z + direction.z * 1.2,
    vx: direction.x * 16 + p.vx * 0.4, vy: 8 - p.input.pitch * 7,
    vz: direction.z * 16 + p.vz * 0.4, fuse: now + 2.1, owner: p.id,
    giant: boost === 'giant' || p.urrrUntil > now, bounce: boost === 'bounce', chain: 0 };
}
export function stepTNT(tnt, dt) {
  tnt.vy -= 22 * dt;
  tnt.x += tnt.vx * dt; tnt.y += tnt.vy * dt; tnt.z += tnt.vz * dt;
  const ground = groundHeight(tnt.x, tnt.z, tnt.y + 0.5) + 0.28;
  if (tnt.y < ground) {
    tnt.y = ground; tnt.vy = Math.abs(tnt.vy) * 0.3;
    tnt.vx *= 0.93; tnt.vz *= 0.93;
  }
}
