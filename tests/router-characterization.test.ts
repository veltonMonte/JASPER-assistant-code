import test, { afterEach, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import dotenv from 'dotenv';
import { toolEvents } from '../src/events/toolEvents.js';
import { cancelAllPendingTerminal, requestTerminalCommand, resolveTerminalApproval } from '../src/tools/terminal.js';

let router: import('../src/agent/router.js').IntentRouter;
before(async () => {
  // A configuração usa somente valores falsos; o arquivo de segredos não é aberto.
  mock.method(dotenv, 'config', () => ({ parsed: {} }));
  process.env.GEMINI_API_KEY = 'chave-falsa-fase0';
  process.env.TARGET_PC_MAC = '00:11:22:33:44:55';
  mock.method(dgram, 'createSocket', () => ({
    once() { return this; },
    setBroadcast() {},
    send(...args: unknown[]) { (args.at(-1) as (error: null) => void)(null); },
    close() {},
  }) as unknown as dgram.Socket);
  const { IntentRouter } = await import('../src/agent/router.js');
  router = new IntentRouter();
});
afterEach(async () => { await cancelAllPendingTerminal(); });

test('caracterização: oito entradas percorrem os ramos atuais sem rede real', async () => {
  for (const [phrase, intent] of [
    ['que horas são', 'GET_TIME'], ['qual o horário', 'GET_TIME'],
    ['oi', 'GREETING'], ['boa noite', 'GREETING'],
    ['ligue meu pc', 'TURN_ON_PC'], ['desliga o pc', 'SHUTDOWN_PC'],
  ]) {
    const result = await router.route(phrase);
    assert.equal(result.handledDirectly, true, phrase);
    assert.equal(result.intentName, intent, phrase);
    assert.equal(typeof result.responseSpeech, 'string');
  }
  const deny = (request: { id: string }) => { setImmediate(() => { void resolveTerminalApproval(request.id, { approved: false }, 'ui'); }); };
  toolEvents.once('request_terminal_approval', deny);
  try {
    const terminal = await router.route('quais arquivos tem aqui');
    assert.equal(terminal.intentName, 'TERMINAL_COMMAND_REQUEST');
    assert.equal(terminal.toolResult.comando, 'ls -la');
  } finally { toolEvents.removeListener('request_terminal_approval', deny); }
  assert.equal((await router.route('explique uma API')).handledDirectly, false);
});

test('caracterização: confirmação pendente aprova echo e negativa cancela', async () => {
  await requestTerminalCommand('echo roteador-ok', 'live');
  const confirmed = await router.route('confirmo');
  assert.equal(confirmed.intentName, 'TERMINAL_APPROVE');
  assert.equal(confirmed.toolResult.output, 'roteador-ok');
  await requestTerminalCommand('echo nao-executado', 'live');
  const denied = await router.route('não');
  assert.equal(denied.intentName, 'TERMINAL_DENY');
  assert.equal(denied.toolResult.success, false);
});
