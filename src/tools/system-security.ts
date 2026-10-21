import { systemSecurityMonitor, type SecurityThreat } from '../security/system-monitor.js';

export interface SecurityToolResult {
  success: boolean;
  status: 'secure' | 'warning' | 'threat_detected';
  summary: string;
  threatsCount: number;
  threats: Array<{
    id: string;
    tipo: string;
    gravidade: string;
    titulo: string;
    descricao: string;
    alvo: string;
    acaoRecomendada: string;
  }>;
  checkedProcesses: number;
  checkedFiles: number;
  duracaoMs: number;
  message: string;
}

/**
 * Ferramenta invocada pelo modelo ou usuário para auditar o status de segurança do host em tempo real.
 */
export async function verificarSegurancaSistema(forcado = false): Promise<SecurityToolResult> {
  const cached = systemSecurityMonitor.getStatus();
  const isFresh = cached && Date.now() - Date.parse(cached.timestamp) < 60_000;
  
  const report = (!forcado && isFresh)
    ? cached
    : await systemSecurityMonitor.runAudit();

  const formattedThreats = report.threats.map(t => ({
    id: t.id,
    tipo: t.type,
    gravidade: t.severity,
    titulo: t.title,
    descricao: t.description,
    alvo: t.target,
    acaoRecomendada: t.recommendedAction,
  }));

  const message = report.status === 'secure'
    ? `🛡️ O sistema está seguro. ${report.checkedProcesses} processos e ${report.checkedFiles} arquivos críticos foram auditados e nenhuma ameaça foi encontrada.`
    : `⚠️ Atenção: Foram detectadas ${report.threatsCount} ameaças ou vulnerabilidades no sistema. Principais ocorrências:\n` +
      formattedThreats.slice(0, 3).map(t => `- [${t.gravidade.toUpperCase()}] ${t.titulo}: ${t.descricao}`).join('\n');

  return {
    success: true,
    status: report.status,
    summary: report.summary,
    threatsCount: report.threatsCount,
    threats: formattedThreats,
    checkedProcesses: report.checkedProcesses,
    checkedFiles: report.checkedFiles,
    duracaoMs: report.durationMs,
    message,
  };
}
