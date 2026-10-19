import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROACTIVE, isQuietTime, validateSettings, type NewsArticle, type ProactiveNotice } from '../src/proactive/types.js';
import { parseNewsFeed, isTopicRelevant } from '../src/proactive/news.js';
import { ProactiveService } from '../src/proactive/service.js';

const START = Date.parse('2026-10-15T15:00:00Z');
function setup(settings = {}) {
  let now = START;
  let available = true;
  let items: NewsArticle[] = [];
  let requests = 0;
  const sent: ProactiveNotice[] = [];
  const storage = new Map<string, string>([['jasper.proactive.settings', JSON.stringify({ ...DEFAULT_PROACTIVE, quietEnabled: false, topics: ['Tecnologia'], ...settings })]]);
  const create = () => new ProactiveService({ read: async key => storage.get(key) || null, write: async (key, value) => { storage.set(key, value); }, fetchNews: async topic => { requests++; return items.filter(item => item.topic === topic); }, deliver: notice => { if (!available) return false; sent.push(notice); return true; }, now: () => now, random: () => .5 });
  const article = (id: string, title = `Tecnologia: lançamento ${id}`, topic = 'Tecnologia'): NewsArticle => ({ id, title, topic, source: 'Fonte de teste', sourceUrl: 'https://example.com', url: `https://example.com/${id}`, publishedAt: new Date(now - 60_000).toISOString() });
  return { service: create(), create, sent, article, storage, setItems: (value: NewsArticle[]) => { items = value; }, advance: (ms: number) => { now += ms; }, setAvailable: (value: boolean) => { available = value; }, requests: () => requests };
}

test('horário de silêncio funciona de um dia para o seguinte e no fuso escolhido', () => {
  assert.equal(isQuietTime({ ...DEFAULT_PROACTIVE, quietStart: '23:00', quietEnd: '08:00' }, Date.parse('2026-10-15T02:30:00Z')), true);
  assert.equal(isQuietTime(DEFAULT_PROACTIVE, Date.parse('2026-10-15T14:00:00Z')), false);
  assert.equal(isQuietTime({ ...DEFAULT_PROACTIVE, quietEnabled: false }, Date.parse('2026-10-15T02:30:00Z')), false);
});
test('preferências rejeitam horários, assuntos e fusos inválidos', () => {
  assert.throws(() => validateSettings({ quietStart: '25:99' }));
  assert.throws(() => validateSettings({ timezone: 'Planeta/Marte' }));
  assert.throws(() => validateSettings({ topics: ['<script>'] }));
  assert.throws(() => validateSettings({ news: 'true' }));
  assert.deepEqual(validateSettings({ topics: ['Fortaleza', 'Fortaleza'] }).topics, ['Fortaleza']);
});
test('feed só produz manchetes recentes, com fonte, data e link seguros', () => {
  const item = (title: string, date: string, link = 'https://example.com/noticia') => `<item><title>${title} - Fonte</title><link>${link}</link><pubDate>${date}</pubDate><source url="https://example.com">Fonte</source></item>`;
  const xml = `<rss><channel>${item('Tecnologia lança chip', new Date(START - 60_000).toUTCString())}${item('Tecnologia antiga', new Date(START - 86_400_000).toUTCString())}${item('Tecnologia futura', new Date(START + 3_600_000).toUTCString())}${item('Tecnologia sem data', '')}${item('Tecnologia inválida', new Date(START).toUTCString(), 'javascript:alert(1)')}</channel></rss>`;
  const result = parseNewsFeed(xml, 'Tecnologia', START);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'Tecnologia lança chip');
  assert.equal(result[0].source, 'Fonte');
  assert.throws(() => parseNewsFeed('<!DOCTYPE rss [<!ENTITY x "oops">]><rss/>', 'Tecnologia', START));
});
test('Fortaleza time não é confundido com notícias da cidade; placares devem ser relevantes', () => {
  assert.equal(isTopicRelevant('Fortaleza vence e avança na Copa', 'Fortaleza Esporte Clube'), true);
  assert.equal(isTopicRelevant('Renove a casa sem reforma: cinco dicas em Fortaleza', 'Fortaleza Esporte Clube'), false);
  assert.equal(isTopicRelevant('Ocorrência policial em Fortaleza', 'Fortaleza Esporte Clube'), false);
  assert.equal(isTopicRelevant('Fortaleza vence por 2 a 0 no Brasileiro', 'Futebol e placares'), true);
  assert.equal(isTopicRelevant('Árbitro pode assumir vaga na Fifa', 'Futebol e placares'), false);
});
test('notícia nova é anunciada uma vez e a deduplicação sobrevive ao reinício', async () => {
  const f = setup(); await f.service.init();
  const article = f.article('chip', 'Tecnologia lança novo chip para computadores');
  f.setItems([article]); await f.service.tick();
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0].article?.id, 'chip');
  f.advance(180_000); await f.service.tick(); assert.equal(f.sent.length, 1);
  const restarted = f.create(); await restarted.init(); await restarted.tick(); assert.equal(f.sent.length, 1);
});
test('sem cliente apto, preserva a notícia e só fala quando há disponibilidade', async () => {
  const f = setup(); f.setAvailable(false); await f.service.init(); f.setItems([f.article('a')]); await f.service.tick();
  assert.equal(f.sent.length, 0); assert.equal(f.service.snapshot().pendingCount, 1);
  f.setAvailable(true); await f.service.tick(); assert.equal(f.sent.length, 1);
});
test('ao pausar, não consulta fontes nem emite falas; escolhas ficam persistidas', async () => {
  const f = setup(); await f.service.init(); await f.service.update({ enabled: false, topics: ['Cinema e trailers'] }); await f.service.tick();
  assert.equal(f.requests(), 0); assert.equal(f.sent.length, 0);
  const restarted = f.create(); await restarted.init(); assert.equal(restarted.snapshot().settings.enabled, false); assert.deepEqual(restarted.snapshot().settings.topics, ['Cinema e trailers']);
});
test('primeira execução não lê o histórico antigo como notícia de última hora', async () => {
  const f = setup(); await f.service.init(); const article = f.article('old'); article.publishedAt = new Date(START - 60 * 60_000).toISOString();
  f.setItems([article]); await f.service.tick(); assert.equal(f.sent.length, 0); assert.equal(f.service.snapshot().articles.length, 1);
});
test('política aparece no máximo uma vez por hora', async () => {
  const f = setup({ topics: ['Política brasileira'] }); await f.service.init();
  f.setItems([f.article('p1', 'Lula anuncia decisão sobre economia', 'Política brasileira')]); await f.service.tick();
  f.advance(180_000); f.setItems([f.article('p2', 'Congresso vota projeto sobre transportes', 'Política brasileira')]); await f.service.tick();
  assert.equal(f.sent.length, 1); f.advance(3_600_000); await f.service.tick(); assert.equal(f.sent.length, 2);
});
test('comentários respeitam o intervalo aleatório e não disparam a cada verificação', async () => {
  const f = setup({ news: false }); await f.service.init(); await f.service.tick(); assert.equal(f.sent.length, 0);
  f.advance(24 * 60_000); await f.service.tick(); assert.equal(f.sent.length, 0);
  f.advance(20 * 60_000); await f.service.tick(); assert.equal(f.sent.length, 1);
  await f.service.tick(); assert.equal(f.sent.length, 1);
});
test('silêncio suspende falas, mas permite consultar as fontes', async () => {
  const f = setup({ quietEnabled: true, quietStart: '00:00', quietEnd: '23:59' }); await f.service.init();
  f.setItems([f.article('q')]); await f.service.tick(); assert.equal(f.sent.length, 0); assert.equal(f.requests(), 1);
});
