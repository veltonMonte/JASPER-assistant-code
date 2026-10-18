export type QualityTier = 'low' | 'medium' | 'high';
export const QUALITY_PROFILES = {
  low: { maxPoints: 8000, pixelRatio: 1, bloomScale: 0, dust: 300, fps: 30, segments: 12, labels: 8 },
  medium: { maxPoints: 25000, pixelRatio: 1.25, bloomScale: .5, dust: 900, fps: 60, segments: 20, labels: 16 },
  high: { maxPoints: 60000, pixelRatio: 2, bloomScale: 1, dust: 1800, fps: 60, segments: 24, labels: 24 },
} as const;
export type QualityProfile = typeof QUALITY_PROFILES[QualityTier];
const valid = (value?: string | null): value is QualityTier => ['low', 'medium', 'high'].includes(value || '');

export function initialQuality(input: { query?: string | null; saved?: string | null; cores?: number; memory?: number; pixelRatio?: number; width?: number }): QualityTier {
  if (valid(input.query)) return input.query;
  if (valid(input.saved)) return input.saved;
  if ((input.cores || 2) <= 4 || (input.memory !== undefined && input.memory <= 4) || (input.width || 1200) < 600) return 'low';
  if ((input.cores || 4) >= 8 && (input.memory || 8) >= 8 && (input.pixelRatio || 1) <= 2) return 'high';
  return 'medium';
}

export function particleCount(base: number, density: number, tier: QualityTier): number {
  return Math.max(0, Math.min(Math.floor(base * Math.max(.25, Math.min(1, density))), QUALITY_PROFILES[tier].maxPoints - QUALITY_PROFILES[tier].dust));
}

/** Cada observação representa uma janela de dois segundos de quadros visíveis. */
export class AdaptiveQuality {
  ratio = 1;
  tier: QualityTier;
  readonly ceiling: QualityTier;
  history: string[] = [];
  private slow = 0;
  private stable = 0;
  constructor(tier: QualityTier) { this.tier = tier; this.ceiling = tier; }
  observe(frameMs: number): boolean {
    const budget = 1000 / QUALITY_PROFILES[this.tier].fps;
    if (frameMs > budget * 1.25) {
      this.slow++; this.stable = 0;
      if (this.slow === 3) { this.ratio *= .75; this.note('redução de 25% dos pontos'); return true; }
      if (this.slow >= 6) {
        this.slow = 0;
        const lower = this.tier === 'high' ? 'medium' : 'low';
        if (lower !== this.tier) { this.tier = lower; this.ratio = 1; this.note(`qualidade ${lower}`); return true; }
        this.ratio = Math.max(.25, this.ratio * .75); this.note('redução adicional de pontos'); return true;
      }
    } else {
      this.slow = 0;
      this.stable = frameMs <= budget * 1.08 ? this.stable + 1 : 0;
      if (this.stable >= 10) {
        this.stable = 0;
        if (this.ratio < 1) { this.ratio = Math.min(1, this.ratio / .75); this.note('recuperação gradual dos pontos'); return true; }
        const ranks: QualityTier[] = ['low', 'medium', 'high'];
        if (ranks.indexOf(this.tier) < ranks.indexOf(this.ceiling)) { this.tier = ranks[ranks.indexOf(this.tier) + 1]; this.note(`recuperação para ${this.tier}`); return true; }
      }
    }
    return false;
  }
  private note(message: string) { this.history.push(message); this.history = this.history.slice(-8); }
}
