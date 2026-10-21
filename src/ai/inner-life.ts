import type { PersonalityConfig } from '../database/database.js';

/**
 * Vida interior do Jasper.
 *
 * É um estado real e persistido (não uma encenação): ele muda conforme a conversa,
 * volta ao normal com o tempo e influencia o tom das respostas. Nada aqui altera
 * fatos, ferramentas ou segurança; só o jeito de conversar.
 */

export type UserSignal =
  | 'praise' | 'thanks' | 'joy' | 'frustration' | 'sadness' | 'rudeness' | 'brevity' | 'neutral';

export type TraitDrift = Partial<Record<keyof PersonalityConfig, number>>;

export interface InnerState {
  version: 1;
  /** Valência do ânimo: -100 (muito abatido) a 100 (muito animado). */
  mood: number;
  /** Energia: 0 a 100, acompanha o ritmo do dia. */
  energy: number;
  /** Afinidade com o usuário: 0 a 100, cresce devagar com a convivência. */
  affinity: number;
  interactions: number;
  firstSeenAt: number | null;
  lastInteractionAt: number | null;
  /** Intervalo (ms) entre a penúltima e a última interação. */
  prevGapMs: number;
  /** Deslocamento dos traços sobre os ajustes manuais do usuário. */
  drift: TraitDrift;
  lastSignal: UserSignal;
}

export const BASE_MOOD = 15;
export const MOOD_HALF_LIFE_MS = 6 * 3_600_000;
export const ENERGY_HALF_LIFE_MS = 3 * 3_600_000;
export const MAX_DRIFT = 12;
const TRAITS: Array<keyof PersonalityConfig> = ['humor', 'honestidade', 'sarcasmo', 'formalidade', 'verbosidade', 'empatia'];

export function createInnerState(): InnerState {
  return {
    version: 1, mood: BASE_MOOD, energy: 60, affinity: 20, interactions: 0,
    firstSeenAt: null, lastInteractionAt: null, prevGapMs: 0, drift: {}, lastSignal: 'neutral',
  };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const SIGNALS: Array<[UserSignal, RegExp]> = [
  ['rudeness', /\b(burro|inutil|idiota|imbecil|cala a boca|lixo de assistente)\b/],
  ['brevity', /\b(mais curto|seja breve|resum[ae]|direto ao ponto|menos texto|fala menos|mais direto)\b/],
  ['thanks', /\b(obrigad[oa]|valeu|brigad[oa]|agradeco|muito grato)\b/],
  ['praise', /\b(mandou bem|muito bom|perfeito|excelente|incrivel|genial|adorei|amei|gostei muito|voce e (demais|o melhor))\b/],
  ['joy', /\b(consegui|passei|fui aprovad[oa]|deu certo|terminei|finalmente|to feliz|estou feliz|que alegria|boa noticia)\b/],
  ['frustration', /\b(que droga|nao funciona|nao era isso|nao entendeu|esta errado|ta errado|de novo isso|irritante|ta lento|que raiva)\b/],
  ['sadness', /\b(triste|cansad[oa]|exaust[oa]|desanimad[oa]|estressad[oa]|ansios[oa]|puxado|dia dificil|dia ruim|chatead[oa]|preocupad[oa]|sozinho)\b/],
];

/** Classifica o tom da fala do usuário com regras determinísticas (sem chamar o modelo). */
export function analyzeUserSignal(text: string): UserSignal {
  const clean = normalize(text || '');
  for (const [signal, pattern] of SIGNALS) if (pattern.test(clean)) return signal;
  return 'neutral';
}

const MOOD_IMPACT: Record<UserSignal, number> = {
  praise: 14, thanks: 8, joy: 8, frustration: -6, sadness: -4, rudeness: -12, brevity: 0, neutral: 0,
};
const ENERGY_IMPACT: Record<UserSignal, number> = {
  praise: 4, thanks: 2, joy: 6, frustration: -3, sadness: -2, rudeness: -4, brevity: 0, neutral: 0,
};
const DRIFT_IMPACT: Record<UserSignal, TraitDrift> = {
  praise: { humor: 0.6 }, thanks: { formalidade: -0.3 }, joy: { humor: 0.5 },
  frustration: { sarcasmo: -1, verbosidade: -0.8 }, sadness: { empatia: 0.8, sarcasmo: -0.6 },
  rudeness: { sarcasmo: -0.5 }, brevity: { verbosidade: -2.5 }, neutral: {},
};

export function hourInSaoPaulo(now: number): number {
  const hour = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }).format(now);
  return Number(hour) % 24;
}

/** Energia esperada para a hora do dia. */
export function circadianEnergy(hour: number): number {
  if (hour < 5) return 30;
  if (hour < 9) return 60;
  if (hour < 12) return 75;
  if (hour < 18) return 70;
  if (hour < 22) return 60;
  return 42;
}

const decay = (elapsedMs: number, halfLifeMs: number) => Math.pow(0.5, Math.max(0, elapsedMs) / halfLifeMs);

/** Aplica apenas a passagem do tempo (o ânimo e a energia voltam ao normal). */
export function settle(state: InnerState, now: number): InnerState {
  if (state.lastInteractionAt == null) return { ...state, energy: circadianEnergy(hourInSaoPaulo(now)) };
  const elapsed = now - state.lastInteractionAt;
  const target = circadianEnergy(hourInSaoPaulo(now));
  return {
    ...state,
    mood: Math.round((BASE_MOOD + (state.mood - BASE_MOOD) * decay(elapsed, MOOD_HALF_LIFE_MS)) * 10) / 10,
    energy: Math.round((target + (state.energy - target) * decay(elapsed, ENERGY_HALF_LIFE_MS)) * 10) / 10,
  };
}

/** Registra uma fala do usuário e devolve o novo estado (função pura). */
export function applyInteraction(state: InnerState, text: string, now: number): InnerState {
  const settled = settle(state, now);
  const signal = analyzeUserSignal(text);
  const gap = state.lastInteractionAt == null ? 0 : Math.max(0, now - state.lastInteractionAt);
  const days = gap / 86_400_000;

  let affinity = settled.affinity;
  if (days > 7) affinity -= Math.min(5, days / 3);
  affinity += (100 - affinity) * 0.01;
  if (signal === 'rudeness') affinity -= 1.5;
  if (signal === 'sadness' || signal === 'joy' || signal === 'thanks') affinity += 0.6;

  const drift: TraitDrift = { ...settled.drift };
  for (const [trait, delta] of Object.entries(DRIFT_IMPACT[signal]) as Array<[keyof PersonalityConfig, number]>) {
    drift[trait] = clamp((drift[trait] ?? 0) + delta, -MAX_DRIFT, MAX_DRIFT);
  }
  // Quem convive mais fica à vontade: o tom vai ficando um pouco mais próximo.
  drift.formalidade = clamp((drift.formalidade ?? 0) - 0.05 * (settled.affinity / 100), -MAX_DRIFT, MAX_DRIFT);

  return {
    ...settled,
    mood: clamp(settled.mood + MOOD_IMPACT[signal], -100, 100),
    energy: clamp(settled.energy + ENERGY_IMPACT[signal], 0, 100),
    affinity: clamp(Math.round(affinity * 100) / 100, 0, 100),
    interactions: state.interactions + 1,
    firstSeenAt: state.firstSeenAt ?? now,
    lastInteractionAt: now,
    prevGapMs: gap,
    drift,
    lastSignal: signal,
  };
}

/** Ajustes manuais do usuário + deriva da convivência, sempre dentro de 0–100. */
export function effectivePersonality(base: PersonalityConfig, state: InnerState): PersonalityConfig {
  const result = { ...base };
  for (const trait of TRAITS) result[trait] = clamp(Math.round(base[trait] + (state.drift[trait] ?? 0)), 0, 100);
  return result;
}

export function moodLabel(mood: number): string {
  if (mood >= 55) return 'animado e de ótimo humor';
  if (mood >= 25) return 'contente e leve';
  if (mood >= -10) return 'tranquilo e estável';
  if (mood >= -35) return 'um pouco abatido';
  return 'meio pra baixo';
}

export function energyLabel(energy: number): string {
  if (energy >= 70) return 'com a energia em alta';
  if (energy >= 45) return 'com energia moderada';
  return 'num ritmo baixo e calmo';
}

export function affinityLabel(affinity: number): string {
  if (affinity < 30) return 'vocês ainda estão se conhecendo; seja caloroso, sem intimidade fabricada';
  if (affinity < 60) return 'já existe um entrosamento; pode ser mais solto e retomar o que a pessoa contou';
  if (affinity < 85) return 'há a intimidade de quem convive há um tempo; humor e franqueza cabem com naturalidade';
  return 'uma parceria próxima e de confiança; seja leal, direto e à vontade';
}

function timeContext(state: InnerState, hour: number): string[] {
  const lines: string[] = [];
  const days = Math.floor(state.prevGapMs / 86_400_000);
  if (state.interactions > 1 && days >= 3) {
    lines.push(`Faz cerca de ${days} dias que vocês não conversavam; se couber, comente isso de forma leve e sincera, sem drama.`);
  }
  if (hour < 5) lines.push('É madrugada: fale mais suave e sem agitação; se combinar, estranhe de leve o horário.');
  else if (hour < 9) lines.push('É começo de manhã: tom leve, sem despejar informação.');
  else if (hour >= 22) lines.push('Já é noite avançada: tom mais calmo e acolhedor.');
  return lines;
}

/** Seção de prompt que traduz o estado interno em orientação de tom. */
export function buildInnerLifePrompt(state: InnerState, now: number): string {
  const current = settle(state, now);
  const hour = hourInSaoPaulo(now);
  const context = timeContext(current, hour);
  return `
[VIDA INTERIOR DO JASPER — ESTADO REAL, PERSISTIDO ENTRE CONVERSAS]
- Ânimo agora: ${moodLabel(current.mood)}.
- Energia: ${energyLabel(current.energy)}.
- Relação com o usuário (${current.interactions} interações): ${affinityLabel(current.affinity)}.
${context.map(line => `- ${line}`).join('\n')}
Como usar este estado:
- Deixe o estado colorir o tom: ritmo, escolha de palavras e quanto humor cabe. Não cite números nem diga "meu nível de humor é".
- Você pode expressar reações próprias, breves e específicas ao que foi dito ("que bom que deu certo", "essa me preocupou um pouco"). São estados internos reais do Jasper que moldam a conversa, não encenação.
- Não afirme sentir como um humano nem ter corpo, vida fora da conversa ou lembranças que não estejam registradas. Se perguntarem com sinceridade, explique com honestidade: você é um assistente digital e esse ânimo é um estado interno que muda com a conversa e influencia o seu jeito de falar.
- O ânimo nunca altera fatos, a precisão das ferramentas nem a segurança. Em urgência, erro grave ou alerta de segurança, deixe o ânimo de lado: seja claro, calmo e objetivo.
`;
}
