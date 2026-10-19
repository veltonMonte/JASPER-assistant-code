import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { normalizePalette, MaterialLibrary } from '../client/src/presentation/style/materials.js';
import { softBox, bevelRadius, groundSubject } from '../client/src/presentation/style/geometry.js';
import { assemblyPose, createAssembly } from '../client/src/presentation/style/assembly.js';
import { compileScene } from '../client/src/presentation/scene/SceneCompiler.js';
import { QUALITY_PROFILES } from '../client/src/presentation/runtime/quality.js';
import { freeScenes } from './fixtures/free-scenes.js';
const THREE=createRequire(path.resolve('client/package.json'))('three');

test('paleta clareia objetos escuros sem tingir branco e cinza',()=>{
  assert.notEqual(normalizePalette('#080808'),'#080808');
  for(const input of ['#000000','#ffffff','#153022','#3399ff']){
    const color=new THREE.Color(normalizePalette(input));const hsl=color.getHSL({h:0,s:0,l:0},THREE.SRGBColorSpace);
    assert.ok(hsl.l>=.345&&hsl.l<=.855);if(input==='#ffffff'||input==='#000000')assert.ok(hsl.s<.01);
  }
  assert.equal(normalizePalette('#080808','holo'),'#080808');
});
test('bisel preserva dimensões e é limitado pela menor aresta',()=>{
  assert.equal(bevelRadius(10,.2,2),.012);
  const shape=softBox(10,.2,2);shape.computeBoundingBox();
  const size=shape.boundingBox!.getSize(new THREE.Vector3());assert.ok(Math.abs(size.y-.2)<.00001);shape.dispose();
});
test('material é reutilizado, madeira é procedural e metal leve continua iluminável',()=>{
  const library=new MaterialLibrary('soft',true),def={color:'#895f34'};
  const a=library.get(def,'wood_light'),b=library.get(def,'wood_light');assert.equal(a,b);assert.ok(a.map);
  const metal=library.get({color:'#808080',metalness:1},'metal_brushed');assert.ok('metalness' in metal&&metal.metalness<=.35);
  const toon=new MaterialLibrary('cartoon').get(def);assert.ok('gradientMap' in toon&&toon.gradientMap);
});
test('cenas de escalas distintas são centralizadas e apoiadas sem mudar coordenadas internas',async()=>{
  for(const fixture of Object.values(freeScenes)){
    const group=new THREE.Group();const result=await compileScene(fixture,{group,quality:QUALITY_PROFILES.low,signal:new AbortController().signal});
    const bounds=groundSubject(group),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
    assert.ok(Math.abs(bounds.min.y)<.000001);assert.ok(Math.abs(center.x)<.000001&&Math.abs(center.z)<.000001);assert.ok(Math.abs(Math.max(size.x,size.y,size.z)-6)<.000001);
    result.dispose();
  }
});
test('montagem preserva transformações, termina, e pode voltar sem acumular erro',async()=>{
  const group=new THREE.Group(),result=await compileScene(freeScenes.teclado,{group,quality:QUALITY_PROFILES.low,signal:new AbortController().signal});
  const keys=group.children.find((o:any)=>o.isInstancedMesh);assert.ok(keys);
  const before=new THREE.Matrix4();keys.getMatrixAt(20,before);
  result.update(.2,.01);assert.equal(result.animated,true);
  result.update(3,.01);assert.equal(result.animated,false);
  const after=new THREE.Matrix4();keys.getMatrixAt(20,after);assert.deepEqual(after.elements,before.elements);
  result.update(0,0);assert.equal(result.animated,true);result.update(3,0);keys.getMatrixAt(20,after);assert.deepEqual(after.elements,before.elements);result.dispose();
});
test('movimento reduzido preserva imediatamente a pose final e o orçamento inclui biséis',async()=>{
  const group=new THREE.Group(),fixture={version:2 as const,nodes:[{id:'blocos',geometry:{type:'box' as const,width:1,height:1,depth:1},repetition:{type:'linear' as const,count:512,offset:[.01,0,0] as [number,number,number]}}]};
  const result=await compileScene(fixture,{group,quality:QUALITY_PROFILES.low,signal:new AbortController().signal,motion:false});result.update(0,0);assert.equal(result.animated,false);
  let triangles=0;group.traverse((o:any)=>{if(o.isMesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.count??1);});assert.ok(triangles<=60000);result.dispose();
});


test('peças de ids distintos compartilham material e lote e rótulos respeitam rotação',async()=>{
  const group=new THREE.Group(),result=await compileScene({version:2,nodes:[
    {id:'a',geometry:{type:'box',width:2,height:1,depth:1},position:[-2,0,0],rotation:[0,0,Math.PI/2],material:{color:'#7394ab'},label:'Peça A'},
    {id:'b',geometry:{type:'box',width:2,height:1,depth:1},position:[2,0,0],material:{color:'#7394ab'}},
  ]},{group,quality:QUALITY_PROFILES.low,signal:new AbortController().signal});
  const meshes=group.children.filter((o:any)=>o.isMesh);assert.equal(meshes.length,1);assert.equal(meshes[0].count,2);
  const label=result.labels[0];assert.ok(Math.abs(label.anchor!.position.x+2)<1e-6);assert.ok(label.anchor!.position.y>1);
  result.dispose();
});


test('trocar planta e objeto conserva o eixo vertical e evita câmera sob o palco',async()=>{
  const {sceneView}=await import('../client/src/presentation/runtime/framing.js');
  for(const view of ['top','front','perspective',undefined]){
    const plan=sceneView(view);assert.deepEqual(plan.up,[0,1,0]);assert.ok(plan.maxPolar<Math.PI/2);assert.ok(plan.direction[1]>0);
    const theta=Math.acos(plan.direction[1]/Math.hypot(...plan.direction));assert.ok(theta>=plan.minPolar&&theta<=plan.maxPolar);
  }
});


test('piso exagerado não reduz o assunto a uma miniatura; plantas preservam a escala',async()=>{
  const group=new THREE.Group(),result=await compileScene({version:2,nodes:[
    {id:'corpo',geometry:{type:'sphere',radius:1},position:[0,1,0]},
    {id:'chao',geometry:{type:'plane',width:30,height:30},rotation:[-Math.PI/2,0,0]},
  ]},{group,quality:QUALITY_PROFILES.low,signal:new AbortController().signal});
  const bounds=groundSubject(group),size=bounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.y-6)<1e-6);assert.equal(group.children.filter((o:any)=>o.isMesh&&o.userData.sceneBackdrop).length,1);result.dispose();
  const house=new THREE.Group(),built=await compileScene(freeScenes.casa,{group:house,quality:QUALITY_PROFILES.low,signal:new AbortController().signal});
  groundSubject(house);assert.equal(house.children.filter((o:any)=>o.isMesh&&o.userData.sceneBackdrop).length,0);built.dispose();
});
