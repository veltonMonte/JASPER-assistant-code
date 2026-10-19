import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function bevelRadius(width: number, height: number, depth: number): number {
  return Math.max(0, Math.min(width, height, depth) * .06);
}

/** A tesselação do bisel também entra no orçamento, inclusive nas instâncias. */
export function softBox(width: number, height: number, depth: number, rounded = true): THREE.BufferGeometry {
  return rounded ? new RoundedBoxGeometry(width, height, depth, 1, bevelRadius(width, height, depth)) : new THREE.BoxGeometry(width, height, depth);
}

export function groundTransform(min: THREE.Vector3, max: THREE.Vector3) {
  const longest = Math.max(max.x - min.x, max.y - min.y, max.z - min.z, .000001);
  const scale = 6 / longest;
  return { scale, position: new THREE.Vector3(-(min.x + max.x) * .5 * scale, -min.y * scale, -(min.z + max.z) * .5 * scale) };
}

/** Limita o enquadramento à geometria do assunto; linhas de legenda não o ampliam. */
export function subjectBounds(group: THREE.Group): THREE.Box3 {
  group.updateMatrixWorld(true);
  const result=new THREE.Box3();
  group.traverse(object=>{if(object instanceof THREE.Mesh&&!object.userData.sceneBackdrop)result.union(new THREE.Box3().setFromObject(object));});
  return result;
}

function hideOversizedGround(group: THREE.Group): void {
  group.updateMatrixWorld(true);
  const records: Array<{object:THREE.Mesh;box:THREE.Box3;flat:boolean}>=[];
  const core=new THREE.Box3();
  group.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const box=new THREE.Box3().setFromObject(object),size=box.getSize(new THREE.Vector3());
    const flat=size.y<Math.max(size.x,size.z)*.0001;
    records.push({object,box,flat});if(!flat)core.union(box);
  });
  if(core.isEmpty())return;
  const size=core.getSize(new THREE.Vector3()),area=Math.max(.000001,size.x*size.z);
  for(const record of records){
    const floor=record.box.getSize(new THREE.Vector3());
    if(record.flat&&record.box.max.y<=core.min.y+size.y*.08&&floor.x*floor.z>area*4&&Math.max(floor.x,floor.z)>Math.max(size.x,size.z)*1.8){
      record.object.userData.sceneBackdrop=true;record.object.visible=false;
    }
  }
}

/** Só altera o grupo de exibição; unidades e coordenadas editáveis são preservadas. */
export function groundSubject(group: THREE.Group): THREE.Box3 {
  group.updateMatrixWorld(true);
  hideOversizedGround(group);
  const bounds = subjectBounds(group);
  if (bounds.isEmpty() || !Number.isFinite(bounds.max.length())) throw new Error('A cena não contém geometria visível.');
  const transform = groundTransform(bounds.min, bounds.max);
  group.scale.setScalar(transform.scale); group.position.copy(transform.position); group.updateMatrixWorld(true);
  return subjectBounds(group);
}
