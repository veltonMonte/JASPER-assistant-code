import test from 'node:test';
import assert from 'node:assert/strict';
import { executeToolByName } from '../src/tools/index.js';
import {
  requestTerminalCommand,
  resolveTerminalApproval,
  getPendingTerminalRequest,
  cancelAllPendingTerminal,
} from '../src/tools/terminal.js';

import { toolEvents } from '../src/events/toolEvents.js';

test('executar_terminal rejeita chamadas de dispositivos que não são Master', async () => {
  const result = await executeToolByName('executar_terminal', { comando: 'echo bloqueado' }, { isMaster: false });
  assert.equal(result.success, false);
  assert.match(result.message, /(?:computador|máquina) principal|Master/i);
});

test('executar_terminal adota default-deny quando isMaster não é informado', async () => {
  const result = await executeToolByName('executar_terminal', { comando: 'echo bloqueado' }, {});
  assert.equal(result.success, false);
  assert.match(result.message, /(?:computador|máquina) principal|Master/i);
});

test('executar_terminal aceita chamadas da máquina principal Master', async () => {
  toolEvents.once('terminal_approval_requested', ({ id }) => {
    void resolveTerminalApproval(id, { approved: false }, 'ui');
  });
  const res = await executeToolByName('executar_terminal', { comando: 'echo permitido' }, { isMaster: true });
  assert.ok(res !== undefined);
  assert.equal(res.comando, 'echo permitido');
  await cancelAllPendingTerminal();
});

test('solicitarTerminalPorVoz rejeita cliente não Master', async () => {
  const result = await executeToolByName('executar_terminal', { comando: 'ls -la' }, { live: true, isMaster: false });
  assert.equal(result.success, false);
  assert.equal(result.status, 'negado_dispositivo_remoto');
  assert.match(result.message, /dispositivos remotos|(?:computador|máquina) principal/i);
});

test('intenção do roteador bloqueia terminal em linguagem natural quando originado por cliente não Master', async () => {
  const { intentRouter } = await import('../src/agent/router.js');
  const route = await intentRouter.route('execute o comando ls -la', { isMaster: false });
  assert.equal(route.handledDirectly, true);
  assert.equal(route.intentName, 'TERMINAL_DENIED_NON_MASTER');
  assert.match(route.responseSpeech || '', /(?:computador|máquina) principal|Master/i);
});
