import { isIP } from 'node:net';
import type { IncomingHttpHeaders } from 'node:http';

const loopback = (ip: string) => ip === '::1' || /^127\./.test(ip.replace(/^::ffff:/, ''));
const proxyHeaders = ['x-forwarded-for', 'forwarded', 'x-real-ip', 'cf-connecting-ip'];

export function isAllowedOrigin(origin: string | undefined, host: string | undefined, protocol: string, allowed: string[]): boolean {
  if (!origin) return true; // Clientes de máquina ainda precisam de credencial.
  try {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) return false;
    return allowed.length ? allowed.includes(origin) : origin === `${protocol}://${host}`;
  } catch { return false; }
}

export function isTrustedViteProxy(peerIp: string, headers: IncomingHttpHeaders, environment: string): boolean {
  if (environment === 'production' || !loopback(peerIp) || headers['x-jasper-proxy'] !== 'vite' || proxyHeaders.some(key => headers[key] !== undefined)) return false;
  try {
    const origin = new URL(String(headers.origin || ''));
    return origin.protocol === 'http:' && origin.port === '5173' && origin.host === headers.host
      && typeof headers['x-jasper-client-ip'] === 'string' && isIP(headers['x-jasper-client-ip'].replace(/^::ffff:/, '').trim()) !== 0;
  } catch { return false; }
}

export function allowMasterForRequest(clientIp: string, headers: IncomingHttpHeaders | undefined, localAddresses: string[], environment: string): boolean {
  if (!headers?.host || proxyHeaders.some(key => headers[key] !== undefined)) return false;
  const normalizedIp = clientIp.replace(/^::ffff:/, '').toLowerCase();
  if (!loopback(normalizedIp) && !localAddresses.includes(normalizedIp)) return false;
  if (headers['x-jasper-client-ip'] !== undefined && !isTrustedViteProxy('127.0.0.1', headers, environment)) return false;
  try {
    const host = new URL(`http://${headers.host}`).hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return host === 'localhost' || loopback(host) || localAddresses.includes(host);
  } catch { return false; }
}
