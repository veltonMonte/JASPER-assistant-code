import * as THREE from 'three';
import { getPresetDefinition } from '../../../../shared/presentation-presets';
import { particleCount } from '../runtime/quality';
import { createCloud } from '../runtime/cloud';
import { subject, type BuildContext } from './types';
async function build({ group, config, quality, tier, signal }: BuildContext) {
  const element = String(config.element || 'carbon').toLowerCase();
  const nucleonCount = element === 'hydrogen' ? 1 : element === 'oxygen' ? 16 : element === 'iron' ? 56 : 12; // padrão carbono-12

  // Núcleo distribuído pela esfera de Fibonacci
  const nucleusGroup = new THREE.Group();
  group.add(nucleusGroup);

  const protonMat = new THREE.MeshStandardMaterial({
    color: 0xff3b30,
    emissive: 0xff3b30,
    emissiveIntensity: 0.8,
    metalness: 0.2,
    roughness: 0.3,
  });
  const neutronMat = new THREE.MeshStandardMaterial({
    color: 0x007aff,
    emissive: 0x007aff,
    emissiveIntensity: 0.6,
    metalness: 0.2,
    roughness: 0.3,
  });
  const nucleonRadius = 0.18;
  const nucleusScale = Math.max(0.4, Math.cbrt(nucleonCount) * 0.32);

  const phi = Math.PI * (3 - Math.sqrt(5)); // ângulo áureo
  const geometry = new THREE.SphereGeometry(nucleonRadius, Math.min(14, quality.segments), 10);
  const protons = new THREE.InstancedMesh(geometry, protonMat, Math.ceil(nucleonCount / 2));
  const neutrons = new THREE.InstancedMesh(geometry, neutronMat, Math.floor(nucleonCount / 2));
  const dummy = new THREE.Object3D();
  for (let i = 0; i < nucleonCount; i++) {
    const y = 1 - i / Math.max(1, nucleonCount - 1) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = phi * i, distance = nucleusScale * (.45 + .55 * Math.sqrt(i / nucleonCount));
    dummy.position.set(Math.cos(angle) * radius * distance, y * distance, Math.sin(angle) * radius * distance);
    dummy.updateMatrix();
    (i % 2 ? neutrons : protons).setMatrixAt(Math.floor(i / 2), dummy.matrix);
  }
  nucleusGroup.add(protons, neutrons);

  // Brilho no centro do núcleo
  const coreGlow = new THREE.Mesh(
    new THREE.SphereGeometry(nucleusScale * 0.85, 20, 20),
    new THREE.MeshBasicMaterial({
      color: 0xff9500,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
    })
  );
  nucleusGroup.add(coreGlow);

  // Nuvem de probabilidade dos orbitais
  const pointCount = particleCount(24000, config.density ?? 1, tier);
  const orbitalCloud = await createCloud('atom', pointCount, '#00e5ff', signal);
  group.add(orbitalCloud);

  // Guias discretas das camadas orbitais
  const shells = [1.8, 3.4];
  for (const sr of shells) {
    const sGeom = new THREE.BufferGeometry();
    const sPoints: number[] = [];
    for (let k = 0; k <= 64; k++) {
      const th = (k / 64) * Math.PI * 2;
      sPoints.push(Math.cos(th) * sr, 0, Math.sin(th) * sr);
    }
    sGeom.setAttribute('position', new THREE.Float32BufferAttribute(sPoints, 3));
    const sLine = new THREE.Line(sGeom, new THREE.LineBasicMaterial({
      color: 0x00f3ff,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
    }));
    sLine.rotation.x = Math.PI / 4;
    group.add(sLine);
  }

  return subject(group, (time: number) => {
    nucleusGroup.rotation.y = time * 0.4;
    nucleusGroup.rotation.z = time * 0.2;
    orbitalCloud.rotation.y = time * 0.12;
    orbitalCloud.rotation.x = Math.sin(time * 0.2) * 0.1;
    const pulse = 0.95 + 0.08 * Math.sin(time * 3);
    coreGlow.scale.set(pulse, pulse, pulse);
  }, [
    { text: 'Núcleo', anchor: nucleusGroup, position: [0, nucleusScale + .35, 0] },
    { text: 'Orbitais 1s e 2s', position: [-2, 1.5, 0] },
    { text: 'Nuvem eletrônica', position: [3, 2, 0] },
  ]);
}
export default { ...getPresetDefinition('atom'), build };
