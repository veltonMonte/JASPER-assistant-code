/** Aguarda desbloqueio do navegador sem deixar a leitura pendurada indefinidamente. */
export async function ensureAudioRunning(context: Pick<AudioContext,'state'|'resume'>,timeoutMs=1200):Promise<boolean> {
  if(context.state==='running')return true;if(context.state==='closed')return false;
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {return await Promise.race([context.resume().then(()=>context.state==='running').catch(()=>false),new Promise<boolean>(resolve=>{timer=setTimeout(()=>resolve(false),timeoutMs);})]);}
  finally {if(timer)clearTimeout(timer);}
}
/** Um turno sem PCM precisa de leitura natural; um turno com áudio nunca duplica a fala. */
export class LiveVoiceTurn {
  private text='';private hasAudio=false;
  addText(text:string):void {this.text=(this.text+text).slice(0,20000);}
  receivedAudio():void {this.hasAudio=true;}
  reset():void {this.text='';this.hasAudio=false;}
  finish():string {const text=this.hasAudio?'':this.text.replace(/```[\s\S]*?```/g,'').replace(/```[\s\S]*$/g,'').trim();this.reset();return text;}
}

/** A escuta armada pode ceder à leitura solicitada; um turno ocupado deve terminar. */
export function canStartManualVoice(state:string):boolean {return state==='IDLE'||state==='LISTENING';}
