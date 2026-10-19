import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { getPresetDefinition } from '../../../../shared/presentation-presets';
import type { PresentationPart } from '../../../../shared/presentation-types';
import { MaterialLibrary } from '../style/materials';
import { softBox } from '../style/geometry';
import { createAssembly } from '../style/assembly';
import { disposeObject } from '../runtime/resources';
import { subject, type BuildContext, type LabelSpec } from './types';

function geometry(part: PresentationPart, segments: number): THREE.BufferGeometry {
  const [width, height, depth] = part.size;
  switch (part.shape) {
    case 'box': return softBox(width, height, depth);
    case 'sphere': return new THREE.SphereGeometry(width / 2, segments, Math.max(8, segments / 2)).scale(1, height / width, depth / width);
    case 'cylinder': return new THREE.CylinderGeometry(width / 2, depth / 2, height, segments);
    case 'cone': return new THREE.ConeGeometry(width / 2, height, segments);
    case 'torus': return new THREE.TorusGeometry(Math.max(.08, width / 2), Math.max(.02, Math.min(height, depth) / 3.5), 12, 32);
    case 'capsule': return new THREE.CapsuleGeometry(width / 2, Math.max(0, height - width), 8, 16).scale(1, 1, Math.max(.1, depth / width));
    case 'plane': return new THREE.PlaneGeometry(width, height);
    case 'mesh': {
      if (part.vertices?.length && part.faces?.length) {
        const result = new THREE.BufferGeometry();
        result.setAttribute('position', new THREE.Float32BufferAttribute(part.vertices.flat(), 3));
        result.setIndex(part.faces.flat()); result.computeVertexNormals(); return result.scale(width, height, depth);
      }
      return new ConvexGeometry((part.vertices || []).map(vertex => new THREE.Vector3(...vertex))).scale(width, height, depth);
    }
  }
}

function build({ group, parts = [], quality, style, motion }: BuildContext) {
  const labels: LabelSpec[] = [];
  const library = new MaterialLibrary(style || 'soft', quality.fps === 30);
  for (const part of parts) {
    const shape = geometry(part, quality.segments);
    const material = library.get({ color: part.color }, part.label || '');
    const mesh = new THREE.Mesh(shape, material);
    mesh.castShadow = !material.transparent; mesh.receiveShadow = true; mesh.position.set(...part.position); mesh.rotation.set(...part.rotation); group.add(mesh);
    if (part.shape === 'box' && parts.length <= 32) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(shape, 25), new THREE.LineBasicMaterial({ color: 0x304452, transparent: true, opacity: .15 })));
    if (part.label) labels.push({ text: part.label, anchor: mesh, position: [0, part.size[1] / 2 + .25, 0] });
  }
  const assembly = createAssembly(group, motion !== false);
  return { group, get animated() { return assembly.active; }, labels, update(time: number) { assembly.update(time); }, dispose() { disposeObject(group); } };
}
export default { ...getPresetDefinition('custom'), build };
