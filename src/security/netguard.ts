import dns from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import axios from 'axios';

type Resolver = (host: string) => Promise<{ address: string; family: number }[]>;
const resolveDns: Resolver = host => dns.lookup(host, { all: true, verbatim: true });
const blockedV4 = new BlockList();
const blockedV6 = new BlockList();
for (const [address, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const) blockedV4.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [['::',96],['::ffff:0:0',96],['fc00::',7],['fe80::',10],['ff00::',8],['2001:db8::',32],['2001::',32],['2002::',16]] as const) blockedV6.addSubnet(address, prefix, 'ipv6');

function publicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blockedV4.check(address, 'ipv4');
  if (family === 6) return /^[23][0-9a-f]{3}:/i.test(address) && !blockedV6.check(address, 'ipv6');
  return false;
}

async function destination(raw: string, resolver: Resolver) {
  if (typeof raw !== 'string' || raw.length > 2048 || /[\u0000-\u0020\u007f]/.test(raw)) throw new Error('URL inválida.');
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('URL inválida.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Somente URLs públicas HTTP ou HTTPS são permitidas.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) throw new Error('Endereço local não permitido.');
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await resolver(hostname);
  if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw new Error('Endereço privado ou reservado não permitido.');
  return { url, addresses };
}

export async function assertPublicHttpUrl(raw: string, resolver: Resolver = resolveDns): Promise<URL> {
  return (await destination(raw, resolver)).url;
}

/** Valida cada destino e fixa o DNS da conexão para impedir troca após a validação. */
export async function publicHttpGet(raw: string, opts: { maxBytes: number; timeoutMs: number; responseType?: 'text' | 'arraybuffer'; headers?: Record<string, string> }) {
  let current = raw;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const { url, addresses } = await destination(current, resolveDns);
    const pinned = addresses[0];
    const lookup = (_host: string, options: any, callback: any) => {
      if (typeof options === 'function') callback = options;
      if (options?.all) callback(null, [pinned]); else callback(null, pinned.address, pinned.family);
    };
    const httpAgent = new http.Agent({ lookup });
    const httpsAgent = new https.Agent({ lookup });
    try {
      const response = await axios.get(url.href, {
        timeout: opts.timeoutMs, maxContentLength: opts.maxBytes, maxBodyLength: opts.maxBytes,
        maxRedirects: 0, proxy: false, httpAgent, httpsAgent, responseType: opts.responseType || 'text',
        headers: opts.headers, validateStatus: status => status >= 200 && status < 400,
      });
      if (response.status >= 300 && response.status < 400) {
        if (redirects === 3 || typeof response.headers.location !== 'string') throw new Error('Limite de redirecionamentos excedido ou destino ausente.');
        current = new URL(response.headers.location, url).href;
        continue;
      }
      return { ...response, source: url.href };
    } finally { httpAgent.destroy(); httpsAgent.destroy(); }
  }
  throw new Error('Limite de redirecionamentos excedido.');
}
