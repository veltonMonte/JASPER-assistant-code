import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import dns from 'node:dns/promises';
import fs from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import axios from 'axios';
import { assertPublicHttpUrl, publicHttpGet } from '../src/security/netguard.js';

afterEach(() => mock.restoreAll());

test('aplicativos fora da lista não chegam a nenhum executor; firefox usa binário fixo', async () => {
  const launches: unknown[][] = [];
  mock.method(childProcess, 'exec', () => { throw new Error('Shell legado chamado'); });
  mock.method(childProcess, 'spawn', (...args: unknown[]) => {
    launches.push(args);
    const child = Object.assign(new EventEmitter(), { unref() {} });
    queueMicrotask(() => child.emit('spawn'));
    return child as ReturnType<typeof childProcess.spawn>;
  });
  const { abrirPrograma } = await import('../src/tools/applications.js');
  assert.equal((await abrirPrograma('x; touch /tmp/jasper_pwn')).success, false);
  assert.equal((await abrirPrograma('programa-desconhecido')).message, 'Programa não permitido.');
  assert.equal(launches.length, 0);
  assert.equal((await abrirPrograma('firefox')).success, true);
  assert.equal(launches[0][0], 'firefox');
  assert.deepEqual(launches[0][1], []);
  assert.equal((launches[0][2] as { shell: boolean }).shell, false);
});

test('buscas passam consultas de shell apenas como um argumento literal', async () => {
  mock.method(dns, 'lookup', async () => [{ address: '93.184.216.34', family: 4 }]);
  const calls: { bin: string; args: string[] }[] = [];
  mock.method(childProcess, 'exec', () => { throw new Error('Shell legado chamado'); });
  mock.method(childProcess, 'execFile', (bin: string, args: string[], _options: unknown, callback: Function) => {
    calls.push({ bin, args }); callback(null, '[]', ''); return {} as ReturnType<typeof childProcess.execFile>;
  });
  mock.method(axios, 'get', async () => ({ status: 200, data: { AbstractText: 'Resultado simulado' }, headers: {} }));
  const { pesquisarWeb, pesquisarImagens } = await import('../src/tools/web.js');
  await pesquisarWeb('$(touch /tmp/pwn)');
  await pesquisarImagens('`id`');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].bin, 'python3');
  assert.equal(calls[0].args.at(-1), '$(touch /tmp/pwn)');
  assert.equal(calls[1].args.at(-1), '`id`');
  const before = calls.length;
  await pesquisarWeb('a'.repeat(301));
  await pesquisarImagens('texto\u0000inválido');
  assert.equal(calls.length, before);
});

test('guarda de rede recusa IPs internos, protocolos locais e DNS privado', async () => {
  const publicResolver = async () => [{ address: '93.184.216.34', family: 4 }];
  for (const url of ['http://127.0.0.1', 'http://127.1', 'http://192.168.0.3', 'http://10.0.0.1', 'http://172.16.0.1', 'http://100.108.231.26', 'http://169.254.169.254', 'http://[::1]', 'http://[::ffff:127.0.0.1]', 'http://[fc00::1]', 'file:///etc/passwd', 'http://localhost']) {
    await assert.rejects(assertPublicHttpUrl(url, publicResolver), undefined, url);
  }
  await assert.rejects(assertPublicHttpUrl('https://example.org', async () => [{ address: '192.168.1.1', family: 4 }]));
  assert.equal((await assertPublicHttpUrl('https://example.org/a', publicResolver)).hostname, 'example.org');
});

test('redirecionamento para rede privada é recusado antes da segunda requisição', async () => {
  mock.method(dns, 'lookup', async () => [{ address: '93.184.216.34', family: 4 }]);
  const get = mock.method(axios, 'get', async () => ({ status: 302, headers: { location: 'http://127.0.0.1/segredo' }, data: '' }));
  await assert.rejects(publicHttpGet('https://example.org', { maxBytes: 1024, timeoutMs: 1000 }));
  assert.equal(get.mock.callCount(), 1);
});

test('site retorna envelope não confiável e download recusa URL privada ou conteúdo sem imagem', async () => {
  mock.method(dns, 'lookup', async () => [{ address: '93.184.216.34', family: 4 }]);
  mock.method(axios, 'get', async () => ({ status: 200, headers: { 'content-type': 'text/html' }, data: '<h1>Texto de teste</h1>' }));
  const { acessarSite } = await import('../src/tools/web.js');
  const result = await acessarSite('https://example.org');
  assert.equal(result.untrusted, true);
  assert.match(result.content, /Texto de teste/);
  const { baixarMidia } = await import('../src/tools/media.js');
  await assert.rejects(baixarMidia('http://127.0.0.1/x', 'foto'));
  await assert.rejects(baixarMidia('https://example.org/x.jpg', 'foto'), /imagem/i);
});

test('vídeo usa argumentos separados, limite de tamanho e separador de opções', async () => {
  mock.method(fs, 'mkdir', async () => undefined);
  mock.method(dns, 'lookup', async () => [{ address: '93.184.216.34', family: 4 }]);
  const calls: string[][] = [];
  mock.method(childProcess, 'exec', () => { throw new Error('Shell legado chamado'); });
  mock.method(childProcess, 'execFile', (_bin: string, args: string[], _options: unknown, callback: Function) => {
    calls.push(args); callback(null, '', ''); return {} as ReturnType<typeof childProcess.execFile>;
  });
  const { baixarMidia } = await import('../src/tools/media.js');
  await baixarMidia('https://example.org/video?q=";id', 'video');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes('--max-filesize'));
  assert.equal(calls[0].at(-2), '--');
  assert.match(calls[0].at(-1) || '', /^https:\/\/example.org/);
});
