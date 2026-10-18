import * as THREE from 'three';
import { getPresetDefinition } from '../../../../shared/presentation-presets';
import { particleCount } from '../runtime/quality';
import { createCloud } from '../runtime/cloud';
import { subject, type BuildContext } from './types';
async function build({ group, config, quality, tier, signal }: BuildContext) {
  const primaryColor = new THREE.Color(config.primaryColor || '#00f3ff');
  const accentColor = new THREE.Color(config.accentColor || '#ff007f');

  const carGroup = new THREE.Group();
  group.add(carGroup);

  const holoMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    metalness: 0.7,
    roughness: 0.25,
    emissive: primaryColor,
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: 0.88,
  });

  const wireMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
  });

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x071b26,
    emissive: primaryColor,
    emissiveIntensity: 0.2,
    metalness: 0.9,
    roughness: 0.1,
    transparent: true,
    opacity: 0.75,
  });

  // Parte inferior do chassi
  const chassisGeom = new THREE.BoxGeometry(4.4, 0.48, 1.9);
  const chassis = new THREE.Mesh(chassisGeom, holoMat);
  chassis.position.y = 0.38;
  carGroup.add(chassis);
  chassis.add(new THREE.LineSegments(new THREE.EdgesGeometry(chassisGeom), wireMat));

  // Cabine
  const cabinGeom = new THREE.BoxGeometry(2.1, 0.58, 1.45);
  const cabin = new THREE.Mesh(cabinGeom, glassMat);
  cabin.position.set(-0.15, 0.82, 0);
  carGroup.add(cabin);
  cabin.add(new THREE.LineSegments(new THREE.EdgesGeometry(cabinGeom), wireMat));

  // Inclinação do capô
  const hoodGeom = new THREE.ConeGeometry(0.9, 1.2, 4);
  hoodGeom.rotateZ(Math.PI / 2);
  hoodGeom.scale(0.3, 0.8, 1.6);
  const hood = new THREE.Mesh(hoodGeom, holoMat);
  hood.position.set(1.5, 0.52, 0);
  carGroup.add(hood);

  // Aerofólio traseiro
  const wingGeom = new THREE.BoxGeometry(0.35, 0.08, 2.0);
  const wing = new THREE.Mesh(wingGeom, holoMat);
  wing.position.set(-2.0, 1.05, 0);
  carGroup.add(wing);

  const pillar1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 0.08), holoMat);
  pillar1.position.set(-1.95, 0.86, 0.6);
  const pillar2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 0.08), holoMat);
  pillar2.position.set(-1.95, 0.86, -0.6);
  carGroup.add(pillar1);
  carGroup.add(pillar2);

  // Faróis com barras luminosas ciano
  const headlightMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
  const hlLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.45), headlightMat);
  hlLeft.position.set(2.21, 0.42, 0.65);
  const hlRight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.45), headlightMat);
  hlRight.position.set(2.21, 0.42, -0.65);
  carGroup.add(hlLeft);
  carGroup.add(hlRight);

  // Lanterna traseira vermelha
  const taillightMat = new THREE.MeshBasicMaterial({ color: accentColor });
  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 1.7), taillightMat);
  tl.position.set(-2.21, 0.52, 0);
  carGroup.add(tl);

  // Quatro rodas
  const wheelMeshes: THREE.Group[] = [];
  const wheelPositions = [
    [1.35, 0.36, 0.98],
    [1.35, 0.36, -0.98],
    [-1.35, 0.36, 0.98],
    [-1.35, 0.36, -0.98],
  ];

  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x112233,
    emissive: primaryColor,
    emissiveIntensity: 0.6,
    metalness: 0.9,
    roughness: 0.2,
  });

  for (const [wx, wy, wz] of wheelPositions) {
    const wGroup = new THREE.Group();
    wGroup.position.set(wx, wy, wz);

    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.28, quality.segments), holoMat);
    tire.rotation.x = Math.PI / 2;
    wGroup.add(tire);

    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.29, 12), rimMat);
    rim.rotation.x = Math.PI / 2;
    wGroup.add(rim);

    carGroup.add(wGroup);
    wheelMeshes.push(wGroup);
  }

  // Linhas de partículas do túnel de vento
  const streamPoints = await createCloud('wind', particleCount(1200, config.density ?? 1, tier), config.primaryColor || '#00f3ff', signal);
  carGroup.add(streamPoints);

  return subject(group, (time: number, dt: number) => {
    carGroup.rotation.y = Math.sin(time * 0.3) * 0.25;
    for (const w of wheelMeshes) {
      w.rotation.z -= dt * 7.2;
    }
  }, [
    { text: 'Carroceria', anchor: carGroup, position: [0, 1.4, 0] },
    { text: 'Fluxo aerodinâmico', position: [3.4, 1.8, 0] },
  ]);
}
export default { ...getPresetDefinition('cyber_car'), build };
