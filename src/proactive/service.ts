import { randomUUID } from 'node:crypto';
import { DEFAULT_PROACTIVE, isQuietTime, validateSettings, type NewsArticle, type ProactiveNotice, type ProactiveSettings } from './types.js';
import { isTopicRelevant, similarHeadline } from './news.js';

interface Runtime {
  known: Array<{ id: string; title: string; at: number }>;
  pending: NewsArticle[];
  initializedTopics: string[];
  nextCommentAt: number;
  lastDeliveredAt: number;
  topicLastSpokenAt: Record<string, number>;
}
interface Dependencies {
  read: (key: string) => Promise<string | null>;
  write: (key: string, value: string) => Promise<void>;
  fetchNews: (topic: string) => Promise<NewsArticle[]>;
  deliver: (notice: ProactiveNotice) => boolean;
  now?: () => number;
  random?: () => number;
}
export class ProactiveService {
  private settings: ProactiveSettings = { ...DEFAULT_PROACTIVE, topics: [...DEFAULT_PROACTIVE.topics] };
  private runtime: Runtime = { known: [], pending: [], initializedTopics: [], nextCommentAt: 0, lastDeliveredAt: 0, topicLastSpokenAt: {} };
  private ready = false;
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastCheckedAt = 0;
  private lastAttemptAt = 0;
  private lastError: string | null = null;
  private latest: NewsArticle[] = [];
  private revision = 0;
  constructor(private deps: Dependencies) {}
  private now() { return this.deps.now?.() ?? Date.now(); }
  private random() { return this.deps.random?.() ?? Math.random(); }
  private nextComment() { return this.now() + (25 + this.random() * 35) * 60_000; }
  async init() {
    const [settings, runtime] = await Promise.all([this.deps.read('jasper.proactive.settings'), this.deps.read('jasper.proactive.runtime')]);
    if (settings) this.settings = validateSettings(JSON.parse(settings));
    if (runtime) {
      const saved = JSON.parse(runtime);
      if (Array.isArray(saved.known) && Array.isArray(saved.pending) && Array.isArray(saved.initializedTopics)) this.runtime = { ...this.runtime, ...saved };
    }
    this.runtime.nextCommentAt = this.nextComment();
    this.ready = true;
  }
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.tick().catch(error => { console.warn('[Jasper notícias]', error.message); }); }, 15_000);
    this.timer.unref();
    void this.tick().catch(error => console.warn('[Jasper notícias]', error.message));
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  snapshot() {
    return { settings: { ...this.settings, topics: [...this.settings.topics] }, ready: this.ready, lastCheckedAt: this.lastCheckedAt ? new Date(this.lastCheckedAt).toISOString() : null,
      lastDeliveredAt: this.runtime.lastDeliveredAt ? new Date(this.runtime.lastDeliveredAt).toISOString() : null,
      lastError: this.lastError, articles: this.latest, pollSeconds: 120, pendingCount: this.runtime.pending.length };
  }
  async update(input: unknown) {
    if (!this.ready) throw new Error('O serviço de notícias ainda está iniciando.');
    const updated = validateSettings(input, this.settings);
    await this.deps.write('jasper.proactive.settings', JSON.stringify(updated));
    this.settings = updated;
    this.revision++;
    this.runtime.pending = this.runtime.pending.filter(item => updated.topics.includes(item.topic));
    this.runtime.nextCommentAt = this.nextComment();
    this.lastAttemptAt = 0;
    await this.persist();
    return this.snapshot();
  }
  private async persist() {
    this.runtime.known = this.runtime.known.filter(item => this.now() - item.at < 86_400_000).slice(-400);
    await this.deps.write('jasper.proactive.runtime', JSON.stringify(this.runtime));
  }
  async tick(forceRefresh = false) {
    if (!this.ready || this.running) return this.snapshot();
    this.running = true;
    try {
      const now = this.now();
      if (!this.settings.enabled) return this.snapshot();
      if (this.settings.news && this.settings.topics.length && (forceRefresh || !this.lastAttemptAt || now - this.lastAttemptAt >= 120_000)) {
        this.lastAttemptAt = now;
        const revision = this.revision;
        const results = await Promise.allSettled(this.settings.topics.map(async topic => ({ topic, articles: await this.deps.fetchNews(topic) })));
        if (revision !== this.revision) return this.snapshot();
        const articles: NewsArticle[] = [];
        let failures = 0;
        for (const result of results) {
          if (result.status === 'rejected') { failures++; continue; }
          const { topic, articles: found } = result.value;
          const firstCheck = !this.runtime.initializedTopics.includes(topic);
          if (firstCheck) this.runtime.initializedTopics.push(topic);
          for (const article of found.filter(article => isTopicRelevant(article.title, topic))) {
            articles.push(article);
            if (this.runtime.known.some(item => item.id === article.id || similarHeadline(item.title, article.title))) continue;
            this.runtime.known.push({ id: article.id, title: article.title, at: now });
            // Establish a baseline on first use instead of reading a backlog of old headlines.
            if ((!firstCheck || now - Date.parse(article.publishedAt) <= 15 * 60_000) && now - Date.parse(article.publishedAt) <= 2 * 3_600_000) this.runtime.pending.push(article);
          }
        }
        const unique = [...new Map(articles.map(item => [item.id, item])).values()];
        const byTopic = this.settings.topics.map(topic => unique.filter(item => item.topic === topic).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)));
        this.latest = [];
        for (let index = 0; index < 4; index++) for (const group of byTopic) if (group[index]) this.latest.push(group[index]);
        if (failures < results.length) this.lastCheckedAt = now;
        this.lastError = failures ? `${failures} assunto(s) sem atualização. Tentarei novamente em dois minutos.` : null;
        await this.persist();
      }
      this.runtime.pending = this.runtime.pending.filter(article => this.settings.topics.includes(article.topic) && isTopicRelevant(article.title, article.topic) && now - Date.parse(article.publishedAt) <= 2 * 3_600_000);
      if (isQuietTime(this.settings, now) || now - this.runtime.lastDeliveredAt < 90_000) return this.snapshot();
      const article = this.settings.news ? this.runtime.pending.filter(item => item.topic !== 'Política brasileira' || now - (this.runtime.topicLastSpokenAt[item.topic] || 0) >= 3_600_000).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0] : undefined;
      let notice: ProactiveNotice | null = null;
      if (article) notice = { id: randomUUID(), kind: 'news', text: `Novidade sobre ${article.topic}. Segundo ${article.source}: ${article.title}.`, article, sentAt: new Date(now).toISOString() };
      else if (now >= this.runtime.nextCommentAt && (this.settings.questions || this.settings.clock)) {
        const clock = this.settings.clock && (!this.settings.questions || this.random() < .35);
        const questions = [
          'Como está indo seu dia? Quer ajuda com alguma coisa?',
          'Quer que eu pesquise os próximos jogos e os últimos resultados do Fortaleza?',
          'Tem algum filme ou campeonato que você quer que eu acompanhe mais de perto?',
          'Quer um resumo das notícias dos assuntos que você escolheu?',
        ];
        const text = clock ? `Agora são ${new Intl.DateTimeFormat('pt-BR', { timeZone: this.settings.timezone, hour: '2-digit', minute: '2-digit' }).format(now)}. Estou por aqui se precisar.` : questions[Math.floor(this.random() * questions.length) % questions.length];
        notice = { id: randomUUID(), kind: clock ? 'clock' : 'question', text, sentAt: new Date(now).toISOString() };
      }
      if (notice && this.deps.deliver(notice)) {
        this.runtime.lastDeliveredAt = now;
        this.runtime.nextCommentAt = this.nextComment();
        if (article) { this.runtime.pending = this.runtime.pending.filter(item => item.id !== article.id); this.runtime.topicLastSpokenAt[article.topic] = now; }
        await this.persist();
      }
      return this.snapshot();
    } finally { this.running = false; }
  }
}
