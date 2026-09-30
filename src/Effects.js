import * as THREE from 'three';
import { CONFIG } from './config.js';
import { groundHeight } from './WorldLayout.js';

export class Effects {
  constructor(scene, assets) {
    this.scene = scene; this.assets = assets; this.particles = []; this.waves = []; this.marks = [];
    this.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(assets.geometry('box'), this.material, CONFIG.maxParticles);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false;
    this.mesh.count = 0; scene.add(this.mesh); this.dummy = new THREE.Object3D();
  }
  burst(x, y, z, color, amount = 24, power = 9) {
    const available = CONFIG.maxParticles - this.particles.length;
    for (let i = 0; i < Math.min(amount, available); i++) {
      this.particles.push({ x, y, z, vx: (Math.random() - 0.5) * power,
        vy: Math.random() * power, vz: (Math.random() - 0.5) * power,
        life: 0.5 + Math.random() * 0.8, max: 1.3, color, size: 0.09 + Math.random() * 0.17 });
    }
  }
  explosion(event, stomp = false) {
    const color = stomp ? 0xc4f28d : event.bounce ? 0x7cddff : 0xffc17a;
    this.burst(event.x, event.y + 0.2, event.z, color, stomp ? 32 : 55, event.radius * 2.4);
    if (this.waves.length >= 18) this.removeWave(this.waves.shift());
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, wireframe: !stomp, depthWrite: false });
    const mesh = new THREE.Mesh(this.assets.geometry(stomp ? 'ring' : 'sphere'), material);
    mesh.position.set(event.x, event.y + 0.12, event.z);
    if (stomp) mesh.rotation.x = Math.PI / 2;
    this.scene.add(mesh); this.waves.push({ mesh, radius: event.radius, life: 0.65, max: 0.65 });
    if (!stomp) {
      if (this.marks.length >= 12) this.removeWave(this.marks.shift());
      const markMaterial = new THREE.MeshBasicMaterial({ color: 0x493f49, transparent: true, opacity: 0.3, depthWrite: false });
      const mark = new THREE.Mesh(this.assets.geometry('cylinder'), markMaterial);
      const floor = groundHeight(event.x, event.z);
      if (Number.isFinite(floor)) {
        mark.position.set(event.x, floor + 0.045, event.z); mark.scale.set(event.radius * 0.4, 0.025, event.radius * 0.4);
        this.scene.add(mark); this.marks.push({ mesh: mark, life: 7, max: 7 });
      } else markMaterial.dispose();
    }
  }
  removeWave(wave) { wave.mesh.removeFromParent(); wave.mesh.material.dispose(); }
  update(dt) {
    this.particles = this.particles.filter(p => p.life > 0);
    this.particles.forEach((p, index) => {
      p.life -= dt; p.vy -= 13 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      this.dummy.position.set(p.x, p.y, p.z); this.dummy.rotation.set(p.life * 3, p.life * 5, p.life);
      this.dummy.scale.setScalar(p.size * Math.max(0, Math.min(1, p.life * 3))); this.dummy.updateMatrix();
      this.mesh.setMatrixAt(index, this.dummy.matrix); this.mesh.setColorAt(index, new THREE.Color(p.color));
    });
    this.mesh.count = this.particles.length; this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    for (const list of [this.waves, this.marks]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const wave = list[i]; wave.life -= dt;
        if (wave.life <= 0) { this.removeWave(wave); list.splice(i, 1); continue; }
        wave.mesh.material.opacity = (list === this.waves ? 0.7 : 0.3) * wave.life / wave.max;
        if (list === this.waves) wave.mesh.scale.setScalar((1 - wave.life / wave.max) * wave.radius + 0.05);
      }
    }
  }
  clear() {
    this.particles = []; this.mesh.count = 0;
    for (const wave of [...this.waves, ...this.marks]) this.removeWave(wave);
    this.waves = []; this.marks = [];
  }
  dispose() { this.clear(); this.mesh.removeFromParent(); this.mesh.dispose(); this.material.dispose(); }
}
