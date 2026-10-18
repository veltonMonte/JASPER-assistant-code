import { executeToolByName } from '../tools/index.js';
import {
  getPendingTerminalRequest,
  interpretApprovalSpeech,
  resolveTerminalApproval,
  wantsRemember,
  interpretTerminalIntent,
} from '../tools/terminal.js';

export interface RouteResult {
  handledDirectly: boolean;
  intentName?: string;
  responseSpeech?: string;
  toolResult?: any;
  durationMs: number;
}

/**
 * Roteador Híbrido de Velocidade (Intent Router)
 * Examina comandos de entrada e executa comandos determinísticos diretamente (< 15ms)
 * sem necessidade de chamada ao LLM (Gemini) para atingir mínima latência.
 */
export class IntentRouter {
  public async route(input: string): Promise<RouteResult> {
    const startTime = Date.now();
    const cleanText = input.toLowerCase().trim();

    // 0. INTENÇÃO: Confirmação ou Negação de Comando de Terminal Pendente
    const pending = getPendingTerminalRequest();
    if (pending) {
      const decision = interpretApprovalSpeech(cleanText, pending.riskLevel);
      if (decision === 'approve') {
        const remember = wantsRemember(cleanText);
        const res = await resolveTerminalApproval(pending.id, { approved: true, remember }, 'voice');
        const speech = res?.success
          ? `Comando "${res.comando}" executado com sucesso.${res.output ? " Saída:\n" + res.output.slice(0, 500) : ""}`
          : `O comando falhou: ${res?.message || res?.error || "erro desconhecido"}`;
        return {
          handledDirectly: true,
          intentName: 'TERMINAL_APPROVE',
          responseSpeech: speech,
          toolResult: res,
          durationMs: Date.now() - startTime,
        };
      }
      if (decision === 'deny') {
        const res = await resolveTerminalApproval(pending.id, { approved: false }, 'voice');
        return {
          handledDirectly: true,
          intentName: 'TERMINAL_DENY',
          responseSpeech: 'Entendido. O comando de terminal foi cancelado.',
          toolResult: res,
          durationMs: Date.now() - startTime,
        };
      }
      if (decision === 'needs_strong') {
        return {
          handledDirectly: true,
          intentName: 'TERMINAL_NEEDS_STRONG',
          responseSpeech: 'Este comando é de alto risco. Aprove pelo botão na interface após revisar o comando literal.',
          durationMs: Date.now() - startTime,
        };
      }
    }

    // 0.1 INTENÇÃO: Comando de Terminal em Linguagem Natural
    const termIntent = interpretTerminalIntent(cleanText);
    if (termIntent) {
      const toolRes = await executeToolByName('executar_terminal', { comando: termIntent.command });
      const speech = toolRes.status === 'aguardando_confirmacao'
        ? `Solicitei a permissão para ${termIntent.description} (comando: "${termIntent.command}"). Você confirma a execução?`
        : (toolRes.message || 'Comando executado com sucesso.');
      return {
        handledDirectly: true,
        intentName: 'TERMINAL_COMMAND_REQUEST',
        responseSpeech: speech,
        toolResult: toolRes,
        durationMs: Date.now() - startTime,
      };
    }

    // 1. INTENÇÃO: Ligar o PC (Wake-on-LAN)
    if (
      /^(jasper,?\s*)?(ligu?e?|inici?a?r?|liga)\s*(o|meu)?\s*(pc|computador|notebook)$/i.test(cleanText) ||
      cleanText.includes('ligar meu pc') ||
      cleanText.includes('ligar o pc') ||
      cleanText.includes('liga o computador')
    ) {
      const toolRes = await executeToolByName('ligar_pc');
      return {
        handledDirectly: true,
        intentName: 'TURN_ON_PC',
        responseSpeech: 'Pronto, estou ligando seu computador.',
        toolResult: toolRes,
        durationMs: Date.now() - startTime,
      };
    }

    // 2. INTENÇÃO: Verificar status do PC
    if (
      cleanText.includes('pc tá ligado') ||
      cleanText.includes('pc está ligado') ||
      cleanText.includes('verificar pc') ||
      cleanText.includes('status do pc') ||
      cleanText.includes('computador está online')
    ) {
      const toolRes = await executeToolByName('verificar_pc');
      const speech = toolRes.online
        ? 'Seu computador está online e respondendo na rede.'
        : 'Seu computador está offline ou desligado.';
      return {
        handledDirectly: true,
        intentName: 'CHECK_PC_STATUS',
        responseSpeech: speech,
        toolResult: toolRes,
        durationMs: Date.now() - startTime,
      };
    }

    // 3. INTENÇÃO: Consultar Horário / Data
    if (
      cleanText.includes('que horas são') ||
      cleanText.includes('qual o horário') ||
      cleanText.includes('que dia é hoje') ||
      cleanText.includes('hora atual')
    ) {
      const toolRes = await executeToolByName('consultar_horario');
      return {
        handledDirectly: true,
        intentName: 'GET_TIME',
        responseSpeech: toolRes.message,
        toolResult: toolRes,
        durationMs: Date.now() - startTime,
      };
    }

    // 4. INTENÇÃO: Saudação Simples
    if (
      /^(jasper,?\s*)?(olá|oi|bom dia|boa tarde|boa noite|tudo bem)\??$/i.test(cleanText)
    ) {
      return {
        handledDirectly: true,
        intentName: 'GREETING',
        responseSpeech: 'Olá! Como posso ajudar você hoje?',
        durationMs: Date.now() - startTime,
      };
    }

    // 5. INTENÇÃO: Desligar PC
    if (cleanText.includes('desligar meu pc') || cleanText.includes('desliga o pc')) {
      const toolRes = await executeToolByName('desligar_pc');
      return {
        handledDirectly: true,
        intentName: 'SHUTDOWN_PC',
        responseSpeech: 'Solicitação de desligamento enviada.',
        toolResult: toolRes,
        durationMs: Date.now() - startTime,
      };
    }

    // Se não for um comando simples e determinístico, delega para a IA Gemini
    return {
      handledDirectly: false,
      durationMs: Date.now() - startTime,
    };
  }
}

export const intentRouter = new IntentRouter();

// --- Teste do Intent Router se executado diretamente ---
if (process.argv[1] && process.argv[1].endsWith('router.ts')) {
  async function testRouter() {
    console.log('🧪 Iniciando testes de latência do Intent Router...\n');
    const testCases = [
      'JASPER, ligue meu PC',
      'JASPER, que horas são?',
      'JASPER, qual a cotação do dólar hoje?',
    ];

    for (const test of testCases) {
      console.log(`Input: "${test}"`);
      const res = await intentRouter.route(test);
      console.log(`Direct Match: ${res.handledDirectly} | Intent: ${res.intentName || 'GEMINI_FALLBACK'} | Duracao: ${res.durationMs}ms`);
      if (res.responseSpeech) console.log(`Fala: "${res.responseSpeech}"`);
      console.log('---');
    }
  }
  testRouter();
}
