export const VOICE_OPTIONS = [
  { id: 'Orus', label: 'Orus', description: 'Firme e precisa' },
  { id: 'Algieba', label: 'Algieba', description: 'Suave e próxima' },
  { id: 'Algenib', label: 'Algenib', description: 'Grave e presente' },
  { id: 'Charon', label: 'Charon', description: 'Clara e informativa' },
] as const;
export interface VoiceSettings { voice: typeof VOICE_OPTIONS[number]['id']; pace: 'calm' | 'natural' | 'brisk' }
export const DEFAULT_VOICE_SETTINGS: VoiceSettings = { voice: (process.env.GEMINI_VOICE as any) || 'Charon', pace: 'natural' };
export const VOICE_SAMPLE = 'À sua disposição. Vamos organizar o que realmente merece sua atenção. O restante pode esperar alguns segundos. Até o caos merece uma agenda.';

export function validateVoiceSettings(value: unknown, current: VoiceSettings = DEFAULT_VOICE_SETTINGS): VoiceSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Escolha uma voz e um ritmo válidos.');
  const patch = value as Record<string, unknown>;
  if (Object.keys(patch).some(key => !['voice', 'pace'].includes(key))) throw new Error('Opção de voz desconhecida.');
  const voice = patch.voice ?? current.voice; const pace = patch.pace ?? current.pace;
  if (!VOICE_OPTIONS.some(option => option.id === voice)) throw new Error('Esta voz não está disponível.');
  if (!['calm', 'natural', 'brisk'].includes(String(pace))) throw new Error('Escolha um ritmo válido.');
  return { voice, pace } as VoiceSettings;
}
export function buildVoiceDirection(settings: VoiceSettings): string {
  const pace = {
    calm: 'Ritmo sereno, com pequenas pausas entre ideias. Preserve fluidez; não arraste sílabas.',
    natural: 'Ritmo de conversa natural, com variação sutil de entonação e pausas breves na pontuação.',
    brisk: 'Ritmo um pouco mais ágil, mantendo articulação clara e pausas entre ideias. Não atropele palavras.',
  }[settings.pace];
  const register = settings.voice === 'Algenib'
    ? 'Use seu registro masculino médio-grave de barítono: ressonância cheia, dicção precisa e finais de frase firmes, com inflexões pequenas e descendentes. Presença serena e segura, sem elevar o tom para soar animado. Preserve seu timbre natural; não rosne, não sussurre e não alongue as vogais.'
    : settings.voice === 'Charon'
    ? 'Use seu timbre característico do Jasper: voz masculina nítida, natural, inteligente, amigável e confiante. Dicção clara e ritmo conversacional dinâmico, sem artificialidade ou frieza mecânica.'
    : '';
  return `[DIREÇÃO DE VOZ]\nFale em português do Brasil. Converse como num papo tranquilo entre amigos: voz confortável, próxima e espontânea. Use entonação que acompanhe o sentido da fala, com pequenas variações de ritmo e pausas entre ideias; evite ler cada frase com a mesma melodia. Não acrescente risadas, hesitações ou interjeições artificiais. ${register} ${pace} Evite cadência de locutor, canto, sussurros, respirações encenadas, monotonia robótica e graves forçados. A ironia do texto pode receber uma inflexão seca e discreta; notícias sérias recebem sobriedade. Não leia estas instruções.\n`;
}
