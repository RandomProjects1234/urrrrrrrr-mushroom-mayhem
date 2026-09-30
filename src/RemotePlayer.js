import { clamp } from './config.js';

// Snapshots arrive at 20Hz. Remote characters render 100ms behind the host.
export class RemotePlayer {
  constructor() { this.samples = []; }
  push(state, time) {
    const last = this.samples.at(-1);
    if (last && time <= last.time) return;
    if (last && (state.health !== last.state.health || Math.hypot(state.x - last.state.x, state.z - last.state.z) > 15)) this.samples = [];
    this.samples.push({ state, time }); if (this.samples.length > 12) this.samples.shift();
  }
  sample(time, local = false) {
    if (!this.samples.length) return null;
    const target = time - (local ? 0 : 0.1);
    while (this.samples.length > 2 && this.samples[1].time <= target) this.samples.shift();
    const a = this.samples[0], b = this.samples[1];
    if (!b || target >= this.samples.at(-1).time) {
      const latest = this.samples.at(-1);
      const dt = clamp(target - latest.time, 0, local ? 0.05 : 0.08);
      return { ...latest.state, x: latest.state.x + latest.state.vx * dt,
        y: latest.state.y + latest.state.vy * dt, z: latest.state.z + latest.state.vz * dt };
    }
    const factor = clamp((target - a.time) / (b.time - a.time), 0, 1);
    const result = { ...b.state };
    for (const key of ['x', 'y', 'z']) result[key] = a.state[key] + (b.state[key] - a.state[key]) * factor;
    const yawDelta = Math.atan2(Math.sin(b.state.yaw - a.state.yaw), Math.cos(b.state.yaw - a.state.yaw));
    result.yaw = a.state.yaw + yawDelta * factor;
    return result;
  }
}
