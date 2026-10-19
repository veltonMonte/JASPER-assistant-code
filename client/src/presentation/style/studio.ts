import * as THREE from 'three';
import type { QualityTier } from '../runtime/quality';
import { disposeObject } from '../runtime/resources';

/** Palco proporcional ao objeto, com sombra barata no perfil leve. */
export function createStudio(bounds: THREE.Box3, tier: QualityTier) {
  const group = new THREE.Group();
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(1.5, Math.hypot(size.x, size.z) * .58);
  const center = bounds.getCenter(new THREE.Vector3());
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8693a6, 1.25);
  const key = new THREE.DirectionalLight(0xfff7ed, 2.4);
  key.position.set(5, 9, 7); key.target.position.copy(center);
  key.castShadow = tier !== 'low'; key.shadow.mapSize.setScalar(tier === 'high' ? 2048 : 1024);
  const extent = Math.max(radius, size.y) * 1.4;
  Object.assign(key.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: .1, far: 35 });
  key.shadow.camera.updateProjectionMatrix(); key.shadow.bias = -.0003; key.shadow.normalBias = .025; key.shadow.radius = 3;
  const fill = new THREE.DirectionalLight(0xe6efff, .55); fill.position.set(-5, 3, 1);
  const rim = new THREE.DirectionalLight(0xb9eaf2, .2); rim.position.set(-2, 5, -6);
  group.add(hemi, key, key.target, fill, rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), new THREE.MeshStandardMaterial({ color: '#b5c8d2', roughness: .95, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.035; floor.receiveShadow = true; group.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * .99, radius, 64), new THREE.MeshBasicMaterial({ color: '#d2e8ef', side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = -.032; group.add(ring);
  // O gradiente também dá contato a superfícies transparentes sem transmissão cara.
  const pixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const distance = Math.hypot((x - 31.5) / 31.5, (y - 31.5) / 31.5);
    const i = (y * 64 + x) * 4; pixels[i] = 17; pixels[i + 1] = 26; pixels[i + 2] = 36;
    pixels[i + 3] = Math.round(Math.max(0, 1 - distance) ** 1.8 * (tier === 'low' ? 100 : 55));
  }
  const texture = new THREE.DataTexture(pixels, 64, 64); texture.magFilter = texture.minFilter = THREE.LinearFilter; texture.needsUpdate = true;
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(.5, size.x * 1.35), Math.max(.5, size.z * 1.35)), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = -.028; group.add(blob);
  return { group, dispose() { key.shadow.dispose(); disposeObject(group); } };
}
