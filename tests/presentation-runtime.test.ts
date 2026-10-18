import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePresentation } from '../src/presentation/schema.js';
import { PRESET_CATALOG, presetPrompt } from '../shared/presentation-presets.js';
import { QUALITY_PROFILES, particleCount, initialQuality, AdaptiveQuality } from '../client/src/presentation/runtime/quality.js';
import { labelLines, limitLabels } from '../client/src/presentation/runtime/labels.js';
import { generateSamples } from '../client/src/presentation/runtime/samples.js';

const scene = (preset: string, config: unknown) => ({ title: 'Cena', steps: [{ title: 'Assunto', narration: 'Observe a cena.', kind: 'model3d', preset, config }] });

test('presets rejeitam configuração desconhecida, quantidade bruta e densidade fora do intervalo', () => {
  for (const config of [{ density: 0 }, { density: 1.1 }, { count: 1000000 }, { element: 'desconhecido' }, { primaryColor: 'javascript:teste' }]) assert.throws(() => parsePresentation(scene('atom', config)));
  assert.throws(() => parsePresentation(scene('preset-inexistente', {})));
  assert.equal(parsePresentation(scene('atom', { density: .5, element: 'oxygen' })).steps[0].config?.density, .5);
  for (const preset of PRESET_CATALOG) assert.ok(presetPrompt().includes(preset.id));
});

test('tiers impõem orçamento total e prioridade da URL sobre preferências salvas', () => {
  for (const tier of ['low', 'medium', 'high'] as const) {
    const quality = QUALITY_PROFILES[tier];
    assert.ok(particleCount(1000000, 1, tier) + quality.dust <= quality.maxPoints);
    assert.ok(particleCount(24000, .5, tier) <= particleCount(24000, 1, tier));
  }
  assert.equal(initialQuality({ query: 'low', saved: 'high', cores: 16, memory: 16, pixelRatio: 2 }), 'low');
  assert.equal(initialQuality({ cores: 2, memory: 4, pixelRatio: 1 }), 'low');
  assert.equal(QUALITY_PROFILES.low.bloomScale, 0);
});

test('qualidade adaptativa reduz pontos antes de reduzir o tier e recupera devagar', () => {
  const adaptive = new AdaptiveQuality('high');
  for (let window = 0; window < 3; window++) adaptive.observe(40);
  assert.equal(adaptive.ratio, .75);
  for (let window = 0; window < 3; window++) adaptive.observe(40);
  assert.equal(adaptive.tier, 'medium');
  adaptive.observe(10);
  assert.equal(adaptive.tier, 'medium');
});

test('rótulos quebram palavras longas e respeitam limite por tier', () => {
  assert.ok(labelLines('uma palavraextremamentelonga demais', 12).every(line => line.length <= 12));
  const labels = Array.from({ length: 40 }, (_, index) => ({ text: `Rótulo ${index}` }));
  assert.equal(limitLabels(labels, 'low').length, 8);
  assert.equal(limitLabels(labels, 'high').length, 24);
});

test('geração produz buffers finitos, reutiliza amostras e respeita cancelamento', async () => {
  const first = await generateSamples('atom', 1200, '#00e5ff', new AbortController().signal);
  assert.equal(first.positions.length, 3600);
  assert.ok(first.positions.every(Number.isFinite));
  assert.ok(first.colors.every(value => value >= 0 && value <= 1));
  const cached = await generateSamples('atom', 1200, '#00e5ff', new AbortController().signal);
  assert.equal(cached.cached, true);
  assert.equal(cached.positions, first.positions);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(generateSamples('atom', 1200, '#00e5ff', controller.signal), /cancelada/);
});
