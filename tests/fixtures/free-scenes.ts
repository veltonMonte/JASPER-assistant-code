import type { SceneSpec, SceneNode, SceneGeometryDef } from '../../shared/scene-types.js';
const node=(id:string,geometry:SceneGeometryDef,position:[number,number,number]=[0,0,0],extra:Partial<SceneNode>={}):SceneNode=>({id,geometry,position,material:{color:'#7394ab'},...extra});
export const freeScenes:Record<string,SceneSpec>={
  dinossauro:{version:2,title:'Dinossauro',nodes:[
    node('corpo',{type:'sphere',radius:1},[0,1.5,0],{scale:[1.5,.8,.65],material:{color:'#578969'},label:'Tronco'}),
    node('cabeca',{type:'sphere',radius:.65},[1.5,2.3,0],{scale:[1.4,.7,.8],material:{color:'#578969'},label:'Cabeça'}),
    node('cauda',{type:'tube',radius:.24,path:[[-1,1.5,0],[-2,1.7,0],[-3,2.2,.1]]},[0,0,0],{material:{color:'#578969'},label:'Cauda'}),
    node('pernas',{type:'capsule',radius:.22,length:.8},[0,.7,-.5],{repetition:{type:'linear',count:2,offset:[0,0,1]},material:{color:'#40694c'}}),
    node('pes',{type:'box',width:.7,height:.18,depth:.4},[.2,.1,-.5],{repetition:{type:'linear',count:2,offset:[0,0,1]}}),
    node('olhos',{type:'sphere',radius:.08},[1.7,2.55,-.35],{repetition:{type:'linear',count:2,offset:[0,0,.7]},material:{color:'#101820'}}),
  ]},
  teclado:{version:2,title:'Teclado mecânico',geometries:{tecla:{type:'box',width:.8,height:.3,depth:.8}},materials:{plastico:{color:'#bac8d4',roughness:.7}},nodes:[node('base',{type:'box',width:13,height:.4,depth:4.5}),{id:'teclas',geometryId:'tecla',materialId:'plastico',position:[-6,.35,-1.5],repetition:{type:'grid',counts:[13,1,4],spacing:[1,0,1]},label:'Teclas'}]},
  computador:{version:2,title:'Computador',nodes:[{id:'gabinete',position:[0,0,0],children:[
    node('estrutura',{type:'box',width:3,height:4,depth:2},[0,2,0],{material:{color:'#92aabc',opacity:.18,transparent:true}}),
    node('placa_mae',{type:'box',width:2.4,height:3,depth:.08},[0,2,-.7],{material:{color:'#367569'},label:'Placa-mãe'}),
    node('processador',{type:'box',width:.6,height:.6,depth:.25},[0,2.7,-.5],{label:'Processador'}),
    node('memoria',{type:'box',width:.18,height:1.2,depth:.15},[.7,2.5,-.5],{repetition:{type:'linear',count:2,offset:[.3,0,0]},material:{color:'#a1be63'},label:'Memória RAM'}),
    node('gpu',{type:'box',width:2,height:.35,depth:1.1},[0,1.5,-.1],{material:{color:'#475565'},label:'Placa de vídeo'}),
  ]}]},
  casa:{version:2,title:'Planta de uma casa',metadata:{view:'top',unit:'meter'},nodes:[
    node('piso',{type:'plane',width:9,height:7},[0,0,0],{rotation:[-Math.PI/2,0,0],material:{color:'#d7c9b3'}}),
    node('parede_norte',{type:'box',width:9,height:2.8,depth:.18},[0,1.4,-3.5]),
    node('parede_sul_a',{type:'box',width:3.5,height:2.8,depth:.18},[-2.75,1.4,3.5]),
    node('parede_sul_b',{type:'box',width:3.5,height:2.8,depth:.18},[2.75,1.4,3.5]),
    node('laterais',{type:'box',width:.18,height:2.8,depth:7},[-4.5,1.4,0],{repetition:{type:'linear',count:2,offset:[9,0,0]}}),
    node('divisoria',{type:'box',width:.18,height:2.8,depth:4.5},[0,1.4,-1.2]),
    node('quarto',{type:'plane',width:3,height:2.5},[-2,.02,-1.5],{rotation:[-Math.PI/2,0,0],label:'Quarto',material:{color:'#b5cad2'}}),
    node('sala',{type:'plane',width:3,height:2.5},[2,.02,1.5],{rotation:[-Math.PI/2,0,0],label:'Sala',material:{color:'#b7c8ac'}}),
  ]},
  oculos:{version:2,title:'Óculos',geometries:{aro:{type:'extrude',path:[[-.8,-.5],[.8,-.5],[.8,.5],[-.8,.5]],holes:[[[-.65,-.35],[-.65,.35],[.65,.35],[.65,-.35]]],depth:.1}},nodes:[
    {id:'aros',geometryId:'aro',material:{color:'#223448'},position:[-.9,0,0],repetition:{type:'linear',count:2,offset:[1.8,0,0]},label:'Armação'},
    node('ponte',{type:'tube',radius:.05,path:[[-.12,0,0],[0,.1,0],[.12,0,0]]}),
    node('haste_esq',{type:'tube',radius:.055,path:[[-1.7,.2,0],[-1.75,.2,-1.2],[-1.65,0,-1.7]]}),
    node('haste_dir',{type:'tube',radius:.055,path:[[1.7,.2,0],[1.75,.2,-1.2],[1.65,0,-1.7]]}),
  ]},
  carro:{version:2,title:'Carro',nodes:[
    node('carroceria',{type:'box',width:4,height:.7,depth:1.7},[0,.8,0],{material:{color:'#a54d4d'},label:'Carroceria'}),
    node('cabine',{type:'mesh',vertices:[[-1,0,-.7],[1,0,-.7],[.6,.8,-.7],[-.6,.8,-.7],[-1,0,.7],[1,0,.7],[.6,.8,.7],[-.6,.8,.7]],faces:[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[3,7,6],[3,6,2],[0,4,7],[0,7,3],[1,2,6],[1,6,5]]},[0,1.1,0],{material:{color:'#708f9e'}}),
    node('rodas',{type:'cylinder',radiusTop:.42,radiusBottom:.42,height:.2},[0,0,0],{material:{color:'#222830'},repetition:{type:'transforms',instances:[{position:[-1.25,.45,-.9],rotation:[Math.PI/2,0,0]},{position:[1.25,.45,-.9],rotation:[Math.PI/2,0,0]},{position:[-1.25,.45,.9],rotation:[Math.PI/2,0,0]},{position:[1.25,.45,.9],rotation:[Math.PI/2,0,0]}]}}),
  ]},
  abajur:{version:2,title:'Abajur',nodes:[
    node('base',{type:'lathe',points:[[0,0],[.8,0],[.8,.15],[.25,.25],[.12,1.8]],segments:24}),
    node('cupula',{type:'lathe',points:[[1,0],[.5,1],[.45,1],[.95,0]],segments:24},[0,1.8,0],{material:{color:'#dfc994'},label:'Cúpula'}),
    node('lampada',{type:'sphere',radius:.2},[0,2.2,0],{material:{color:'#fff0ba',emissive:'#fff0ba',emissiveIntensity:1}}),
  ]},
};
