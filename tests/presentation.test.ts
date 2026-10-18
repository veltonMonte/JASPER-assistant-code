import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePresentation } from '../src/presentation/schema.js';

const diagram = {
  title: 'Fluxo de uma API', subtitle: 'Da requisição à resposta',
  steps: [{ title: 'Pedido', narration: 'O navegador envia uma requisição ao servidor.', kind: 'diagram',
    nodes: [{ id: 'browser', label: 'Navegador', x: 20, y: 50 }, { id: 'api', label: 'API', x: 80, y: 50 }],
    links: [{ from: 'browser', to: 'api', label: 'HTTP' }] }],
};

test('estrutura um diagrama narrado para a tela de apresentação', () => {
  const result = parsePresentation(JSON.stringify(diagram));
  assert.match(result.id, /^[0-9a-f-]{36}$/);
  assert.equal(result.steps[0].links?.[0].label, 'HTTP');
  assert.equal(result.steps[0].nodes?.[0].color, '#9ecbdd');
  assert.equal(result.steps[0].narration, diagram.steps[0].narration);
  const edge = parsePresentation({ ...diagram, steps: [{ ...diagram.steps[0], nodes: [{ ...diagram.steps[0].nodes[0], x: 0, y: 100 }, diagram.steps[0].nodes[1]] }] });
  assert.equal(edge.steps[0].nodes?.[0].x, 12);
  assert.equal(edge.steps[0].nodes?.[0].y, 85);
});

test('aceita um objeto 3D composto por peças controladas', () => {
  const result = parsePresentation({ title: 'Satélite', steps: [{ title: 'Estrutura', narration: 'Este é o corpo central.', kind: 'model3d',
    parts: [{ shape: 'box', size: [2, 1, 1], position: [0, 0, 0], rotation: [0, .2, 0], color: '#4477aa', label: 'Corpo' },
      { shape: 'sphere', size: [1, 1, 1], position: [0, 1, 0] }] }] });
  assert.equal(result.steps[0].parts?.length, 2);
  assert.equal(result.steps[0].parts?.[1].color, '#9ecbdd');
});

test('impede ligações soltas, coordenadas inválidas e apresentações grandes', () => {
  assert.throws(() => parsePresentation({ ...diagram, steps: [{ ...diagram.steps[0], links: [{ from: 'browser', to: 'desconhecido' }] }] }), /conexão sem bloco/);
  assert.throws(() => parsePresentation({ ...diagram, steps: [{ ...diagram.steps[0], nodes: [{ ...diagram.steps[0].nodes[0], x: Infinity }, diagram.steps[0].nodes[1]] }] }), /posição x/);
  assert.throws(() => parsePresentation({ ...diagram, steps: Array(7).fill(diagram.steps[0]) }), /1 a 6 etapas/);
  assert.throws(() => parsePresentation({ title: 'Modelo', steps: [{ title: 'Objeto', narration: 'Um objeto.', kind: 'model3d', parts: [{ shape: 'script', size: [1, 1, 1] }] }] }), /forma 3D/);
});

test('aceita desenhos livres e malhas 3D sem permitir conteúdo SVG executável', () => {
  const drawing = parsePresentation({ title: 'Circuito', steps: [{ title: 'Percurso', narration: 'A corrente segue pelo circuito.', kind: 'drawing', elements: [
    { type: 'path', d: 'M 10 20 C 30 5 70 5 90 20', color: '#77bbdd', fill: 'none', width: 1.5 },
    { type: 'ellipse', x: 50, y: 50, rx: 12, ry: 8, color: '#ffffff', fill: '#334455' },
    { type: 'text', x: 50, y: 75, text: 'Energia', color: '#ddeeff' },
  ] }] });
  assert.equal(drawing.steps[0].elements?.length, 3);
  assert.equal(drawing.steps[0].elements?.[1].type, 'ellipse');
  const model = parsePresentation({ title: 'Asa', steps: [{ title: 'Forma', narration: 'Observe o perfil da asa.', kind: 'model3d', parts: [
    { shape: 'mesh', size: [2, .4, 1], vertices: [[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1], [0, 1, 0]], faces: [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]] },
  ] }] });
  assert.equal(model.steps[0].parts?.[0].vertices?.length, 5);
  assert.equal(model.steps[0].parts?.[0].faces?.length, 4);
  assert.throws(() => parsePresentation({ title: 'Risco', steps: [{ title: 'Script', narration: 'Texto.', kind: 'drawing', elements: [
    { type: 'path', d: 'M 0 0" onload="alert(1)', color: '#ffffff' },
  ] }] }), /traçado SVG inválido/);
  assert.throws(() => parsePresentation({ title: 'Risco', steps: [{ title: 'Malha', narration: 'Texto.', kind: 'model3d', parts: [
    { shape: 'mesh', vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] },
  ] }] }), /4 a 48 vértices/);
  assert.throws(() => parsePresentation({ title: 'Risco', steps: [{ title: 'Malha', narration: 'Texto.', kind: 'model3d', parts: [
    { shape: 'mesh', vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], faces: [[0, 1, 4], [0, 1, 2], [0, 1, 3], [1, 2, 3]] },
  ] }] }), /face 1/);
});

test('aceita preset procedural sem peças manuais', () => {
  const result = parsePresentation({
    title: 'Átomo de Carbono',
    steps: [{
      title: 'Orbitais Quânticos',
      narration: 'O carbono possui elétrons em orbitais quânticos de probabilidade.',
      kind: 'model3d',
      preset: 'atom',
      config: { element: 'carbon' }
    }]
  });
  assert.equal(result.steps[0].preset, 'atom');
  assert.equal(result.steps[0].config?.element, 'carbon');
  assert.deepEqual(result.steps[0].parts, []);
});
