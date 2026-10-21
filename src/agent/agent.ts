import { intentRouter } from './router.js';
import { geminiBrain } from '../ai/gemini.js';
import { sessionContext } from '../ai/context.js';
import { dbManager } from '../database/database.js';

export interface AgentExecutionResult {
  responseText: string;
  routeType: 'DIRECT_INTENT' | 'GEMINI_AGENT';
  intentName?: string;
  toolsExecuted: string[];
  metrics: {
    sttMs: number;
    routerMs: number;
    geminiMs: number;
    toolMs: number;
    ttsMs: number;
    totalMs: number;
  };
}

export class JasperAgent {
  /**
   * Processa o texto recebido de um comando de voz ou mensagem do celular
   */
  public async processCommand(
    commandText: string,
    sttDurationMs: number = 0,
    options?: { isMaster?: boolean }
  ): Promise<AgentExecutionResult> {
    const overallStartTime = Date.now();
    console.log(`\n🎙️ [JASPER] Recebido comando: "${commandText}"`);

    // 1. Passo: Roteador Híbrido de Velocidade (Intent Router)
    const routerStartTime = Date.now();
    const routeResult = await intentRouter.route(commandText, options);
    const routerMs = Date.now() - routerStartTime;

    // Se o Intent Router atendeu diretamente (< 15ms)
    if (routeResult.handledDirectly && routeResult.responseSpeech) {
      console.log(`⚡ [Intent Router] Comando resolvido em ${routerMs}ms via Direct Intent: [${routeResult.intentName}]`);

      const totalMs = Date.now() - overallStartTime + sttDurationMs;
      const metrics = {
        sttMs: sttDurationMs,
        routerMs,
        geminiMs: 0,
        toolMs: routeResult.toolResult?._executionTimeMs || 0,
        ttsMs: 0, // Será calculado no momento da síntese TTS
        totalMs,
      };

      // Adiciona mensagem ao contexto
      sessionContext.addUserMessage(commandText);
      sessionContext.addModelMessage(routeResult.responseSpeech);

      // Grava métricas no SQLite de forma assíncrona
      dbManager.logPerformance({
        commandText,
        sttMs: metrics.sttMs,
        routerMs: metrics.routerMs,
        geminiMs: 0,
        toolMs: metrics.toolMs,
        ttsMs: 0,
        totalMs: metrics.totalMs,
        routeType: 'DIRECT_INTENT',
      });

      return {
        responseText: routeResult.responseSpeech,
        routeType: 'DIRECT_INTENT',
        intentName: routeResult.intentName,
        toolsExecuted: routeResult.intentName ? [routeResult.intentName.toLowerCase()] : [],
        metrics,
      };
    }

    // 2. Passo: Comando Raciocinado ou Conversacional -> Google Gemini
    console.log(`🧠 [Gemini Agent] Encaminhando solicitação para o cérebro de IA...`);
    const history = sessionContext.getMessages();

    const geminiResult = await geminiBrain.generateResponse(commandText, history, options);
    const geminiMs = geminiResult.durationMs;

    // Adiciona ao contexto conversacional
    sessionContext.addUserMessage(commandText);
    sessionContext.addModelMessage(geminiResult.text);

    const totalMs = Date.now() - overallStartTime + sttDurationMs;
    const metrics = {
      sttMs: sttDurationMs,
      routerMs,
      geminiMs,
      toolMs: 0,
      ttsMs: 0,
      totalMs,
    };

    dbManager.logPerformance({
      commandText,
      sttMs: metrics.sttMs,
      routerMs: metrics.routerMs,
      geminiMs: metrics.geminiMs,
      toolMs: 0,
      ttsMs: 0,
      totalMs: metrics.totalMs,
      routeType: 'GEMINI_AGENT',
    });

    return {
      responseText: geminiResult.text,
      routeType: 'GEMINI_AGENT',
      toolsExecuted: geminiResult.toolsExecuted,
      metrics,
    };
  }
}

export const jasperAgent = new JasperAgent();
