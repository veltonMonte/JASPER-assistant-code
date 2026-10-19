import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { generateNaturalSpeech, pcmToWav, SPEECH_SAMPLE_RATE, type SpeechSocket } from '../src/voice/natural-speech.js';

class FakeSocket extends EventEmitter implements SpeechSocket {
  sent: any[] = [];
  closed = false;
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.closed = true; this.emit('close'); }
  terminate() { this.close(); }
  packet(data: unknown) { this.emit('message', Buffer.from(JSON.stringify(data))); }
}
function fixture() {
  const socket = new FakeSocket();
  return { socket, config: { apiKey: 'test-key', model: 'existing-live-model', voice: 'Puck', createSocket: () => socket, timeoutMs: 2000 } };
}
function audio(socket: FakeSocket, pcm: Buffer, mimeType = 'audio/pcm;rate=24000') {
  socket.packet({ serverContent: { modelTurn: { parts: [{ inlineData: { data: pcm.toString('base64'), mimeType } }] } } });
}

test('WAV registra PCM16 mono a 24 kHz e preserva todas as amostras', () => {
  const pcm = Buffer.from([0, 0, 255, 127, 0, 128]);
  const wav = pcmToWav(pcm);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt32LE(4), pcm.length + 36); assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), SPEECH_SAMPLE_RATE); assert.equal(wav.readUInt32LE(28), 48000);
  assert.equal(wav.readUInt16LE(34), 16); assert.equal(wav.readUInt32LE(40), pcm.length);
  assert.deepEqual(wav.subarray(44), pcm);
  assert.throws(() => pcmToWav(Buffer.alloc(0))); assert.throws(() => pcmToWav(Buffer.alloc(3)));
  assert.throws(() => pcmToWav(pcm, 16000));
});
test('usa modelo e voz configurados sem ferramentas ou memória da conversa', async () => {
  const f = fixture(); const result = generateNaturalSpeech('Uma notícia de teste.', f.config);
  f.socket.emit('open');
  assert.equal(f.socket.sent[0].setup.model, 'models/existing-live-model');
  assert.equal(f.socket.sent[0].setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Puck');
  assert.equal(f.socket.sent[0].setup.tools, undefined);
  assert.equal(f.socket.sent.length, 1);
  f.socket.packet({ setupComplete: {} }); assert.equal(f.socket.sent.length, 2);
  assert.match(f.socket.sent[1].clientContent.turns[0].parts[0].text, /Uma notícia de teste/);
  audio(f.socket, Buffer.from([1, 0, 2, 0])); audio(f.socket, Buffer.from([3, 0, 4, 0]));
  f.socket.packet({ serverContent: { turnComplete: true } });
  const wav = await result;
  assert.deepEqual(wav.subarray(44), Buffer.from([1, 0, 2, 0, 3, 0, 4, 0])); assert.equal(f.socket.closed, true);
});
test('não toca saída com formato ou frequência errados', async () => {
  for (const mime of ['audio/mpeg', 'audio/pcm;rate=16000']) {
    const f = fixture(); const result = generateNaturalSpeech('Teste.', f.config);
    const rejected = assert.rejects(result, /Formato/); audio(f.socket, Buffer.alloc(10), mime); await rejected;
    assert.equal(f.socket.closed, true);
  }
});
test('cancelar fecha a geração e não deixa uma fala antiga começar depois', async () => {
  const f = fixture(); const controller = new AbortController();
  const result = generateNaturalSpeech('Teste.', f.config, controller.signal);
  const rejected = assert.rejects(result, /cancelada/); controller.abort(); await rejected;
  assert.equal(f.socket.closed, true);
});
test('conexão interrompida e retorno sem áudio falham claramente', async () => {
  const f = fixture(); const result = generateNaturalSpeech('Teste.', f.config);
  const rejected = assert.rejects(result, /encerrou/); f.socket.close(); await rejected;
  const empty = fixture(); const noAudio = generateNaturalSpeech('Teste.', empty.config);
  const emptyRejected = assert.rejects(noAudio, /PCM inválido/); empty.socket.packet({ serverContent: { turnComplete: true } }); await emptyRejected;
});
test('limita a duração de uma tentativa sem resposta', async () => {
  const f = fixture(); await assert.rejects(generateNaturalSpeech('Teste.', { ...f.config, timeoutMs: 10 }), /demorou/);
  assert.equal(f.socket.closed, true);
});
test('rejeita falta de configuração, texto vazio e leituras muito longas', async () => {
  const f = fixture(); await assert.rejects(generateNaturalSpeech('Teste.', { ...f.config, apiKey: '' }), /configurada/);
  await assert.rejects(generateNaturalSpeech(' ', f.config), /inválido/);
  await assert.rejects(generateNaturalSpeech('a'.repeat(1201), f.config), /inválido/);
});

test('sessão de voz só atende conexões autorizadas ainda abertas', async () => {
  const { JasperWebSocketServer } = await import('../src/server/websocket.js');
  const server = new JasperWebSocketServer() as any;
  const client = { readyState: 1 };
  assert.equal(server.isVoiceSessionAuthorized(''), false);
  assert.equal(server.isVoiceSessionAuthorized('unknown'), false);
  const token = server.createVoiceSession(client);
  assert.equal(server.isVoiceSessionAuthorized(token), true);
  client.readyState = 3;
  assert.equal(server.isVoiceSessionAuthorized(token), false);
  client.readyState = 1; server.voiceSessions.delete(client);
  assert.equal(server.isVoiceSessionAuthorized(token), false);
});

test('leituras do modelo nativo usam configuração de resposta rápida', async () => {
  const f = fixture(); f.config.model = 'gemini-2.5-flash-native-audio-latest';
  const result = generateNaturalSpeech('À sua disposição.', f.config);
  f.socket.emit('open');
  assert.deepEqual(f.socket.sent[0].setup.generationConfig.thinkingConfig, { thinkingBudget: 0 });
  f.socket.packet({ setupComplete: {} }); audio(f.socket, Buffer.from([1, 0, 2, 0]));
  f.socket.packet({ serverContent: { turnComplete: true } }); await result;
});
