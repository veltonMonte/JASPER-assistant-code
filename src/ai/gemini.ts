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
    }
  }

  /**
   * Remove mensagens de tool/function do histórico para evitar conflito de validação de schemas do SDK
   */
  private sanitizeHistory(history: Array<{ role: string; content: string }>): Array<{ role: string; parts: Array<{ text: string }> }> {
    return history
      .filter((msg) => msg.role === 'user' || msg.role === 'model')
      .map((msg) => ({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));
  }

  /**
   * Helper com timeout individual por chamada à API do Gemini
   */
  private withTimeout<T>(promise: Promise<T>, ms: number = 15000): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Gemini API timeout (${ms}ms)`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  /**
   * Processa o comando textual do usuário com raciocínio e execução encadeada de ferramentas
   */
  public async generateResponse(
    userPrompt: string,
    historyContext: Array<{ role: string; content: string }> = []
  ): Promise<GeminiResponse> {
    const startTime = Date.now();
    const toolsExecuted: string[] = [];
    const chartConfigs: string[] = [];
    const imageConfigs: string[] = [];

    // Se não houver chave de API configurada, utiliza o modo simulação inteligente
    if (!this.genAI || !config.gemini.apiKey) {
      return this.fallbackResponse(userPrompt, startTime);
    }

    try {
      // Carrega memórias salvas para injetar no contexto do sistema
      let memorySummary = '';
      try {
        const memories = await dbManager.getAllMemories();
        if (memories.length > 0) {
          memorySummary = '\nMEMÓRIAS PERSISTENTES REGISTRADAS:\n' +
            memories.map((m) => `- ${m.key}: ${m.value}`).join('\n') + '\n';
        }
      } catch (e) {}

      const now = new Date();
      const fmtStr = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now);
      
      const tzDate = new Date(now.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
      const isoStr = tzDate.getFullYear() + "-" + String(tzDate.getMonth()+1).padStart(2, '0') + "-" + String(tzDate.getDate()).padStart(2, '0') + " " + String(tzDate.getHours()).padStart(2, '0') + ":" + String(tzDate.getMinutes()).padStart(2, '0') + ":" + String(tzDate.getSeconds()).padStart(2, '0');
      
      const timeContext = `\n[CONTEXTO DE TEMPO DA SESSÃO]\nO horário atual em Brasília é: ${fmtStr}.\n(Formato ISO: ${isoStr}).\nATENÇÃO: Você DEVE SEMPRE chamar a ferramenta 'consultarHorario' ANTES de agendar qualquer alarme para ter certeza absoluta da hora e do dia ATUAL e evitar atrasos!\n`;

      const fullSystemInstruction = JASPER_SYSTEM_PROMPT + memorySummary + timeContext;
      const cleanHistory = this.sanitizeHistory(historyContext);

      const model = this.genAI.getGenerativeModel({
        model: config.gemini.model,
        systemInstruction: fullSystemInstruction,
        tools: [{ functionDeclarations: geminiToolDeclarations as any }],
      });

      const chat = model.startChat({
        history: cleanHistory,
      });

      // Envia o prompt com timeout seguro de 15 segundos
      const apiResult = await this.withTimeout(chat.sendMessage(userPrompt), 15000);
      let currentResponse = await apiResult.response;
      let finalResponseText = '';
      let turns = 0;

      // Loop de execução de ferramentas encadeadas (ex: pesquisar_web -> renderizar_grafico -> resposta)
      while (turns < 5) {
        const functionCalls = currentResponse.functionCalls();
        if (!functionCalls || functionCalls.length === 0) {
          try {
            const txt = currentResponse.text();
            if (txt) {
              finalResponseText += (finalResponseText ? '\n\n' : '') + txt;
            }
          } catch (e) {}
          break;
        }

        turns++;
        const functionResponses = [];

        for (const fc of functionCalls) {
          toolsExecuted.push(fc.name);
          const toolResult = await executeToolByName(fc.name, fc.args as any);

          if (fc.name === 'renderizar_grafico' && toolResult?.chartConfig) {
            chartConfigs.push(toolResult.chartConfig);
          } else if (fc.name === 'pesquisar_imagens' && toolResult?.images) {
            imageConfigs.push(JSON.stringify(toolResult.images));
          }

          functionResponses.push({
            functionResponse: {
              name: fc.name,
              response: toolResult,
            },
          });
        }

        // Devolve os resultados das ferramentas para o Gemini continuar o raciocínio
        const followUpResult = await this.withTimeout(chat.sendMessage(functionResponses), 15000);
        currentResponse = await followUpResult.response;
      }

      // Injeta blocos de gráficos se ainda não foram incluídos explicitamente no markdown
      if (chartConfigs.length > 0 && !finalResponseText.includes('```recharts')) {
        for (const cfg of chartConfigs) {
          finalResponseText += `\n\n\`\`\`recharts\n${cfg}\n\`\`\`\n`;
        }
      }

      // Injeta galeria de imagens se ainda não foi incluída
      if (imageConfigs.length > 0 && !finalResponseText.includes('```images')) {
        for (const imgCfg of imageConfigs) {
          finalResponseText += `\n\n\`\`\`images\n${imgCfg}\n\`\`\`\n`;
        }
      }

      return {
        text: finalResponseText.trim() || 'Comando processado com sucesso pelo JASPER.',
        toolsExecuted,
        durationMs: Date.now() - startTime,
      };
    } catch (error: any) {
      console.error('❌ Erro na integração com o Gemini:', error.message);
      return this.fallbackResponse(userPrompt, startTime, error.message);
    }
  }

  /**
   * Resposta de contingência offline/fallback quando a API do Gemini não está acessível
   */
  private async fallbackResponse(
    userPrompt: string,
    startTime: number,
    errorDetails?: string
  ): Promise<GeminiResponse> {
    const lower = userPrompt.toLowerCase();
    let text = '';
    const toolsExecuted: string[] = [];

    if (
      lower.includes('código') || lower.includes('codigo') ||
      lower.includes('python') || lower.includes('javascript') ||
      lower.includes('html') || lower.includes('função') || lower.includes('funcao')
    ) {
      text = `Aqui está um exemplo de código:\n\n\`\`\`python\ndef processar():\n    print("⚡ [JASPER] Operação concluída com sucesso.")\nprocessar()\n\`\`\``;
    } else if (lower.includes('imagem') || lower.includes('foto') || lower.includes('buscar imagem')) {
      const query = userPrompt.replace(/jasper|imagem|imagens|foto|fotos|buscar|pesquisar/gi, '').trim() || 'tecnologia';
      const imgRes = await executeToolByName('pesquisar_imagens', { query });
      toolsExecuted.push('pesquisar_imagens');
      text = `🖼️ Busquei imagens sobre **"${query}"** para você.`;
      if (imgRes.images) {
        text += `\n\n\`\`\`images\n${JSON.stringify(imgRes.images)}\n\`\`\``;
      }
    } else if (lower.includes('pesquisar') || lower.includes('eleição') || lower.includes('eleições') || lower.includes('notícia')) {
      const query = userPrompt.replace(/jasper|pesquisar|pesquisa/gi, '').trim();
      const searchRes = await executeToolByName('pesquisar_web', { query });
      toolsExecuted.push('pesquisar_web');
      text = `Pesquisei na internet sobre **"${query}"**:\n\n` +
        (searchRes.results ? searchRes.results.slice(0, 4).map((r: any) => `• **${r.title}**: ${r.snippet}`).join('\n') : searchRes.message);
    } else if (lower.includes('gráfico') || lower.includes('grafico') || lower.includes('chart')) {
      const chartConfig = JSON.stringify({
        title: 'Métricas de Desempenho JASPER',
        type: 'area',
        data: [
          { name: '00:00', cpu: 12, ram: 45 },
          { name: '06:00', cpu: 18, ram: 50 },
          { name: '12:00', cpu: 35, ram: 65 },
          { name: '18:00', cpu: 28, ram: 58 },
          { name: '22:00', cpu: 15, ram: 48 },
        ],
        xKey: 'name',
        series: [
          { dataKey: 'cpu', name: 'Uso de CPU (%)', color: '#38bdf8' },
          { dataKey: 'ram', name: 'Uso de RAM (%)', color: '#818cf8' },
        ],
      });
      toolsExecuted.push('renderizar_grafico');
      text = `Aqui está a estrutura gráfica solicitada:\n\n\`\`\`recharts\n${chartConfig}\n\`\`\``;
    } else {
      text = `Compreendido! Recebi sua mensagem: "${userPrompt}". O assistente JASPER está pronto.`;
    }

    return {
      text,
      toolsExecuted,
      durationMs: Date.now() - startTime,
    };
  }
}

export const geminiBrain = new GeminiBrain();
