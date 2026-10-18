import { randomBytes, timingSafeEqual } from 'node:crypto';

export function resolveApiCredentials(environment: string, candidate?: string): { token: string; generated: boolean } {
  const token = candidate?.trim() || '';
  const valid = token.length >= 32 && token !== 'jasper-secure-local-token';
  if (environment === 'production' && !valid) throw new Error('API_SECRET_TOKEN é obrigatório em produção e deve ter pelo menos 32 caracteres, sem usar o valor de exemplo.');
  return valid ? { token, generated: false } : { token: randomBytes(32).toString('hex'), generated: true };
}

export function equalToken(candidate: string, expected: string): boolean {
  if (!candidate || !expected) return false;
  const left = Buffer.from(candidate); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
