import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runProgram } from './process.js';
import { toolEvents } from '../events/toolEvents.js';

export interface ProcessInfo {
  pid: number;
  user: string;
  cpu: number;
  mem: number;
  name: string;
  cmd: string;
}

export interface FileInspectionTarget {
  path: string;
  exists: boolean;
  isExecutable: boolean;
  content?: string;
  mode?: number;
}

export type ThreatSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ThreatType = 'process' | 'file' | 'permission' | 'persistence';

export interface SecurityThreat {
  id: string;
  type: ThreatType;
  severity: ThreatSeverity;
  title: string;
  description: string;
  target: string;
  detectedAt: string;
  recommendedAction: string;
}

export interface SecurityAuditReport {
  timestamp: string;
  status: 'secure' | 'warning' | 'threat_detected';
  threatsCount: number;
  threats: SecurityThreat[];
  checkedProcesses: number;
  checkedFiles: number;
  durationMs: number;
  summary: string;
}

/** Padrões conhecidos de mineradores de criptomoeda (cryptojacking). */
const MINER_PATTERNS = [
  /\b(?:xmrig|minerd|cpuminer|ethminer|monero|cryptonight|nanopool|nicehash|supportxmr)\b/i,
  /stratum\+(?:tcp|ssl):\/\//i,
  /\b(?:pool\.minexmr\.com|pool\.supportxmr\.com)\b/i,
];

/** Padrões de reverse shells, malwares conhecidos e comandos anômalos. */
const ATTACK_PATTERNS = [
  /\bnc\s+(?:-[a-z]*e\b|.*-e\s+\/(?:bin|usr))/i,
  /\bncat\s+.*-e\s+\//i,
  /\/dev\/tcp\/\d+\.\d+\.\d+\.\d+\/\d+/i,
  /\bsocat\s+exec:\/bin\/(?:ba|z)?sh/i,
  /\bpython[23]?\s+-c\s+.*pty\.spawn/i,
  /\b(?:kinsing|kdevtmpfsi|tsm\.sh|autorun\.sh)\b/i,
  /\b(?:curl|wget)\b[^|;\n\r]*\|\s*(?:ba|z|)sh\b/i,
];

/** Binários e scripts em execução a partir de pastas temporárias normalmente não confiáveis. */
const SUSPICIOUS_PATHS = [
  /^\/tmp\//i,
  /^\/dev\/shm\//i,
  /^\/var\/tmp\//i,
];

export function inspectProcesses(processes: ProcessInfo[]): SecurityThreat[] {
  const threats: SecurityThreat[] = [];

  for (const proc of processes) {
    const fullText = `${proc.name} ${proc.cmd}`;

    // 1. Detecção de mineradores
    if (MINER_PATTERNS.some(p => p.test(fullText))) {
      threats.push({
        id: createThreatId('miner', proc.pid, proc.name),
        type: 'process',
        severity: 'critical',
        title: 'Minerador de Criptomoeda Detectado',
        description: `Processo suspeito de mineração não autorizada em execução: "${proc.cmd.slice(0, 160)}"`,
        target: `PID ${proc.pid} (${proc.name})`,
        detectedAt: new Date().toISOString(),
        recommendedAction: `Finalizar o processo imediatamente (kill -9 ${proc.pid}) e verificar a origem do binário.`,
      });
      continue;
    }

    // 2. Detecção de reverse shells e malwares
    if (ATTACK_PATTERNS.some(p => p.test(fullText))) {
      threats.push({
        id: createThreatId('attack', proc.pid, proc.name),
        type: 'process',
        severity: 'critical',
        title: 'Shell Reverso ou Malware Detectado',
        description: `Processo com assinatura de comando malicioso ou controle remoto: "${proc.cmd.slice(0, 160)}"`,
        target: `PID ${proc.pid} (${proc.name})`,
        detectedAt: new Date().toISOString(),
        recommendedAction: `Interromper a conexão de rede e finalizar o processo PID ${proc.pid}.`,
      });
      continue;
    }

    // 3. Execução de arquivos de /tmp ou /dev/shm com alto consumo de recursos
    const isTempPath = SUSPICIOUS_PATHS.some(p => p.test(proc.cmd.trim()));
    if (isTempPath && !proc.cmd.includes('node') && !proc.cmd.includes('npm')) {
      threats.push({
        id: createThreatId('temp_exec', proc.pid, proc.name),
        type: 'process',
        severity: 'high',
        title: 'Executável em Diretório Temporário',
        description: `Processo rodando a partir de pasta temporária (/tmp ou /dev/shm): "${proc.cmd.slice(0, 160)}"`,
        target: `PID ${proc.pid} (${proc.name})`,
        detectedAt: new Date().toISOString(),
        recommendedAction: `Verificar se o binário em pasta temporária é legítimo. Caso contrário, finalizar PID ${proc.pid}.`,
      });
    }
  }

  return threats;
}

export function inspectFiles(files: FileInspectionTarget[]): SecurityThreat[] {
  const threats: SecurityThreat[] = [];

  for (const file of files) {
    if (!file.exists) continue;

    // 1. Verificação de permissões frouxas em arquivos de segredos (.env)
    if (file.path.endsWith('.env') || file.path.includes('/.env.')) {
      if (typeof file.mode === 'number') {
        const othersPermissions = file.mode & 0o007; // Leitura/escrita/execução por 'outros'
        const groupPermissions = file.mode & 0o070;
        if (othersPermissions !== 0 || (groupPermissions & 0o020) !== 0) {
          threats.push({
            id: createThreatId('perm_env', file.path),
            type: 'permission',
            severity: 'high',
            title: 'Permissões Inseguras em Arquivo de Segredos',
            description: `O arquivo ${file.path} possui permissões permissivas (outros/grupo têm acesso de leitura ou escrita).`,
            target: file.path,
            detectedAt: new Date().toISOString(),
            recommendedAction: `Ajustar permissões do arquivo para acesso restrito (chmod 600 ${file.path}).`,
          });
        }
      }
    }

    // 2. Arquivos em pastas temporárias com scripts de download e execução automática
    const inTempDir = file.path.startsWith('/tmp/') || file.path.startsWith('/dev/shm/') || file.path.startsWith('/var/tmp/');
    if (inTempDir && file.content) {
      if (MINER_PATTERNS.some(p => p.test(file.content!))) {
        threats.push({
          id: createThreatId('file_miner', file.path),
          type: 'file',
          severity: 'high',
          title: 'Configuração ou Script de Mineração em Pasta Temporária',
          description: `O arquivo ${file.path} contém parâmetros de conexão com pools de mineração.`,
          target: file.path,
          detectedAt: new Date().toISOString(),
          recommendedAction: `Excluir o arquivo suspeito (${file.path}) e auditar processos ativos.`,
        });
      } else if (ATTACK_PATTERNS.some(p => p.test(file.content!))) {
        threats.push({
          id: createThreatId('file_attack', file.path),
          type: 'file',
          severity: 'critical',
          title: 'Script de Download e Execução Automática (Dropper)',
          description: `O arquivo ${file.path} contém comandos para baixar e executar scripts remotos sem validação.`,
          target: file.path,
          detectedAt: new Date().toISOString(),
          recommendedAction: `Remover imediatamente o script e revisar o histórico de comandos.`,
        });
      }
    }
  }

  return threats;
}

function createThreatId(type: string, ...parts: (string | number)[]): string {
  const raw = `${type}_${parts.join('_')}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

export interface SecurityMonitorOptions {
  intervalMs?: number;
  processProvider?: () => Promise<ProcessInfo[]>;
  fileProvider?: () => Promise<FileInspectionTarget[]>;
  onAlert?: (threat: SecurityThreat) => void;
}

export class SystemSecurityMonitor {
  private timer: NodeJS.Timeout | null = null;
  private intervalMs: number;
  private running = false;
  private lastAudit: SecurityAuditReport | null = null;
  private reportedThreats = new Set<string>();
  private processProvider: () => Promise<ProcessInfo[]>;
  private fileProvider: () => Promise<FileInspectionTarget[]>;
  private onAlertCallback?: (threat: SecurityThreat) => void;

  constructor(opts: SecurityMonitorOptions = {}) {
    this.intervalMs = opts.intervalMs ?? 5 * 60 * 1000; // 5 minutos por padrão
    this.processProvider = opts.processProvider ?? defaultProcessProvider;
    this.fileProvider = opts.fileProvider ?? defaultFileProvider;
    this.onAlertCallback = opts.onAlert;
  }

  public setProcessProvider(provider: () => Promise<ProcessInfo[]>): void {
    this.processProvider = provider;
  }

  public setFileProvider(provider: () => Promise<FileInspectionTarget[]>): void {
    this.fileProvider = provider;
  }

  public onAlert(cb: (threat: SecurityThreat) => void): void {
    this.onAlertCallback = cb;
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    console.log(`🛡️ [Segurança 24h] Agente de monitoramento iniciado (auditorias a cada ${Math.round(this.intervalMs / 1000)}s).`);
    
    // Executa uma auditoria inicial logo após a inicialização
    void this.runAudit().catch(err => {
      console.warn('⚠️ [Segurança 24h] Falha na auditoria inicial:', err.message);
    });

    this.timer = setInterval(() => {
      void this.runAudit().catch(err => {
        console.warn('⚠️ [Segurança 24h] Erro durante auditoria periódica:', err.message);
      });
    }, this.intervalMs);
    this.timer.unref();
  }

  public stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('🛡️ [Segurança 24h] Agente de monitoramento pausado.');
  }

  public async runAudit(): Promise<SecurityAuditReport> {
    const startTime = Date.now();
    const processes = await this.processProvider();
    const files = await this.fileProvider();

    const processThreats = inspectProcesses(processes);
    const fileThreats = inspectFiles(files);
    const threats = [...processThreats, ...fileThreats];

    // Notifica ameaças novas que ainda não foram reportadas
    for (const threat of threats) {
      if (!this.reportedThreats.has(threat.id)) {
        this.reportedThreats.add(threat.id);
        console.warn(`🚨 [Segurança 24h] Ameaça detectada (${threat.severity.toUpperCase()}): ${threat.title} - ${threat.description}`);
        
        if (this.onAlertCallback) {
          try { this.onAlertCallback(threat); } catch (e) {}
        }

        toolEvents.emit('security_threat_detected', threat);
      }
    }

    const durationMs = Date.now() - startTime;
    const hasCritical = threats.some(t => t.severity === 'critical');
    const hasHigh = threats.some(t => t.severity === 'high');
    const status: SecurityAuditReport['status'] = hasCritical || hasHigh
      ? 'threat_detected'
      : threats.length > 0
        ? 'warning'
        : 'secure';

    const summary = status === 'secure'
      ? `Sistema seguro. Foram inspecionados ${processes.length} processos e ${files.length} arquivos críticos sem anomalias detectadas.`
      : `Atenção: foram identificadas ${threats.length} potenciais vulnerabilidades ou ameaças no sistema.`;

    const report: SecurityAuditReport = {
      timestamp: new Date().toISOString(),
      status,
      threatsCount: threats.length,
      threats,
      checkedProcesses: processes.length,
      checkedFiles: files.length,
      durationMs,
      summary,
    };

    this.lastAudit = report;
    return report;
  }

  public getStatus(): SecurityAuditReport | null {
    return this.lastAudit;
  }

  public getThreats(): SecurityThreat[] {
    return this.lastAudit ? this.lastAudit.threats : [];
  }
}

/** Provedor padrão para listar processos do sistema */
async function defaultProcessProvider(): Promise<ProcessInfo[]> {
  try {
    const isWin = process.platform === 'win32';
    if (isWin) {
      // Suporte no Windows
      const res = await runProgram('tasklist', ['/v', '/fo', 'csv', '/nh'], {
        cwd: process.cwd(),
        timeoutMs: 8000,
      });
      if (!res.ok) return [];
      const lines = res.stdout.split('\n').filter(l => l.trim().length > 0);
      return lines.map((line, idx) => {
        const parts = line.split('","').map(p => p.replace(/^"|"$/g, ''));
        const name = parts[0] || 'processo';
        const pid = parseInt(parts[1] || '0', 10);
        return {
          pid: isNaN(pid) ? idx : pid,
          user: parts[6] || 'user',
          cpu: 0,
          mem: 0,
          name,
          cmd: parts[8] || name,
        };
      });
    }

    // Padrão Linux / macOS
    const res = await runProgram('ps', ['-eo', 'pid,user,%cpu,%mem,comm,args'], {
      cwd: process.cwd(),
      timeoutMs: 8000,
    });
    if (!res.ok) return [];

    const lines = res.stdout.split('\n').slice(1).filter(l => l.trim().length > 0);
    const processes: ProcessInfo[] = [];

    for (const line of lines) {
      const match = line.trim().match(/^(\d+)\s+([^\s]+)\s+([\d.]+)\s+([\d.]+)\s+([^\s]+)\s+(.+)$/);
      if (match) {
        processes.push({
          pid: parseInt(match[1], 10),
          user: match[2],
          cpu: parseFloat(match[3]),
          mem: parseFloat(match[4]),
          name: match[5],
          cmd: match[6],
        });
      }
    }

    return processes;
  } catch {
    return [];
  }
}

/** Provedor padrão para inspecionar arquivos sensíveis */
async function defaultFileProvider(): Promise<FileInspectionTarget[]> {
  const targets: FileInspectionTarget[] = [];
  const candidatePaths: string[] = [
    path.resolve(process.cwd(), '.env'),
    path.join(os.homedir(), '.ssh', 'authorized_keys'),
  ];

  // Inspeciona arquivos recentes em /tmp se estiver em ambiente Unix
  if (process.platform !== 'win32') {
    try {
      const tmpFiles = await fs.readdir('/tmp');
      for (const file of tmpFiles.slice(0, 30)) {
        if (file.endsWith('.sh') || file.endsWith('.py') || file.startsWith('.')) {
          candidatePaths.push(path.join('/tmp', file));
        }
      }
    } catch {}
  }

  for (const filePath of candidatePaths) {
    try {
      const stat = await fs.stat(filePath);
      let content: string | undefined;
      // Lê os primeiros 16 KB de arquivos pequenos
      if (stat.size < 64 * 1024) {
        content = await fs.readFile(filePath, { encoding: 'utf-8' }).catch(() => undefined);
      }
      targets.push({
        path: filePath,
        exists: true,
        isExecutable: Boolean(stat.mode & 0o111),
        mode: stat.mode,
        content,
      });
    } catch {
      // Arquivo não existe ou sem permissão de leitura
    }
  }

  return targets;
}

export const systemSecurityMonitor = new SystemSecurityMonitor();
