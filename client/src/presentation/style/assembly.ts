import * as THREE from 'three';

export function easeOutBack(t: number): number {
  const p = Math.max(0, Math.min(1, t)) - 1;
  return 1 + 2.70158 * p * p * p + 1.70158 * p * p;
}
export function assemblyPose(time: number, index: number, count: number): { scale: number; lift: number; complete: boolean } {
  const delay = index * Math.min(.075, .9 / Math.max(1, count - 1));
  const t = Math.max(0, Math.min(1, (time - delay) / .65));
  return { scale: Math.max(.001, easeOutBack(t)), lift: (1 - t) ** 3, complete: t >= 1 };
}

/** Matrizes finais imutáveis: repetir/retroceder não acumula erro de posição. */
export function createAssembly(group: THREE.Group, enabled = true) {
  const records: Array<{ mesh: THREE.Mesh; base: THREE.Matrix4[]; start: number }> = [];
  let count = 0;
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const base: THREE.Matrix4[] = [];
    if (object instanceof THREE.InstancedMesh) {
      for (let i = 0; i < object.count; i++) { const m = new THREE.Matrix4(); object.getMatrixAt(i, m); base.push(m); }
    } else { if (object.matrixAutoUpdate) object.updateMatrix(); base.push(object.matrix.clone()); }
    records.push({ mesh: object, base, start: count }); count += base.length;
  });
  const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
  const lift = Math.max(size.y, size.x, size.z) * .12;
  const scratch = new THREE.Matrix4(); let active = enabled;
  return {
    get active() { return active; },
    update(time: number) {
      active = enabled && time < 1.55;
      for (const record of records) {
        for (let i = 0; i < record.base.length; i++) {
          const pose = assemblyPose(enabled ? time : 10, record.start + i, count);
          scratch.copy(record.base[i]);
          for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) scratch.elements[col * 4 + row] *= pose.scale;
          scratch.elements[13] += pose.lift * lift;
          if (record.mesh instanceof THREE.InstancedMesh) record.mesh.setMatrixAt(i, scratch);
          else { record.mesh.matrixAutoUpdate = false; record.mesh.matrix.copy(scratch); record.mesh.matrixWorldNeedsUpdate = true; }
        }
        if (record.mesh instanceof THREE.InstancedMesh) record.mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
