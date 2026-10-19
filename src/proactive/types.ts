export interface ProactiveSettings {
  enabled: boolean;
  news: boolean;
  topics: string[];
  questions: boolean;
  clock: boolean;
  quietEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  timezone: string;
}
export interface NewsArticle {
  id: string;
  title: string;
  url: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  topic: string;
}
export interface ProactiveNotice {
  id: string;
  kind: 'news' | 'question' | 'clock';
  text: string;
  sentAt: string;
  article?: NewsArticle;
}
export const DEFAULT_PROACTIVE: ProactiveSettings = {
  enabled: true, news: true,
  topics: ['Fortaleza Esporte Clube', 'Futebol e placares', 'Política brasileira', 'Cinema e trailers'],
  questions: true, clock: true, quietEnabled: true,
  quietStart: '23:00', quietEnd: '08:00', timezone: 'America/Fortaleza',
};
export function validateSettings(input: unknown, current = DEFAULT_PROACTIVE): ProactiveSettings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuração inválida.');
  const result = { ...current, topics: [...current.topics] };
  for (const key of ['enabled', 'news', 'questions', 'clock', 'quietEnabled'] as const) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) {
      if (typeof value !== 'boolean') throw new Error(`Valor inválido para ${key}.`);
      result[key] = value;
    }
  }
  const data = input as Record<string, unknown>;
  if (data.topics !== undefined) {
    if (!Array.isArray(data.topics) || data.topics.length > 8 || data.topics.some(t => typeof t !== 'string' || !t.trim() || t.length > 80 || /[<>\x00-\x1f]/.test(t))) throw new Error('Escolha até 8 assuntos, com até 80 caracteres cada.');
    result.topics = [...new Set(data.topics.map(t => t.trim()))];
  }
  for (const key of ['quietStart', 'quietEnd'] as const) {
    if (data[key] !== undefined) {
      if (typeof data[key] !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(data[key])) throw new Error('Horário de silêncio inválido.');
      result[key] = data[key];
    }
  }
  if (data.timezone !== undefined) {
    if (typeof data.timezone !== 'string' || data.timezone.length > 80) throw new Error('Fuso horário inválido.');
    try { new Intl.DateTimeFormat('pt-BR', { timeZone: data.timezone }).format(); } catch { throw new Error('Fuso horário inválido.'); }
    result.timezone = data.timezone;
  }
  return result;
}
export function isQuietTime(settings: ProactiveSettings, now: number): boolean {
  if (!settings.quietEnabled || settings.quietStart === settings.quietEnd) return false;
  const current = new Intl.DateTimeFormat('en-GB', { timeZone: settings.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  return settings.quietStart < settings.quietEnd
    ? current >= settings.quietStart && current < settings.quietEnd
    : current >= settings.quietStart || current < settings.quietEnd;
}
