import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { GeminiBrain } from '../src/ai/gemini.js';
import { GeminiLiveSession } from '../src/ai/gemini-live.js';
import { dbManager, DEFAULT_PERSONALITY } from '../src/database/database.js';
import { voicePreferences } from '../src/voice/preferences.js';
import { JASPER_SYSTEM_PROMPT } from '../src/ai/prompts.js';

afterEach(() => mock.restoreAll());

function prepareContext() {
  mock.method(dbManager, 'getPersonality', async () => ({ ...DEFAULT_PERSONALITY }));
  mock.method(dbManager, 'getAllMemories', async () => []);
}

test('texto recebe as instruções de conversa e o histórico antes de uma continuação curta', async () => {
  prepareContext();
  const brain = new GeminiBrain() as any;
  let instruction = ''; let receivedHistory: unknown; const messages: unknown[] = [];
  brain.genAI = { getGenerativeModel: (options: any) => {
    instruction = options.systemInstruction;
    return { startChat: ({ history }: any) => {
      receivedHistory = history;
      return { sendMessage: async (text: unknown) => {
        messages.push(text);
        return { response: { functionCalls: () => [], text: () => 'O que aconteceu depois da reunião?' } };
      } };
    } };
  } };
  const history = [
    { role: 'user', parts: [{ text: 'A reunião de hoje foi cansativa.' }] },
    { role: 'model', parts: [{ text: 'O que te cansou mais nela?' }] },
  ];
  const result = await brain.generateResponse('foi a discussão no final', history);
  assert.deepEqual(receivedHistory, history);
  assert.deepEqual(messages, ['foi a discussão no final']);
  assert.deepEqual(result.toolsExecuted, []);
  assert.equal(result.text, 'O que aconteceu depois da reunião?');
  assert.ok(instruction.includes(JASPER_SYSTEM_PROMPT));
  assert.match(instruction, /CONVERSA QUE TEM CONTINUIDADE/);
  assert.match(instruction, /Mesmo com formalidade alta, acompanhe o tom casual/);
});

test('voz ao vivo recebe o mesmo estilo de conversa e preserva voz e ritmo escolhidos', async () => {
  prepareContext();
  mock.method(voicePreferences, 'get', async () => ({ voice: 'Algieba', pace: 'calm' } as const));
  const session = new GeminiLiveSession() as any; const sent: any[] = [];
  session.isConnected = true;
  session.ws = { readyState: 1, send: (payload: string) => sent.push(JSON.parse(payload)) };
  await session.sendSetupHandshake();
  const setup = sent[0].setup;
  assert.ok(setup.systemInstruction.parts[0].text.includes(JASPER_SYSTEM_PROMPT));
  assert.match(setup.systemInstruction.parts[0].text, /papo tranquilo entre amigos/);
  assert.match(setup.systemInstruction.parts[0].text, /Ritmo sereno/);
  assert.equal(setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Algieba');
  assert.ok(setup.tools[0].functionDeclarations.length > 0);
  assert.deepEqual(setup.inputAudioTranscription, {});
});

test('conversa indisponível informa a falha sem fingir uma resposta nem ecoar o usuário', async () => {
  const brain = new GeminiBrain() as any;
  brain.genAI = null;
  const result = await brain.generateResponse('hoje foi um dia difícil');
  assert.match(result.text, /Não consegui me conectar/);
  assert.doesNotMatch(result.text, /Recebi sua mensagem|está pronto|hoje foi um dia difícil/);
  assert.deepEqual(result.toolsExecuted, []);
});
