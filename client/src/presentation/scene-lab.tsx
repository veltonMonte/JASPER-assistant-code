/** Página de desenvolvimento; não é incluída na entrada de produção. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import PresentationErrorBoundary from '../components/PresentationErrorBoundary';
import Presentation3D from '../components/Presentation3D';
import { freeScenes } from '../../../tests/fixtures/free-scenes';
import type { SceneSpec } from '../../../shared/scene-types';
import '../index.css';
const scenes: Record<string, SceneSpec> = {
  cadeira: { version:2,title:'Cadeira',materials:{wood_light:{color:'#e1bb83'},fabric:{color:'#5e91ad'}},nodes:[
    {id:'assento',geometry:{type:'box',width:2,height:.22,depth:2},materialId:'wood_light',position:[0,1.8,0],label:'Assento'},
    {id:'pernas',geometry:{type:'box',width:.18,height:1.7,depth:.18},materialId:'wood_light',position:[0,.85,0],repetition:{type:'grid',counts:[2,1,2],spacing:[1.65,0,1.65],center:true}},
    {id:'encosto',geometry:{type:'box',width:2,height:1.7,depth:.18},materialId:'wood_light',position:[0,2.7,-.9],label:'Encosto'},
    {id:'almofada',geometry:{type:'box',width:1.75,height:.2,depth:1.75},materialId:'fabric',position:[0,2,0]},
  ]},
  castelo: { version:2,title:'Castelo',materials:{pedra:{color:'#c3b4dc'},telhado:{color:'#ba684e'},porta:{color:'#906343'}},nodes:[
    {id:'muralha',geometry:{type:'box',width:5,height:2.2,depth:.55},materialId:'pedra',position:[0,1.1,0],label:'Muralha'},
    {id:'torres',geometry:{type:'cylinder',radiusTop:.65,radiusBottom:.65,height:3.6},materialId:'pedra',position:[-2.5,1.8,0],repetition:{type:'linear',count:2,offset:[5,0,0]},label:'Torres'},
    {id:'telhados',geometry:{type:'cone',radius:.86,height:1.2},materialId:'telhado',position:[-2.5,4.2,0],repetition:{type:'linear',count:2,offset:[5,0,0]}},
    {id:'portao',geometry:{type:'box',width:1.1,height:1.6,depth:.12},materialId:'porta',position:[0,.8,.3],label:'Portão'},
    {id:'ameias',geometry:{type:'box',width:.38,height:.4,depth:.6},materialId:'pedra',position:[-1.8,2.4,0],repetition:{type:'linear',count:7,offset:[.6,0,0]}},
  ]}, ...freeScenes,
};
function SimulatedFailure():never {throw new Error('Falha simulada no laboratório 3D.');}
function Lab(){
  const [name,setName]=useState('castelo');const [fault,setFault]=useState(false);
  return <main style={{height:'100vh',display:'grid',gridTemplateRows:'70px 1fr',background:'#0a1018'}}>
    <header style={{display:'flex',alignItems:'center',gap:24,padding:'0 24px',color:'#d4e4ec'}}><strong>JASPER / ESTÚDIO 3D</strong><label>Cena de verificação <select aria-label="Cena de verificação" value={name} onChange={e=>{setFault(false);setName(e.target.value);}}>{Object.keys(scenes).map(id=><option key={id} value={id}>{id}</option>)}</select></label><span style={{fontSize:12,color:'#96a7b9'}}>Arraste para explorar · role para aproximar</span><button type="button" onClick={()=>setFault(true)}>Testar recuperação</button></header>
    <PresentationErrorBoundary resetKey={name} onRetry={()=>setFault(false)} onClose={()=>setFault(false)}>{fault?<SimulatedFailure />:<Presentation3D step={{kind:'model3d',title:scenes[name].title||name,narration:'',scene:scenes[name]}} />}</PresentationErrorBoundary>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Lab />);
