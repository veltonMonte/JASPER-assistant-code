import test from 'node:test';
import assert from 'node:assert/strict';
import { AutomaticMicrophone } from '../client/src/lib/automaticMicrophone.js';

const ready = { enabled: true, connected: true, authorized: true, liveReady: true, visible: true, capturing: false };
test('inicia a escuta automaticamente quando o dispositivo e o Gemini estão prontos', async () => {
  const microphone = new AutomaticMicrophone(); let starts = 0;
  await microphone.resume({ ...ready, authorized: false }, async () => { starts++; });
  assert.equal(starts, 0);
  await microphone.resume(ready, async () => { starts++; }); assert.equal(starts, 1);
});
test('retoma a captura depois de perder e recuperar a conexão', async () => {
  const microphone = new AutomaticMicrophone(); let starts = 0;
  const capture = async () => { starts++; };
  await microphone.resume(ready, capture);
  await microphone.resume({ ...ready, connected: false, liveReady: false }, capture);
  await microphone.resume({ ...ready, liveReady: false }, capture);
  assert.equal(starts, 1);
  await microphone.resume(ready, capture); assert.equal(starts, 2);
});
test('não duplica a solicitação de microfone enquanto a permissão está pendente', async () => {
  const microphone = new AutomaticMicrophone(); let starts = 0; let grant!: () => void;
  const capture = () => { starts++; return new Promise<void>(resolve => { grant = resolve; }); };
  const pending = microphone.resume(ready, capture);
  await microphone.resume(ready, capture); assert.equal(starts, 1);
  grant(); await pending;
  await microphone.resume({ ...ready, capturing: true }, capture); assert.equal(starts, 1);
});
test('pausa manual é respeitada mesmo depois de reconectar', async () => {
  const microphone = new AutomaticMicrophone(); let starts = 0;
  await microphone.resume({ ...ready, enabled: false }, async () => { starts++; });
  assert.equal(starts, 0);
  await microphone.resume(ready, async () => { starts++; }); assert.equal(starts, 1);
});
test('permissão negada não gera tentativas repetidas; o botão permite nova tentativa', async () => {
  const microphone = new AutomaticMicrophone(); let starts = 0;
  await microphone.resume(ready, async () => { starts++; throw new Error('NotAllowedError'); });
  await microphone.resume(ready, async () => { starts++; }); assert.equal(starts, 1);
  microphone.allowRetry();
  await microphone.resume(ready, async () => { starts++; }); assert.equal(starts, 2);
});
test('falha temporária permite retomar automaticamente após espera', async () => {
  const microphone = new AutomaticMicrophone(); let starts = 0;
  await microphone.resume(ready, async () => { starts++; throw new Error('Dispositivo ocupado'); });
  await microphone.resume(ready, async () => { starts++; });
  assert.equal(starts, 1);
  (microphone as any).retryAt = Date.now() - 1;
  await microphone.resume(ready, async () => { starts++; });
  assert.equal(starts, 2);
});
