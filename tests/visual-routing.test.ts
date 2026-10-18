import test from 'node:test';
import assert from 'node:assert/strict';
import { isVisualRequest } from '../src/presentation/visual-intent.js';
import { JasperWebSocketServer } from '../src/server/websocket.js';

test('pedidos visuais e edições têm rota textual sem capturar conversas comuns',()=>{
  for(const text of ['Crie uma bicicleta em 3D','Jasper, gere a planta de uma casa','Explique por diagrama o fluxo de uma API'])assert.equal(isVisualRequest(text),true);
  assert.equal(isVisualRequest('Aumente a cauda',true),true);assert.equal(isVisualRequest('Aumente o volume',false),false);assert.equal(isVisualRequest('Que horas são?'),false);
});
test('queda antes de responder recupera uma vez e preserva a sessão solicitante',async()=>{
  const server=new JasperWebSocketServer() as any;const client={readyState:1,send(){}};server.activeClient=client;server.voiceSessions.set(client,'sessao-falsa');server.unansweredLiveRequests.set(client,'pedido de teste');
  const recovered:string[]=[];server.processTextFallback=async(_client:any,text:string)=>{assert.equal(_client,client);recovered.push(text);};
  await server.recoverUnansweredLiveRequest();await server.recoverUnansweredLiveRequest();assert.deepEqual(recovered,['pedido de teste']);
});
test('nenhuma recuperação repete um pedido que já teve resposta ou ferramenta',async()=>{
  const server=new JasperWebSocketServer() as any;const client={readyState:1,send(){}};server.activeClient=client;server.voiceSessions.set(client,'sessao-falsa');let calls=0;server.processTextFallback=async()=>{calls++;};
  await server.recoverUnansweredLiveRequest();assert.equal(calls,0);
});

test('microfone vincula a origem da voz e não transfere um turno ocupado',async()=>{
  const server=new JasperWebSocketServer() as any;const first={readyState:1,send(){}},second={readyState:1,send(){}};let identity='';
  server.voiceSessions.set(first,'sessao-voz-falsa');server.geminiLive={setVisualSession:(id:string)=>{identity=id;}};
  const {wakeWordManager}=await import('../src/voice/wakeword.js');wakeWordManager.setState('IDLE');
  assert.equal(server.adoptVoiceClient(first),true);assert.equal(server.activeClient,first);assert.equal(identity.length,64);
  wakeWordManager.setState('PROCESSING');assert.equal(server.adoptVoiceClient(second),false);assert.equal(server.activeClient,first);wakeWordManager.setState('IDLE');
});
