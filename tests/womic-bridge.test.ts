import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const helper=resolve('womic-bridge.sh');
function fixture(run:(folder:string)=>void) {
  const folder=mkdtempSync(join(tmpdir(),'jasper-womic-bridge-'));
  try{run(folder);}finally{rmSync(folder,{recursive:true,force:true});}
}
function shell(folder:string,body:string) {
  return spawnSync('/bin/bash',['-c',`source "$1"\n${body}`,'bridge-test',helper],{env:{...process.env,TMPDIR:folder,BRIDGE_TEST_DIR:folder},encoding:'utf8',timeout:5000});
}

test('exige placa Loopback real e seleciona o mesmo subdispositivo do cliente',()=>fixture(folder=>{
  const cards=join(folder,'cards');writeFileSync(cards,' 0 [Notebook       ]: HDA - Notebook\n');
  let result=shell(folder,'find_loopback_device "$BRIDGE_TEST_DIR/cards"');assert.equal(result.status,1);assert.equal(result.stdout,'');
  writeFileSync(cards,' 0 [Notebook       ]: HDA - Notebook\n 2 [Loopback       ]: Loopback - Loopback\n');
  result=shell(folder,'find_loopback_device "$BRIDGE_TEST_DIR/cards"');assert.equal(result.status,0);assert.equal(result.stdout,'plughw:2,1,0\n');
}));

test('cliente encerrado não seleciona microfone vazio nem inicia processos',()=>fixture(folder=>{
  const result=shell(folder,`find_loopback_device(){ echo plughw:2,1,0; }
MICCLIENT_PID=999999999
arecord(){ echo indevido; }
pactl(){ echo indevido; }
if start_audio_bridge; then exit 1; fi`);
  assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'');
}));

test('falha na captura encerra a ponte e não anuncia sucesso',()=>fixture(folder=>{
  const result=shell(folder,`find_loopback_device(){ echo plughw:2,1,0; }
MICCLIENT_PID=$$
arecord(){ return 1; }
pacat(){ exec cat >/dev/null; }
pactl(){ echo "$*" >> "$BRIDGE_TEST_DIR/selecoes"; }
notify_backend(){ echo "$*" >> "$BRIDGE_TEST_DIR/avisos"; }
if start_audio_bridge; then exit 1; fi
[ -z "$CAPTURE_PID$BRIDGE_PID$BRIDGE_DIR" ]`);
  assert.equal(result.status,0,result.stderr);assert.equal(existsSync(join(folder,'selecoes')),false);assert.equal(existsSync(join(folder,'avisos')),false);
}));

test('ponte saudável seleciona WO Mic e restaura notebook ao encerrar',()=>fixture(folder=>{
  const result=shell(folder,`find_loopback_device(){ echo plughw:2,1,0; }
MICCLIENT_PID=$$
arecord(){ exec sleep 30; }
pacat(){ exec cat >/dev/null; }
pactl(){ echo "$*" >> "$BRIDGE_TEST_DIR/selecoes"; }
notify_backend(){ echo "$*" >> "$BRIDGE_TEST_DIR/avisos"; }
move_active_recording_streams(){ echo "$*" >> "$BRIDGE_TEST_DIR/movimentos"; }
find_notebook_mic(){ echo notebook-mic; }
start_audio_bridge || exit 1
stop_audio_bridge
[ -z "$CAPTURE_PID$BRIDGE_PID$BRIDGE_DIR" ]`);
  assert.equal(result.status,0,result.stderr);
  assert.equal(readFileSync(join(folder,'selecoes'),'utf8'),'set-default-source womic_mic.monitor\nset-default-source notebook-mic\n');
  assert.equal(readFileSync(join(folder,'avisos'),'utf8'),'womic\nnotebook\n');
  assert.equal(readFileSync(join(folder,'movimentos'),'utf8'),'womic_mic.monitor\nnotebook-mic\n');
}));

test('ajuste de driver exige administrador e arquivos têm sintaxe válida',()=>{
  for(const path of ['womic-service.sh','womic-bridge.sh','scripts/enable-womic-loopback.sh'])assert.equal(spawnSync('/bin/bash',['-n',path]).status,0);
  if(process.getuid?.()!==0){const result=spawnSync('/bin/bash',['scripts/enable-womic-loopback.sh'],{encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stdout,/autorização de administrador/);}
});
