import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseSceneSpec, SceneValidationError, geometryCost } from '../src/presentation/scene-schema.js';
import { SceneSessionStore } from '../src/presentation/scene-session.js';
import { createVisualPresentation, beginSceneTurn } from '../src/presentation/scene-generation.js';
import { parsePresentation } from '../src/presentation/schema.js';
import { freeScenes } from './fixtures/free-scenes.js';
import { QUALITY_PROFILES } from '../client/src/presentation/runtime/quality.js';
const THREE=createRequire(path.resolve('client/package.json'))('three');
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));

test('cenas livres de assuntos distintos usam o contrato comum sem presets',()=>{
  for(const [name,scene]of Object.entries(freeScenes)){
    const result=parsePresentation({title:name,steps:[{title:name,narration:'Observe as partes desta representação.',kind:'model3d',scene}]});
    assert.equal(result.steps[0].scene?.version,2);assert.equal(result.steps[0].preset,undefined);
  }
  assert.equal(createVisualPresentation({title:'Objeto',narration:'Texto.'}).code,'invalid_scene');
  assert.throws(()=>parsePresentation({title:'Carro',steps:[{title:'Carro',narration:'Texto.',kind:'model3d'}]}));
});
test('validação aponta campos e bloqueia ids, referências, números e repetições inválidos',()=>{
  const invalid=[{...freeScenes.teclado,version:3},{version:2,nodes:[{id:'vazio'}]},{version:2,nodes:[{id:'a',geometryId:'nao_existe'}]},
    {version:2,nodes:[{id:'a',geometry:{type:'javascript',code:'alert(1)'}}]},
    {version:2,nodes:[{id:'a',geometry:{type:'box',width:1,height:1,depth:1},scale:[0,1,1]}]},
    {version:2,nodes:[{id:'a',geometry:{type:'sphere',radius:Infinity}}]},
    {...freeScenes.teclado,nodes:[...freeScenes.teclado.nodes,freeScenes.teclado.nodes[0]]}];
  for(const scene of invalid)assert.throws(()=>parseSceneSpec(scene),SceneValidationError);
  const repeated=copy(freeScenes.teclado);repeated.nodes[1].repetition={type:'grid',counts:[512,512,512],spacing:[1,1,1]};assert.throws(()=>parseSceneSpec(repeated),/orçamento/);
  const cyclic:any={version:2,nodes:[]};cyclic.nodes.push({id:'ciclo',children:cyclic.nodes});assert.throws(()=>parseSceneSpec(cyclic),/circular/);
});
test('malhas, contornos e furos malformados não chegam ao Three.js',()=>{
  for(const geometry of [
    {type:'mesh',vertices:[[0,0,0],[1,0,0],[2,0,0]],faces:[[0,1,2]]},
    {type:'mesh',vertices:[[0,0,0],[1,0,0],[0,1,0]],faces:[[0,1,4]]},
    {type:'extrude',path:[[0,0],[1,1],[0,1],[1,0]],depth:1},
    {type:'extrude',path:[[0,0],[2,0],[2,2],[0,2]],holes:[[[3,3],[4,3],[4,4],[3,4]]],depth:1},
    {type:'tube',path:[[0,0,0],[0,0,0]],radius:1},
  ])assert.throws(()=>parseSceneSpec({version:2,nodes:[{id:'objeto',geometry}]}));
});
test('edições são atômicas, preservam ids, desfazem e não atravessam sessões',()=>{
  const store=new SceneSessionStore();const original=store.save('primeiro',freeScenes.dinossauro);
  const edited=store.patch('primeiro',{targetSceneId:original.id,operations:[{op:'updateNode',nodeId:'cabeca',patch:{scale:[2,1,1]}}]});
  assert.deepEqual(edited.nodes[1].scale,[2,1,1]);assert.equal(edited.id,original.id);
  assert.throws(()=>store.patch('segundo',{operations:[{op:'removeNode',nodeId:'cabeca'}]}),/cena ativa/);
  assert.throws(()=>store.patch('primeiro',{targetSceneId:'antiga',operations:[{op:'removeNode',nodeId:'cabeca'}]}),/cena mudou/);
  assert.throws(()=>store.patch('primeiro',{operations:[{op:'updateNode',nodeId:'cabeca',patch:{scale:[0,0,0]}}]}));
  assert.deepEqual(store.get('primeiro')?.nodes[1].scale,[2,1,1]);assert.deepEqual(store.undo('primeiro').nodes[1].scale,original.nodes[1].scale);
});
test('tentativas de reparo têm limite e um novo pedido reabre a geração',()=>{
  beginSceneTurn('limite');for(let i=0;i<3;i++)assert.equal(createVisualPresentation({sceneJson:'{}',narration:'Texto.'},'limite').code,'invalid_scene');
  assert.equal(createVisualPresentation({sceneJson:JSON.stringify(freeScenes.abajur),narration:'Texto.'},'limite').code,'scene_repair_limit');
  beginSceneTurn('limite');assert.equal(createVisualPresentation({sceneJson:JSON.stringify(freeScenes.abajur),narration:'Texto.'},'limite').success,true);
});
test('compilador constrói todos os assuntos nos três tiers com descarte e instanciamento',async()=>{
  const {compileScene}=await import('../client/src/presentation/scene/SceneCompiler.js');
  for(const tier of ['low','medium','high'] as const)for(const [name,input]of Object.entries(freeScenes)){
    const scene=parseSceneSpec(input),group=new THREE.Group();
    const result=await compileScene(scene,{group,quality:QUALITY_PROFILES[tier],signal:new AbortController().signal});
    const bounds=new THREE.Box3().setFromObject(group);assert.equal(bounds.isEmpty(),false,name);assert.ok(Number.isFinite(bounds.max.length()),name);
    const geometries=new Set<any>();group.traverse((object:any)=>{if(object.geometry)geometries.add(object.geometry);});
    let disposed=0;geometries.forEach(g=>g.addEventListener('dispose',()=>disposed++));
    if(name==='teclado'){const keys=group.children.find((item:any)=>item.isInstancedMesh);assert.equal(keys?.count,52);}
    result.dispose();assert.equal(disposed,geometries.size);assert.equal(group.children.length,0);
  }
});
test('compilador respeita cancelamento antes de começar',async()=>{
  const {compileScene}=await import('../client/src/presentation/scene/SceneCompiler.js');const controller=new AbortController();controller.abort();
  const group=new THREE.Group();await assert.rejects(compileScene(freeScenes.carro,{group,quality:QUALITY_PROFILES.low,signal:controller.signal}));assert.equal(group.children.length,0);
});

test('etapa visível define a cena editada e não permite selecionar cenas alheias',()=>{
  const store=new SceneSessionStore();const p=store.register({id:'apresentacao',title:'Etapas',subtitle:'',steps:[{title:'Primeira',narration:'Texto.',kind:'model3d',scene:freeScenes.carro},{title:'Segunda',narration:'Texto.',kind:'model3d',scene:freeScenes.oculos}]},'dono');
  const first=p.steps[0].scene!,second=p.steps[1].scene!;assert.equal(store.get('dono')?.id,first.id);
  store.activate('dono',second.id!);assert.equal(store.get('dono')?.id,second.id);
  assert.throws(()=>store.activate('outro',second.id!),/não pertence/);
  store.patch('dono',{targetSceneId:second.id,operations:[{op:'updateNode',nodeId:'haste_esq',patch:{material:{color:'#ff0000'}}}]});
  assert.equal(store.get('dono')?.nodes[2].material?.color,'#ff0000');
});

test('enquadramento conserva visibilidade em escalas distintas e telas estreitas',async()=>{
  const {sceneFraming}=await import('../client/src/presentation/runtime/framing.js');
  for(const diagonal of [.00001,1,10000])for(const aspect of [.3,1,2]){const plan=sceneFraming(diagonal,aspect);assert.ok(Number.isFinite(plan.distance));assert.ok(plan.far>plan.distance*8+plan.radius);assert.ok(plan.near<plan.radius*.1);assert.ok(plan.fogDensity*plan.distance<.25);}
  assert.ok(sceneFraming(10,.3).distance>sceneFraming(10,2).distance);
});
