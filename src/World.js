import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLATFORMS, RAMPS, SOLIDS, TREES, PADS, terrainHeight, groundHeight } from './WorldLayout.js';
import { CONFIG, MUSHROOMS } from './config.js';

export class World {
  constructor(scene, assets) {
    this.scene = scene; this.assets = assets; this.root = new THREE.Group(); scene.add(this.root);
    this.items = new Map(); this.tnt = new Map(); this.pads = []; this.ownedGeometries = [];
    this.build(); this.batchStatic();
  }
  add(mesh) { this.root.add(mesh); return mesh; }
  build() {
    const a = this.assets;
    const positions = [], colors = [], color = new THREE.Color();
    const vertex = (radius, angle) => {
      const x = radius * Math.cos(angle), z = radius * Math.sin(angle);
      positions.push(x, terrainHeight(x, z), z);
      color.setHex(Math.sin(x * 0.6 + z * 0.3) > 0.5 ? 0x819c69 : 0x6f8759);
      colors.push(color.r, color.g, color.b);
    };
    for (let ring = 0; ring < 12; ring++) {
      for (let i = 0; i < 96; i++) {
        const r1 = ring / 12 * CONFIG.radius, r2 = (ring + 1) / 12 * CONFIG.radius;
        const a1 = i / 96 * Math.PI * 2, a2 = (i + 1) / 96 * Math.PI * 2;
        vertex(r1, a1); vertex(r2, a2); vertex(r2, a1);
        vertex(r1, a1); vertex(r1, a2); vertex(r2, a2);
      }
    }
    const groundGeometry = new THREE.BufferGeometry();
    groundGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    groundGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); groundGeometry.computeVertexNormals();
    this.ownedGeometries.push(groundGeometry);
    this.groundMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
    const ground = new THREE.Mesh(groundGeometry, this.groundMaterial); ground.receiveShadow = true; this.add(ground);
    const islandGeometry = new THREE.CylinderGeometry(CONFIG.radius, 25, 8, 40);
    this.ownedGeometries.push(islandGeometry);
    const island = new THREE.Mesh(islandGeometry, a.material(0x716577)); island.position.y = -4.35; this.add(island);
    for (const tree of TREES) {
      const mushroom = a.mushroom([0xb85a72, 0xa67bb0, 0xd89b67][Math.floor(tree.height) % 3], tree.height / 1.6);
      mushroom.position.set(tree.x, terrainHeight(tree.x, tree.z), tree.z); this.add(mushroom);
    }
    for (let i = 0; i < 70; i++) {
      const angle = i * 2.39996, radius = 5 + (i * 1.73 % 25);
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      const grass = a.mesh('box', 0xa2b57a, x, terrainHeight(x, z) + 0.18, z, 0.07, 0.4, 0.5);
      grass.rotation.y = angle; grass.rotation.z = 0.3; this.add(grass);
      if (i % 5 === 0) { const rock = a.mesh('sphere', 0x99909d, x, terrainHeight(x, z), z, 0.6, 0.4, 0.6); this.add(rock); }
    }
    for (const p of PLATFORMS) {
      this.add(a.mesh('box', p.type === 'stone' ? 0x9d929e : 0x927263, p.x, p.y - 0.18, p.z, p.w, 0.36, p.d));
      for (const side of [-1, 1]) this.add(a.mesh('box', 0x6e5861, p.x + side * (p.w / 2 - 0.3), p.y / 2, p.z, 0.45, p.y, p.d - 0.4));
      for (let x = -p.w / 2; x <= p.w / 2; x += 0.7) this.add(a.mesh('box', 0xb19679, p.x + x, p.y + 0.035, p.z, 0.04, 0.05, p.d));
    }
    for (const ramp of RAMPS) {
      const geometry = new THREE.BufferGeometry();
      const x = ramp.w / 2, z = ramp.d / 2, y = ramp.y;
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([
        -x,y,-z, x,0,z, x,y,-z, -x,y,-z, -x,0,z, x,0,z,
        -x,0,-z,-x,0,z,-x,y,-z, x,0,-z,x,y,-z,x,0,z,
      ], 3)); geometry.computeVertexNormals(); this.ownedGeometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, a.material(0xa58b72)); mesh.position.set(ramp.x, 0, ramp.z); this.add(mesh);
    }
    for (const box of SOLIDS) {
      if (box.type === 'boot') {
        this.add(a.mesh('box', 0xb6a59c, box.x, 0.4, box.z, 4.8, 0.8, 7.8));
        this.add(a.mesh('box', 0x4d3b59, box.x, 2.65, box.z + 1.2, 3.5, 4.7, 3.5));
        this.add(a.mesh('box', 0x634962, box.x, 1.3, box.z - 1.2, 4, 1.8, 4.7));
        this.add(a.mesh('box', 0xddc78d, box.x, 3.2, box.z - 0.65, 1.2, 0.8, 0.2));
        this.add(a.sign(['OUR FOUNDING BOOT', 'est. last Tuesday'], box.x, 0.9, box.z - 3.6, 3.7, 0.8));
      } else {
        const palette = { thrift: 0xd1ba8e, shack: 0x97786b, house: 0xe7c8b0 };
        this.add(a.mesh('box', palette[box.type], box.x, (box.y - 0.4) / 2, box.z, box.w, box.y - 0.4, box.d));
        if (box.type === 'house') this.add(a.mesh('cap', 0xb96481, box.x, box.y - 0.4, box.z, 4, 1.8, 4));
        else this.add(a.mesh('box', box.type === 'thrift' ? 0x818b64 : 0x715864, box.x, box.y - 0.2, box.z, box.w + 0.7, 0.4, box.d + 0.7));
        this.add(a.mesh('box', 0x4f4650, box.x, 1.2, box.z + box.d / 2 + 0.02, 1.5, 2.4, 0.12));
        for (const side of [-1, 1]) {
          this.add(a.mesh('box', 0x827f94, box.x + side * 2, 2.1, box.z + box.d / 2 + 0.03, 1.1, 1.2, 0.1));
          this.add(a.mesh('box', 0xe5dcae, box.x + side * 2, 2.1, box.z + box.d / 2 + 0.08, 0.08, 1.2, 0.1));
        }
        const lines = box.type === 'thrift' ? ['THRIFT & YEET', 'BOOTS $3. CHAOS FREE.'] : box.type === 'shack' ? ['TNT STORAGE', 'absolutely probably safe'] : ['MUSH-ROOM FOR RENT'];
        this.add(a.sign(lines, box.x, box.y - 1.2, box.z + box.d / 2 + 0.15, box.w - 0.6, 1.1));
      }
    }
    for (const pad of PADS) {
      const y = terrainHeight(pad.x, pad.z);
      this.add(a.mesh('cylinder', 0x5b5a70, pad.x, y + 0.08, pad.z, 1.6, 0.18, 1.6));
      const disc = a.mesh('cylinder', 0xb8ee84, pad.x, y + 0.2, pad.z, 1.35, 0.13, 1.35, true);
      this.add(disc); this.pads.push(disc);
    }
    this.add(a.sign(['KNEE HIGH BOOTS', 'THAT I THRIFTED'], 0, 6.1, -18.3, 12, 2.2));
    for (const x of [-5.5, 5.5]) this.add(a.mesh('box', 0x6a5654, x, 3, -18.5, 0.3, 8, 0.3));
    // A roofless cave entrance that can actually be explored.
    for (const x of [-5, 5]) this.add(a.mesh('sphere', 0x7c738b, x, 1.9, -27, 2.4, 2.6, 2.7));
    this.add(a.mesh('sphere', 0x7c738b, 0, 4.4, -28, 5.5, 1.3, 3));
    this.add(a.sign(['urrrrrrrrr'], 0, 1.5, -31, 3, 0.7));
    this.add(a.sign(['DO NOT LICK THE MOON'], -13, 3.7, -8, 4, 0.8, 0.25));
    this.add(a.sign(['YOUR BOOTS ARE VALID'], 12, 4.8, 7, 4, 0.8, -0.3));
    this.add(a.sign(['FOREST SAFETY RATING: ?', 'complaints go in the void'], -25, 1.2, 15, 5, 1.1, 0.7));
    // A tiny moon wearing its own thrifted boot.
    this.add(a.mesh('sphere', 0xf8e8c7, -37, 34, -52, 6, 6, 6));
    this.add(a.mesh('box', 0x74627d, -35, 28.6, -51, 4, 2, 5));
  }
  batchStatic() {
    this.root.updateMatrixWorld(true);
    const groups = new Map();
    this.root.traverse(mesh => {
      if (!mesh.isMesh || mesh.material.map || mesh.material.vertexColors || this.pads.includes(mesh)) return;
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(mesh.matrixWorld);
      // Standardize attributes before merging primitive geometry types.
      geometry.deleteAttribute('uv');
      const list = groups.get(mesh.material) || []; list.push({ geometry, mesh }); groups.set(mesh.material, list);
    });
    for (const [material, entries] of groups) {
      const geometry = mergeGeometries(entries.map(entry => entry.geometry));
      if (geometry) {
        const batch = new THREE.Mesh(geometry, material); batch.castShadow = true; batch.receiveShadow = true;
        this.root.add(batch); this.ownedGeometries.push(geometry);
        entries.forEach(entry => entry.mesh.removeFromParent());
      }
      entries.forEach(entry => entry.geometry.dispose());
    }
  }
  createItem(item) {
    const a = this.assets;
    let root;
    if (item.kind === 'mushroom') {
      root = a.mushroom(MUSHROOMS[item.type].color, 0.85);
      const ring = a.mesh('ring', MUSHROOMS[item.type].color, 0, -0.25, 0, 0.7, 0.7, 0.7, true);
      ring.rotation.x = Math.PI / 2; root.add(ring);
    } else if (item.kind === 'ammo') {
      root = new THREE.Group(); root.add(a.mesh('box', 0xc75559, 0, 0.2, 0, 0.85, 0.75, 0.85));
      root.add(a.mesh('box', 0xf3dba2, 0, 0.2, 0, 0.92, 0.16, 0.92));
    } else {
      root = new THREE.Group(); root.add(a.mesh('cylinder', 0xc27160, 0, 0.45, 0, 0.65, 1.6, 0.65));
      for (const y of [0, 0.9]) root.add(a.mesh('cylinder', 0x544652, 0, y, 0, 0.7, 0.14, 0.7));
    }
    this.scene.add(root); this.items.set(item.id, { root, ...item });
  }
  setItems(items) {
    const ids = new Set(items.map(item => item.id));
    for (const [id, item] of this.items) if (!ids.has(id)) { item.root.removeFromParent(); this.items.delete(id); }
    for (const item of items) {
      if (!this.items.has(item.id)) this.createItem(item);
      Object.assign(this.items.get(item.id), item);
    }
  }
  updateTNT(items, time, dt) {
    const ids = new Set(items.map(item => item.id));
    for (const [id, root] of this.tnt) if (!ids.has(id)) { root.removeFromParent(); this.tnt.delete(id); }
    for (const item of items) {
      if (!this.tnt.has(item.id)) {
        const root = new THREE.Group();
        root.add(this.assets.mesh('box', item.bounce ? 0x67c8dc : 0xdf6163, 0, 0, 0, 0.6, 0.6, 0.6));
        root.add(this.assets.mesh('box', 0xffe9b8, 0, 0, 0, 0.64, 0.18, 0.64));
        root.add(this.assets.mesh('cylinder', 0x48334b, 0, 0.4, 0, 0.035, 0.3, 0.035));
        root.add(this.assets.mesh('sphere', 0xffd66f, 0, 0.57, 0, 0.09, 0.09, 0.09, true));
        this.tnt.set(item.id, root); this.scene.add(root);
      }
      const root = this.tnt.get(item.id);
      root.position.lerp(new THREE.Vector3(item.x, item.y, item.z), 1 - Math.exp(-dt * 25));
      root.rotation.set(time * 2, time * 3, 0);
      root.scale.setScalar((item.giant ? 1.5 : 1) * (1 + Math.sin(time * 22) * 0.08 * Math.max(0, 1 - (item.fuse - time))));
    }
  }
  update(dt, time, authoritativeItems) {
    if (authoritativeItems) this.setItems(authoritativeItems);
    for (const item of this.items.values()) {
      if (!authoritativeItems && item.kind !== 'barrel') {
        const floor = groundHeight(item.x, item.z, item.y + 0.5) + 0.45;
        if (item.y > floor || item.vy > 0) { item.vy -= CONFIG.gravity * dt; item.y += item.vy * dt; }
        if (item.y < floor) { item.y = floor; item.vy = 0; }
      }
      item.root.position.set(item.x, item.y + (item.kind === 'barrel' ? 0 : Math.sin(time * 2 + item.x) * 0.09), item.z);
      if (item.kind !== 'barrel') item.root.rotation.y = time * 0.65;
    }
    for (const pad of this.pads) pad.scale.y = 0.13 + Math.sin(time * 4) * 0.02;
  }
  clearDynamic() { this.setItems([]); for (const root of this.tnt.values()) root.removeFromParent(); this.tnt.clear(); }
  dispose() {
    this.clearDynamic(); this.root.removeFromParent();
    for (const geometry of this.ownedGeometries) geometry.dispose();
    this.groundMaterial.dispose();
    this.root.traverse(node => node.userData.disposable?.forEach(resource => resource.dispose()));
  }
}
