import test from 'node:test';
import assert from 'node:assert/strict';
import { fastAudioGenerationConfig, LIVE_SILENCE_MS } from '../src/voice/realtime-config.js';
import { JasperWebSocketServer } from '../src/server/websocket.js';
import { wakeWordManager } from '../src/voice/wakeword.js';
import { buildVoiceDirection } from '../src/voice/profiles.js';
import { GeminiLiveSession } from '../src/ai/gemini-live.js';

test('modo rápido é aplicado somente ao modelo nativo compatível e preserva a resposta completa', () => {
  assert.deepEqual(fastAudioGenerationConfig('gemini-2.5-flash-native-audio-latest'), { thinkingConfig: { thinkingBudget: 0 } });
  for (const model of ['gemini-3.8-live', 'gemini-3.1-flash-live-preview', 'other-model']) assert.deepEqual(fastAudioGenerationConfig(model), {});
  assert.ok(LIVE_SILENCE_MS >= 500 && LIVE_SILENCE_MS < 800);
});
test('quedas de energia no microfone não finalizam repetidamente o áudio contínuo', () => {
  const server = new JasperWebSocketServer() as any; let flushes = 0;
  server.geminiLive = { isLiveConnected: () => true, forceTurnComplete: () => { flushes++; } };
  server.turnUserTranscript = '';
  for (let index = 0; index < 5; index++) { wakeWordManager.setState('LISTENING'); server.onCaptureSilence(); }
  assert.equal(flushes, 0); assert.equal(wakeWordManager.getState(), 'IDLE'); assert.equal(server.voiceResponseTimer, null);
});
test('fala compreendida ainda mostra processamento sem cortar o buffer do Gemini', () => {
  const server = new JasperWebSocketServer() as any; let flushes = 0;
  server.geminiLive = { isLiveConnected: () => true, forceTurnComplete: () => { flushes++; } };
  server.turnUserTranscript = 'Jasper, pode me ajudar?'; wakeWordManager.setState('LISTENING');
  server.onCaptureSilence();
  assert.equal(flushes, 0); assert.equal(wakeWordManager.getState(), 'PROCESSING');
  server.clearVoiceResponseTimer(); wakeWordManager.setState('IDLE');
});
test('presença da voz grave é dirigida na síntese sem deformar a reprodução', () => {
  const direction = buildVoiceDirection({ voice: 'Algenib', pace: 'natural' });
  assert.match(direction, /barítono/); assert.match(direction, /ressonância cheia/); assert.match(direction, /timbre natural/);
  assert.doesNotMatch(buildVoiceDirection({ voice: 'Algieba', pace: 'natural' }), /barítono/);
});
test('áudio ao vivo não acumula quadros antigos quando a conexão está lenta', () => {
  const session = new GeminiLiveSession() as any;
  const sent: string[] = [];
  session.isConnected = true;
  session.setupComplete = true;
  session.ws = { readyState: 1, bufferedAmount: 600_000, send: (value: string) => sent.push(value) };
  assert.equal(session.sendAudioChunk('AA=='), false);
  assert.equal(sent.length, 0);
  session.ws.bufferedAmount = 0;
  assert.equal(session.sendAudioChunk('AA=='), true);
  assert.equal(sent.length, 1);
});
test('Gemini volta a tentar após muitas quedas', () => {
  const session = new GeminiLiveSession() as any;
  session.reconnectAttempts = 20;
  session.connect = async () => {};
  session.scheduleReconnect();
  assert.ok(session.reconnectTimer);
  clearTimeout(session.reconnectTimer);
});
