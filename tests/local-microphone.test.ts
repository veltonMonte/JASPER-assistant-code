import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { LocalMicrophoneCapture } from '../src/voice/local-microphone.js';

class FakeCapture extends EventEmitter {
  stdout=new PassThrough();stderr=new PassThrough();exitCode:null|number=null;signalCode:null|string=null;killed=false;
  kill(signal:string){this.killed=true;this.signalCode=signal;this.emit('close',null,signal);return true;}
}
function fixture(){const child=new FakeCapture(),frames:Buffer[]=[],statuses:any[]=[];let starts=0;
  const capture=new LocalMicrophoneCapture<any>({spawn:()=>{starts++;return child as any;},onAudio:(_owner,frame)=>frames.push(frame),onStatus:(owner,active,error)=>statuses.push({owner,active,error})});
  return {child,capture,frames,statuses,starts:()=>starts};
}
test('captura exige início explícito, tem dono único e entrega PCM em quadros limitados',()=>{
  const f=fixture(),owner={readyState:1},other={readyState:1};assert.equal(f.starts(),0);assert.equal(f.capture.start(owner),true);assert.equal(f.capture.start(other),false);assert.equal(f.starts(),1);
  f.child.stdout.write(Buffer.alloc(1600,1));assert.equal(f.frames.length,0);f.child.stdout.write(Buffer.alloc(1600,2));assert.equal(f.frames.length,1);assert.equal(f.frames[0].length,3200);assert.equal(f.statuses[0].active,true);
  f.capture.stop(other);assert.equal(f.child.killed,false);f.capture.stop(owner);assert.equal(f.child.killed,true);assert.equal(f.statuses.at(-1).active,false);
});
test('pausa descarta áudio e outra sessão não controla a captura',()=>{
  const f=fixture(),owner={readyState:1},other={readyState:1};f.capture.start(owner);f.capture.pause(owner,true);f.child.stdout.write(Buffer.alloc(3200));assert.equal(f.frames.length,0);
  f.capture.pause(other,false);f.child.stdout.write(Buffer.alloc(3200));assert.equal(f.frames.length,0);f.capture.pause(owner,false);f.child.stdout.write(Buffer.alloc(3200));assert.equal(f.frames.length,1);f.capture.stop(owner);
});
test('fechar página, falhar captura ou exceder limite encerra o processo sem enviar gravação antiga',()=>{
  for(const reason of ['closed','error','oversized']){const f=fixture(),owner={readyState:1};f.capture.start(owner);
    if(reason==='closed'){owner.readyState=3;f.child.stdout.write(Buffer.alloc(3200));}
    else if(reason==='error')f.child.emit('error',new Error('falha simulada'));
    else f.child.stdout.write(Buffer.alloc(65537));
    assert.equal(f.child.killed,true);const count=f.frames.length;f.child.stdout.write(Buffer.alloc(3200));assert.equal(f.frames.length,count);assert.equal(f.capture.owns(owner),false);
  }
});
test('dispositivo remoto aprovado não pode ativar microfone do notebook',async()=>{
  const {JasperWebSocketServer}=await import('../src/server/websocket.js');const server=new JasperWebSocketServer()as any;const messages:any[]=[];const remote={readyState:1,send:(json:string)=>messages.push(JSON.parse(json))};
  server.voiceSessions.set(remote,'sessao-falsa');let starts=0;server.localMicrophone={busy:()=>false,start:()=>{starts++;return true;}};
  await server.handleClientMessage(remote,{type:'START_LOCAL_MIC'});assert.equal(starts,0);assert.match(messages.at(-1).error,/computador principal/);
});
test('computador principal autenticado pode iniciar a entrada fixa WO Mic',async()=>{
  const {JasperWebSocketServer}=await import('../src/server/websocket.js');const {wakeWordManager}=await import('../src/voice/wakeword.js');wakeWordManager.setState('IDLE');
  const server=new JasperWebSocketServer()as any,owner={readyState:1,send(){}};server.voiceSessions.set(owner,'sessao-local-falsa');server.masterClients.add(owner);server.geminiLive={isLiveConnected:()=>true,setVisualSession(){}};
  let started:any;server.localMicrophone={busy:()=>false,start:(client:any)=>{started=client;return true;}};await server.handleClientMessage(owner,{type:'START_LOCAL_MIC'});assert.equal(started,owner);
});
