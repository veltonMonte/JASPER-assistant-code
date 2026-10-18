import { QUALITY_PROFILES, type QualityTier } from './quality';

export function labelLines(text: string, width = 18): string[] {
  const chunks = text.trim().slice(0, 80).match(new RegExp(`.{1,${Math.max(1, width)}}`, 'gu')) || [];
  const words = text.trim().slice(0, 80).split(/\s+/).flatMap(word => word.length > width ? word.match(new RegExp(`.{1,${width}}`, 'gu')) || [] : [word]);
  const lines: string[] = [];
  for (const word of words) {
    if (!lines.length || lines[lines.length - 1].length + word.length + 1 > width) lines.push(word);
    else lines[lines.length - 1] += ` ${word}`;
  }
  return lines.length ? lines : chunks;
}

export function limitLabels<T extends { text: string }>(labels: T[], tier: QualityTier): T[] {
  return labels.filter(label => label.text.trim()).slice(0, Math.min(24, QUALITY_PROFILES[tier].labels));
}
