import type { SceneGeometryDef, SceneNode, SceneSpec, SceneTransform, Vec3 } from './scene-types.js';

export interface Placement {
  on?: string; under?: string; beside?: string;
  side?: 'left' | 'right' | 'front' | 'back';
  align?: 'center' | 'left' | 'right' | 'front' | 'back';
  floor?: number; gap?: number; inset?: number; offset?: Vec3;
}
type Bounds = { min: Vec3; max: Vec3 };
const empty = (): Bounds => ({ min: [Infinity,Infinity,Infinity], max: [-Infinity,-Infinity,-Infinity] });
const include = (box: Bounds, point: Vec3) => { for(let i=0;i<3;i++){box.min[i]=Math.min(box.min[i],point[i]);box.max[i]=Math.max(box.max[i],point[i]);} };
const union = (a: Bounds,b: Bounds) => { include(a,b.min);include(a,b.max);return a; };
const sized = (x:number,y:number,z:number): Bounds => ({min:[-x/2,-y/2,-z/2],max:[x/2,y/2,z/2]});
function pointsBounds(points: Vec3[], radius=0): Bounds {
  const box=empty();for(const p of points)include(box,p);
  for(let i=0;i<3;i++){box.min[i]-=radius;box.max[i]+=radius;}return box;
}
function geometryBounds(g:SceneGeometryDef):Bounds {
  switch(g.type){
    case 'box':return sized(g.width,g.height,g.depth);
    case 'sphere':return sized(g.radius*2,g.radius*2,g.radius*2);
    case 'capsule':return sized(g.radius*2,g.length+g.radius*2,g.radius*2);
    case 'cylinder':{const r=Math.max(g.radiusTop,g.radiusBottom);return sized(r*2,g.height,r*2);}
    case 'cone':return sized(g.radius*2,g.height,g.radius*2);
    case 'torus':return sized((g.radius+g.tube)*2,(g.radius+g.tube)*2,g.tube*2);
    case 'plane':return sized(g.width,g.height,0);
    case 'mesh':return pointsBounds(g.vertices);
    case 'tube':return pointsBounds(g.path,g.radius);
    case 'lathe':{const r=Math.max(...g.points.map(p=>p[0]));return {min:[-r,Math.min(...g.points.map(p=>p[1])),-r],max:[r,Math.max(...g.points.map(p=>p[1])),r]};}
    case 'extrude':{const b=g.bevelEnabled?(g.bevelSize??Math.min(.02,g.depth/4)):0;const t=g.bevelEnabled?(g.bevelThickness??Math.min(.02,g.depth/4)):0;const box=pointsBounds(g.path.map(([x,y])=>[x,y,0]),b);box.min[2]=-t;box.max[2]=g.depth+t;return box;}
  }
}
/** Mesma convenção Euler XYZ do renderizador: escala, Z, Y, X, translação. */
function transformBounds(box:Bounds, transform:SceneTransform):Bounds {
  const result=empty(),s=transform.scale||[1,1,1],r=transform.rotation||[0,0,0],p=transform.position||[0,0,0];
  const [cx,cy,cz]=r.map(Math.cos),[sx,sy,sz]=r.map(Math.sin);
  for(let i=0;i<8;i++){
    let x=(i&1?box.max[0]:box.min[0])*s[0],y=(i&2?box.max[1]:box.min[1])*s[1],z=(i&4?box.max[2]:box.min[2])*s[2];
    [x,y]=[x*cz-y*sz,x*sz+y*cz];[x,z]=[x*cy+z*sy,-x*sy+z*cy];[y,z]=[y*cx-z*sx,y*sx+z*cx];
    include(result,[x+p[0],y+p[1],z+p[2]]);
  }
  return result;
}
function repeatedBounds(box:Bounds,node:SceneNode):Bounds {
  const rep=node.repetition;if(!rep)return box;
  const result=empty();const add=(t:SceneTransform)=>union(result,transformBounds(box,t));
  if(rep.type==='transforms')rep.instances.forEach(add);
  if(rep.type==='linear')for(let i=0;i<rep.count;i++)add({position:rep.offset.map(v=>v*i) as Vec3});
  if(rep.type==='grid')for(let x=0;x<rep.counts[0];x++)for(let y=0;y<rep.counts[1];y++)for(let z=0;z<rep.counts[2];z++)add({position:[x,y,z].map((v,i)=>(v-(rep.center?(rep.counts[i]-1)/2:0))*rep.spacing[i]) as Vec3});
  if(rep.type==='radial')for(let i=0;i<rep.count;i++){
    const a=(rep.startAngle||0)+i*(rep.arc||Math.PI*2)/rep.count,axis=rep.axis||'y',c=Math.cos(a)*rep.radius,s=Math.sin(a)*rep.radius;
    add({position:axis==='y'?[c,0,s]:axis==='x'?[0,c,s]:[c,s,0],rotation:axis==='y'?[0,-a,0]:axis==='x'?[a,0,0]:[0,0,a]});
  }
  return result;
}

/** Resolve referências entre irmãos ou ao corpo geométrico do pai, sem executar expressões. */
export function resolvePlacements(input:SceneSpec):SceneSpec {
  const scene=structuredClone(input);
  const resolveLevel=(nodes:SceneNode[],parentAnchor?:{id:string;bounds:Bounds}):Map<string,Bounds>=>{
    const byId=new Map(nodes.map(n=>[n.id,n])),bounds=new Map<string,Bounds>(),visiting=new Set<string>();
    const resolve=(node:SceneNode):Bounds=>{
      if(bounds.has(node.id))return bounds.get(node.id)!;
      if(visiting.has(node.id))throw new Error(`place.${node.id}: relação circular entre peças`);
      visiting.add(node.id);
      const def=node.geometry||scene.geometries?.[node.geometryId||''];let box=def?geometryBounds(def):empty();
      for(const child of resolveLevel(node.children||[],def?{id:node.id,bounds:geometryBounds(def)}:undefined).values())union(box,child);
      box=transformBounds(repeatedBounds(box,node),{rotation:node.rotation,scale:node.scale});
      const place=node.place;
      if(place){
        const targetId=place.on||place.under||place.beside;
        const ownCenter=box.min.map((v,i)=>(v+box.max[i])/2);
        const position:Vec3=[-ownCenter[0],0,-ownCenter[2]];
        if(targetId){
          const target=byId.get(targetId);
          const ref=target?resolve(target):parentAnchor?.id===targetId?parentAnchor.bounds:undefined;
          if(!ref)throw new Error(`place.${node.id}: referência ${targetId} deve ser um irmão ou o pai com geometria`);
          const center=ref.min.map((v,i)=>(v+ref.max[i])/2);
          for(let i=0;i<3;i++)position[i]=center[i]-ownCenter[i];
          const thickness=Math.min(...box.max.map((v,i)=>v-box.min[i]).filter(v=>v>0));
          const gap=place.gap??(-.002*Math.min(1,thickness));
          if(place.on)position[1]=ref.max[1]-box.min[1]+gap;
          else if(place.under)position[1]=ref.min[1]-box.max[1]-gap;
          else {
            const side=place.side||'right',axis=side==='left'||side==='right'?0:2,positive=side==='right'||side==='front';
            position[axis]=positive?ref.max[axis]-box.min[axis]+gap:ref.min[axis]-box.max[axis]-gap;
            position[1]=ref.min[1]-box.min[1];
          }
          const align=place.align||'center',inset=place.inset||0;
          if(align!=='center'){
            const axis=align==='left'||align==='right'?0:2,positive=align==='right'||align==='front';
            const lateralAxis=(place.side==='front'||place.side==='back')?2:0;
            if(!place.beside||axis!==lateralAxis)position[axis]=positive?ref.max[axis]-box.max[axis]-inset:ref.min[axis]-box.min[axis]+inset;
          }
        } else position[1]=(place.floor??0)-box.min[1];
        for(let i=0;i<3;i++)position[i]+=place.offset?.[i]||0;
        if(position.some(v=>!Number.isFinite(v)||Math.abs(v)>100))throw new Error(`place.${node.id}: posição resolvida fora dos limites`);
        node.position=position;
      }
      box=transformBounds(box,{position:node.position});bounds.set(node.id,box);visiting.delete(node.id);return box;
    };
    nodes.forEach(resolve);return bounds;
  };
  resolveLevel(scene.nodes);return scene;
}
