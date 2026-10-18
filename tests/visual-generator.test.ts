import test from 'node:test';
import assert from 'node:assert/strict';
import { VisualGenerator, selectVisualModel, visualGenerationConfig } from '../src/presentation/visual-generator.js';
import { freeScenes } from './fixtures/free-scenes.js';
const models=[{name:'models/gemini-3.8-flash',supportedGenerationMethods:['generateContent']},{name:'models/gemini-3.1-flash-live',supportedGenerationMethods:['generateContent']},{name:'models/gemini-3.8-pro',supportedGenerationMethods:['generateContent']}];
test('geração seleciona um modelo textual anunciado e não usa voz, imagem ou Pro',()=>{
  assert.equal(selectVisualModel(models,'modelo-antigo'),'models/gemini-3.8-flash');assert.throws(()=>selectVisualModel(models,'modelo-antigo',['models/gemini-3.8-flash']));
});
test('geração visual corrige JSON uma vez e usa o executor com a sessão correta',async()=>{
  let count=0;const generator=new VisualGenerator({apiKey:'chave-falsa',preferredModel:'modelo-antigo',listModels:async()=>models,
    generate:async()=>++count===1?'JSON inválido':JSON.stringify({scene:freeScenes.abajur,title:'Abajur',narration:'Uma luminária.'}),
    execute:async(args,session)=>{assert.equal(session,'dono');assert.equal(JSON.parse(args.sceneJson).version,2);return {success:true};}});
  assert.equal((await generator.generate('Modele uma luminária.','dono')).success,true);assert.equal(count,2);
});
test('limite de uso é comunicado sem busca web nem falsa cena pronta',async()=>{
  const generator=new VisualGenerator({apiKey:'chave-falsa',preferredModel:'teste',listModels:async()=>models,generate:async()=>{throw {response:{status:429}};}});
  await assert.rejects(generator.generate('Crie um objeto.','dono'),/limite de uso/);
});
test('modelo indisponível tem tentativas limitadas',async()=>{
  let calls=0;const generator=new VisualGenerator({apiKey:'chave-falsa',preferredModel:'teste',listModels:async()=>models,generate:async()=>{calls++;throw {response:{status:404}};}});
  await assert.rejects(generator.generate('Crie um objeto.','dono'));assert.equal(calls,1);
});

test('configuração reduz latência sem usar thinkingBudget incompatível em modelos novos',()=>{
  assert.deepEqual(visualGenerationConfig('models/gemini-2.5-flash').thinkingConfig,{thinkingBudget:0});
  assert.deepEqual(visualGenerationConfig('models/gemini-3.8-flash').thinkingConfig,{thinkingLevel:'low'});
});
