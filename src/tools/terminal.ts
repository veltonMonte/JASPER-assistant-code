import { exec } from 'child_process';
import { toolEvents } from '../events/toolEvents.js';
import crypto from 'crypto';

export type CommandRiskLevel = 'safe' | 'medium' | 'high';

// Whitelist em memória para a sessão atual (prefixos aprovados com "sempre permitir")
const autoApproveWhitelist = new Set<string>();

// Tempo máximo aguardando confirmação do usuário
const APPROVAL_TIMEOUT_MS = 90_000;

/**
 * Comandos críticos que NUNCA são executados, mesmo com confirmação.
 * Protege contra destruição do sistema por erro de transcrição ou alucinação do modelo.
 */
const BLOCKED_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /^\s*sudo\b|\|\s*sudo\b|;\s*sudo\b|&&\s*sudo\b/i, reason: 'comandos sudo estão bloqueados' },
  { pattern: /\bsu\s+(-|root)/i, reason: 'troca de usuário para root bloqueada' },
  { pattern: /\brm\s+(-[a-z]*\s+)*(\/|~\/?|\$HOME\/?|\/\*|~\/\*)(\s|$)/i, reason: 'remoção da raiz ou da pasta pessoal' },
  { pattern: /\bmkfs(\.|\s)/i, reason: 'formatação de disco' },
  { pattern: /\bdd\s+.*\bof=\/dev\//i, reason: 'escrita direta em dispositivo de bloco' },
  { pattern: />\s*\/dev\/(sd|nvme|hd|mmcblk)/i, reason: 'escrita direta em dispositivo de bloco' },
  { pattern: /:\(\)\s*\{\s*:\|:&\s*\}\s*;\s*:/, reason: 'fork bomb' },
  { pattern: /\b(shutdown|poweroff|reboot|halt|init\s+0|init\s+6)\b/i, reason: 'desligamento/reinício do sistema' },
  { pattern: /\bchmod\s+(-[a-z]*\s+)*[0-7]*777\s+\/(\s|$)/i, reason: 'alteração de permissão da raiz' },
  { pattern: /\b(curl|wget)\b[^|]*\|\s*(ba|z|)sh\b/i, reason: 'execução de script remoto via pipe' },
];

export function getBlockedReason(comando: string): string | null {
  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(comando)) return reason;
  }
  return null;
}

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

// ==============================================================================
// Reconhecimento de confirmação por voz/texto
// ==============================================================================

function normalizeSpeech(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NEGATIVE_WORDS = ['nao', 'cancela', 'cancelar', 'cancelado', 'nega', 'negar', 'negado', 'recusa', 'recuso', 'recusado', 'aborta', 'abortar', 'pare', 'esquece', 'nunca'];
const NEGATIVE_PHRASES = ['nem pensar', 'de jeito nenhum', 'de forma alguma', 'deixa pra la', 'deixa para la', 'melhor nao'];
const AFFIRMATIVE_WORDS = ['sim', 'confirmo', 'confirmado', 'confirma', 'autorizo', 'autorizado', 'aprovo', 'aprovado', 'ok', 'okay', 'pode', 'executa', 'executar', 'roda', 'rodar', 'manda', 'claro', 'positivo', 'bora', 'permito', 'aceito', 'yes', 'dale'];
const AFFIRMATIVE_PHRASES = ['vai em frente', 'com certeza', 'pode ser', 'manda ver', 'manda bala', 'faz isso', 'pode fazer', 'pode rodar', 'pode executar', 'roda ai', 'executa ai', 'faz isso jasper', 'manda ver jasper', 'sem problemas'];
const EXTRA_NEGATIVE_PHRASES = ['nao executa', 'nao roda', 'nao quero', 'deixa quieto'];
const STRONG_CONFIRM_WORDS = ['confirmo', 'confirmado', 'autorizo', 'autorizado'];
const REMEMBER_PHRASES = ['sempre permitir', 'sempre pode', 'pode sempre', 'nao precisa perguntar', 'nao pergunte mais', 'lembra disso', 'sempre autorizo'];

export type SpeechDecision = 'approve' | 'deny' | 'needs_strong' | null;

/**
 * Interpreta uma fala do usuário como resposta à solicitação pendente.
 * Negativas têm prioridade ("não pode executar" é negação).
 * Comandos de alto risco exigem confirmação forte ("confirmo"/"autorizo").
 */
export function interpretApprovalSpeech(text: string, riskLevel: CommandRiskLevel): SpeechDecision {
  const clean = normalizeSpeech(text);
  if (!clean) return null;
  const words = clean.split(' ');

  if (words.some((w) => NEGATIVE_WORDS.includes(w)) || NEGATIVE_PHRASES.some((p) => clean.includes(p)) || EXTRA_NEGATIVE_PHRASES.some((p) => clean.includes(p))) {
    return 'deny';
  }

  const affirmative = words.some((w) => AFFIRMATIVE_WORDS.includes(w)) || AFFIRMATIVE_PHRASES.some((p) => clean.includes(p));
  if (!affirmative) return null;

  if (riskLevel === 'high' && !words.some((w) => STRONG_CONFIRM_WORDS.includes(w))) {
    return 'needs_strong';
  }
  return 'approve';
}

export function wantsRemember(text: string): boolean {
  const clean = normalizeSpeech(text);
  return REMEMBER_PHRASES.some((p) => clean.includes(p));
}

/**
 * Interpreta intenções de linguagem natural para comandos seguros do terminal Linux.
 * Converte pedidos como "quais arquivos tem aqui" em "ls -la", "como está a memória" em "free -h", etc.
 */
export function interpretTerminalIntent(text: string): { command: string; description: string } | null {
  const clean = normalizeSpeech(text);

  // 1. Comando explícito: "execute o comando ls -la", "rode no terminal git status", "comando pwd"
  const explicitMatch = clean.match(/^(?:execute|executar|rode|rodar|comando|terminal)\s+(?:no\s+terminal\s+)?(?:o\s+comando\s+)?(.+)$/i);
  if (explicitMatch && explicitMatch[1]) {
    const rawCmd = explicitMatch[1].trim();
    if (rawCmd.length > 1) {
      return { command: rawCmd, description: `executar o comando "${rawCmd}"` };
    }
  }

  // 2. Listar arquivos / diretório
  if (
    clean.includes('listar arquivos') || clean.includes('liste os arquivos') ||
    clean.includes('quais arquivos tem') || clean.includes('mostrar arquivos') ||
    clean.includes('o que tem nessa pasta') || clean.includes('conteudo da pasta') ||
    clean.includes('ver arquivos') || clean === 'ls' || clean === 'ls la'
  ) {
    return { command: 'ls -la', description: 'listar todos os arquivos e pastas do diretório atual' };
  }

  // 3. Status do Git
  if (
    clean.includes('status do git') || clean.includes('git status') ||
    clean.includes('como esta o git') || clean.includes('como ta o git') ||
    clean.includes('situacao do git')
  ) {
    return { command: 'git status', description: 'verificar o status atual do repositório Git' };
  }

  // 4. Últimos commits / Histórico do Git
  if (
    clean.includes('ultimos commits') || clean.includes('historico do git') ||
    clean.includes('git log') || clean.includes('quais foram os ultimos commits')
  ) {
    return { command: 'git log -n 5 --oneline', description: 'exibir os últimos 5 commits do Git' };
  }

  // 5. Diferença / Mudanças no Git
  if (
    clean.includes('git diff') || clean.includes('o que mudou no git') ||
    clean.includes('alteracoes pendentes')
  ) {
    return { command: 'git diff --stat', description: 'mostrar o resumo de alterações pendentes no Git' };
  }

  // 6. Memória RAM do sistema
  if (
    clean.includes('memoria livre') || clean.includes('memoria ram') ||
    clean.includes('uso de memoria') || clean.includes('consumo de memoria') ||
    clean.includes('quanta memoria')
  ) {
    return { command: 'free -h', description: 'consultar o uso e disponibilidade de memória RAM' };
  }

  // 7. Espaço em Disco
  if (
    clean.includes('espaco em disco') || clean.includes('armazenamento livre') ||
    clean.includes('disco livre') || clean.includes('quanto espaco') ||
    clean.includes('uso do disco')
  ) {
    return { command: 'df -h /', description: 'consultar o espaço em disco do sistema' };
  }

  // 8. Processos em execução
  if (
    clean.includes('processos rodando') || clean.includes('processos ativos') ||
    clean.includes('quais processos') || clean.includes('top processos')
  ) {
    return { command: 'ps aux --sort=-%mem | head -n 12', description: 'listar os processos com maior consumo de memória' };
  }

  // 9. Pasta atual / Caminho
  if (
    clean.includes('qual o diretorio atual') || clean.includes('pasta atual') ||
    clean.includes('em que pasta estou') || clean.includes('onde estou') ||
    clean === 'pwd'
  ) {
    return { command: 'pwd', description: 'mostrar o caminho completo do diretório atual' };
  }

  // 10. Endereço IP / Rede
  if (
    clean.includes('qual meu ip') || clean.includes('qual e o meu ip') ||
    clean.includes('meu endereco ip') || clean.includes('ip local') ||
    clean.includes('ip da maquina')
  ) {
    return { command: 'hostname -I', description: 'exibir o endereço IP local da máquina' };
  }

  // 11. Tempo de atividade / Uptime
  if (
    clean.includes('tempo ligado') || clean.includes('tempo de atividade') ||
    clean.includes('uptime') || clean.includes('quando ligou o pc') ||
    clean.includes('quanto tempo o pc esta ligado')
  ) {
    return { command: 'uptime -p', description: 'consultar há quanto tempo o computador está ligado' };
  }

  // 12. Usuário logado
  if (
    clean.includes('quem sou eu') || clean.includes('qual usuario') ||
    clean.includes('usuario logado') || clean === 'whoami'
  ) {
    return { command: 'whoami', description: 'exibir o nome do usuário atual logado' };
  }

  // 13. Versões de ambiente
  if (clean.includes('versao do node') || clean.includes('versao de node')) {
    return { command: 'node -v', description: 'consultar a versão instalada do Node.js' };
  }
  if (clean.includes('versao do python') || clean.includes('versao de python')) {
    return { command: 'python3 --version', description: 'consultar a versão instalada do Python' };
  }
  if (clean.includes('versao do linux') || clean.includes('versao do kernel') || clean.includes('versao do sistema')) {
    return { command: 'uname -a', description: 'consultar informações do kernel e sistema operacional' };
  }

  return null;
}

// ==============================================================================
// Registro de solicitações pendentes
// ==============================================================================

export type TerminalResult = { success: boolean; message: string; output?: string; error?: string; comando?: string };
export type ApprovalSource = 'ui' | 'voice' | 'text' | 'tool' | 'timeout' | 'interrupt';
export type ApprovalMode = 'blocking' | 'live';

export interface PendingTerminalRequest {
  id: string;
  command: string;
  riskLevel: CommandRiskLevel;
  mode: ApprovalMode;
  createdAt: number;
  userSpeechAt: number;      // último instante em que o VAD detectou fala do usuário após a solicitação
  transcript: string;        // transcrição acumulada da fala do usuário após a solicitação
}

interface ResolvedRecord {
  id: string;
  command: string;
  approved: boolean;
  source: ApprovalSource;
  result: TerminalResult;
  resolvedAt: number;
  delivered: boolean;        // resultado já entregue ao modelo
}

const pendingRequests = new Map<string, { req: PendingTerminalRequest; timer: NodeJS.Timeout }>();
let lastResolved: ResolvedRecord | null = null;

export function getPendingTerminalRequest(): PendingTerminalRequest | null {
  let latest: PendingTerminalRequest | null = null;
  for (const { req } of pendingRequests.values()) {
    if (!latest || req.createdAt > latest.createdAt) latest = req;
  }
  return latest;
}

export function getLastResolved(): ResolvedRecord | null {
  return lastResolved;
}

export function markResultDelivered(id: string): void {
  if (lastResolved && lastResolved.id === id) lastResolved.delivered = true;
}

/** Registra atividade de fala do usuário (VAD) para as solicitações pendentes. */
export function registerUserSpeech(): void {
  const now = Date.now();
  for (const { req } of pendingRequests.values()) req.userSpeechAt = now;
}

/** Acrescenta transcrição da fala do usuário às solicitações pendentes. */
export function appendUserTranscript(text: string): void {
  if (!text) return;
  const now = Date.now();
  for (const { req } of pendingRequests.values()) {
    req.transcript = `${req.transcript} ${text}`.trim().slice(-500);
    req.userSpeechAt = now;
  }
}

/**
 * Cria uma solicitação de execução. Retorna o resultado imediato quando o comando
 * é bloqueado ou auto-aprovado; caso contrário, retorna a solicitação pendente.
 */
export async function requestTerminalCommand(
  comando: string,
  mode: ApprovalMode,
): Promise<{ immediate: TerminalResult } | { pending: PendingTerminalRequest }> {
  const command = (comando || '').trim();
  if (!command) {
    return { immediate: { success: false, message: 'Nenhum comando informado.' } };
  }

  const blocked = getBlockedReason(command);
  if (blocked) {
    console.warn(`[Terminal] Comando bloqueado (${blocked}): ${command}`);
    return { immediate: { success: false, comando: command, message: `Comando bloqueado pela política de segurança: ${blocked}. Ele não pode ser executado pelo JASPER.` } };
  }

  if (autoApproveWhitelist.has(getCommandPrefix(command)) || autoApproveWhitelist.has(command)) {
    console.log(`[Terminal] Auto-aprovado via whitelist de sessão: ${command}`);
    return { immediate: await runExec(command) };
  }

  const req: PendingTerminalRequest = {
    id: crypto.randomUUID(),
    command,
    riskLevel: getCommandRiskLevel(command),
    mode,
    createdAt: Date.now(),
    userSpeechAt: 0,
    transcript: '',
  };

  const timer = setTimeout(() => {
    void resolveTerminalApproval(req.id, { approved: false }, 'timeout');
  }, APPROVAL_TIMEOUT_MS);

  pendingRequests.set(req.id, { req, timer });
  console.log(`[Terminal] Solicitando aprovação (${req.riskLevel.toUpperCase()}, ${mode}) para: ${command}`);
  toolEvents.emit('request_terminal_approval', { id: req.id, command, riskLevel: req.riskLevel });
  return { pending: req };
}

/**
 * Resolve uma solicitação pendente (aprovação ou negação) e executa o comando se aprovado.
 * Ponto único usado pela UI, texto, voz, ferramenta do modelo e timeout.
 */
export async function resolveTerminalApproval(
  id: string,
  decision: { approved: boolean; customCommand?: string; remember?: boolean },
  source: ApprovalSource,
): Promise<TerminalResult | null> {
  const entry = pendingRequests.get(id);
  if (!entry) return null;
  pendingRequests.delete(id);
  clearTimeout(entry.timer);
  const { req } = entry;

  let result: TerminalResult;
  let finalCommand = req.command;

  if (!decision.approved) {
    result = {
      success: false,
      comando: req.command,
      message: source === 'timeout'
        ? `Tempo limite de aprovação excedido (${APPROVAL_TIMEOUT_MS / 1000}s). Comando cancelado.`
        : 'Acesso negado pelo usuário. O comando não foi executado.',
    };
    console.log(`[Terminal] Comando negado (${source}): ${req.command}`);
  } else {
    if (decision.customCommand && decision.customCommand.trim()) {
      finalCommand = decision.customCommand.trim();
      const blocked = getBlockedReason(finalCommand);
      if (blocked) {
        result = { success: false, comando: finalCommand, message: `Comando editado bloqueado pela política de segurança: ${blocked}.` };
        finishResolution(req, false, source, result, finalCommand);
        return result;
      }
    }
    if (decision.remember) {
      autoApproveWhitelist.add(getCommandPrefix(finalCommand));
      autoApproveWhitelist.add(finalCommand);
      console.log(`[Terminal] Comando adicionado à whitelist da sessão: "${finalCommand}"`);
    }
    console.log(`[Terminal] Executando comando aprovado (${source}): ${finalCommand}`);
    result = await runExec(finalCommand);
  }

  finishResolution(req, decision.approved, source, result, finalCommand, decision);
  return result;
}

function finishResolution(
  req: PendingTerminalRequest,
  approved: boolean,
  source: ApprovalSource,
  result: TerminalResult,
  finalCommand: string,
  decision?: { customCommand?: string; remember?: boolean },
): void {
  lastResolved = {
    id: req.id,
    command: finalCommand,
    approved,
    source,
    result,
    resolvedAt: Date.now(),
    delivered: source === 'tool',
  };
  toolEvents.emit('terminal_approval_resolved', {
    id: req.id,
    command: finalCommand,
    approved,
    source,
    mode: req.mode,
    result,
    customCommand: decision?.customCommand,
    remember: decision?.remember,
  });
  toolEvents.emit(`terminal_execution_result_${req.id}`, result);
}

/** Cancela todas as solicitações pendentes (ex.: usuário interrompeu). */
export async function cancelAllPendingTerminal(source: ApprovalSource = 'interrupt'): Promise<void> {
  for (const id of [...pendingRequests.keys()]) {
    await resolveTerminalApproval(id, { approved: false }, source);
  }
}

// ==============================================================================
// Ferramentas expostas ao modelo
// ==============================================================================

/**
 * Modo bloqueante (agente de texto): aguarda a decisão do usuário e retorna o resultado.
 */
export async function executarTerminal(comando: string): Promise<TerminalResult> {
  const res = await requestTerminalCommand(comando, 'blocking');
  if ('immediate' in res) return res.immediate;
  return new Promise((resolve) => {
    toolEvents.once(`terminal_execution_result_${res.pending.id}`, (result: TerminalResult) => resolve(result));
  });
}

/**
 * Modo de voz (Gemini Live): não bloqueia o modelo. Registra a solicitação e devolve
 * instruções para o modelo pedir a confirmação verbal ao usuário.
 */
export async function solicitarTerminalPorVoz(comando: string): Promise<any> {
  const res = await requestTerminalCommand(comando, 'live');
  if ('immediate' in res) return res.immediate;
  const { pending } = res;
  const fraseConfirmacao = pending.riskLevel === 'high'
    ? 'Este comando é de ALTO RISCO: o usuário precisa dizer explicitamente "confirmo" ou "autorizo".'
    : 'O usuário pode responder "sim", "pode executar" ou "não".';
  return {
    success: true,
    status: 'aguardando_confirmacao',
    id: pending.id,
    comando: pending.command,
    risco: pending.riskLevel,
    instrucao:
      `O comando AINDA NÃO foi executado. Pergunte ao usuário em voz, de forma curta, se ele confirma a execução de "${pending.command}". ` +
      `${fraseConfirmacao} Depois que o usuário responder, chame a ferramenta confirmar_comando_terminal com aprovado=true ou aprovado=false. ` +
      'Nunca confirme por conta própria sem ouvir a resposta do usuário.',
  };
}

/**
 * Chamada pelo modelo depois de ouvir a resposta do usuário.
 * Exige que o usuário tenha realmente falado após a solicitação (proteção contra alucinação).
 */
export async function confirmarComandoTerminal(aprovado: boolean, lembrar = false): Promise<any> {
  const pending = getPendingTerminalRequest();

  if (!pending) {
    // A confirmação pode já ter sido resolvida pela transcrição de voz ou pela interface.
    if (lastResolved && Date.now() - lastResolved.resolvedAt < 60_000) {
      lastResolved.delivered = true;
      return {
        ...lastResolved.result,
        comando: lastResolved.command,
        observacao: lastResolved.approved
          ? 'A decisão do usuário já havia sido registrada e o comando foi executado. Informe o resultado.'
          : 'O usuário já havia negado ou a solicitação expirou. Informe que o comando não foi executado.',
      };
    }
    return { success: false, message: 'Não há nenhum comando aguardando confirmação.' };
  }

  if (!aprovado) {
    return await resolveTerminalApproval(pending.id, { approved: false }, 'tool');
  }

  // Proteção anti-alucinação:
  // Exige que o usuário tenha falado após a solicitação OU que já tenha se passado tempo suficiente (> 800ms)
  // para permitir que o modelo neural do Gemini Live confirme após ouvir a voz do usuário.
  const userSpokeRecently = pending.userSpeechAt > pending.createdAt;
  const elapsedSinceCreation = Date.now() - pending.createdAt;

  if (!userSpokeRecently && elapsedSinceCreation < 800) {
    return {
      success: false,
      status: 'aguardando_confirmacao',
      message: 'O usuário ainda não respondeu. Pergunte se ele confirma e aguarde a resposta antes de chamar esta ferramenta novamente.',
    };
  }

  if (pending.transcript) {
    const decision = interpretApprovalSpeech(pending.transcript, pending.riskLevel);
    if (decision === 'deny') {
      return await resolveTerminalApproval(pending.id, { approved: false }, 'tool');
    }
    if (decision === 'needs_strong') {
      return {
        success: false,
        status: 'aguardando_confirmacao',
        message: 'Comando de alto risco: peça ao usuário que diga explicitamente "confirmo" ou "autorizo".',
      };
    }
  } else if (pending.riskLevel === 'high') {
    return {
      success: false,
      status: 'aguardando_confirmacao',
      message: 'Comando de alto risco sem transcrição confiável da resposta. Peça ao usuário que diga "confirmo" ou aprove pelo botão na tela.',
    };
  }

  const remember = lembrar || (pending.transcript ? wantsRemember(pending.transcript) : false);
  return await resolveTerminalApproval(pending.id, { approved: true, remember }, 'tool');
}

function runExec(comandoToRun: string): Promise<TerminalResult> {
  return new Promise((resolve) => {
    exec(comandoToRun, { timeout: 30000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      const output = (stdout || '').trim();
      if (error) {
        console.error(`[Terminal] Erro na execução:`, error.message);
        return resolve({
          success: false,
          comando: comandoToRun,
          message: `O comando falhou com o erro: ${error.message}`,
          error: (stderr || error.message).slice(0, 4000),
          output: output.slice(0, 4000),
        });
      }
      resolve({
        success: true,
        comando: comandoToRun,
        message: 'Comando executado com sucesso.',
        output: output.length > 4000 ? output.slice(0, 4000) + '\n...[saída truncada]' : output,
      });
    });
  });
}
