export const CONFIG = Object.freeze({
  maxPlayers: 8, simHz: 60, networkHz: 20, roundSeconds: 300,
  radius: 34, gravity: 27, speed: 8, sprint: 12, jump: 11,
  playerRadius: 0.65, playerHeight: 2.25, maxTNT: 32,
  maxMushrooms: 60, maxParticles: 280, respawnSeconds: 3,
  inputTimeout: 0.6, invulnerability: 2.5,
});
export const COLORS = [0xb8f46c, 0xff6a6a, 0x74dfff, 0xc797ff, 0xffcd63, 0xff8fc4, 0x5ff0bc, 0xe7eeff];
export const MUSHROOMS = Object.freeze({
  giant: { name: 'GIANT', color: 0xff775e, detail: 'Next TNT has an enormous blast.', symbol: '↑' },
  bounce: { name: 'BOUNCE', color: 0x69dfff, detail: 'Next TNT launches everyone sky-high.', symbol: '↟' },
  speed: { name: 'SPEED', color: 0xf5d85f, detail: 'Eight seconds of deeply irresponsible speed.', symbol: '»' },
  mushroom: { name: 'MUSHROOM MUSHROOM', color: 0xb7f06a, detail: 'Grow a whole family of tiny mushrooms.', symbol: '✳' },
  mystery: { name: 'MYSTERY', color: 0xc992ff, detail: 'One random effect. Zero useful explanations.', symbol: '?' },
  urrrr: { name: 'URRRR', color: 0xff8fb8, detail: 'Adds 55% to your URRRR meter.', symbol: 'R' },
});
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const emptyInput = () => ({ x: 0, z: 0, yaw: 0, pitch: 0, sprint: false });
export const cleanName = value => typeof value === 'string'
  ? [...value].filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
    .join('').trim().slice(0, 18) || 'Boot Enjoyer' : 'Boot Enjoyer';
