import test from 'node:test';
import assert from 'node:assert/strict';
import { JasperWebSocketServer } from '../src/server/websocket.js';

function client() {
  const messages: any[] = [];
  const socket = { readyState: 1, send: (value: string) => messages.push(JSON.parse(value)) };
  return { socket, messages };
}

test('o computador principal entra após reconexão sem token salvo', async () => {
  const server = new JasperWebSocketServer() as any;
  const { socket, messages } = client();
  server.clientIps.set(socket, '127.0.0.1');
  server.clientRequests.set(socket, { headers: { host: '127.0.0.1:3000' } });

  await server.handleClientMessage(socket, { type: 'AUTH_CHECK', deviceId: 'host', token: '' });

  assert.equal(messages.at(-1).type, 'AUTH_STATUS');
  assert.equal(messages.at(-1).isMaster, true);
  assert.equal(messages.at(-1).isAuthorized, true);
  assert.equal(typeof messages.at(-1).voiceToken, 'string');
  assert.equal(messages.at(-1).token, undefined);
});

test('endereço remoto com antigo token master não vira principal', async () => {
  const server = new JasperWebSocketServer() as any;
  const { socket, messages } = client();
  server.clientIps.set(socket, '203.0.113.8');

  await server.handleClientMessage(socket, { type: 'AUTH_CHECK', deviceId: 'other', token: 'jasper_master_forged' });

  assert.equal(messages.at(-1).type, 'AUTH_STATUS');
  assert.equal(messages.at(-1).isMaster, false);
  assert.equal(messages.at(-1).isAuthorized, false);
  assert.equal(server.voiceSessions.has(socket), false);
});

test('somente dispositivo autenticado pode enviar comandos e receber avisos de aprovação', async () => {
  const server = new JasperWebSocketServer() as any;
  const unauthenticated = client();
  const master = client();
  server.wss = { clients: new Set([unauthenticated.socket, master.socket]) };

  await server.handleClientMessage(unauthenticated.socket, { type: 'GET_PERSONALITY' });
  assert.deepEqual(unauthenticated.messages, []);

  server.broadcastToMasters({ type: 'DEVICE_ACCESS_REQUEST', id: 'pending' });
  assert.deepEqual(unauthenticated.messages, []);
  assert.deepEqual(master.messages, []);

  server.masterClients.add(master.socket);
  server.broadcastToMasters({ type: 'DEVICE_ACCESS_REQUEST', id: 'pending' });
  assert.equal(master.messages.at(-1).id, 'pending');
  assert.deepEqual(unauthenticated.messages, []);
});
