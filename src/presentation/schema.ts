import { randomUUID } from 'node:crypto';

import type { PresentationPart, PresentationNode, PresentationLink, DrawingElement, PresentationStep, Presentation } from '../../shared/presentation-types.js';
export type { PresentationPart, PresentationNode, PresentationLink, DrawingElement, PresetKind, PresetConfig, PresentationStep, Presentation } from '../../shared/presentation-types.js';
import { inferPreset, getPresetDefinition, parsePresetConfig } from '../../shared/presentation-presets.js';

const fail = (message: string): never => { throw new Error(`Apresentação inválida: ${message}`); };
const str = (value: unknown, max: number, field: string): string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max ? value.trim() : fail(field);
const record = (value: unknown, field: string): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail(field);
const bounded = (value: unknown, min: number, max: number, field: string): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fail(field);
const vector = (value: unknown, min: number, max: number, field: string): [number, number, number] => {
  if (!Array.isArray(value) || value.length !== 3) return fail(field);
  return value.map((item, index) => bounded(item, min, max, `${field}[${index}]`)) as [number, number, number];
};
const color = (value: unknown, fallback = '#9ecbdd'): string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
const paint = (value: unknown): string => value === 'none' ? 'none' : color(value, 'none');

export function parsePresentation(input: unknown): Presentation {
  let source: unknown = input;
  if (typeof source === 'string') {
    if (source.length > 32_000) return fail('conteúdo grande demais');
    try { source = JSON.parse(source.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
    catch { return fail('JSON'); }
  }
  const data = record(source, 'estrutura');
  const rawSteps = data.steps;
  if (!Array.isArray(rawSteps) || rawSteps.length < 1 || rawSteps.length > 6) return fail('use de 1 a 6 etapas');
  const steps = rawSteps.map((raw, index): PresentationStep => {
    const step = record(raw, `etapa ${index + 1}`);
    const title = str(step.title, 100, 'título da etapa');
    const narration = str(step.narration, 850, 'narração da etapa');
    if (step.kind === 'model3d') {
      const rawParts = Array.isArray(step.parts) ? step.parts : [];
      const preset = step.preset === undefined
        ? (rawParts.length ? 'custom' : inferPreset(title))
        : getPresetDefinition(step.preset).id;
      const config = parsePresetConfig(preset, step.config);
      if (rawParts.length === 0 && preset === 'custom') return fail('o modelo deve ter de 1 a 48 peças ou um preset reconhecido');
      if (rawParts.length > 48) return fail('o modelo deve ter no máximo 48 peças');
      const parts = rawParts.map((rawPart, partIndex): PresentationPart => {
        const part = record(rawPart, `peça ${partIndex + 1}`);
        if (!['box', 'sphere', 'cylinder', 'cone', 'torus', 'capsule', 'plane', 'mesh'].includes(String(part.shape))) return fail('forma 3D');
        const vertices = part.shape === 'mesh' ? part.vertices : undefined;
        if (part.shape === 'mesh' && (!Array.isArray(vertices) || vertices.length < 4 || vertices.length > 48)) return fail('malha 3D deve ter de 4 a 48 vértices');
        const faces = part.shape === 'mesh' ? part.faces : undefined;
        if (faces !== undefined && (!Array.isArray(faces) || faces.length < 4 || faces.length > 96)) return fail('malha 3D deve ter de 4 a 96 faces');
        const parsedFaces = Array.isArray(faces) ? faces.map((face, faceIndex): [number, number, number] => {
          if (!Array.isArray(face) || face.length !== 3 || face.some(index => !Number.isInteger(index) || index < 0 || index >= (vertices as unknown[]).length)) return fail(`face ${faceIndex + 1}`);
          if (new Set(face).size !== 3) return fail(`face ${faceIndex + 1} degenerada`);
          return face as [number, number, number];
        }) : undefined;
        return {
          shape: part.shape as PresentationPart['shape'],
          position: vector(part.position ?? [0, 0, 0], -8, 8, 'posição'),
          size: vector(part.size ?? [1, 1, 1], .03, 8, 'tamanho'),
          rotation: vector(part.rotation ?? [0, 0, 0], -7, 7, 'rotação'),
          color: color(part.color),
          ...(part.label ? { label: str(part.label, 55, 'rótulo') } : {}),
          ...(Array.isArray(vertices) ? { vertices: vertices.map((vertex, vertexIndex) => vector(vertex, -2, 2, `vértice ${vertexIndex + 1}`)) } : {}),
          ...(parsedFaces ? { faces: parsedFaces } : {}),
        };
      });
      return {
        title, narration, kind: 'model3d',
        ...(preset ? { preset } : {}),
        ...(config ? { config } : {}),
        parts,
      };
    }
    if (step.kind === 'diagram') {
      if (!Array.isArray(step.nodes) || step.nodes.length < 1 || step.nodes.length > 14) return fail('o diagrama deve ter de 1 a 14 blocos');
      const nodes = step.nodes.map((rawNode, nodeIndex): PresentationNode => {
        const node = record(rawNode, `bloco ${nodeIndex + 1}`);
        return {
          id: str(node.id, 30, 'id do bloco'), label: str(node.label, 75, 'rótulo do bloco'),
          ...(node.detail ? { detail: str(node.detail, 120, 'detalhe do bloco') } : {}),
          x: Math.max(12, Math.min(88, bounded(node.x, 0, 100, 'posição x'))),
          y: Math.max(15, Math.min(85, bounded(node.y, 0, 100, 'posição y'))), color: color(node.color),
        };
      });
      const ids = new Set(nodes.map(node => node.id));
      if (ids.size !== nodes.length) return fail('ids dos blocos repetidos');
      if (!Array.isArray(step.links) || step.links.length > 24) return fail('conexões');
      const links = step.links.map((rawLink): PresentationLink => {
        const link = record(rawLink, 'conexão');
        const from = str(link.from, 30, 'origem');
        const to = str(link.to, 30, 'destino');
        if (!ids.has(from) || !ids.has(to)) return fail('conexão sem bloco');
        return { from, to, ...(link.label ? { label: str(link.label, 60, 'rótulo da conexão') } : {}) };
      });
      return { title, narration, kind: 'diagram', nodes, links };
    }
    if (step.kind === 'drawing') {
      if (!Array.isArray(step.elements) || step.elements.length < 1 || step.elements.length > 80) return fail('o desenho deve ter de 1 a 80 elementos');
      const elements = step.elements.map((rawElement): DrawingElement => {
        const element = record(rawElement, 'elemento do desenho');
        const stroke = color(element.color);
        if (element.type === 'path') {
          const d = str(element.d, 1600, 'traçado');
          if (!/^[0-9eE+.,\-\sMmLlHhVvCcSsQqTtAaZz]+$/.test(d) || !/[Mm]/.test(d)) return fail('traçado SVG inválido');
          return { type: 'path', d, color: stroke, fill: paint(element.fill), width: bounded(element.width ?? 1, .1, 8, 'largura do traço') };
        }
        if (element.type === 'ellipse') return {
          type: 'ellipse', x: bounded(element.x, 0, 100, 'posição x'), y: bounded(element.y, 0, 100, 'posição y'),
          rx: bounded(element.rx, .1, 50, 'raio x'), ry: bounded(element.ry, .1, 50, 'raio y'),
          color: stroke, fill: paint(element.fill), width: bounded(element.width ?? 1, .1, 8, 'largura do traço'),
        };
        if (element.type === 'rect') return {
          type: 'rect', x: bounded(element.x, 0, 100, 'posição x'), y: bounded(element.y, 0, 100, 'posição y'),
          width: bounded(element.width, .1, 100, 'largura'), height: bounded(element.height, .1, 100, 'altura'),
          radius: bounded(element.radius ?? 0, 0, 30, 'arredondamento'), color: stroke, fill: paint(element.fill),
          strokeWidth: bounded(element.strokeWidth ?? 1, .1, 8, 'largura do traço'),
        };
        if (element.type === 'text') return {
          type: 'text', x: bounded(element.x, 0, 100, 'posição x'), y: bounded(element.y, 0, 100, 'posição y'),
          text: str(element.text, 100, 'texto do desenho'), color: stroke, size: bounded(element.size ?? 3, 1, 10, 'tamanho do texto'),
        };
        return fail('tipo de elemento do desenho');
      });
      return { title, narration, kind: 'drawing', elements };
    }
    return fail('tipo da etapa');
  });
  return { id: randomUUID(), title: str(data.title, 110, 'título'), subtitle: typeof data.subtitle === 'string' ? data.subtitle.slice(0, 180).trim() : '', steps };
}
