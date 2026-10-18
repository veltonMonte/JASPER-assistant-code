import { SCENE_BUDGETS as B } from '../../shared/scene-capabilities.js';
import type { SceneSpec, SceneNode, SceneGeometryDef, SceneMaterialDef, SceneRepetition, SceneTransform, Vec2, Vec3 } from '../../shared/scene-types.js';

export class SceneValidationError extends Error {
  readonly issues: { path: string; message: string }[];
  constructor(path: string, message: string) { super(`Cena inválida em ${path}: ${message}`); this.name='SceneValidationError'; this.issues=[{path,message}]; }
}
const fail=(p:string,m:string):never=>{throw new SceneValidationError(p,m);};
const obj=(v:unknown,p:string):Record<string,any>=>v && typeof v==='object' && !Array.isArray(v) ? v as Record<string,any> : fail(p,'use um objeto');
const keys=(v:Record<string,any>,allowed:string[],p:string)=>{for(const k of Object.keys(v))if(!allowed.includes(k))fail(`${p}.${k}`,'campo desconhecido');};
const num=(v:unknown,p:string,min=0.0001,max=100):number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:fail(p,`use número entre ${min} e ${max}`);
const integer=(v:unknown,p:string,min:number,max:number)=>{const n=num(v,p,min,max);return Number.isInteger(n)?n:fail(p,'use um inteiro');};
const text=(v:unknown,p:string,max=120):string=>typeof v==='string'&&v.trim()&&v.length<=max?v.trim():fail(p,`use texto de até ${max} caracteres`);
const id=(v:unknown,p:string)=>{const s=text(v,p,64);return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s)&&!['constructor','prototype','__proto__'].includes(s)?s:fail(p,'identificador inválido');};
const vec=(v:unknown,p:string,n=3,min=-100,max=100):number[]=>Array.isArray(v)&&v.length===n?v.map((x,i)=>num(x,`${p}[${i}]`,min,max)):fail(p,`use ${n} coordenadas`);
const bool=(v:unknown,p:string)=>typeof v==='boolean'?v:fail(p,'use true ou false');
const hex=(v:unknown,p:string)=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)?v:fail(p,'use cor #RRGGBB');
const list=(v:unknown,p:string,min:number,max:number):any[]=>Array.isArray(v)&&v.length>=min&&v.length<=max?v:fail(p,`use de ${min} a ${max} itens`);
const cross=(a:Vec2,b:Vec2,c:Vec2)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const on=(a:Vec2,b:Vec2,c:Vec2)=>Math.abs(cross(a,b,c))<1e-8&&c[0]>=Math.min(a[0],b[0])-1e-8&&c[0]<=Math.max(a[0],b[0])+1e-8&&c[1]>=Math.min(a[1],b[1])-1e-8&&c[1]<=Math.max(a[1],b[1])+1e-8;
function intersects(a:Vec2,b:Vec2,c:Vec2,d:Vec2):boolean {return cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);}
function polygon(value:unknown,p:string):Vec2[] {
  const points=list(value,p,3,B.maxExtrudePoints).map((v,i)=>vec(v,`${p}[${i}]`,2) as Vec2);
  const area=points.reduce((s,a,i)=>{const b=points[(i+1)%points.length];return s+a[0]*b[1]-b[0]*a[1];},0);
  if(Math.abs(area)<1e-8)fail(p,'contorno sem área');
  for(let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length];if(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-7)fail(p,'pontos consecutivos repetidos');
    for(let j=i+1;j<points.length;j++)if(j!==i+1&&!(i===0&&j===points.length-1)&&intersects(a,b,points[j],points[(j+1)%points.length]))fail(p,'contorno cruza a si mesmo');
  }
  return points;
}
function inside(point:Vec2,poly:Vec2[]):boolean {let result=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(on(a,b,point))return false;if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])result=!result;}return result;}
function disjoint(a:Vec2[],b:Vec2[]):boolean {return !a.some((x,i)=>b.some((y,j)=>intersects(x,a[(i+1)%a.length],y,b[(j+1)%b.length])));}
const segmentKeys=['widthSegments','heightSegments','radialSegments','tubularSegments','capSegments','segments'];
const geometryKeys:Record<SceneGeometryDef['type'],string[]>={box:['width','height','depth'],sphere:['radius','widthSegments','heightSegments'],cylinder:['radiusTop','radiusBottom','height','radialSegments'],cone:['radius','height','radialSegments'],capsule:['radius','length','capSegments','radialSegments'],torus:['radius','tube','radialSegments','tubularSegments'],plane:['width','height'],extrude:['path','holes','depth','bevelEnabled','bevelThickness','bevelSize'],lathe:['points','segments','phiStart','phiLength'],tube:['path','radius','tubularSegments','radialSegments','closed'],mesh:['vertices','faces']};
export function parseGeometry(value:unknown,p='geometry'):SceneGeometryDef {
  const raw=obj(value,p),type=raw.type as SceneGeometryDef['type'];if(!Object.hasOwn(geometryKeys,type))return fail(`${p}.type`,'operação desconhecida');keys(raw,['type',...geometryKeys[type]],p);
  const out:Record<string,any>={type};
  const required:Record<string,string[]>={box:['width','height','depth'],sphere:['radius'],cylinder:['radiusTop','radiusBottom','height'],cone:['radius','height'],capsule:['radius','length'],torus:['radius','tube'],plane:['width','height'],extrude:['depth'],tube:['radius']};
  for(const key of required[type]||[])out[key]=num(raw[key],`${p}.${key}`,['radiusTop','radiusBottom','length'].includes(key)?0:.0001);
  if(type==='cylinder'&&out.radiusTop===0&&out.radiusBottom===0)fail(p,'cilindro sem raio');
  for(const key of segmentKeys)if(raw[key]!==undefined)out[key]=integer(raw[key],`${p}.${key}`,3,key==='tubularSegments'?96:32);
  if(type==='extrude') {
    out.path=polygon(raw.path,`${p}.path`);out.holes=raw.holes===undefined?[]:list(raw.holes,`${p}.holes`,0,B.maxHolesPerExtrude).map((v,i)=>polygon(v,`${p}.holes[${i}]`));
    if(out.path.length+out.holes.reduce((s:number,h:Vec2[])=>s+h.length,0)>B.maxExtrudePoints)fail(p,'contornos excedem o orçamento');
    for(let i=0;i<out.holes.length;i++){const h=out.holes[i];if(!h.every((point:Vec2)=>inside(point,out.path))||!disjoint(h,out.path))fail(`${p}.holes[${i}]`,'furo deve ficar dentro do contorno');for(let j=0;j<i;j++)if(!disjoint(h,out.holes[j])||inside(h[0],out.holes[j])||inside(out.holes[j][0],h))fail(p,'furos se sobrepõem');}
    if(raw.bevelEnabled!==undefined)out.bevelEnabled=bool(raw.bevelEnabled,`${p}.bevelEnabled`);
    for(const k of ['bevelSize','bevelThickness'])if(raw[k]!==undefined)out[k]=num(raw[k],`${p}.${k}`,0,Math.min(1,out.depth/2));
  }
  if(type==='lathe') {
    out.points=list(raw.points,`${p}.points`,2,64).map((v,i)=>{const point=vec(v,`${p}.points[${i}]`,2) as Vec2;if(point[0]<0)fail(p,'raio do perfil negativo');return point;});
    if(out.points.every((v:Vec2)=>v[0]===0))fail(p,'perfil sem raio');
    for(const k of ['phiStart','phiLength'])if(raw[k]!==undefined)out[k]=num(raw[k],`${p}.${k}`,k==='phiLength'?.01:0,Math.PI*2);
  }
  if(type==='tube') {
    out.path=list(raw.path,`${p}.path`,2,64).map((v,i)=>vec(v,`${p}.path[${i}]`) as Vec3);
    if(out.path.some((v:Vec3,i:number)=>i>0&&Math.hypot(...v.map((x,j)=>x-out.path[i-1][j]))<1e-6))fail(p,'pontos da curva repetidos');
    if(raw.closed!==undefined)out.closed=bool(raw.closed,`${p}.closed`);
    if(out.closed&&out.path.length<3)fail(p,'curva fechada exige três pontos');
  }
  if(type==='mesh') {
    out.vertices=list(raw.vertices,`${p}.vertices`,3,B.maxMeshVertices).map((v,i)=>vec(v,`${p}.vertices[${i}]`));
    out.faces=list(raw.faces,`${p}.faces`,1,B.maxMeshFaces).map((face,i)=>{const f=list(face,`${p}.faces[${i}]`,3,3).map((x,j)=>integer(x,`${p}.faces[${i}][${j}]`,0,out.vertices.length-1));if(new Set(f).size!==3)fail(p,'face degenerada');const [a,b,c]=f.map(j=>out.vertices[j]);const u=b.map((x:number,j:number)=>x-a[j]),v=c.map((x:number,j:number)=>x-a[j]);if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<1e-10)fail(p,'triângulo sem área');return f;});
  }
  return out as SceneGeometryDef;
}
export function parseMaterial(value:unknown,p='material'):SceneMaterialDef {
  const raw=obj(value,p);keys(raw,['color','roughness','metalness','emissive','emissiveIntensity','opacity','transparent','wireframe'],p);
  const out:SceneMaterialDef={color:hex(raw.color,`${p}.color`)};
  for(const k of ['roughness','metalness','opacity','emissiveIntensity'] as const)if(raw[k]!==undefined)out[k]=num(raw[k],`${p}.${k}`,0,k==='emissiveIntensity'?2:1);
  if(raw.emissive!==undefined)out.emissive=hex(raw.emissive,`${p}.emissive`);
  for(const k of ['transparent','wireframe'] as const)if(raw[k]!==undefined)out[k]=bool(raw[k],`${p}.${k}`);
  return out;
}
function transform(raw:Record<string,any>,p:string):SceneTransform {const out:SceneTransform={};for(const k of ['position','rotation','scale'] as const)if(raw[k]!==undefined)out[k]=vec(raw[k],`${p}.${k}`,3,k==='scale'?B.scaleMin:k==='rotation'?-Math.PI*20:-B.coordinateBound,k==='scale'?B.scaleMax:k==='rotation'?Math.PI*20:B.coordinateBound) as Vec3;return out;}
export function repetitionCount(repetition?:SceneRepetition):number {return !repetition?1:repetition.type==='grid'?repetition.counts.reduce((a,b)=>a*b,1):repetition.type==='transforms'?repetition.instances.length:repetition.count;}
function repetition(value:unknown,p:string):SceneRepetition {
  const raw=obj(value,p),type=raw.type;
  if(type==='linear'){keys(raw,['type','count','offset'],p);return {type,count:integer(raw.count,`${p}.count`,1,B.maxTotalInstances),offset:vec(raw.offset,`${p}.offset`) as Vec3};}
  if(type==='grid'){keys(raw,['type','counts','spacing','center'],p);const counts=list(raw.counts,`${p}.counts`,3,3).map((x,i)=>integer(x,`${p}.counts[${i}]`,1,B.maxTotalInstances)) as Vec3;return {type,counts,spacing:vec(raw.spacing,`${p}.spacing`) as Vec3,...(raw.center!==undefined?{center:bool(raw.center,`${p}.center`)}:{})};}
  if(type==='radial'){keys(raw,['type','count','radius','axis','startAngle','arc'],p);if(raw.axis!==undefined&&!['x','y','z'].includes(raw.axis))fail(p,'eixo inválido');return {type,count:integer(raw.count,`${p}.count`,1,B.maxTotalInstances),radius:num(raw.radius,`${p}.radius`,0),...(raw.axis?{axis:raw.axis}:{}),...(raw.startAngle!==undefined?{startAngle:num(raw.startAngle,`${p}.startAngle`,-Math.PI*20,Math.PI*20)}:{}),...(raw.arc!==undefined?{arc:num(raw.arc,`${p}.arc`,.001,Math.PI*2)}:{})};}
  if(type==='transforms'){keys(raw,['type','instances'],p);return {type,instances:list(raw.instances,`${p}.instances`,1,B.maxTotalInstances).map((v,i)=>{const item=obj(v,`${p}.instances[${i}]`);keys(item,['position','rotation','scale'],p);return transform(item,p);})};}
  return fail(p,'repetição desconhecida');
}
/** Estimativa conservadora do custo máximo do compilador, antes dos tiers. */
export function geometryCost(g:SceneGeometryDef):{vertices:number;triangles:number} {
  let triangles:number;
  switch(g.type){case 'box':triangles=12;break;case 'plane':triangles=2;break;case 'sphere':triangles=(g.widthSegments||24)*(g.heightSegments||16)*2;break;case 'cylinder':case 'cone':triangles=(g.radialSegments||24)*4;break;case 'capsule':triangles=(g.radialSegments||16)*((g.capSegments||8)*4+2);break;case 'torus':triangles=(g.radialSegments||12)*(g.tubularSegments||32)*2;break;case 'tube':triangles=(g.tubularSegments||48)*(g.radialSegments||8)*2;break;case 'lathe':triangles=(g.segments||24)*(g.points.length-1)*2;break;case 'extrude':{const points=g.path.length+(g.holes||[]).reduce((s,h)=>s+h.length,0);triangles=(points+2*(g.holes?.length||0))*2+points*2*(g.bevelEnabled?5:1);break;}case 'mesh':return {vertices:g.vertices.length,triangles:g.faces.length};}
  const vertices=g.type==='sphere'?((g.widthSegments||24)+1)*((g.heightSegments||16)+1):g.type==='tube'?((g.tubularSegments||48)+1)*((g.radialSegments||8)+1):g.type==='box'?24:g.type==='plane'?4:g.type==='extrude'?triangles*3:triangles*2;
  return {vertices,triangles};
}
export function parseSceneSpec(input:unknown):SceneSpec {
  let value=input;
  if(typeof input==='string'){if(new TextEncoder().encode(input).length>B.maxJsonBytes)fail('$','documento grande demais');try{value=JSON.parse(input);}catch{fail('$','JSON inválido');}}
  else {try {if(new TextEncoder().encode(JSON.stringify(input)).length>B.maxJsonBytes)fail('$','documento grande demais');}catch(error){if(error instanceof SceneValidationError)throw error;fail('$','estrutura circular ou inválida');}}
  const raw=obj(value,'$');keys(raw,['version','id','title','metadata','geometries','materials','nodes','pointsOfInterest'],'$');if(raw.version!==2)fail('version','use a versão 2');
  const scene:SceneSpec={version:2,nodes:[]};if(raw.id!==undefined)scene.id=id(raw.id,'id');if(raw.title!==undefined)scene.title=text(raw.title,'title');
  if(raw.metadata!==undefined){const m=obj(raw.metadata,'metadata');keys(m,['unit','dimensions','view','description','tags'],'metadata');scene.metadata={};if(m.unit!==undefined){if(!['meter','centimeter','millimeter','generic'].includes(m.unit))fail('metadata.unit','unidade inválida');scene.metadata.unit=m.unit;}if(m.view!==undefined){if(!['perspective','top','isometric','front'].includes(m.view))fail('metadata.view','vista inválida');scene.metadata.view=m.view;}if(m.dimensions!==undefined)scene.metadata.dimensions=vec(m.dimensions,'metadata.dimensions',3,.0001,1000) as Vec3;if(m.description!==undefined)scene.metadata.description=text(m.description,'metadata.description',500);if(m.tags!==undefined)scene.metadata.tags=list(m.tags,'metadata.tags',0,8).map((v,i)=>text(v,`metadata.tags[${i}]`,40));}
  for(const field of ['geometries','materials'] as const)if(raw[field]!==undefined){const dictionary=obj(raw[field],field);if(Object.keys(dictionary).length>(field==='geometries'?B.maxGeometries:B.maxMaterials))fail(field,'dicionário grande demais');const result:Record<string,any>={};for(const [key,v]of Object.entries(dictionary)){id(key,`${field}.${key}`);result[key]=field==='geometries'?parseGeometry(v,`${field}.${key}`):parseMaterial(v,`${field}.${key}`);}Object.assign(scene,{[field]:result});}
  const ids=new Set<string>();let nodes=0,instances=0,vertices=0,triangles=0,labels=0,drawables=0;
  const visit=(value:unknown,p:string,depth:number,multiplier:number,parentScale:number):SceneNode=>{
    if(depth>B.maxHierarchyDepth)fail(p,'hierarquia profunda demais');if(++nodes>B.maxTotalNodes)fail(p,'nós demais');
    const n=obj(value,p);keys(n,['id','name','geometryId','materialId','geometry','material','position','rotation','scale','repetition','label','description','children'],p);
    const node:SceneNode={id:id(n.id,`${p}.id`),...transform(n,p)};if(ids.has(node.id))fail(`${p}.id`,'id repetido');ids.add(node.id);
    const scale=parentScale*Math.max(...(node.scale||[1,1,1]));if(scale>1000)fail(`${p}.scale`,'escala acumulada grande demais');
    if(n.name!==undefined)node.name=text(n.name,`${p}.name`,80);if(n.description!==undefined)node.description=text(n.description,`${p}.description`,300);
    if(n.label!==undefined){node.label=text(n.label,`${p}.label`,55);if(++labels>B.maxLabels)fail(p,'rótulos demais');}
    if(n.geometryId!==undefined){node.geometryId=id(n.geometryId,`${p}.geometryId`);if(!Object.hasOwn(scene.geometries||{},node.geometryId))fail(p,'referência de geometria inexistente');}
    if(n.materialId!==undefined){node.materialId=id(n.materialId,`${p}.materialId`);if(!Object.hasOwn(scene.materials||{},node.materialId))fail(p,'referência de material inexistente');}
    if(n.geometry!==undefined){if(node.geometryId)fail(p,'escolha geometry ou geometryId');node.geometry=parseGeometry(n.geometry,`${p}.geometry`);}
    if(n.material!==undefined){if(node.materialId)fail(p,'escolha material ou materialId');node.material=parseMaterial(n.material,`${p}.material`);}
    if(n.repetition!==undefined)node.repetition=repetition(n.repetition,`${p}.repetition`);
    const copies=multiplier*repetitionCount(node.repetition);if(copies>B.maxTotalInstances)fail(p,'repetição excede o orçamento');
    const g=node.geometry||scene.geometries?.[node.geometryId||''];
    if(g){drawables++;instances+=copies;const cost=geometryCost(g);vertices+=cost.vertices*copies;triangles+=cost.triangles*copies;}
    else if(n.material||n.materialId)fail(p,'material sem geometria');
    if(instances>B.maxTotalInstances||vertices>B.maxVertices||triangles>B.maxTriangles)fail(p,'orçamento de instâncias, vértices ou triângulos excedido');
    if(n.children!==undefined)node.children=list(n.children,`${p}.children`,0,B.maxTotalNodes).map((v,i)=>visit(v,`${p}.children[${i}]`,depth+1,copies,scale));
    if(!g&&!node.children?.length)fail(p,'grupo vazio');return node;
  };
  scene.nodes=list(raw.nodes,'nodes',1,B.maxTotalNodes).map((v,i)=>visit(v,`nodes[${i}]`,1,1,1));if(!drawables)fail('nodes','cena sem geometria');
  if(raw.pointsOfInterest!==undefined){const pointIds=new Set<string>();scene.pointsOfInterest=list(raw.pointsOfInterest,'pointsOfInterest',0,24).map((v,i)=>{const p=`pointsOfInterest[${i}]`,point=obj(v,p);keys(point,['id','name','position','target','distance'],p);const key=id(point.id,`${p}.id`);if(pointIds.has(key))fail(p,'id repetido');pointIds.add(key);return {id:key,name:text(point.name,`${p}.name`,55),position:vec(point.position,`${p}.position`) as Vec3,...(point.target!==undefined?{target:vec(point.target,`${p}.target`) as Vec3}:{}),...(point.distance!==undefined?{distance:num(point.distance,`${p}.distance`,.01,1000)}:{})};});}
  return scene;
}
