import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

export interface MicrophoneOwner { readyState:number }
interface Dependencies<T> {
  spawn?:()=>ChildProcessWithoutNullStreams;
  onAudio:(owner:T,pcm:Buffer)=>void;
  onStatus:(owner:T,active:boolean,error?:string)=>void;
}
/** Captura explícita do WO Mic, limitada a uma sessão e sem arquivos de áudio. */
export class LocalMicrophoneCapture<T extends MicrophoneOwner> {
  private child:ChildProcessWithoutNullStreams|null=null;
  private owner:T|null=null;
  private paused=false;
  private pending=Buffer.alloc(0);
  private ready=false;
  private timer:ReturnType<typeof setTimeout>|undefined;
  constructor(private dependencies:Dependencies<T>){}
  owns(owner:T):boolean{return this.owner===owner;}
  busy(owner:T):boolean{return this.owner!==null&&this.owner!==owner;}
  start(owner:T):boolean {
    if(this.child)return this.owner===owner;
    this.owner=owner;this.ready=false;this.paused=false;this.pending=Buffer.alloc(0);
    let child:ChildProcessWithoutNullStreams;
    try {child=this.dependencies.spawn?.()||spawn('parec',['--device=womic_mic.monitor','--raw','--format=s16le','--rate=16000','--channels=1','--latency-msec=80','--process-time-msec=40'],{stdio:'pipe'});}
    catch {this.owner=null;this.dependencies.onStatus(owner,false,'Não consegui abrir a entrada WO Mic do notebook.');return false;}
    this.child=child;
    const fail=()=>{if(this.child===child)this.stop(owner,'A captura do WO Mic encerrou. Confira a conexão do celular e tente novamente.');};
    child.on('error',fail);child.on('close',fail);child.stderr.resume();
    this.timer=setTimeout(()=>{if(this.child===child&&!this.ready)this.stop(owner,'O WO Mic não entregou áudio. Confira a conexão do celular.');},3000);
    child.stdout.on('data',(chunk:Buffer)=>{
      if(this.child!==child)return;
      if(owner.readyState!==1){this.stop(owner);return;}
      if(!this.ready){this.ready=true;clearTimeout(this.timer);this.dependencies.onStatus(owner,true);}
      if(this.paused){this.pending=Buffer.alloc(0);return;}
      if(chunk.length>65536){this.stop(owner,'A entrada de áudio excedeu o limite esperado.');return;}
      this.pending=Buffer.concat([this.pending,chunk]);
      while(this.pending.length>=3200){const frame=this.pending.subarray(0,3200);this.pending=this.pending.subarray(3200);this.dependencies.onAudio(owner,frame);}
    });
    return true;
  }
  pause(owner:T,value:boolean):void {if(this.owner===owner){this.paused=value;this.pending=Buffer.alloc(0);}}
  stop(owner:T,error?:string):void {
    if(this.owner!==owner)return;
    const child=this.child;this.child=null;this.owner=null;this.pending=Buffer.alloc(0);clearTimeout(this.timer);
    if(child){try{child.kill('SIGTERM');}catch{}const terminate=setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null)try{child.kill('SIGKILL');}catch{}},1000);terminate.unref();child.once('close',()=>clearTimeout(terminate));}
    this.dependencies.onStatus(owner,false,error);
  }
}
