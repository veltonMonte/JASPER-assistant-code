import path from 'node:path';
import { runProgram } from '../security/process.js';
import { toolEvents } from '../events/toolEvents.js';
import crypto from 'crypto';

export type CommandRiskLevel = 'safe' | 'medium' | 'high';

// Permissão temporária por comando literal, concedida somente pela interface.
const autoApproveWhitelist = new Map<string, number>();
const TERMINAL_CWD = path.resolve(process.cwd());
const SHELL_META = /[;&|`$()<>\{\}\n\r]/;
const normalizedCommand = (command: string) => command.trim().replace(/\s+/g, ' ');

function commandTokens(command: string): string[] | null {
  const tokens: string[] = [];
  const expression = /"([^"\\]*)"|'([^'\\]*)'|([^\s"'\\]+)/gy;
  let offset = 0;
  while (offset < command.length) {
    while (/\s/.test(command[offset] || '') && offset < command.length) offset++;
    if (offset === command.length) break;
    expression.lastIndex = offset;
    const match = expression.exec(command);
    if (!match) return null;
    tokens.push(match[1] ?? match[2] ?? match[3]); offset = expression.lastIndex;
  }
  return tokens.length ? tokens : null;
}

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
  if (SHELL_META.test(comando) || /(?:^|[\s/])(?:\.env(?:\.[^\s/]*)?|\.ssh|\.gnupg|id_rsa|jasper\.db)(?:$|[\s/])|\.git\/config|tokens?/i.test(comando)) return 'high';
  const tokens = commandTokens(comando.trim());
  if (!tokens) return 'high';
  const literal = tokens.join(' ');
  if (/(?:^|[\s/])(?:\.env(?:\.[^\s/]*)?|\.ssh|\.gnupg|id_rsa|jasper\.db)(?:$|[\s/])|\.git\/config|tokens?/i.test(literal)) return 'high';
  const safe = [
    /^(pwd|whoami)$/, /^ls(?: -[lah]+)?$/, /^uname(?: -[arsmn]+)?$/, /^uptime(?: -p)?$/,
    /^(df|free) -h$/, /^node -v$/, /^python3 --version$/,
    /^git status(?: --short| --branch| --porcelain| -sb)*$/,
    /^git diff(?: --stat| --name-only| --numstat| --check| --cached)*$/,
    /^git log(?: --oneline| -n (?:[1-9]|[1-4][0-9]|50)| --max-count=(?:[1-9]|[1-4][0-9]|50))*$/,
  ];
  if (safe.some(rule => rule.test(literal))) return 'safe';
  if (['cat', 'head', 'tail', 'grep'].includes(tokens[0])) {
    for (const token of tokens.slice(1).filter(item => !item.startsWith('-'))) {
      const resolved = path.resolve(TERMINAL_CWD, token);
      if (token.startsWith('~') || path.relative(TERMINAL_CWD, resolved).startsWith('..') || path.isAbsolute(token)) return 'high';
    }
    return 'medium';
  }
  if (tokens[0] === 'echo') return 'medium';
  return 'high';
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
const AFFIRMATIVE_PHRASES = ['sim execute', 'sim pode executar', 'pode executar', 'confirmo', 'autorizo', 'autorizo a execucao'];
const EXTRA_NEGATIVE_PHRASES = ['nao executa', 'nao roda', 'nao quero', 'deixa quieto'];
const REMEMBER_PHRASES = ['sempre permitir', 'sempre pode', 'pode sempre', 'nao precisa perguntar', 'nao pergunte mais', 'lembra disso', 'sempre autorizo'];

export type SpeechDecision = 'approve' | 'deny' | 'needs_strong' | null;

/**
 * Interpreta uma fala do usuário como resposta à solicitação pendente.
 * Negativas têm prioridade ("não pode executar" é negação).
 * Comandos de alto risco exigem o botão da interface.
 */
export function interpretApprovalSpeech(text: string, riskLevel: CommandRiskLevel): SpeechDecision {
  const clean = normalizeSpeech(text);
  if (!clean) return null;
  const words = clean.split(' ');

  if (words.some((w) => NEGATIVE_WORDS.includes(w)) || NEGATIVE_PHRASES.some((p) => clean.includes(p)) || EXTRA_NEGATIVE_PHRASES.some((p) => clean.includes(p))) {
    return 'deny';
  }

  const affirmative = AFFIRMATIVE_PHRASES.includes(clean.replace(/\bjasper\b/g, '').trim());
  if (!affirmative) return null;

  if (riskLevel === 'high') {
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
  const command = typeof comando === 'string' ? comando.trim() : '';
  if (command.length > 4000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(command)) return { immediate: { success: false, message: 'Comando inválido ou grande demais.' } };
  if (!command) {
    return { immediate: { success: false, message: 'Nenhum comando informado.' } };
  }

  const blocked = getBlockedReason(command);
  if (blocked) {
    console.warn(`[Terminal] Comando bloqueado (${blocked}): ${command}`);
    return { immediate: { success: false, comando: command, message: `Comando bloqueado pela política de segurança: ${blocked}. Ele não pode ser executado pelo JASPER.` } };
  }

  const key = normalizedCommand(command);
  if ((autoApproveWhitelist.get(key) || 0) > Date.now() && !SHELL_META.test(command) && getCommandRiskLevel(command) === 'safe') {
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
  if (source === 'tool' || (decision.approved && (!['ui', 'voice', 'text'].includes(source) || (entry.req.riskLevel === 'high' && source !== 'ui') || (decision.customCommand && source !== 'ui')))) {
    return { success: false, comando: entry.req.command, message: 'Aguardando aprovação humana pelo canal permitido.' };
  }
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
      if (finalCommand.length > 4000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(finalCommand)) {
        result = { success: false, comando: finalCommand, message: 'Comando editado inválido.' };
        finishResolution(req, false, source, result, finalCommand);
        return result;
      }
      const blocked = getBlockedReason(finalCommand);
      if (blocked) {
        result = { success: false, comando: finalCommand, message: `Comando editado bloqueado pela política de segurança: ${blocked}.` };
        finishResolution(req, false, source, result, finalCommand);
        return result;
      }
    }
    if (decision.remember && source === 'ui' && !SHELL_META.test(finalCommand) && getCommandRiskLevel(finalCommand) === 'safe') {
      autoApproveWhitelist.set(normalizedCommand(finalCommand), Date.now() + 30 * 60_000);
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
 * Restrito exclusivamente à máquina principal (Master).
 */
export async function executarTerminal(comando: string, isMaster = false): Promise<TerminalResult> {
  if (!isMaster) {
    return {
      success: false,
      comando,
      message: 'Execução de terminal bloqueada pela política de segurança: apenas a máquina principal (Master) pode executar comandos no sistema operacional.',
    };
  }
  const res = await requestTerminalCommand(comando, 'blocking');
  if ('immediate' in res) return res.immediate;
  return new Promise((resolve) => {
    toolEvents.once(`terminal_execution_result_${res.pending.id}`, (result: TerminalResult) => resolve(result));
  });
}

/**
 * Modo de voz (Gemini Live): não bloqueia o modelo. Registra a solicitação e devolve
 * instruções para o modelo pedir a confirmação verbal ao usuário.
 * Restrito exclusivamente à máquina principal (Master).
 */
export async function solicitarTerminalPorVoz(comando: string, isMaster = false): Promise<any> {
  if (!isMaster) {
    return {
      success: false,
      status: 'negado_dispositivo_remoto',
      comando,
      message: 'Comandos de terminal não podem ser solicitados ou executados por dispositivos remotos. Use diretamente o computador principal.',
    };
  }
  const res = await requestTerminalCommand(comando, 'live');
  if ('immediate' in res) return res.immediate;
  const { pending } = res;
  const fraseConfirmacao = pending.riskLevel === 'high'
    ? 'Este comando é de ALTO RISCO: a aprovação deve ocorrer pelo botão na interface.'
    : 'O usuário pode responder "sim, execute", "confirmo" ou "não".';
  return {
    success: true,
    status: 'aguardando_confirmacao',
    id: pending.id,
    comando: pending.command,
    risco: pending.riskLevel,
    instrucao:
      `O comando AINDA NÃO foi executado. Pergunte ao usuário em voz, de forma curta, se ele confirma a execução de "${pending.command}". ` +
      `${fraseConfirmacao} A decisão é registrada pelo servidor; confirmar_comando_terminal apenas consulta o estado. ` +
      'Nunca confirme por conta própria sem ouvir a resposta do usuário.',
  };
}

/**
 * Chamada pelo modelo depois de ouvir a resposta do usuário.
 * Somente consulta decisões já registradas pelo servidor; o modelo não pode aprovar.
 */
export async function confirmarComandoTerminal(): Promise<any> {
  const pending = getPendingTerminalRequest();
  if (pending) return { success: false, status: 'aguardando', comando: pending.command, message: 'Aguarde a decisão humana. Esta ferramenta apenas consulta o estado.' };
  if (!lastResolved) return { success: false, status: 'sem_solicitacao', message: 'Não há comando aguardando aprovação.' };
  lastResolved.delivered = true;
  return { ...lastResolved.result, status: lastResolved.approved ? 'aprovado' : lastResolved.source === 'timeout' ? 'expirado' : 'negado' };
}

async function runExec(command: string): Promise<TerminalResult> {
  const tokens = commandTokens(command);
  const shell = SHELL_META.test(command) || !tokens;
  const result = await runProgram(shell ? '/bin/sh' : tokens[0], shell ? ['-c', command] : tokens.slice(1), {
    cwd: TERMINAL_CWD, timeoutMs: 30_000, maxBuffer: 1024 * 1024,
  });
  return {
    success: result.ok, comando: command,
    message: result.ok ? 'Comando executado com sucesso.' : 'O comando não foi concluído.',
    output: result.stdout.trim().slice(0, 4000),
    ...(result.ok ? {} : { error: result.stderr.slice(0, 4000) }),
  };
}
