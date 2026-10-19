import test from 'node:test';
import assert from 'node:assert/strict';
import { VoicePreferences } from '../src/voice/preferences.js';
import { VOICE_OPTIONS, DEFAULT_VOICE_SETTINGS, validateVoiceSettings, buildVoiceDirection } from '../src/voice/profiles.js';
import { buildPersonalityPrompt, formatTarsConfirmation, DEFAULT_PERSONALITY } from '../src/ai/personality.js';
import { GeminiLiveSession } from '../src/ai/gemini-live.js';

function store() { const values = new Map<string, string>(); return { values, read: async (key: string) => values.get(key) || null, write: async (key: string, value: string) => { values.set(key, value); } }; }
test('voz nova usa Algenib e aceita apenas os perfis e ritmos oferecidos', () => {
  assert.equal(DEFAULT_VOICE_SETTINGS.voice, process.env.GEMINI_VOICE || 'Charon'); assert.equal(VOICE_OPTIONS.length, 4);
  for (const voice of VOICE_OPTIONS) assert.equal(validateVoiceSettings({ voice: voice.id }).voice, voice.id);
  for (const invalid of [null, [], { voice: 'unknown' }, { pace: 0.5 }, { pitch: -3 }]) assert.throws(() => validateVoiceSettings(invalid));
});
test('preferências persistem e uma prévia não altera a voz salva', async () => {
  const db = store(); const preferences = new VoicePreferences(db);
  assert.deepEqual(await preferences.get(), DEFAULT_VOICE_SETTINGS);
  await preferences.update({ voice: 'Algieba', pace: 'calm' });
  const preview = validateVoiceSettings({ voice: 'Algenib' }, await preferences.get());
  assert.equal(preview.voice, 'Algenib'); assert.equal((await preferences.get()).voice, 'Algieba');
  assert.deepEqual(await new VoicePreferences(db).get(), { voice: 'Algieba', pace: 'calm' });
});
test('falha ao salvar não muda a voz ativa', async () => {
  const preferences = new VoicePreferences({ read: async () => null, write: async () => { throw new Error('storage unavailable'); } });
  await assert.rejects(preferences.update({ voice: 'Algenib' })); assert.deepEqual(await preferences.get(), DEFAULT_VOICE_SETTINGS);
});
test('configuração corrompida restaura um perfil válido', async () => {
  const preferences = new VoicePreferences({ read: async () => '{broken', write: async () => {} });
  assert.deepEqual(await preferences.get(), DEFAULT_VOICE_SETTINGS);
});
test('direção de voz controla o ritmo sem efeitos que deformem o timbre', () => {
  assert.match(buildVoiceDirection({ voice: 'Orus', pace: 'calm' }), /Ritmo sereno/);
  assert.match(buildVoiceDirection({ voice: 'Orus', pace: 'brisk' }), /mais ágil/);
  assert.match(buildVoiceDirection(DEFAULT_VOICE_SETTINGS), /graves forçados/);
});
test('estilo formal mantém espontaneidade, ironia discreta e honestidade em qualquer nível', () => {
  assert.equal(DEFAULT_PERSONALITY.formalidade, 70);
  for (const honestidade of [0, 50, 100]) {
    const prompt = buildPersonalityPrompt({ ...DEFAULT_PERSONALITY, honestidade });
    assert.match(prompt, /A verdade não é ajustável/); assert.match(prompt, /Nunca humilhe/);
    assert.match(prompt, /Não anuncie a piada/); assert.match(prompt, /duas interpretações/);
  }
  assert.doesNotMatch(formatTarsConfirmation('padrao'), /TARS|subsistemas|militar/);
});
test('trocar a voz comunica a pausa antes de reconectar e encerra o socket anterior', async () => {
  const session = new GeminiLiveSession() as any; const events: string[] = [];
  session.ws = { close: () => events.push('close') }; session.isConnected = true; session.setupComplete = true;
  session.on('disconnected', () => events.push('disconnected'));
  session.connect = async () => events.push('connect');
  await session.reloadPersonality(); assert.deepEqual(events, ['disconnected', 'close', 'connect']); assert.equal(session.ws, null);
});
