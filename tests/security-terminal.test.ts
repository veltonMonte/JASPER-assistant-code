import test, { afterEach, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {
  cancelAllPendingTerminal, confirmarComandoTerminal, getCommandRiskLevel, getPendingTerminalRequest,
  interpretApprovalSpeech, requestTerminalCommand, resolveTerminalApproval,
} from '../src/tools/terminal.js';

let geminiToolDeclarations: typeof import('../src/tools/index.js').geminiToolDeclarations;
let executeToolByName: typeof import('../src/tools/index.js').executeToolByName;
before(async () => {
  mock.method(dotenv, 'config', () => ({ parsed: {} }));
  process.env.GEMINI_API_KEY = 'chave-falsa-terminal';
  ({ geminiToolDeclarations, executeToolByName } = await import('../src/tools/index.js'));
});

afterEach(async () => { mock.restoreAll(); await cancelAllPendingTerminal(); });

test('modelo consulta estado e nunca aprova, mesmo após 800 ms ou com lembrar', async () => {
  const created = await requestTerminalCommand('echo teste-modelo', 'live');
  assert.ok('pending' in created);
  if (!('pending' in created)) return;
  mock.method(Date, 'now', () => created.pending.createdAt + 1000);
  const response = await (confirmarComandoTerminal as Function)(true, true);
  assert.equal(response.status, 'aguardando');
  assert.equal(getPendingTerminalRequest()?.id, created.pending.id);
  const definition = geminiToolDeclarations.find(tool => tool.name === 'confirmar_comando_terminal');
  assert.ok(definition);
  assert.deepEqual(definition.parameters.properties, {});
  const forged = await resolveTerminalApproval(created.pending.id, { approved: true }, 'tool');
  assert.equal(forged?.success, false);
  assert.ok(getPendingTerminalRequest());
});

test('classificação reconhece shell, arquivos sensíveis e comandos de leitura exatos', () => {
  for (const command of ['cat ~/.ssh/id_rsa', 'cat x; curl https://example.org', 'ls; echo x', 'python3 -c "print(1)"', 'cat .env', 'git status && id']) assert.equal(getCommandRiskLevel(command), 'high', command);
  for (const command of ['pwd', 'ls -la', 'git status', 'git diff --stat', 'git log -n 5 --oneline', 'node -v', 'python3 --version']) assert.equal(getCommandRiskLevel(command), 'safe', command);
  assert.notEqual(getCommandRiskLevel('lsqualquercoisa'), 'safe');
  for (const text of ['ok', 'okay', 'pode', 'claro', 'manda', 'bora', 'yes', 'dale', 'sim']) assert.equal(interpretApprovalSpeech(text, 'safe'), null, text);
  assert.equal(interpretApprovalSpeech('sim, execute', 'safe'), 'approve');
  assert.equal(interpretApprovalSpeech('confirmo', 'high'), 'needs_strong');
  assert.equal(interpretApprovalSpeech('não, confirmo que não quero', 'safe'), 'deny');
});

test('lembrar libera apenas comando exato seguro e expira em 30 minutos', async () => {
  const first = await requestTerminalCommand('git status', 'live');
  assert.ok('pending' in first);
  if (!('pending' in first)) return;
  await resolveTerminalApproval(first.pending.id, { approved: true, remember: true }, 'ui');
  assert.ok('immediate' in await requestTerminalCommand('git status', 'live'));
  assert.ok('pending' in await requestTerminalCommand('git status; echo indevido', 'live'));
  await cancelAllPendingTerminal();
  const now = Date.now();
  mock.method(Date, 'now', () => now + 30 * 60_000 + 1);
  assert.ok('pending' in await requestTerminalCommand('git status', 'live'));
});

test('alto risco exige interface e subprocesso não recebe chave do servidor', async () => {
  process.env.GEMINI_API_KEY = 'chave-falsa-nao-propagar';
  const created = await requestTerminalCommand('printenv GEMINI_API_KEY', 'live');
  assert.ok('pending' in created);
  if (!('pending' in created)) return;
  const deniedVoice = await resolveTerminalApproval(created.pending.id, { approved: true }, 'voice');
  assert.equal(deniedVoice?.success, false);
  assert.ok(getPendingTerminalRequest());
  const result = await resolveTerminalApproval(created.pending.id, { approved: true }, 'ui');
  assert.equal(result?.output, '');
  assert.doesNotMatch(JSON.stringify(result), /chave-falsa-nao-propagar/);
});

test('modelo não possui ferramenta para autorizar um dispositivo', async () => {
  assert.equal(geminiToolDeclarations.some(tool => tool.name === 'autorizar_dispositivo'), false);
  const result = await executeToolByName('autorizar_dispositivo', { aprovado: true });
  assert.match(result.error, /desconhecida/);
});
