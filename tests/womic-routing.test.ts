import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function runRouting(input:string,target='womic_mic.monitor') {
  const folder=mkdtempSync(join(tmpdir(),'jasper-womic-routing-'));
  try {
    writeFileSync(join(folder,'streams.json'),input);
    writeFileSync(join(folder,'pactl'),`#!/bin/bash\nif [ "$1" = "-f" ]; then cat "$ROUTING_FIXTURE/streams.json"; elif [ "$1" = "move-source-output" ]; then printf '%s %s\\n' "$2" "$3" >> "$ROUTING_FIXTURE/moves"; fi\n`,{mode:0o700});
    writeFileSync(join(folder,'moves'),'');
    const result=spawnSync('/bin/bash',['-c','source "$1"; move_active_recording_streams "$2"','routing-test',resolve('womic-routing.sh'),target],{env:{...process.env,PATH:`${folder}:${process.env.PATH}`,ROUTING_FIXTURE:folder},encoding:'utf8',timeout:5000});
    assert.equal(result.status,0,result.stderr);
    return readFileSync(join(folder,'moves'),'utf8');
  } finally {rmSync(folder,{recursive:true,force:true});}
}

test('ponte de microfone preserva Sunshine, OBS e captura de áudio da tela',()=>{
  const stream=(index:number,name:string,extra={})=>({index,properties:{'application.name':name,...extra}});
  const input=JSON.stringify([stream(7,'Firefox'),stream(8,'sunshine'),stream(9,'Chromium'),stream(10,'OBS'),stream(11,'Chrome',{'stream.capture.sink':'true'}),stream(12,'unknown'),stream(13,'Google Chrome',{'application.process.binary':'chrome'})]);
  assert.equal(runRouting(input),'7 womic_mic.monitor\n9 womic_mic.monitor\n13 womic_mic.monitor\n');
  assert.equal(runRouting(input,'notebook-mic'),'7 notebook-mic\n9 notebook-mic\n13 notebook-mic\n');
});
test('falha de inventário não redireciona gravações indiscriminadamente',()=>{
  for(const input of ['JSON inválido','{}','null','[null,{"index":"7","properties":{"application.name":"Firefox"}}]'])assert.equal(runRouting(input),'');
});
test('funções da ponte e serviço passam na validação de sintaxe',()=>{
  for(const file of ['womic-routing.sh','womic-service.sh'])assert.equal(spawnSync('/bin/bash',['-n',file]).status,0);
});
