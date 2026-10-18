import * as THREE from 'three';
import { getPresetDefinition } from '../../../../shared/presentation-presets';
import { subject, type BuildContext, type LabelSpec } from './types';

function build({ group, quality }: BuildContext) {
  const layers = [4, 7, 7, 3], coords: [number, number, number][][] = [];
  const material = new THREE.MeshStandardMaterial({ color: 0x00f3ff, emissive: 0x00f3ff, emissiveIntensity: .7, metalness: .3, roughness: .2 });
  const instances = new THREE.InstancedMesh(new THREE.SphereGeometry(.18, Math.min(16, quality.segments), Math.min(16, quality.segments)), material, 21);
  const dummy = new THREE.Object3D(); let instance = 0;
  const labels: LabelSpec[] = [];
  layers.forEach((count, layer) => {
    coords[layer] = [];
    const x = (layer - 1.5) * 2.4;
    for (let node = 0; node < count; node++) {
      const y = (node - (count - 1) / 2), z = Math.sin(node * 1.5 + layer) * .4;
      coords[layer].push([x, y, z]); dummy.position.set(x, y, z); dummy.updateMatrix(); instances.setMatrixAt(instance++, dummy.matrix);
    }
    labels.push({ text: layer === 0 ? 'Entrada' : layer === 3 ? 'Saída' : `Camada oculta ${layer}`, position: [x, count / 2 + .4, 0] });
  });
  group.add(instances);
  const positions: number[] = [];
  for (let layer = 0; layer < layers.length - 1; layer++) for (const from of coords[layer]) for (const to of coords[layer + 1]) positions.push(...from, ...to);
  const links = new THREE.BufferGeometry(); links.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  group.add(new THREE.LineSegments(links, new THREE.LineBasicMaterial({ color: 0x5ab3cf, transparent: true, opacity: .28, blending: THREE.AdditiveBlending })));
  return subject(group, time => { group.rotation.y = time * .2; group.rotation.x = Math.sin(time * .15) * .1; }, labels);
}
export default { ...getPresetDefinition('neural_network'), build };
