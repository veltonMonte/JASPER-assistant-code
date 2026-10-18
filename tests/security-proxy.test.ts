import test, { before, mock } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { allowMasterForRequest, isTrustedViteProxy } from '../src/security/origin.js';

before(() => { mock.method(dotenv, 'config', () => ({ parsed: {} })); process.env.GEMINI_API_KEY = 'chave-falsa-proxy'; });

test('loopback com cabeçalho de proxy ou Host externo não vira master', async () => {
  const local = ['127.0.0.1', '192.168.1.10'];
  for (const header of ['x-forwarded-for', 'forwarded', 'x-real-ip', 'cf-connecting-ip']) assert.equal(allowMasterForRequest('127.0.0.1', { host: '127.0.0.1:3000', [header]: '8.8.8.8' }, local, 'development'), false);
  assert.equal(allowMasterForRequest('127.0.0.1', { host: 'externo.example:3000' }, local, 'development'), false);
  assert.equal(allowMasterForRequest('127.0.0.1', { host: '127.0.0.1:3000' }, local, 'development'), true);
  assert.equal(allowMasterForRequest('127.0.0.1', { host: '127.0.0.1:3000', 'x-jasper-client-ip': '127.0.0.1' }, local, 'development'), false);
  const { JasperWebSocketServer } = await import('../src/server/websocket.js');
  const server = new JasperWebSocketServer() as any;
  const messages: any[] = [];
  const ws = { readyState: 1, send: (raw: string) => messages.push(JSON.parse(raw)) };
  server.clientIps.set(ws, '127.0.0.1');
  server.clientRequests.set(ws, { headers: { host: '127.0.0.1:3000', 'x-forwarded-for': '8.8.8.8' } });
  await server.handleClientMessage(ws, { type: 'AUTH_CHECK', deviceId: 'proxy', token: '' });
  assert.equal(messages.at(-1).isMaster, false);
  assert.equal(messages.at(-1).isAuthorized, false);
});

test('cabeçalho de IP do Vite exige loopback, desenvolvimento e origem do proxy', () => {
  const headers = { host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5173', 'x-jasper-proxy': 'vite', 'x-jasper-client-ip': '192.168.1.20' };
  assert.equal(isTrustedViteProxy('127.0.0.1', headers, 'development'), true);
  assert.equal(isTrustedViteProxy('8.8.8.8', headers, 'development'), false);
  assert.equal(isTrustedViteProxy('127.0.0.1', headers, 'production'), false);
});

test('voz e ferramenta não resolvem pedido de dispositivo; somente a interface o aprova', async () => {
  const { dbManager } = await import('../src/database/database.js');
  mock.method(dbManager, 'saveDeviceRequest', async () => {});
  mock.method(dbManager, 'denyDevice', async () => {});
  const approve = mock.method(dbManager, 'approveDevice', async () => {});
  const { requestDeviceAccess, resolveDeviceAccess, getPendingDeviceRequest } = await import('../src/tools/devices.js');
  const pending = await requestDeviceAccess('dispositivo-teste-fase1', 'Aparelho simulado', '192.168.1.20');
  try {
    assert.equal((await resolveDeviceAccess(pending.id, true, 'voice')).success, false);
    assert.equal((await resolveDeviceAccess(pending.id, true, 'tool')).success, false);
    assert.equal(approve.mock.callCount(), 0);
    assert.equal(getPendingDeviceRequest()?.id, pending.id);
    assert.equal((await resolveDeviceAccess(pending.id, true, 'ui')).success, true);
    assert.equal(approve.mock.callCount(), 1);
  } finally { await resolveDeviceAccess(pending.id, false, 'ui'); }
});
