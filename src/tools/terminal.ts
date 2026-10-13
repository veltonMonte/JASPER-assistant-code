import { exec } from 'child_process';
import { toolEvents } from '../events/toolEvents.js';
import crypto from 'crypto';

export type CommandRiskLevel = 'safe' | 'medium' | 'high';

// Whitelist em memória para a sessão atual
const autoApproveWhitelist = new Set<string>();

export function getCommandRiskLevel(comando: string): CommandRiskLevel {
  const trimmed = comando.trim().toLowerCase();
  
  // High risk (comandos de remoção, push, término de processos, alteração de permissão)
  if (
    trimmed.includes('rm ') || trimmed.includes('rmdir') ||
    trimmed.includes('git push') || trimmed.includes('git reset') || trimmed.includes('git checkout -f') ||
    trimmed.includes('kill ') || trimmed.includes('pkill') || trimmed.includes('chmod') ||
    trimmed.includes('chown') || trimmed.includes('dd ') || trimmed.includes('mkfs') ||
    trimmed.includes('npm publish') || trimmed.includes('drop ')
  ) {
    return 'high';
  }
  
  // Safe / Read-only (comandos inofensivos de consulta)
  if (
    trimmed.startsWith('ls') || trimmed.startsWith('dir') ||
    trimmed.startsWith('cat ') || trimmed.startsWith('echo ') ||
    trimmed.startsWith('pwd') || trimmed.startsWith('git status') ||
    trimmed.startsWith('git diff') || trimmed.startsWith('git log') ||
    trimmed.startsWith('git branch') || trimmed.startsWith('node -v') ||
    trimmed.startsWith('npm -v') || trimmed.startsWith('python --version') ||
    trimmed.startsWith('which ') || trimmed.startsWith('head ') ||
    trimmed.startsWith('tail ') || trimmed.startsWith('grep ') ||
    trimmed.startsWith('whoami') || trimmed.startsWith('uname')
  ) {
    return 'safe';
  }

  return 'medium';
}

function getCommandPrefix(comando: string): string {
  const parts = comando.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[1]}` : parts[0] || comando.trim();
}

export async function executarTerminal(comando: string): Promise<{ success: boolean; message: string; output?: string; error?: string }> {
  return new Promise((resolve) => {
    // Basic protection against sudo commands
    const isSudo = comando.trim().toLowerCase().startsWith('sudo');
    if (isSudo) {
      return resolve({
        success: false,
        message: 'Acesso negado: comandos sudo estão temporariamente bloqueados por segurança.',
      });
    }

    const commandPrefix = getCommandPrefix(comando);
    const riskLevel = getCommandRiskLevel(comando);

    // Auto-aprovação se estiver na whitelist da sessão
    if (autoApproveWhitelist.has(commandPrefix) || autoApproveWhitelist.has(comando.trim())) {
      console.log(`[Terminal] ⚡ Auto-aprovado via whitelist de sessão: ${comando}`);
      return runExec(comando, resolve);
    }

    const requestId = crypto.randomUUID();

    // 1. Listen for the response event specific to this requestId
    const responseListener = (payload: { approved: boolean; customCommand?: string; remember?: boolean }) => {
      toolEvents.removeListener(`terminal_approval_response_${requestId}`, responseListener);
      clearTimeout(timeoutId);

      if (!payload.approved) {
        return resolve({
          success: false,
          message: 'Acesso negado pelo usuário. O comando não foi executado.',
        });
      }

      const finalCommand = payload.customCommand && payload.customCommand.trim() ? payload.customCommand.trim() : comando;

      if (payload.remember) {
        autoApproveWhitelist.add(getCommandPrefix(finalCommand));
        autoApproveWhitelist.add(finalCommand);
        console.log(`[Terminal] 🛡️ Comando adicionado à whitelist da sessão: "${finalCommand}"`);
      }

      console.log(`[Terminal] Executando comando aprovado: ${finalCommand}`);
      runExec(finalCommand, resolve);
    };

    toolEvents.on(`terminal_approval_response_${requestId}`, responseListener);

    // 2. Timeout for approval
    const timeoutId = setTimeout(() => {
      toolEvents.removeListener(`terminal_approval_response_${requestId}`, responseListener);
      resolve({
        success: false,
        message: 'Tempo limite de aprovação excedido (60 segundos). Comando cancelado.',
      });
    }, 60000);

    // 3. Emit the request to the websocket server to forward to the frontend
    console.log(`[Terminal] Solicitando aprovação (${riskLevel.toUpperCase()}) para o comando: ${comando}`);
    toolEvents.emit('request_terminal_approval', { id: requestId, command: comando, riskLevel });
  });
}

function runExec(comandoToRun: string, resolve: (val: { success: boolean; message: string; output?: string; error?: string }) => void) {
  exec(comandoToRun, { timeout: 30000 }, (error, stdout, stderr) => {
    if (error) {
      console.error(`[Terminal] Erro na execução:`, error.message);
      return resolve({
        success: false,
        message: `O comando falhou com o erro: ${error.message}`,
        error: stderr || error.message,
      });
    }

    resolve({
      success: true,
      message: 'Comando executado com sucesso.',
      output: stdout.trim(),
    });
  });
}

