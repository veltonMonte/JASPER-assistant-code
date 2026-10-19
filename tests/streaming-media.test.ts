import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareStreamingMarkdown } from '../client/src/lib/streamingMarkdown.ts';

test('oculta JSON de mídia incompleto até o fechamento do bloco', () => {
  assert.deepEqual(prepareStreamingMarkdown('Olá\n```recharts\n{"data":['), { markdown: 'Olá\n', pending: 'recharts' });
  assert.deepEqual(prepareStreamingMarkdown('```images\n{"images":[]}\n```'), { markdown: '```images\n{"images":[]}\n```', pending: null });
});
test('preserva blocos concluídos enquanto uma nova mídia chega', () => {
  const complete = '```images\n{"images":[]}\n```\n';
  assert.deepEqual(prepareStreamingMarkdown(complete + '```video\n{'), { markdown: complete, pending: 'video' });
});
test('código e crases em conteúdo não são confundidos com mídia incompleta', () => {
  assert.equal(prepareStreamingMarkdown('```python\nprint(1)').pending, null);
  assert.equal(prepareStreamingMarkdown('Use `images` aqui').pending, null);
  assert.equal(prepareStreamingMarkdown('~~~table\n{}\n~~~').pending, null);
});

test('legenda do orb mostra somente prosa, sem JSON de gráficos', async () => {
  const { proseFromStreamingMarkdown } = await import('../client/src/lib/streamingMarkdown.ts');
  assert.equal(proseFromStreamingMarkdown('Aqui está.\n```recharts\n{"data":[]}\n```'), 'Aqui está.');
  assert.equal(proseFromStreamingMarkdown('Veja.\n```images\n{'), 'Veja.');
});
