import test from 'node:test';
import assert from 'node:assert/strict';
import { JasperWebSocketServer } from '../src/server/websocket.js';
import { wakeWordManager } from '../src/voice/wakeword.js';

function fixture() {
  const server = new JasperWebSocketServer() as any;
  const deliveries: any[] = [];
  const first = { readyState: 1, send: (text: string) => deliveries.push({ client: 'first', data: JSON.parse(text) }) };
  const second = { readyState: 1, send: (text: string) => deliveries.push({ client: 'second', data: JSON.parse(text) }) };
  server.wss = { clients: new Set([first, second]) };
  server.voiceSessions.set(first, 'first-session'); server.voiceSessions.set(second, 'second-session');
  const status = () => ({ seenAt: Date.now(), activeAt: Date.now() - 180_000, visible: true, canSpeak: true, busy: false });
  server.presence.set(first, status()); server.presence.set(second, status()); server.activeClient = second;
  wakeWordManager.setState('IDLE');
  const notice = { id: 'test', kind: 'news', text: 'Manchete de teste', sentAt: new Date().toISOString() };
  return { server, first, second, deliveries, notice };
}
test('fala espontânea é enviada somente a um cliente apto', () => {
  const f = fixture(); assert.equal(f.server.deliverProactive(f.notice), true);
  assert.equal(f.deliveries.length, 1); assert.equal(f.deliveries[0].client, 'second');
});
test('não interrompe fala, escuta, processamento ou confirmação de terminal', () => {
  const f = fixture();
  for (const state of ['SPEAKING', 'LISTENING', 'PROCESSING'] as const) { wakeWordManager.setState(state); assert.equal(f.server.deliverProactive(f.notice), false); }
  wakeWordManager.setState('IDLE'); f.server.pendingTerminalApprovalId = 'pending'; assert.equal(f.server.deliverProactive(f.notice), false);
  assert.equal(f.deliveries.length, 0);
});
test('clientes ocultos, ocupados, sem gesto de áudio ou com presença antiga não recebem voz', () => {
  for (const change of [{ visible: false }, { busy: true }, { canSpeak: false }, { seenAt: Date.now() - 60_000 }, { activeAt: Date.now() }]) {
    const f = fixture(); f.server.presence.set(f.first, { ...f.server.presence.get(f.first), ...change }); f.server.presence.delete(f.second);
    assert.equal(f.server.deliverProactive(f.notice), false);
  }
});
