import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechToTextHandler, parseRecordedAudio } from '../src/voice/stt.js';
import { GeminiLiveSession } from '../src/ai/gemini-live.js';
import { JasperWebSocketServer } from '../src/server/websocket.js';
import { wakeWordManager } from '../src/voice/wakeword.js';

const clip = 'data:audio/webm;codecs=opus;base64,AQIDBA==';
test('preserva o tipo real de áudio enviado pelo navegador', () => {
  assert.deepEqual(parseRecordedAudio(clip), { mimeType: 'audio/webm', data: 'AQIDBA==' });
  assert.equal(parseRecordedAudio('data:audio/mp4;base64,AQID').mimeType, 'audio/mp4');
  for (const invalid of ['', 'AQID', 'data:audio/webm;base64,', 'data:text/plain;base64,AQID']) assert.throws(() => parseRecordedAudio(invalid));
});
test('transcreve nomes, números e negações sem trocar por comandos de contingência', async () => {
  const handler = new SpeechToTextHandler(async audio => {
    assert.equal(audio.mimeType, 'audio/webm'); return 'Jasper, não marque o jogo do Fortaleza às oito.';
  });
  const result = await handler.transcribeAudio(clip);
  assert.equal(result.text, 'Jasper, não marque o jogo do Fortaleza às oito.');
});
test('silêncio não vira um pedido de horário', async () => {
  for (const value of ['SEM_FALA', '', '<noise>', '[silêncio]']) {
    const result = await new SpeechToTextHandler(async () => value).transcribeAudio(clip);
    assert.equal(result.text, ''); assert.equal(result.confidence, 0);
  }
});
test('falha de rede ou gravação inválida produz erro e nunca inventa transcrição', async () => {
  const handler = new SpeechToTextHandler(async () => { throw new Error('offline'); });
  await assert.rejects(handler.transcribeAudio(clip), /Não consegui transcrever/);
  await assert.rejects(handler.transcribeAudio(''), /gravação/);
});
test('finalizar a fala envia audioStreamEnd ao Gemini e permite retomar áudio', () => {
  const session = new GeminiLiveSession() as any; const sent: any[] = [];
  assert.equal(session.forceTurnComplete(), false);
  session.ws = { readyState: 1, send: (data: string) => sent.push(JSON.parse(data)) };
  session.isConnected = true; session.setupComplete = true;
  assert.equal(session.forceTurnComplete(), true);
  assert.deepEqual(sent[0], { realtimeInput: { audioStreamEnd: true } });
  assert.equal(session.sendAudioChunk('AQID'), true);
  assert.equal(sent[1].realtimeInput.mediaChunks[0].mimeType, 'audio/pcm;rate=16000');
});
test('transcrição da resposta chega à interface e pensamentos e ruídos são ignorados', async () => {
  const session = new GeminiLiveSession() as any; const text: string[] = []; const input: string[] = [];
  session.on('text_chunk', (chunk: string) => text.push(chunk)); session.on('input_transcription', (chunk: string) => input.push(chunk));
  await session.handleGeminiMessage({ serverContent: { inputTranscription: { text: ' <noise>' }, modelTurn: { parts: [{ text: 'Internal reasoning', thought: true }] } } });
  await session.handleGeminiMessage({ serverContent: { inputTranscription: { text: 'Fortaleza' }, outputTranscription: { text: 'Entendido.' }, modelTurn: { parts: [{ text: 'Entendido.' }] } } });
  assert.deepEqual(input, ['Fortaleza']); assert.deepEqual(text, ['Entendido.']);
});
test('gravação vazia avisa o usuário e não segue para o agente', async () => {
  const server = new JasperWebSocketServer() as any; const sent: any[] = [];
  const ws = { readyState: 1, send: (data: string) => sent.push(JSON.parse(data)) };
  await server.processCommandFallback(ws, 'TEXT:');
  assert.equal(sent[0].type, 'ERROR'); assert.match(sent[0].message, /repetir/);
  assert.equal(wakeWordManager.getState(), 'IDLE');
});
test('erro de transcrição aparece ao usuário', async () => {
  const server = new JasperWebSocketServer() as any; const sent: any[] = [];
  await server.processCommandFallback({ readyState: 1, send: (data: string) => sent.push(JSON.parse(data)) }, 'invalid');
  assert.equal(sent[0].type, 'ERROR'); assert.match(sent[0].message, /gravação/);
});

test('fim de captura sem fala não deixa a interface presa em processamento', async () => {
  const server = new JasperWebSocketServer() as any; const sent: any[] = [];
  server.geminiLive = { isLiveConnected: () => true, forceTurnComplete: () => true };
  const ws = { readyState: 1, send: (data: string) => sent.push(JSON.parse(data)) };
  server.voiceSessions.set(ws, 'authorized-test-session');
  wakeWordManager.setState('IDLE');
  await server.handleClientMessage(ws, { type: 'SPEECH_ENDED' });
  assert.deepEqual(sent[0], { type: 'STATE_CHANGE', state: 'IDLE' });
});
test('espera por voz sem resposta termina com aviso e permite tentar novamente', async () => {
  const server = new JasperWebSocketServer() as any; const sent: any[] = [];
  wakeWordManager.setState('PROCESSING');
  server.waitForVoiceResponse({ readyState: 1, send: (data: string) => sent.push(JSON.parse(data)) }, 5);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.match(sent[0].message, /demorou demais/); assert.equal(wakeWordManager.getState(), 'IDLE');
});
test('resposta iniciada cancela aviso de demora', async () => {
  const server = new JasperWebSocketServer() as any; const sent: any[] = [];
  wakeWordManager.setState('PROCESSING');
  server.waitForVoiceResponse({ readyState: 1, send: (data: string) => sent.push(JSON.parse(data)) }, 5);
  server.clearVoiceResponseTimer(); await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(sent, []); wakeWordManager.setState('IDLE');
});
