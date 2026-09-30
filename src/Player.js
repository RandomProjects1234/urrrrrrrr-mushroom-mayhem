import * as THREE from 'three';

export class Player {
  constructor(assets, state, local = false) {
    this.assets = assets; this.root = new THREE.Group(); this.local = local; this.boots = [];
    const body = new THREE.Group(); this.body = body; this.root.add(body);
    body.add(assets.mesh('box', state.color, 0, 1.42, 0, 0.8, 0.68, 0.5));
    body.add(assets.mesh('box', 0xf7d9ae, 0, 2.03, 0, 0.68, 0.55, 0.62));
    body.add(assets.mesh('box', state.color, 0, 2.34, 0.04, 0.77, 0.16, 0.7));
    body.add(assets.mesh('box', 0x272639, -0.16, 2.08, -0.32, 0.1, 0.12, 0.025));
    body.add(assets.mesh('box', 0x272639, 0.16, 2.08, -0.32, 0.1, 0.12, 0.025));
    body.add(assets.mesh('box', 0xae6168, 0, 1.91, -0.32, 0.23, 0.06, 0.025));
    this.arms = [-1, 1].map(side => {
      const arm = assets.mesh('box', state.color, side * 0.54, 1.38, 0, 0.25, 0.62, 0.28);
      body.add(arm); return arm;
    });
    for (const side of [-1, 1]) {
      const boot = new THREE.Group(); boot.position.x = side * 0.35;
      boot.add(assets.mesh('box', 0x49354f, 0, 0.62, 0, 0.59, 1.18, 0.57));
      boot.add(assets.mesh('box', 0x62475b, 0, 0.22, -0.29, 0.65, 0.43, 1.1));
      boot.add(assets.mesh('box', 0x272432, 0, 0.065, -0.25, 0.7, 0.13, 1.18));
      boot.add(assets.mesh('box', 0xd8bf70, 0, 0.78, -0.3, 0.2, 0.19, 0.07));
      boot.add(assets.mesh('box', 0xd8bf70, 0, 0.42, -0.3, 0.2, 0.12, 0.07));
      body.add(boot); this.boots.push(boot);
    }
    const labelTexture = assets.label([state.name], { width: 256, height: 48, size: 24, background: '#292431', color: '#fff4d4' });
    this.labelTexture = labelTexture;
    const labelMaterial = new THREE.SpriteMaterial({ map: labelTexture, depthTest: false });
    this.label = new THREE.Sprite(labelMaterial); this.label.scale.set(2.7, 0.5, 1);
    this.label.position.y = 3.1; this.root.add(this.label);
    this.aura = assets.mesh('ring', 0xb9f572, 0, 0.08, 0, 1.4, 1.4, 1.4, true);
    this.aura.rotation.x = Math.PI / 2; this.root.add(this.aura);
    this.root.position.set(state.x, state.y, state.z);
  }
  update(state, dt, time) {
    if (!state) return;
    this.root.visible = state.health > 0;
    this.root.position.set(state.x, state.y, state.z);
    this.body.rotation.y = state.yaw;
    const speed = Math.hypot(state.vx, state.vz);
    const walk = Math.sin(time * Math.max(6, speed * 1.4));
    const powered = state.urrrUntil > time;
    this.body.position.y = state.grounded ? Math.abs(walk) * Math.min(speed / 90, 0.16) : 0;
    this.body.rotation.z = state.stomping ? Math.sin(time * 35) * 0.15 : walk * Math.min(speed / 160, 0.06);
    this.boots.forEach((boot, index) => {
      const desired = powered ? 1.9 : 1;
      boot.scale.lerp(new THREE.Vector3(desired, desired, desired), 1 - Math.exp(-dt * 12));
      boot.rotation.x = state.grounded ? walk * (index ? 1 : -1) * Math.min(speed / 18, 0.7) : state.stomping ? 0 : -0.3;
    });
    this.arms.forEach((arm, index) => { arm.rotation.x = state.grounded ? walk * (index ? -1 : 1) * 0.5 : -1.8; });
    this.aura.visible = powered || state.immuneUntil > time;
    this.aura.rotation.z += dt * 2;
    this.aura.scale.setScalar(powered ? 1.4 + Math.sin(time * 9) * 0.1 : 1);
    this.label.visible = !this.local;
  }
  dispose() {
    this.root.removeFromParent(); this.label.material.dispose();
    this.labelTexture.dispose(); this.assets.textures.delete(this.labelTexture);
  }
}
