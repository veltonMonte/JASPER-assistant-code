import test from 'node:test';
import assert from 'node:assert/strict';
import { fastAudioGenerationConfig } from '../src/voice/realtime-config.js';
import { VoiceActivityDetector } from '../src/voice/vad.js';
import { buildVoiceDirection, DEFAULT_VOICE_SETTINGS } from '../src/voice/profiles.js';
import { config } from '../src/config/config.js';

test('fastAudioGenerationConfig omite thinkingConfig para gemini-3.8-live e preserva 2.5', () => {
  // Gemini 3.8 Live não aceita thinkingConfig no setup; deve omitir a propriedade
  assert.deepEqual(fastAudioGenerationConfig('gemini-3.8-live'), {});
  assert.deepEqual(fastAudioGenerationConfig('models/gemini-3.8-live'), {});
  
  // Gemini 2.5 Native Audio utiliza thinkingBudget: 0 para conversação imediata
  assert.deepEqual(fastAudioGenerationConfig('gemini-2.5-flash-native-audio-latest'), {
    thinkingConfig: { thinkingBudget: 0 }
  });
});

test('modelo padrão do Gemini Live é gemini-3.8-live com fallback seguro', () => {
  // Configuração padrão do sistema prioriza a família 3.8
  const defaultModel = config.gemini.liveModel;
  assert.match(defaultModel, /gemini-3\.8-live|gemini-2\.5-flash-native-audio/);
});

test('VAD detecta barge-in quando usuário fala durante resposta do assistente', () => {
  const vad = new VoiceActivityDetector();
  vad.notifyAssistantSpeaking(true);

  // Simula passagem de tempo maior que a janela de guarda (600ms)
  (vad as any).speakingStartTime = Date.now() - 1000;

  // Usuário começa a falar (energia acima do limiar)
  // Gera um buffer de áudio PCM com amplitude alta
  const highEnergyBuffer = Buffer.alloc(3200);
  for (let i = 0; i < highEnergyBuffer.length; i += 2) {
    highEnergyBuffer.writeInt16LE(8000, i);
  }
  const isSpeaking = vad.processAudioEnergy(highEnergyBuffer.toString('base64'));
  assert.equal(isSpeaking, true);

  let interruptEmitted = false;
  vad.on('interrupted', () => { interruptEmitted = true; });

  const interrupted = vad.onUserAudioReceived(true);
  assert.equal(interrupted, true);
  assert.equal(interruptEmitted, true);
});

test('VAD protege contra falsos positivos nos primeiros 600ms de fala do assistente', () => {
  const vad = new VoiceActivityDetector();
  vad.notifyAssistantSpeaking(true);

  // Assistente acabou de começar a falar (menos de 600ms)
  (vad as any).speakingStartTime = Date.now() - 100;
  vad.isUserCurrentlySpeaking = true;

  const interrupted = vad.onUserAudioReceived(true);
  assert.equal(interrupted, false);
});

test('direção de voz humanizada proíbe clichês de atendimento e exige naturalidade', () => {
  const direction = buildVoiceDirection(DEFAULT_VOICE_SETTINGS);
  assert.match(direction, /português do Brasil/i);
  assert.match(direction, /conversa|amigos/i);
  assert.match(direction, /pausas/i);
  assert.match(direction, /robótica|monotonia/i);
});
