export type SampleKind = 'atom' | 'flow' | 'wind' | 'dust';
export interface Samples { positions: Float32Array; colors: Float32Array; generationMs: number; maxSliceMs: number; cached: boolean }
const cache = new Map<string, Samples>();
const tables = new Map<number, Float32Array>();

function radialTable(orbital: number): Float32Array {
  const kind = Math.min(orbital, 2);
  const found = tables.get(kind); if (found) return found;
  const result = new Float32Array(257);
  let total = 0;
  for (let i = 1; i < result.length; i++) {
    const r = i / 256 * 5.5;
    total += kind === 0 ? r * r * Math.exp(-2.5 * r) : kind === 1 ? r * r * (2 - r / 1.4) ** 2 * Math.exp(-r) : r ** 4 * Math.exp(-r);
    result[i] = total;
  }
  for (let i = 0; i < result.length; i++) result[i] /= total;
  tables.set(kind, result); return result;
}
function inverseRadius(orbital: number, value: number): number {
  const table = radialTable(orbital); let low = 0, high = 256;
  while (low + 1 < high) { const mid = (low + high) >>> 1; if (table[mid] < value) low = mid; else high = mid; }
  return (low + (value - table[low]) / Math.max(.000001, table[high] - table[low])) / 256 * 5.5;
}
function generator(key: string): () => number {
  let seed = 2166136261;
  for (let i = 0; i < key.length; i++) seed = Math.imul(seed ^ key.charCodeAt(i), 16777619);
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function color(value: string): [number, number, number] {
  const raw = parseInt(value.replace('#', ''), 16);
  const linear = (channel: number) => { const c = channel / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };
  return [linear(raw >>> 16 & 255), linear(raw >>> 8 & 255), linear(raw & 255)];
}

/** Amostras imutáveis e determinísticas; cada lote cede a thread em até ~4 ms. */
export async function generateSamples(kind: SampleKind, count: number, tint: string, signal: AbortSignal): Promise<Samples> {
  if (signal.aborted) throw new DOMException('Geração cancelada.', 'AbortError');
  const key = `${kind}:${count}:${tint}`;
  const found = cache.get(key); if (found) return { ...found, cached: true, generationMs: 0, maxSliceMs: 0 };
  const started = performance.now(); let sliceStarted = started, maxSliceMs = 0;
  const random = generator(key);
  const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3);
  const primary = color(tint), cyan = color('#00e5ff'), green = color('#00ff88'), magenta = color('#ff007f');
  const flowA = color('#00f3ff'), flowB = color('#9d4edd');
  const xs = new Float64Array(8), ys = new Float64Array(8), zs = new Float64Array(8);
  for (let lane = 0; lane < 8; lane++) xs[lane] = .1 + lane * .003;
  const lorenz = (lane: number) => {
    const x = xs[lane], y = ys[lane], z = zs[lane];
    xs[lane] += 10 * (y - x) * .007; ys[lane] += (x * (28 - z) - y) * .007; zs[lane] += (x * y - 8 / 3 * z) * .007;
  };
  if (kind === 'flow') for (let step = 0; step < 500; step++) for (let lane = 0; lane < 8; lane++) lorenz(lane);
  for (let i = 0; i < count; i++) {
    if (signal.aborted) throw new DOMException('Geração cancelada.', 'AbortError');
    const offset = i * 3;
    let r = primary[0], g = primary[1], b = primary[2];
    if (kind === 'atom') {
      const orbital = i % 5;
      const radius = inverseRadius(orbital, random());
      const cosine = orbital < 2 ? random() * 2 - 1 : Math.cbrt(random() * 2 - 1);
      const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine)), angle = random() * Math.PI * 2;
      const a = radius * sine * Math.cos(angle), c = radius * sine * Math.sin(angle), axis = radius * cosine;
      positions[offset] = orbital === 2 ? axis : a;
      positions[offset + 1] = orbital === 3 ? axis : orbital === 2 ? a : c;
      positions[offset + 2] = orbital === 4 ? axis : orbital === 3 ? c : orbital === 2 ? c : axis;
      const shade = orbital === 0 ? cyan : orbital === 1 ? green : magenta;
      r = shade[0]; g = shade[1]; b = shade[2];
    } else if (kind === 'flow') {
      const lane = i % 8; lorenz(lane);
      positions[offset] = xs[lane] * .15; positions[offset + 1] = (zs[lane] - 25) * .15; positions[offset + 2] = ys[lane] * .15;
      const fraction = random(), second = fraction >= .5, mix = second ? (fraction - .5) * 2 : fraction * 2;
      const from = second ? flowB : flowA, to = second ? magenta : flowB;
      r = from[0] + (to[0] - from[0]) * mix; g = from[1] + (to[1] - from[1]) * mix; b = from[2] + (to[2] - from[2]) * mix;
    } else {
      positions[offset] = (random() - .5) * (kind === 'wind' ? 8 : 42);
      positions[offset + 1] = kind === 'wind' ? .2 + random() * 1.5 : (random() - .5) * 28;
      positions[offset + 2] = (random() - .5) * (kind === 'wind' ? 2.2 : 42);
    }
    colors[offset] = r; colors[offset + 1] = g; colors[offset + 2] = b;
    if ((i & 127) === 0 && performance.now() - sliceStarted >= 4) { maxSliceMs = Math.max(maxSliceMs, performance.now() - sliceStarted); await new Promise(resolve => setTimeout(resolve, 0)); sliceStarted = performance.now(); }
  }
  const result = { positions, colors, generationMs: performance.now() - started, maxSliceMs: Math.max(maxSliceMs, performance.now() - sliceStarted), cached: false };
  if (cache.size >= 8) cache.delete(cache.keys().next().value!);
  cache.set(key, result); return result;
}
