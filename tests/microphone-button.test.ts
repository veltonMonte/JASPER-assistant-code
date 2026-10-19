import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import InputBar from '../client/src/components/InputBar.js';
const requireClient=createRequire(resolve('client/package.json'));
const React=requireClient('react');const {renderToStaticMarkup}=requireClient('react-dom/server');

test('controle local do WO Mic habilita botão sem API de captura do navegador',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});
  try{
    const props={onSendText(){},onToggleMic(){},isListening:false,isMicStarting:false,isVoiceReady:true,isConnected:true};
    const button=(extra:any)=>renderToStaticMarkup(React.createElement(InputBar,{...props,...extra})).match(/<button[^>]*class="[^"]*\bmic\b[^"]*"[^>]*>/)?.[0]||'';
    assert.match(button({}),/disabled/);assert.doesNotMatch(button({canUseLocalMicrophone:true}),/disabled/);assert.match(button({canUseLocalMicrophone:true,isConnected:false}),/disabled/);
  }finally{if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else Reflect.deleteProperty(globalThis,'navigator');}
});
