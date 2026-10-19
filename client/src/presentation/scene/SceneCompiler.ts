import * as THREE from 'three';
import type { SceneSpec, SceneGeometryDef, SceneMaterialDef, SceneNode, SceneRepetition, SceneTransform } from '../../../../shared/scene-types';
import type { BuildContext, BuilderResult, LabelSpec } from '../presets/types';
import { MaterialLibrary, type VisualStyle } from '../style/materials';
import { softBox } from '../style/geometry';
import { createAssembly } from '../style/assembly';
import { disposeObject } from '../runtime/resources';

function geometry(def:SceneGeometryDef,segments:number,rounded=true):THREE.BufferGeometry {
  const seg=(n:number|undefined,fallback:number,min=3)=>Math.max(min,Math.min(n||fallback,segments));
  switch(def.type){
    case 'box':return softBox(def.width,def.height,def.depth,rounded);
    case 'sphere':return new THREE.SphereGeometry(def.radius,seg(def.widthSegments,24),seg(def.heightSegments,16));
    case 'cylinder':return new THREE.CylinderGeometry(def.radiusTop,def.radiusBottom,def.height,seg(def.radialSegments,24));
    case 'cone':return new THREE.ConeGeometry(def.radius,def.height,seg(def.radialSegments,24));
    case 'capsule':return new THREE.CapsuleGeometry(def.radius,def.length,seg(def.capSegments,8),seg(def.radialSegments,16));
    case 'torus':return new THREE.TorusGeometry(def.radius,def.tube,seg(def.radialSegments,12),Math.min(def.tubularSegments||32,segments*2));
    case 'plane':return new THREE.PlaneGeometry(def.width,def.height);
    case 'lathe':return new THREE.LatheGeometry(def.points.map(p=>new THREE.Vector2(...p)),seg(def.segments,24),def.phiStart,def.phiLength);
    case 'tube':return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(def.path.map(p=>new THREE.Vector3(...p)),def.closed||false,'centripetal'),Math.min(def.tubularSegments||48,segments*3),def.radius,seg(def.radialSegments,8),def.closed||false);
    case 'extrude':{
      const path=new THREE.Shape(def.path.map(p=>new THREE.Vector2(...p)));
      for(const hole of def.holes||[])path.holes.push(new THREE.Path(hole.map(p=>new THREE.Vector2(...p))));
      return new THREE.ExtrudeGeometry(path,{depth:def.depth,steps:1,bevelEnabled:def.bevelEnabled||false,bevelSegments:2,bevelSize:def.bevelSize??Math.min(.02,def.depth/4),bevelThickness:def.bevelThickness??Math.min(.02,def.depth/4),curveSegments:Math.min(12,segments)});
    }
    case 'mesh':{
      const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(def.vertices.flat(),3));result.setIndex(def.faces.flat());result.computeVertexNormals();return result;
    }
  }
}
function matrix(transform:SceneTransform):THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(...(transform.position||[0,0,0])),new THREE.Quaternion().setFromEuler(new THREE.Euler(...(transform.rotation||[0,0,0]),'XYZ')),new THREE.Vector3(...(transform.scale||[1,1,1])));
}
export function repetitionMatrices(repetition?:SceneRepetition):THREE.Matrix4[] {
  if(!repetition)return [new THREE.Matrix4()];
  if(repetition.type==='transforms')return repetition.instances.map(matrix);
  const result:THREE.Matrix4[]=[];
  if(repetition.type==='linear')for(let i=0;i<repetition.count;i++)result.push(new THREE.Matrix4().makeTranslation(...repetition.offset.map(v=>v*i) as [number,number,number]));
  if(repetition.type==='grid'){
    const [nx,ny,nz]=repetition.counts,[dx,dy,dz]=repetition.spacing;
    for(let x=0;x<nx;x++)for(let y=0;y<ny;y++)for(let z=0;z<nz;z++)result.push(new THREE.Matrix4().makeTranslation((x-(repetition.center?(nx-1)/2:0))*dx,(y-(repetition.center?(ny-1)/2:0))*dy,(z-(repetition.center?(nz-1)/2:0))*dz));
  }
  if(repetition.type==='radial')for(let i=0;i<repetition.count;i++){
    const angle=(repetition.startAngle||0)+i*(repetition.arc||Math.PI*2)/repetition.count;
    const axis=repetition.axis||'y',position: [number,number,number]=axis==='y'?[Math.cos(angle)*repetition.radius,0,Math.sin(angle)*repetition.radius]:axis==='x'?[0,Math.cos(angle)*repetition.radius,Math.sin(angle)*repetition.radius]:[Math.cos(angle)*repetition.radius,Math.sin(angle)*repetition.radius,0];
    const rotation: [number,number,number]=axis==='y'?[0,-angle,0]:axis==='x'?[angle,0,0]:[0,0,angle];
    result.push(matrix({position,rotation}));
  }
  return result;
}
/** Constrói dados declarativos; nenhum código vindo do modelo é executado. */
export async function compileScene(scene:SceneSpec,ctx:Pick<BuildContext,'group'|'quality'|'signal'> & {style?:VisualStyle;motion?:boolean}):Promise<BuilderResult> {
  const {group,quality,signal}=ctx;
  const library=new MaterialLibrary(ctx.style||'soft',quality.fps===30);
  const geometries=new Map<string,THREE.BufferGeometry>(),materials=library.materials;
  const batches=new Map<string,{geometry:THREE.BufferGeometry;material:THREE.MeshStandardMaterial|THREE.MeshToonMaterial;matrices:THREE.Matrix4[];ids:string[]}>();
  const labels:LabelSpec[]=[];const callouts:number[]=[];let slice=performance.now();
  const yieldIfNeeded=async()=>{signal.throwIfAborted();if(performance.now()-slice>=4){await new Promise(resolve=>setTimeout(resolve,0));signal.throwIfAborted();slice=performance.now();}};
  const visit=async(node:SceneNode,parents:THREE.Matrix4[])=>{
    await yieldIfNeeded();
    const local=matrix(node),copies=repetitionMatrices(node.repetition),worlds:THREE.Matrix4[]=[];
    for(const parent of parents)for(const copy of copies)worlds.push(new THREE.Matrix4().multiplyMatrices(parent,local).multiply(copy));
    const def=node.geometry||scene.geometries?.[node.geometryId||''];
    if(def){
      const matDef=node.material||scene.materials?.[node.materialId||'']||{color:'#a9cbd9'};
      const gKey=JSON.stringify(def);
      const m=library.get(matDef,node.materialId||node.name||node.id),key=`${gKey}|${m.uuid}`;
      let g=geometries.get(gKey);if(!g){g=geometry(def,quality.segments);g.computeBoundingBox();geometries.set(gKey,g);await yieldIfNeeded();}
      let batch=batches.get(key);if(!batch){batch={geometry:g,material:m,matrices:[],ids:[]};batches.set(key,batch);}
      batch.matrices.push(...worlds);batch.ids.push(...worlds.map(()=>node.id));
      if(node.label&&labels.length<24&&g.boundingBox){
        const box=g.boundingBox.clone().applyMatrix4(worlds[0]),center=box.getCenter(new THREE.Vector3());
        const lift=Math.max(.01,box.max.y-box.min.y)*.12;
        const anchor=new THREE.Group();anchor.position.set(center.x,box.max.y+lift,center.z);group.add(anchor);
        labels.push({text:node.label,anchor,position:[0,0,0]});
        callouts.push(center.x,box.max.y,center.z,center.x,box.max.y+lift,center.z);
      }
    }
    for(const child of node.children||[])await visit(child,worlds);
  };
  try {
    signal.throwIfAborted();
    for(const node of scene.nodes)await visit(node,[new THREE.Matrix4()]);
    const triangles=(g:THREE.BufferGeometry)=>(g.index?.count??g.attributes.position.count)/3;
    let totalTriangles=[...batches.values()].reduce((sum,b)=>sum+triangles(b.geometry)*b.matrices.length,0);
    let totalVertices=[...batches.values()].reduce((sum,b)=>sum+b.geometry.attributes.position.count*b.matrices.length,0);
    if(totalTriangles>60000||totalVertices>30000){
      for(const [key,g] of geometries){
        const def=JSON.parse(key) as SceneGeometryDef;
        if(def.type!=='box')continue;
        const plain=geometry(def,quality.segments,false);
        for(const batch of batches.values())if(batch.geometry===g){totalTriangles-=(triangles(g)-triangles(plain))*batch.matrices.length;totalVertices-=(g.attributes.position.count-plain.attributes.position.count)*batch.matrices.length;batch.geometry=plain;}
        g.dispose();geometries.set(key,plain);
        if(totalTriangles<=60000&&totalVertices<=30000)break;
      }
    }
    for(const batch of batches.values()){
      await yieldIfNeeded();
      if(batch.matrices.length===1){const mesh=new THREE.Mesh(batch.geometry,batch.material);mesh.matrixAutoUpdate=false;mesh.matrix.copy(batch.matrices[0]);mesh.userData.nodeIds=batch.ids;mesh.castShadow=!batch.material.transparent;mesh.receiveShadow=true;group.add(mesh);}
      else {const mesh=new THREE.InstancedMesh(batch.geometry,batch.material,batch.matrices.length);batch.matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();mesh.userData.nodeIds=batch.ids;mesh.castShadow=!batch.material.transparent;mesh.receiveShadow=true;group.add(mesh);}
    }
    if(callouts.length){const lines=new THREE.BufferGeometry();lines.setAttribute('position',new THREE.Float32BufferAttribute(callouts,3));const callout=new THREE.LineSegments(lines,new THREE.LineBasicMaterial({color:'#9bb7c3',transparent:true,opacity:.5}));callout.userData.labelCallout=true;group.add(callout);}
    for(const point of scene.pointsOfInterest||[])if(labels.length<24)labels.push({text:point.name,position:point.position});
    group.updateMatrixWorld(true);
    const assembly=createAssembly(group,ctx.motion!==false);
    return {group,get animated(){return assembly.active;},labels,update(time){assembly.update(time);},dispose(){disposeObject(group);}};
  } catch(error){disposeObject(group);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());throw error;}
}
