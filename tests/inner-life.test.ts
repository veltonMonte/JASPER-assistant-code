import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { dbManager, DEFAULT_PERSONALITY } from '../src/database/database.js';
import {
  analyzeUserSignal, applyInteraction, buildInnerLifePrompt, createInnerState, effectivePersonality,
  settle, BASE_MOOD, MAX_DRIFT,
} from '../src/ai/inner-life.js';
import { InnerLifeService, sanitizeInnerState } from '../src/ai/inner-life-service.js';
import { allVariants, PHRASE_KEYS, say } from '../src/agent/phrasebook.js';
import { GeminiBrain } from '../src/ai/gemini.js';

afterEach(() => mock.restoreAll());

// 05:00Z = 02:00 em São Paulo (sem horário de verão em 2026).
const NIGHT = Date.UTC(2026, 0, 15, 5, 0, 0);
const NOON = Date.UTC(2026, 0, 15, 15, 0, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

test('classifica o tom da fala em português, com ou sem acentos', () => {
  assert.equal(analyzeUserSignal('Valeu, Jasper!'), 'thanks');
  assert.equal(analyzeUserSignal('mandou bem'), 'praise');
  assert.equal(analyzeUserSignal('Consegui terminar o projeto'), 'joy');
  assert.equal(analyzeUserSignal('hoje foi puxado, estou cansado'), 'sadness');
  assert.equal(analyzeUserSignal('isso não era isso que eu pedi, que droga'), 'frustration');
  assert.equal(analyzeUserSignal('seja breve por favor'), 'brevity');
  assert.equal(analyzeUserSignal('você é um inútil'), 'rudeness');
  assert.equal(analyzeUserSignal('que horas são'), 'neutral');
  assert.equal(analyzeUserSignal(''), 'neutral');
});

test('elogio melhora o ânimo e grosseria piora, sem sair de -100..100', () => {
  const happy = applyInteraction(createInnerState(), 'mandou bem', NOON);
  assert.ok(happy.mood > BASE_MOOD);
  const rude = applyInteraction(happy, 'seu inútil', NOON + 1000);
  assert.ok(rude.mood < happy.mood);
  let state = createInnerState();
  for (let i = 0; i < 200; i++) state = applyInteraction(state, 'perfeito, adorei', NOON + i * 1000);
  assert.ok(state.mood <= 100 && state.energy <= 100);
});

test('o ânimo volta ao normal com o tempo', () => {
  const excited = applyInteraction(createInnerState(), 'mandou bem', NOON);
  const later = settle(excited, NOON + 12 * HOUR);
  assert.ok(Math.abs(later.mood - BASE_MOOD) < Math.abs(excited.mood - BASE_MOOD));
  const muchLater = settle(excited, NOON + 10 * DAY);
  assert.ok(Math.abs(muchLater.mood - BASE_MOOD) < 0.5);
});

test('a deriva dos traços é limitada e a personalidade efetiva respeita 0..100', () => {
  let state = createInnerState();
  for (let i = 0; i < 500; i++) state = applyInteraction(state, 'resume, seja breve', NOON + i * 1000);
  assert.ok(Math.abs(state.drift.verbosidade!) <= MAX_DRIFT);
  const effective = effectivePersonality({ ...DEFAULT_PERSONALITY, verbosidade: 3, humor: 99 }, { ...state, drift: { verbosidade: -MAX_DRIFT, humor: MAX_DRIFT } });
  assert.equal(effective.verbosidade, 0);
  assert.equal(effective.humor, 100);
  assert.deepEqual(effectivePersonality(DEFAULT_PERSONALITY, createInnerState()), DEFAULT_PERSONALITY);
});

test('a afinidade cresce devagar e cai depois de uma ausência longa', () => {
  let state = createInnerState();
  const start = state.affinity;
  for (let i = 0; i < 50; i++) state = applyInteraction(state, 'que horas são', NOON + i * 60_000);
  assert.ok(state.affinity > start && state.affinity < 60);
  const afterAbsence = applyInteraction(state, 'oi', NOON + 40 * DAY);
  assert.ok(afterAbsence.affinity < state.affinity + 1);
  assert.equal(afterAbsence.interactions, state.interactions + 1);
});

test('o prompt traduz o estado em tom e mantém a honestidade sobre ser digital', () => {
  const prompt = buildInnerLifePrompt(createInnerState(), NOON);
  assert.match(prompt, /VIDA INTERIOR DO JASPER/);
  assert.match(prompt, /assistente digital/);
  assert.match(prompt, /nunca altera fatos/i);
  assert.doesNotMatch(prompt, /\d+%/);
});

test('o prompt considera madrugada e ausência prolongada', () => {
  assert.match(buildInnerLifePrompt(createInnerState(), NIGHT), /madrugada/i);
  let state = applyInteraction(createInnerState(), 'oi', NOON);
  state = applyInteraction(state, 'voltei', NOON + 5 * DAY);
  assert.match(buildInnerLifePrompt(state, NOON + 5 * DAY), /5 dias/);
});

test('JSON salvo corrompido volta ao padrão e valores fora da faixa são limitados', () => {
  assert.deepEqual(sanitizeInnerState('lixo'), createInnerState());
  assert.deepEqual(sanitizeInnerState(null), createInnerState());
  const result = sanitizeInnerState({ mood: 'alto', affinity: 9999, drift: { humor: 99, empatia: 'x' }, lastSignal: 'inventado' });
  assert.equal(result.mood, BASE_MOOD);
  assert.equal(result.affinity, 100);
  assert.equal(result.drift.humor, MAX_DRIFT);
  assert.equal(result.drift.empatia, undefined);
  assert.equal(result.lastSignal, 'neutral');
});

test('o serviço persiste o estado e o restaura em outra instância', async () => {
  let stored = '';
  mock.method(dbManager, 'getSetting', async () => stored || null);
  mock.method(dbManager, 'saveSetting', async (_key: string, value: string) => { stored = value; });
  const first = new InnerLifeService();
  first.observe('mandou bem', NOON);
  first.observe('obrigado', NOON + 1000);
  await first.flush();
  assert.ok(stored.includes('"interactions":2'));
  const second = new InnerLifeService();
  const adapted = await second.adapt(DEFAULT_PERSONALITY, NOON + 2000);
  assert.equal(second.snapshot(NOON + 2000).interactions, 2);
  assert.match(adapted.prompt, /VIDA INTERIOR DO JASPER/);
  second.reset();
  assert.equal(second.snapshot().interactions, 0);
});

test('sem banco o serviço segue funcionando com o estado padrão', async () => {
  mock.method(dbManager, 'getSetting', async () => { throw new Error('banco indisponível'); });
  const service = new InnerLifeService();
  const adapted = await service.adapt(DEFAULT_PERSONALITY, NOON);
  assert.deepEqual(adapted.personality, DEFAULT_PERSONALITY);
  assert.match(adapted.prompt, /VIDA INTERIOR DO JASPER/);
  service.observe('   ');
  assert.equal(service.snapshot().interactions, 0);
});

test('livro de frases varia, preenche variáveis e evita frases de atendimento', () => {
  for (const key of PHRASE_KEYS) {
    for (const phrase of allVariants(key)) assert.doesNotMatch(phrase, /Solicitação|Processando|executado com sucesso|à disposição|Posso ajudar/i, `${key}: ${phrase}`);
    const a = say(key, { rng: () => 0, vars: { motivo: 'x', descricao: 'listar', comando: 'ls' } });
    const b = say(key, { rng: () => 0, vars: { motivo: 'x', descricao: 'listar', comando: 'ls' } });
    assert.notEqual(a, b, `${key} repetiu a mesma frase em seguida`);
    assert.doesNotMatch(a + b, /\{\w+\}/);
  }
  assert.match(say('pc_on_failed', { vars: { motivo: 'MAC inválido' } }), /MAC inválido/);
  assert.match(say('terminal_ask', { vars: { descricao: 'listar arquivos', comando: 'ls -la' } }), /ls -la/);
});

test('respostas diretas do roteador não usam mais a frase fixa de desligamento', async () => {
  const { IntentRouter } = await import('../src/agent/router.js');
  const result = await new IntentRouter().route('desliga o pc');
  assert.equal(result.intentName, 'SHUTDOWN_PC');
  assert.doesNotMatch(result.responseSpeech || '', /^Solicitação de desligamento enviada\.$/);
  assert.match(result.responseSpeech || '', /desligamento/i);
});

test('o agente de texto inclui a vida interior e a personalidade efetiva no prompt', async () => {
  mock.method(dbManager, 'getPersonality', async () => ({ ...DEFAULT_PERSONALITY }));
  mock.method(dbManager, 'getAllMemories', async () => []);
  const brain = new GeminiBrain() as any;
  let instruction = '';
  brain.genAI = { getGenerativeModel: (options: any) => {
    instruction = options.systemInstruction;
    return { startChat: () => ({ sendMessage: async () => ({ response: { functionCalls: () => [], text: () => 'Beleza.' } }) }) };
  } };
  await brain.generateResponse('oi');
  assert.match(instruction, /VIDA INTERIOR DO JASPER/);
  assert.match(instruction, /ESTILO J\.A\.R\.V\.I\.S\./);
  assert.match(instruction, /A verdade não é ajustável/);
});
