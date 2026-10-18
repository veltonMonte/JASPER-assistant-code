import type { PresetConfig, PresetKind } from './presentation-types.js';

const properties = {
  density: 'número entre 0.25 e 1; o cliente aplica o teto de qualidade',
  element: 'hydrogen, carbon, oxygen ou iron; utilizado no átomo',
  primaryColor: 'cor hexadecimal #RRGGBB; utilizada pelo veículo',
  accentColor: 'cor hexadecimal #RRGGBB; utilizada pelo veículo',
};

/** Registro de metadados puro: servidor e construtores usam a mesma definição. */
export const PRESET_CATALOG = [
  { id: 'atom', label: 'Átomo', keywords: ['átomo', 'atomo', 'orbital', 'quântico', 'quantico'], defaultConfig: { element: 'carbon', density: 1 } },
  { id: 'cyber_car', label: 'Veículo', keywords: ['carro', 'veículo', 'veiculo', 'automóvel'], defaultConfig: { primaryColor: '#00f3ff', accentColor: '#ff007f', density: 1 } },
  { id: 'solar_system', label: 'Sistema solar', keywords: ['sistema solar', 'planetas', 'astronomia'], defaultConfig: { density: 1 } },
  { id: 'flow_field', label: 'Campo de fluxo', keywords: ['lorenz', 'caos', 'atrator', 'fluxo de partículas'], defaultConfig: { density: 1 } },
  { id: 'neural_network', label: 'Rede neural', keywords: ['rede neural', 'redes neurais', 'aprendizado de máquina'], defaultConfig: { density: 1 } },
  { id: 'custom', label: 'Peças personalizadas', keywords: [], defaultConfig: { density: 1 } },
].map(item => ({ ...item, id: item.id as PresetKind, defaultConfig: item.defaultConfig as PresetConfig, configSchema: { properties }, validate: (value: unknown) => parsePresetConfig(item.id as PresetKind, value) }));

export function getPresetDefinition(id: unknown) {
  const definition = PRESET_CATALOG.find(item => item.id === id);
  if (!definition) throw new Error('Apresentação inválida: preset desconhecido.');
  return definition;
}

export function parsePresetConfig(id: PresetKind, value: unknown): PresetConfig {
  const definition = getPresetDefinition(id);
  if (value === undefined) return { ...definition.defaultConfig };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Configuração de preset inválida.');
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some(key => !Object.prototype.hasOwnProperty.call(properties, key))) throw new Error('Configuração de preset contém campo desconhecido.');
  if (raw.density !== undefined && (typeof raw.density !== 'number' || !Number.isFinite(raw.density) || raw.density < .25 || raw.density > 1)) throw new Error('A densidade deve estar entre 0.25 e 1.');
  if (raw.element !== undefined && !['hydrogen', 'carbon', 'oxygen', 'iron'].includes(String(raw.element))) throw new Error('Elemento do átomo inválido.');
  for (const key of ['primaryColor', 'accentColor']) if (raw[key] !== undefined && (typeof raw[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(raw[key] as string))) throw new Error('Cor de preset inválida.');
  return { ...definition.defaultConfig, ...raw } as PresetConfig;
}

export function inferPreset(title: string): PresetKind {
  const text = title.toLocaleLowerCase('pt-BR');
  return PRESET_CATALOG.find(item => item.keywords.some(keyword => text.includes(keyword)))?.id || 'custom';
}

export function presetPrompt(): string {
  return 'Presets disponíveis (registro do Jasper):\n' + PRESET_CATALOG.map(item => `${item.id}: ${item.label}; palavras-chave: ${item.keywords.join(', ') || 'composição livre'}; config: ${JSON.stringify(item.configSchema.properties)}; padrões: ${JSON.stringify(item.defaultConfig)}`).join('\n')
    + '\nInclua label curto nas peças principais do modo custom. Nunca defina quantidades brutas de partículas. Use density entre 0.25 e 1. O cliente limita os recursos ao aparelho.';
}
