import test, { before, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { requestTerminalCommand, cancelAllPendingTerminal, getLastResolved } from '../src/tools/terminal.js';

let JasperWebSocketServer: typeof import('../src/server/websocket.js').JasperWebSocketServer;
before(async () => {
  mock.method(dotenv, 'config', () => ({ parsed: {} }));
  process.env.GEMINI_API_KEY = 'chave-falsa-teste-botao';
  ({ JasperWebSocketServer } = await import('../src/server/websocket.js'));
});
afterEach(async () => { await cancelAllPendingTerminal(); });

test('botão de aprovação chega ao resolvedor e executa o comando aprovado', async () => {
  const server = new JasperWebSocketServer();
  const client = { readyState: 1, send() {} };
  (server as any).voiceSessions.set(client, 'sessao-falsa-teste');
  const request = await requestTerminalCommand('echo botao-funciona', 'live');
  assert.ok('pending' in request);
  if (!('pending' in request)) return;
  await (server as any).handleClientMessage(client, { type: 'TERMINAL_APPROVAL_RESPONSE', id: request.pending.id, approved: true });
  assert.equal(getLastResolved()?.id, request.pending.id);
  assert.equal(getLastResolved()?.source, 'ui');
  assert.equal(getLastResolved()?.result.output, 'botao-funciona');
});
