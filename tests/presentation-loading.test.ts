import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWithRetry } from '../client/src/lib/loadWithRetry.js';

test('abertura recupera falha temporária de rede sem recarregar a conversa',async()=>{
  let calls=0;const waits:number[]=[];
  const component=await loadWithRetry(async()=>{if(calls++===0)throw new Error('Failed to fetch dynamically imported module');return {default:'Tela'};},async(ms)=>{waits.push(ms);});
  assert.deepEqual(component,{default:'Tela'});assert.equal(calls,2);assert.deepEqual(waits,[250]);
});
test('abertura limita tentativas e não repete erros de programação',async()=>{
  let calls=0;
  await assert.rejects(loadWithRetry(async()=>{calls++;throw new Error('network error');},async()=>{}),/network/);assert.equal(calls,3);
  calls=0;await assert.rejects(loadWithRetry(async()=>{calls++;throw new Error('Objeto inválido');},async()=>{}),/Objeto inválido/);assert.equal(calls,1);
});
