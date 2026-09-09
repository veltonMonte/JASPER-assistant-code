import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/config.js';
import { JASPER_SYSTEM_PROMPT } from './prompts.js';
import { geminiToolDeclarations, executeToolByName } from '../tools/index.js';
import { dbManager } from '../database/database.js';

export interface GeminiResponse {
  text: string;
  toolsExecuted: string[];
  durationMs: number;
}

export class GeminiBrain {
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    if (config.gemini.apiKey) {
      this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    } else {
      console.warn('⚠️ GEMINI_API_KEY não definida no arquivo .env. O JASPER responderá no modo simulação/fallback offline.');
    }
  }

  /**
   * Processa uma solicitação conversacional do usuário utilizando o modelo Gemini
   */
  public async generateResponse(
    userPrompt: string,
    historyContext: any[] = []
  ): Promise<GeminiResponse> {
    const startTime = Date.now();
    const toolsExecuted: string[] = [];

    // Se não houver chave de API configurada, utiliza o modo simulação inteligente
    if (!this.genAI || !config.gemini.apiKey) {
      return this.fallbackResponse(userPrompt, startTime);
    }

    try {
      // Carrega memórias salvas para injetar no contexto do sistema
      const memories = await dbManager.getAllMemories();
      let memorySummary = '';
      if (memories.length > 0) {
        memorySummary = '\nMEMÓRIAS PERSISTENTES REGISTRADAS:\n' +
          memories.map((m) => `- ${m.key}: ${m.value}`).join('\n') + '\n';
      }

      const fullSystemInstruction = JASPER_SYSTEM_PROMPT + memorySummary;

      const model = this.genAI.getGenerativeModel({
        model: config.gemini.model,
        systemInstruction: fullSystemInstruction,
        tools: [{ functionDeclarations: geminiToolDeclarations as any }],
      });

      const chat = model.startChat({
        history: historyContext,
      });

      const result = await chat.sendMessage(userPrompt);
      const response = await result.response;
      
      const functionCalls = response.functionCalls();

      if (functionCalls && functionCalls.length > 0) {
        let finalResponseText = '';

        for (const fc of functionCalls) {
          toolsExecuted.push(fc.name);

          // Executa a função localmente
          const toolResult = await executeToolByName(fc.name, fc.args as any);

          // Envia o resultado de volta para o Gemini
          const followUp = await chat.sendMessage([
            {
              functionResponse: {
                name: fc.name,
                response: toolResult,
              },
            },
          ]);

          const followUpResponse = await followUp.response;
          finalResponseText += followUpResponse.text() || toolResult.message || 'Ação executada com sucesso.';
        }

        return {
          text: finalResponseText.trim(),
          toolsExecuted,
          durationMs: Date.now() - startTime,
        };
      }

      return {
        text: response.text()?.trim() || 'Desculpe, não consegui entender completamente.',
        toolsExecuted: [],
        durationMs: Date.now() - startTime,
      };
    } catch (error: any) {
      console.error('❌ Erro na integração com o Gemini:', error.message);
      return this.fallbackResponse(userPrompt, startTime, error.message);
    }
  }

  /**
   * Resposta de contingência offline/fallback quando a API do Gemini não está configurada ou falha
   */
  private async fallbackResponse(
    userPrompt: string,
    startTime: number,
    errorDetails?: string
  ): Promise<GeminiResponse> {
    const lower = userPrompt.toLowerCase();
    let text = 'Entendi sua solicitação.';
    const toolsExecuted: string[] = [];

    if (lower.includes('pesquisar') || lower.includes('preço') || lower.includes('custando') || lower.includes('quanto custa')) {
      const query = userPrompt.replace(/jasper|pesquisar|pesquisa|quanto custa|preço/gi, '').trim();
      const searchRes = await executeToolByName('pesquisar_web', { query });
      toolsExecuted.push('pesquisar_web');
      text = `Pesquisei na internet sobre ${query}. ${searchRes.message || ''}`;
    } else if (lower.includes('mensagem') || lower.includes('mande uma mensagem')) {
      const msgRes = await executeToolByName('enviar_mensagem', { contato: 'Contato', mensagem: userPrompt });
      toolsExecuted.push('enviar_mensagem');
      text = msgRes.message;
    } else if (lower.includes('aprend') || lower.includes('dica') || lower.includes('ajuda')) {
      text = 'Essa é uma excelente pergunta! Como assistente pessoal, recomendo analisar o seu objetivo principal e avançar passo a passo.';
    } else {
      text = `Compreendido: "${userPrompt}". ${errorDetails ? 'Modo de contingência ativo.' : 'Estou à disposição.'}`;
    }

    return {
      text,
      toolsExecuted,
      durationMs: Date.now() - startTime,
    };
  }
}

export const geminiBrain = new GeminiBrain();
