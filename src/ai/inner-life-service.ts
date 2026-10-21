import { dbManager } from '../database/database.js';
import type { PersonalityConfig } from '../database/database.js';
import {
  applyInteraction, buildInnerLifePrompt, createInnerState, effectivePersonality, settle,
  MAX_DRIFT, type InnerState, type TraitDrift, type UserSignal,
} from './inner-life.js';

const SETTING_KEY = 'jasper.inner_life';
const SAVE_DELAY_MS = 3_000;
const SIGNALS: UserSignal[] = ['praise', 'thanks', 'joy', 'frustration', 'sadness', 'rudeness', 'brevity', 'neutral'];
const TRAITS: Array<keyof PersonalityConfig> = ['humor', 'honestidade', 'sarcasmo', 'formalidade', 'verbosidade', 'empatia'];

const finite = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** Valida o JSON salvo; qualquer dado corrompido volta ao padrão em vez de contaminar o prompt. */
export function sanitizeInnerState(raw: unknown): InnerState {
  const base = createInnerState();
  if (!raw || typeof raw !== 'object') return base;
  const data = raw as Record<string, any>;
  const drift: TraitDrift = {};
  for (const trait of TRAITS) {
    const value = data.drift?.[trait];
    if (typeof value === 'number' && Number.isFinite(value)) drift[trait] = Math.min(MAX_DRIFT, Math.max(-MAX_DRIFT, value));
  }
  const time = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null);
  return {
    version: 1,
    mood: finite(data.mood, base.mood, -100, 100),
    energy: finite(data.energy, base.energy, 0, 100),
    affinity: finite(data.affinity, base.affinity, 0, 100),
    interactions: Math.floor(finite(data.interactions, 0, 0, 1e9)),
    firstSeenAt: time(data.firstSeenAt),
    lastInteractionAt: time(data.lastInteractionAt),
    prevGapMs: finite(data.prevGapMs, 0, 0, 1e12),
    drift,
    lastSignal: SIGNALS.includes(data.lastSignal) ? data.lastSignal : 'neutral',
  };
}

/** Mantém o estado interno em memória e o persiste no SQLite (assistant_settings). */
export class InnerLifeService {
  private state: InnerState = createInnerState();
  private loaded = false;
  private saveTimer: NodeJS.Timeout | null = null;

  public async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await dbManager.getSetting(SETTING_KEY);
      if (raw) this.state = sanitizeInnerState(JSON.parse(raw));
      this.loaded = true;
    } catch {
      // Banco indisponível: segue com o estado em memória e tenta de novo na próxima chamada.
    }
  }

  /** Registra a fala do usuário e agenda a gravação do estado. */
  public observe(text: string, now = Date.now()): void {
    if (typeof text !== 'string' || !text.trim()) return;
    this.state = applyInteraction(this.state, text, now);
    this.scheduleSave();
  }

  public snapshot(now = Date.now()): InnerState {
    return settle(this.state, now);
  }

  /** Personalidade efetiva (ajustes do usuário + deriva) e a seção de prompt correspondente. */
  public async adapt(base: PersonalityConfig, now = Date.now()): Promise<{ personality: PersonalityConfig; prompt: string }> {
    await this.ensureLoaded();
    return { personality: effectivePersonality(base, this.state), prompt: buildInnerLifePrompt(this.state, now) };
  }

  public reset(): void {
    this.state = createInnerState();
    this.scheduleSave();
  }

  public async flush(): Promise<void> {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    try { await dbManager.saveSetting(SETTING_KEY, JSON.stringify(this.state)); }
    catch { console.warn('⚠️ Não foi possível salvar o estado interno do Jasper agora.'); }
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; void this.flush(); }, SAVE_DELAY_MS);
    this.saveTimer.unref?.();
  }
}

export const innerLife = new InnerLifeService();
