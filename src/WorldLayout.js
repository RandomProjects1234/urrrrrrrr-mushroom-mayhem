import { CONFIG } from './config.js';

// Shared by rendering and the authoritative physics. Coordinates are player feet.
export const PLATFORMS = [
  { x: -13, z: -8, w: 9, d: 7, y: 3.2, type: 'wood' },
  { x: 12, z: 7, w: 8, d: 8, y: 4.4, type: 'stone' },
  { x: 0, z: -16, w: 18, d: 3, y: 3.2, type: 'bridge' },
];
export const RAMPS = [
  { x: -13, z: -1, w: 5, d: 7, y: 3.2 },
  { x: 12, z: 15, w: 5, d: 8, y: 4.4 },
  { x: -7, z: -11, w: 4, d: 5, y: 3.2 },
  { x: 7, z: -11, w: 4, d: 5, y: 3.2 },
];
export const SOLIDS = [
  { x: -23, z: 4, w: 7, d: 7, y: 5.4, type: 'thrift' },
  { x: 20, z: -15, w: 6, d: 6, y: 4.2, type: 'shack' },
  { x: -4, z: 22, w: 5, d: 5, y: 5, type: 'house' },
  { x: 24, z: 0, w: 4, d: 7, y: 5, type: 'boot' },
];
export const PADS = [{ x: 1, z: 10 }, { x: -19, z: -15 }, { x: 17, z: 20 }];
export const SPAWNS = [{ x: 0, z: 0 }, { x: 7, z: 0 }, { x: -7, z: 0 }, { x: 0, z: 7 },
  { x: 0, z: -7 }, { x: 9, z: -6 }, { x: -9, z: 8 }, { x: 5, z: 17 }];
export const TREES = Array.from({ length: 22 }, (_, i) => {
  const angle = i * 2.39996;
  const radius = 20 + (i % 4) * 3;
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius,
    height: 5 + i % 5, radius: 0.5 + (i % 3) * 0.17 };
}).filter(tree => !SOLIDS.some(p => Math.abs(tree.x - p.x) < p.w / 2 + 3 && Math.abs(tree.z - p.z) < p.d / 2 + 3));

export function terrainHeight(x, z) {
  if (Math.hypot(x, z) > CONFIG.radius) return -Infinity;
  return 0.32 * Math.sin(x * 0.19) * Math.sin(z * 0.23)
    + 1.45 * Math.exp(-((x + 18) ** 2 + (z - 16) ** 2) / 65)
    + 1.15 * Math.exp(-((x - 17) ** 2 + (z + 22) ** 2) / 70);
}
export function rampHeight(ramp, x, z) {
  if (Math.abs(x - ramp.x) > ramp.w / 2 || Math.abs(z - ramp.z) > ramp.d / 2) return -Infinity;
  return ramp.y * (1 - (z - ramp.z + ramp.d / 2) / ramp.d);
}
export function groundHeight(x, z, feetY = Infinity) {
  let height = terrainHeight(x, z);
  for (const ramp of RAMPS) height = Math.max(height, rampHeight(ramp, x, z));
  for (const p of [...PLATFORMS, ...SOLIDS]) {
    if (Math.abs(x - p.x) < p.w / 2 && Math.abs(z - p.z) < p.d / 2 && feetY >= p.y - 0.28) {
      height = Math.max(height, p.y);
    }
  }
  return height;
}
export function validPickupPoint(x, z) {
  return Math.hypot(x, z) < CONFIG.radius - 3 && !SOLIDS.some(p =>
    Math.abs(x - p.x) < p.w / 2 + 1 && Math.abs(z - p.z) < p.d / 2 + 1);
}
