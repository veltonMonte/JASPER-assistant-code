import { randomUUID } from 'node:crypto';
import { parsePresentation } from './schema.js';
import { parseSceneSpec, SceneValidationError } from './scene-schema.js';
import { currentSceneSession, rememberPresentation, sceneSessions } from './scene-session.js';
import type { Presentation } from '../../shared/presentation-types.js';
const attempts=new Map<string,{count:number;until:number}>();
export function beginSceneTurn(session:string):void {attempts.delete(session);}
export function createVisualPresentation(args:Record<string,any>,session=currentSceneSession()):any {
  const correction=attempts.get(session);if(session&&correction&&correction.until>Date.now()&&correction.count>=3)return {success:false,error:'A cena não passou pela validação após duas correções. Aguarde um novo pedido.',code:'scene_repair_limit',repairable:false};
  try {
    const modes=[args.presentationJson!==undefined,args.sceneJson!==undefined,args.scenePatchJson!==undefined,args.undoScene===true].filter(Boolean).length;
    if(modes>1)throw new SceneValidationError('$','escolha presentationJson, sceneJson, scenePatchJson ou undoScene');
    let presentation:Presentation;
    if(args.presentationJson!==undefined)presentation=parsePresentation(args.presentationJson);
    else if(args.sceneJson!==undefined||args.scenePatchJson!==undefined||args.undoScene===true){
      // Valide os campos de apresentação antes de modificar o histórico da cena.
      const header=parsePresentation({title:args.title||'Estúdio visual',subtitle:args.subtitle||'',steps:[{title:args.title||'Cena livre',narration:args.narration,kind:'drawing',elements:[{type:'text',x:50,y:50,text:'Preparando cena'}]}]});
      const scene=args.sceneJson!==undefined?parseSceneSpec(args.sceneJson):args.scenePatchJson!==undefined?sceneSessions.patch(session,args.scenePatchJson):sceneSessions.undo(session);
      presentation={...header,steps:[{title:args.title||scene.title||'Cena livre',narration:args.narration,kind:'model3d',scene}]};
      if(args.scenePatchJson!==undefined||args.undoScene===true)return {success:true,presentation,message:'Cena atualizada. A interface narra a etapa; não repita a narração.'};
    } else {
      if(!args.preset&&!args.parts)throw new SceneValidationError('sceneJson','envie a geometria livre em sceneJson ou uma apresentação completa em presentationJson; não escolha átomo por padrão');
      presentation=parsePresentation({title:args.title||'Estúdio visual',subtitle:args.subtitle||'',steps:[{title:args.title||'Objeto',narration:args.narration,kind:args.kind||'model3d',...(args.preset?{preset:args.preset}:{}),config:{element:args.element||'carbon',primaryColor:args.primaryColor||'#00f3ff',accentColor:args.accentColor||'#ff007f'},parts:args.parts||[]}]});
    }
    presentation=rememberPresentation(presentation,session);attempts.delete(session);
    return {success:true,presentation,message:'Apresentação preparada. A interface narra cada etapa; não repita a narração.'};
  } catch(error){
    if(session){if(attempts.size>=64)attempts.delete(attempts.keys().next().value!);const previous=attempts.get(session);attempts.set(session,{count:previous&&previous.until>Date.now()?previous.count+1:1,until:Date.now()+120_000});}
    return {success:false,code:'invalid_scene',error:error instanceof Error?error.message:'Cena inválida.',issues:error instanceof SceneValidationError?error.issues:[],repairable:!session||(attempts.get(session)?.count||0)<3,instrucao:'Corrija somente os campos indicados e chame novamente a ferramenta, no máximo duas vezes. Preserve a cena anterior; não substitua por preset.'};
  }
}
