import * as THREE from 'three';

export class Assets {
  constructor() { this.geometries = new Map(); this.materials = new Map(); this.textures = new Set(); }
  geometry(type) {
    if (!this.geometries.has(type)) {
      const builders = {
        box: () => new THREE.BoxGeometry(1, 1, 1),
        sphere: () => new THREE.IcosahedronGeometry(1, 0),
        cylinder: () => new THREE.CylinderGeometry(0.8, 1, 1, 8),
        cap: () => new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2),
        ring: () => new THREE.TorusGeometry(1, 0.06, 4, 24),
      };
      this.geometries.set(type, builders[type]());
    }
    return this.geometries.get(type);
  }
  material(color, glow = false) {
    const key = `${color}-${glow}`;
    if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshStandardMaterial({
      color, roughness: 0.92, flatShading: true,
      emissive: glow ? color : 0, emissiveIntensity: glow ? 0.45 : 0,
    }));
    return this.materials.get(key);
  }
  mesh(type, color, x, y, z, sx = 1, sy = 1, sz = 1, glow = false) {
    const mesh = new THREE.Mesh(this.geometry(type), this.material(color, glow));
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }
  label(lines, { width = 512, height = 128, color = '#292431', background = '#f5edcf', size = 36 } = {}) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = background; context.fillRect(0, 0, width, height);
    context.fillStyle = color; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.font = `900 ${size}px monospace`;
    lines.forEach((line, index) => context.fillText(line, width / 2, height * (index + 0.5) / lines.length, width - 24));
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter; this.textures.add(texture);
    return texture;
  }
  sign(lines, x, y, z, width = 6, height = 1.4, rotation = 0) {
    const group = new THREE.Group();
    const texture = this.label(lines, { height: lines.length > 1 ? 192 : 96, size: 35 });
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material); face.position.y = height / 2;
    const board = this.mesh('box', 0x655444, 0, height / 2, -0.07, width + 0.14, height + 0.14, 0.14);
    group.add(board, face);
    group.position.set(x, y, z); group.rotation.y = rotation;
    group.userData.disposable = [material, face.geometry];
    return group;
  }
  mushroom(color, scale = 1) {
    const group = new THREE.Group();
    group.add(this.mesh('cylinder', 0xf5e8ce, 0, scale * 0.6, 0, scale * 0.2, scale * 1.2, scale * 0.2));
    group.add(this.mesh('cap', color, 0, scale * 1.14, 0, scale * 0.82, scale * 0.47, scale * 0.82));
    group.add(this.mesh('cylinder', 0xf8d8a6, 0, scale * 1.14, 0, scale * 0.79, scale * 0.08, scale * 0.79));
    for (let i = 0; i < 4; i++) {
      const angle = i * 2.4;
      group.add(this.mesh('sphere', 0xf9ebce, Math.cos(angle) * scale * 0.4, scale * 1.5,
        Math.sin(angle) * scale * 0.4, scale * 0.12, scale * 0.055, scale * 0.12));
    }
    return group;
  }
  dispose() {
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    for (const texture of this.textures) texture.dispose();
  }
}
