import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureAudioRunning, LiveVoiceTurn, canStartManualVoice } from '../client/src/lib/voicePlayback.js';

test('saída suspensa é retomada e bloqueio de autoplay não fica pendurado',async()=>{
  const context:any={state:'suspended',resume:async()=>{context.state='running';}};assert.equal(await ensureAudioRunning(context),true);
  assert.equal(await ensureAudioRunning({state:'suspended',resume:()=>new Promise(()=>{})},10),false);
  assert.equal(await ensureAudioRunning({state:'closed',resume:async()=>{throw new Error('fechado');}}),false);
});
test('resposta somente textual vira leitura natural uma vez e áudio real não duplica',()=>{
  const turn=new LiveVoiceTurn();turn.addText('Olá. ');turn.addText('Estou aqui.');assert.equal(turn.finish(),'Olá. Estou aqui.');assert.equal(turn.finish(),'');
  turn.addText('Resposta falada.');turn.receivedAudio();assert.equal(turn.finish(),'');
  turn.addText('Cancelado.');turn.reset();assert.equal(turn.finish(),'');
  turn.addText('Veja a cena.\n```json\n{"nodes":[]}\n```');assert.equal(turn.finish(),'Veja a cena.');
});

test('leitura manual funciona com escuta armada e respeita o turno em andamento',()=>{
  for(const state of ['IDLE','LISTENING'])assert.equal(canStartManualVoice(state),true);
  for(const state of ['PROCESSING','SPEAKING','ERROR'])assert.equal(canStartManualVoice(state),false);
});
