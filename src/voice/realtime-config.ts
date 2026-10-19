export const LIVE_SILENCE_MS = 600;
export const LIVE_PREFIX_PADDING_MS = 200;
/** Native 2.5 audio can answer conversational turns without a separate thinking pass. */
export function fastAudioGenerationConfig(model: string): { thinkingConfig?: { thinkingBudget: number } } {
  return /^(?:models\/)?gemini-2\.5-flash-native-audio(?:-|$)/.test(model)
    ? { thinkingConfig: { thinkingBudget: 0 } } : {};
}
