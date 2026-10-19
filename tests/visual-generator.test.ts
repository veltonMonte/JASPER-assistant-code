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
  assert.deepEqual(visualGenerationConfig('models/gemini-2.5-flash').thinkingConfig,{thinkingBudget:1024});
  assert.deepEqual(visualGenerationConfig('models/gemini-3.8-flash').thinkingConfig,{thinkingLevel:'low'});
});

test('cache reaproveita só criações autocontidas, revalida e separa conversas',async()=>{
  let calls=0,executions=0;
  const generator=new VisualGenerator({apiKey:'chave-falsa',preferredModel:'teste',listModels:async()=>models,
    generate:async()=>{calls++;return JSON.stringify({scene:freeScenes.abajur,title:'Abajur',narration:'Uma luminária.'});},
    execute:async(args)=>{executions++;assert.ok(args.sceneJson);return {success:true};}});
  assert.equal((await generator.generate('Crie uma luminária.','a')).generation.cached,false);
  assert.equal((await generator.generate('Crie uma luminária.','a')).generation.cached,true);
  assert.equal(calls,1);assert.equal(executions,2);
  await generator.generate('Crie uma luminária.','b');assert.equal(calls,2);
  await generator.generate('Aumente essa luminária.','a');await generator.generate('Aumente essa luminária.','a');assert.equal(calls,4);
});
test('cache é limitado e não guarda documentos rejeitados',async()=>{
  let calls=0;
  const generator=new VisualGenerator({apiKey:'chave-falsa',preferredModel:'teste',listModels:async()=>models,
    generate:async()=>{calls++;return JSON.stringify({scene:freeScenes.abajur,title:'Objeto',narration:'Teste.'});},execute:async()=>({success:true})});
  for(let i=0;i<10;i++)await generator.generate(`Crie um objeto ${i}.`,'a');
  await generator.generate('Crie um objeto 0.','a');assert.equal(calls,11);
  const failing=new VisualGenerator({apiKey:'chave-falsa',preferredModel:'teste',listModels:async()=>models,generate:async()=>{calls++;return '{}';},execute:async()=>({success:false,repairable:false})});
  await assert.rejects(failing.generate('Crie um objeto.','a'));await assert.rejects(failing.generate('Crie um objeto.','a'));assert.equal(calls,13);
});


test('criações que se referem à cena anterior não são reaproveitadas do cache',async()=>{
  let calls=0;
  const generator=new VisualGenerator({apiKey:'chave-falsa',preferredModel:'teste',listModels:async()=>models,
    generate:async()=>{calls++;return JSON.stringify({scene:freeScenes.abajur,title:'Abajur',narration:'Teste.'});},execute:async()=>({success:true})});
  for(const request of ['Crie uma versão deste objeto.','Crie uma vista em corte.','Crie outro carro.']){
    await generator.generate(request,'dono');await generator.generate(request,'dono');
  }
  assert.equal(calls,6);
});


test('seleção visual prioriza Flash completo mais recente anunciado, preservando fallback',()=>{
  const catalog=[{name:'models/gemini-2.5-flash',supportedGenerationMethods:['generateContent']},{name:'models/gemini-3.1-flash',supportedGenerationMethods:['generateContent']},{name:'models/gemini-3.5-flash-lite',supportedGenerationMethods:['generateContent']}];
  assert.equal(selectVisualModel(catalog,'gemini-2.5-flash'),'models/gemini-3.1-flash');
  assert.equal(selectVisualModel(catalog,'gemini-2.5-flash',['models/gemini-3.1-flash']),'models/gemini-2.5-flash');
});


test('modelo Flash novo recusado retorna ao modelo anunciado anterior',async()=>{
  for(const status of [403,429,503]){
  const used:string[]=[];
  const generator=new VisualGenerator({apiKey:'chave-falsa',preferredModel:'gemini-2.5-flash',listModels:async()=>[{name:'models/gemini-2.5-flash',supportedGenerationMethods:['generateContent']},...models],
    generate:async(model)=>{used.push(model);if(model!=='models/gemini-2.5-flash')throw {response:{status}};return JSON.stringify({scene:freeScenes.abajur,title:'Objeto',narration:'Teste.'});},execute:async()=>({success:true})});
  assert.equal((await generator.generate('Crie uma luminária.','dono')).success,true);assert.deepEqual(used,['models/gemini-3.8-flash','models/gemini-2.5-flash']);
  }
});
