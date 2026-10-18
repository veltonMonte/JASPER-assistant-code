import test, { before, mock } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

let executeToolByName: typeof import('../src/tools/index.js').executeToolByName;
before(async () => {
  mock.method(dotenv, 'config', () => ({ parsed: {} }));
  process.env.GEMINI_API_KEY = 'chave-falsa-fase0';
  ({ executeToolByName } = await import('../src/tools/index.js'));
});

test('caracterização: ferramenta desconhecida retorna erro e duração', async () => {
  const result = await executeToolByName('ferramenta_inexistente_fase0');
  assert.match(result.error, /desconhecida ou não registrada/);
  assert.equal(typeof result._executionTimeMs, 'number');
});

test('caracterização: terminal sem argumentos não cria aprovação nem execução', async () => {
  const result = await executeToolByName('executar_terminal');
  assert.equal(result.success, false);
  assert.equal(result.message, 'Nenhum comando informado.');
});
