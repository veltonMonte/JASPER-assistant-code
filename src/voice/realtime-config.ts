export const LIVE_SILENCE_MS = 600;
export const LIVE_PREFIX_PADDING_MS = 200;
/**
 * Configuração de geração de áudio em tempo real.
 * O Gemini 3.8 Live padrão não aceita thinkingConfig no setup (deve ser omitido).
 * O Gemini 2.5 Native Audio utiliza thinkingBudget: 0 para respostas conversacionais imediatas.
 */
export function fastAudioGenerationConfig(model: string): { thinkingConfig?: { thinkingBudget: number } } {
  // Modelos Gemini 3.8 Live padrão omitem thinkingConfig
  if (/^(?:models\/)?gemini-3\.8-live(?:-preview)?$/i.test(model)) {
    return {};
  }
  // Modelos 2.5 Native Audio usam thinkingBudget: 0
  if (/^(?:models\/)?gemini-2\.5-flash-native-audio(?:-|$)/i.test(model)) {
    return { thinkingConfig: { thinkingBudget: 0 } };
  }
  return {};
}
