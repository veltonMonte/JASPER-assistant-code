import * as THREE from 'three';
import { getPresetDefinition } from '../../../../shared/presentation-presets';
import { subject, type BuildContext, type LabelSpec } from './types';

function build({ group, quality }: BuildContext) {
  const sun = new THREE.Mesh(new THREE.SphereGeometry(1.2, quality.segments, quality.segments), new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
  const corona = new THREE.Mesh(new THREE.SphereGeometry(1.45, quality.segments, quality.segments), new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: .45, blending: THREE.AdditiveBlending }));
  group.add(sun, corona);
  const planets = [
    { name: 'Mercúrio', r: 2.2, size: .16, color: 0x999999, speed: 1.8 },
    { name: 'Vênus', r: 3.1, size: .25, color: 0xe6b800, speed: 1.3 },
    { name: 'Terra', r: 4.2, size: .28, color: 0x00a8ff, speed: 1 },
    { name: 'Marte', r: 5.3, size: .22, color: 0xff4d4d, speed: .8 },
    { name: 'Júpiter', r: 6.8, size: .55, color: 0xd9822b, speed: .5 },
  ];
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: .2, roughness: .4 });
  material.onBeforeCompile = shader => { shader.fragmentShader = shader.fragmentShader.replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * vColor.rgb;'); };
  material.customProgramCacheKey = () => 'jasper-planetas-instanciados';
  const instances = new THREE.InstancedMesh(new THREE.SphereGeometry(1, quality.segments, quality.segments), material, planets.length);
  instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(instances);
  const dummy = new THREE.Object3D(), shade = new THREE.Color();
  const anchors: THREE.Group[] = [];
  const labels: LabelSpec[] = [{ text: 'Sol', position: [0, 1.7, 0] }];
  planets.forEach((planet, index) => {
    const positions = new Float32Array(65 * 3);
    for (let k = 0; k <= 64; k++) { const angle = k / 64 * Math.PI * 2; positions[k * 3] = Math.cos(angle) * planet.r; positions[k * 3 + 2] = Math.sin(angle) * planet.r; }
    const orbit = new THREE.BufferGeometry(); orbit.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    group.add(new THREE.Line(orbit, new THREE.LineBasicMaterial({ color: 0x5ab3cf, transparent: true, opacity: .25 })));
    instances.setColorAt(index, shade.set(planet.color));
    const anchor = new THREE.Group(); group.add(anchor); anchors.push(anchor);
    labels.push({ text: planet.name, anchor, position: [0, planet.size + .25, 0] });
  });
  const update = (time: number) => {
    sun.rotation.y = time * .2;
    for (let index = 0; index < planets.length; index++) {
      const planet = planets[index];
      const angle = time * planet.speed * .4;
      dummy.position.set(Math.cos(angle) * planet.r, 0, Math.sin(angle) * planet.r);
      dummy.rotation.y = time * 2; dummy.scale.setScalar(planet.size); dummy.updateMatrix();
      instances.setMatrixAt(index, dummy.matrix); anchors[index].position.copy(dummy.position);
    }
    instances.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return subject(group, update, labels);
}
export default { ...getPresetDefinition('solar_system'), build };
