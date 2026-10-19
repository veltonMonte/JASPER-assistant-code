import axios from 'axios';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { createHash } from 'node:crypto';
import type { NewsArticle } from './types.js';

const parser = new XMLParser({ ignoreAttributes: false, processEntities: true, parseTagValue: false });
const QUERIES: Record<string, string> = {
  'Fortaleza Esporte Clube': '"Fortaleza" (futebol OR "Esporte Clube" OR placar OR resultado)',
  'Futebol e placares': 'futebol (placar OR resultado OR final OR campeonato)',
  'Política brasileira': '(política OR Lula OR Bolsonaro OR Congresso) Brasil',
  'Cinema e trailers': '(cinema OR Marvel OR Vingadores) (trailer OR estreia OR anúncio)',
};
export function normalizeHeadline(title: string): string {
  return title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function similarHeadline(a: string, b: string): boolean {
  const left = new Set(normalizeHeadline(a).split(' ').filter(t => t.length > 3));
  const right = new Set(normalizeHeadline(b).split(' ').filter(t => t.length > 3));
  if (left.size < 4 || right.size < 4) return normalizeHeadline(a) === normalizeHeadline(b);
  const shared = [...left].filter(t => right.has(t)).length;
  return shared / Math.max(left.size, right.size) >= .8;
}
export function isTopicRelevant(title: string, topic: string): boolean {
  const text = normalizeHeadline(title);
  if (topic === 'Fortaleza Esporte Clube') return /\b(fortaleza|leao do pici|tricolor do pici)\b/.test(text)
    && /\b(jog\w*|futebol|placar|resultado|campeon\w*|brasileir\w*|serie|copa|cbf|treinad\w*|tecnic\w*|atacant\w*|zagueir\w*|goleir\w*|contrat\w*|elenco|torcid\w*|vence\w*|vitoria|derrota|empate|escala\w*|pici|clube|gol\w*|partida|castelao|x|vs)\b/.test(text);
  if (topic === 'Futebol e placares') return /\b(placar|resultado|vence\w*|venc\w*|empata\w*|empate|gole\w*|derrota|final|campeao|elimina\w*|\d+ [xa] \d+)\b/.test(text)
    && /\b(futebol|brasileir\w*|libertadores|champions|copa|selecao|fortaleza|flamengo|palmeiras|corinthians|vasco|fluminense|botafogo|sao paulo|santos|cruzeiro|atletico|internacional|gremio|bahia|sport|ceara|barcelona|real madrid)\b/.test(text);
  if (topic === 'Política brasileira') return /\b(lula|bolsonaro|congresso|senad\w*|camara|tse|stf|elei\w*|governo|presiden\w*|politic\w*|ministr\w*|pec|deputad\w*)\b/.test(text)
    && !/\b(opiniao|coluna|artigo)\b/.test(text);
  if (topic === 'Cinema e trailers') return /\b(cinema\w*|filme\w*|marvel|vingadores|trailer|netflix|disney|hbo)\b/.test(text)
    && /\b(trailer|estreia\w*|anunci\w*|lanc\w*|confirm\w*|revela\w*)\b/.test(text);
  const terms = normalizeHeadline(topic).split(' ').filter(term => term.length > 3);
  return !terms.length || terms.some(term => text.includes(term));
}
function safeUrl(value: unknown): string {
  try { const url = new URL(String(value)); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''; } catch { return ''; }
}
function plain(value: unknown): string { return String(value ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); }
export function parseNewsFeed(xml: string, topic: string, now = Date.now()): NewsArticle[] {
  if (xml.length > 1_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('Feed de notícias inválido.');
  const parsed = parser.parse(xml);
  const entries = parsed?.rss?.channel?.item;
  const items = Array.isArray(entries) ? entries : entries ? [entries] : [];
  return items.flatMap((item: any) => {
    const source = plain(typeof item.source === 'object' ? item.source['#text'] : item.source).slice(0, 100);
    const sourceUrl = safeUrl(item.source?.['@_url']);
    const url = safeUrl(item.link);
    const published = Date.parse(String(item.pubDate));
    const title = plain(item.title).replace(new RegExp(` - ${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '').slice(0, 240);
    // Undated, future and stale results never become spoken "breaking news".
    if (!source || !title || !url || !isTopicRelevant(title, topic) || !Number.isFinite(published) || published > now + 300_000 || now - published > 6 * 3_600_000) return [];
    return [{ id: createHash('sha256').update(normalizeHeadline(title)).digest('hex').slice(0, 24), title, url, source, sourceUrl, publishedAt: new Date(published).toISOString(), topic }];
  }).sort((a: NewsArticle, b: NewsArticle) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 12);
}
export async function fetchTopicNews(topic: string): Promise<NewsArticle[]> {
  const query = (QUERIES[topic] || topic) + ' when:6h';
  const response = await axios.get('https://news.google.com/rss/search', {
    params: { q: query, hl: 'pt-BR', gl: 'BR', ceid: 'BR:pt-419' },
    timeout: 12_000, maxContentLength: 1_000_000, responseType: 'text',
    headers: { 'User-Agent': 'JasperPersonalAssistant/1.0', Accept: 'application/rss+xml, application/xml' },
  });
  return parseNewsFeed(String(response.data), topic);
}
