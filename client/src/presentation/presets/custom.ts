import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { getPresetDefinition } from '../../../../shared/presentation-presets';
import type { PresentationPart } from '../../../../shared/presentation-types';
import { subject, type BuildContext, type LabelSpec } from './types';

function geometry(part: PresentationPart, segments: number): THREE.BufferGeometry {
  const [width, height, depth] = part.size;
  switch (part.shape) {
    case 'box': return new THREE.BoxGeometry(width, height, depth);
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

function build({ group, parts = [], quality }: BuildContext) {
  const labels: LabelSpec[] = [];
  for (const part of parts) {
    const shape = geometry(part, quality.segments);
    const material = new THREE.MeshStandardMaterial({ color: part.color, emissive: part.color, emissiveIntensity: .25, metalness: .35, roughness: .35, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(shape, material);
    mesh.position.set(...part.position); mesh.rotation.set(...part.rotation); group.add(mesh);
    if (part.shape === 'box' && parts.length <= 32) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(shape, 25), new THREE.LineBasicMaterial({ color: 0xc8f2ff, transparent: true, opacity: .35, blending: THREE.AdditiveBlending })));
    if (part.label) labels.push({ text: part.label, anchor: mesh, position: [0, part.size[1] / 2 + .25, 0] });
  }
  return subject(group, () => {}, labels, false);
}
export default { ...getPresetDefinition('custom'), build };
