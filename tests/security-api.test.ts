import test, { before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import { resolveApiCredentials } from '../src/security/credentials.js';
import { isAllowedOrigin } from '../src/security/origin.js';

let server: http.Server;
let base: string;
const machineToken = 'token-falso-apenas-teste-com-mais-de-32-caracteres';
before(async () => {
  mock.method(dotenv, 'config', () => ({ parsed: {} }));
  process.env.API_SECRET_TOKEN = machineToken;
  process.env.GEMINI_API_KEY = 'chave-falsa-api';
  const { jasperWsServer } = await import('../src/server/websocket.js');
  const { jasperAgent } = await import('../src/agent/agent.js');
  const { dbManager } = await import('../src/database/database.js');
  mock.method(jasperWsServer, 'isVoiceSessionAuthorized', token => token === 'sessao-teste');
  mock.method(jasperAgent, 'processCommand', async () => ({ response: 'Resposta simulada' }) as any);
  mock.method(dbManager, 'getAllMemories', async () => []);
  const routes = (await import('../src/server/routes.js')).default;
  const app = express(); app.use(express.json()); app.use('/api', routes);
  server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
});
after(async () => { if (server) await new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }); mock.restoreAll(); });

test('API protege comandos, memórias e preferências; apenas health permanece público', async () => {
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  assert.equal((await fetch(`${base}/api/health`, { method: 'HEAD' })).status, 401);
  for (const endpoint of ['memory', 'personality', 'voice/preferences', 'proactive', 'audio/mic-status']) assert.equal((await fetch(`${base}/api/${endpoint}`)).status, 401, endpoint);
  assert.equal((await fetch(`${base}/api/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'oi' }) })).status, 401);
  const command = await fetch(`${base}/api/command`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sessao-teste' }, body: JSON.stringify({ command: 'oi' }) });
  assert.equal(command.status, 200);
  assert.equal((await fetch(`${base}/api/memory`, { headers: { Authorization: `Bearer ${machineToken}` } })).status, 200);
  assert.equal((await fetch(`${base}/api/memory`, { headers: { Authorization: 'Bearer incorreto' } })).status, 401);
});

test('produção recusa credenciais ausentes, fracas ou de exemplo', () => {
  for (const candidate of [undefined, '', 'curto', 'jasper-secure-local-token']) assert.throws(() => resolveApiCredentials('production', candidate), /API_SECRET_TOKEN/);
  assert.equal(resolveApiCredentials('production', machineToken).token, machineToken);
  const dev = resolveApiCredentials('development', undefined);
  assert.equal(dev.generated, true);
  assert.ok(dev.token.length >= 32);
  const boot = spawnSync(process.execPath, ['--import', 'tsx', '-e', 'require("dotenv").config=()=>({parsed:{}});require("./src/config/config.ts");'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 10_000,
    env: { PATH: '/usr/bin:/bin', HOME: '/tmp', LANG: 'C', NODE_ENV: 'production', API_SECRET_TOKEN: 'fraco', GEMINI_API_KEY: 'chave-falsa-boot' },
  });
  assert.notEqual(boot.status, 0);
  assert.match(boot.stderr, /API_SECRET_TOKEN/);
});

test('política de origem permite mesma origem por padrão e lista explícita quando configurada', () => {
  assert.equal(isAllowedOrigin('http://127.0.0.1:3000', '127.0.0.1:3000', 'http', []), true);
  assert.equal(isAllowedOrigin('https://malicioso.example', '127.0.0.1:3000', 'http', []), false);
  assert.equal(isAllowedOrigin('null', '127.0.0.1:3000', 'http', []), false);
  assert.equal(isAllowedOrigin('https://jasper.example', '127.0.0.1:3000', 'http', ['https://jasper.example']), true);
});
