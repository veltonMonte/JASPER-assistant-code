import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSceneSpec } from '../src/presentation/scene-schema.js';
import { SceneSessionStore } from '../src/presentation/scene-session.js';
import type { SceneNode } from '../shared/scene-types.js';
const box=(id:string,w:number,h:number,d:number,extra:Partial<SceneNode>={}):SceneNode=>({id,geometry:{type:'box',width:w,height:h,depth:d},...extra});
const chair=()=>({version:2,nodes:[
  box('almofada',1.8,.2,1.8,{place:{on:'assento',gap:0}}),
  box('assento',2,.2,2,{place:{floor:1.7}}),
  box('encosto',2,1.8,.2,{place:{on:'assento',align:'back',gap:0}}),
  box('pernas',.15,1.7,.15,{place:{under:'assento',gap:0},repetition:{type:'grid',counts:[2,1,2],spacing:[1.65,0,1.65],center:true}}),
]});
test('montagem relativa resolve dependências fora de ordem, apoio, encosto e pernas',()=>{
  const input=chair(),scene=parseSceneSpec(input),[cushion,seat,back,legs]=scene.nodes;
  assert.deepEqual(seat.position,[0,1.8,0]);assert.ok(Math.abs(cushion.position![1]-2)<1e-9);
  assert.ok(Math.abs(back.position![2]+.9)<1e-9);assert.ok(Math.abs(legs.position![1]-.85)<1e-9);
  assert.equal(input.nodes[0].position,undefined);assert.deepEqual(parseSceneSpec(scene),scene);
});
test('relações cíclicas, referências ausentes e expressões não são aceitas',()=>{
  for(const nodes of [
    [box('a',1,1,1,{place:{on:'b'}}),box('b',1,1,1,{place:{on:'a'}})],
    [box('a',1,1,1,{place:{on:'ausente'}})],
    [box('a',1,1,1,{place:{floor:'floor+eval(1)' as any}})],
    [box('a',1,1,1,{place:{on:'a',floor:0}})],
  ])assert.throws(()=>parseSceneSpec({version:2,nodes}));
});
test('apoio respeita rotação, escala, grupos e alinhamento lateral',()=>{
  const scene=parseSceneSpec({version:2,nodes:[box('base',4,.2,2,{rotation:[0,0,Math.PI/2],place:{floor:0}}),box('topo',1,1,1,{place:{on:'base',gap:0}}),{id:'grupo',place:{beside:'base',side:'right',gap:.2},children:[box('dentro',1,2,1,{scale:[2,1,1]})]}]});
  assert.ok(Math.abs(scene.nodes[1].position![1]-4.5)<1e-9);assert.ok(Math.abs(scene.nodes[2].position![0]-1.3)<1e-9);
});
test('editar o apoio reposiciona dependentes e mover diretamente remove a relação',()=>{
  const store=new SceneSessionStore();store.save('dono',parseSceneSpec(chair()));
  const resized=store.patch('dono',{operations:[{op:'updateNode',nodeId:'assento',patch:{geometry:{type:'box',width:2,height:.4,depth:2}}}]});
  assert.ok(Math.abs(resized.nodes[0].position![1]-2.2)<1e-9);
  const moved=store.patch('dono',{operations:[{op:'updateNode',nodeId:'almofada',patch:{position:[4,4,4]}}]});assert.equal(moved.nodes[0].place,undefined);assert.deepEqual(moved.nodes[0].position,[4,4,4]);
});


test('peça filha pode se apoiar na geometria do pai sem criar dependência circular',()=>{
  const scene=parseSceneSpec({version:2,nodes:[box('perna',.3,2,.3,{position:[1,2,0],scale:[1,2,1],children:[
    box('pe',.6,.2,.5,{place:{under:'perna',gap:0}}),
  ]})]});
  assert.deepEqual(scene.nodes[0].children![0].position,[0,-1.1,0]);assert.deepEqual(parseSceneSpec(scene),scene);
  const store=new SceneSessionStore();store.save('dono',scene);
  const edited=store.patch('dono',{operations:[{op:'updateNode',nodeId:'perna',patch:{geometry:{type:'box',width:.3,height:3,depth:.3}}}]});
  assert.deepEqual(edited.nodes[0].children![0].position,[0,-1.6,0]);
  assert.throws(()=>parseSceneSpec({version:2,nodes:[{id:'grupo',children:[box('pe',1,1,1,{place:{under:'grupo'}})]}]}),/pai com geometria/);
});


test('alinhamento não cancela o afastamento lateral entre peças',()=>{
  const scene=parseSceneSpec({version:2,nodes:[box('a',2,2,2,{place:{floor:0}}),box('b',2,2,2,{place:{beside:'a',side:'right',align:'right',gap:.1}})]});
  assert.ok(Math.abs(scene.nodes[1].position![0]-2.1)<1e-9);
});
