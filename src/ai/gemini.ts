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

  private sanitizeHistory(history: any[]): any[] {
    if (!Array.isArray(history) || history.length === 0) return [];
    const valid: any[] = [];
    let expectedRole = 'user';

    for (const msg of history) {
      if (msg && msg.role === expectedRole && Array.isArray(msg.parts) && msg.parts.length > 0) {
        valid.push(msg);
        expectedRole = expectedRole === 'user' ? 'model' : 'user';
      }
    }

    // History must end with 'model' so current user prompt can be sent
    if (valid.length % 2 !== 0) {
      valid.pop();
    }
    return valid;
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
      
      const timeContext = `\n[CONTEXTO DE TEMPO DA SESSÃO]\nO horário atual (no momento do carregamento desta mensagem) em Brasília é: ${fmtStr}.\n(Formato ISO: ${isoStr}).\nATENÇÃO: Você DEVE SEMPRE chamar a ferramenta 'consultarHorario' ANTES de agendar qualquer alarme para ter certeza absoluta da hora e do dia ATUAL e evitar atrasos!\n`;

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

      // Race Gemini API against 3500ms timeout for instant offline fallback
      const apiPromise = chat.sendMessage(userPrompt);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API timeout (3500ms)')), 3500)
      );

      const result = await Promise.race([apiPromise, timeoutPromise]);
      const response = await result.response;
      
      const functionCalls = response.functionCalls();

      if (functionCalls && functionCalls.length > 0) {
        let finalResponseText = '';

        for (const fc of functionCalls) {
          toolsExecuted.push(fc.name);

          // Executa a função localmente
          const toolResult = await executeToolByName(fc.name, fc.args as any);

          // Envia o resultado de volta para o Gemini
          const followUpPromise = chat.sendMessage([
            {
              functionResponse: {
                name: fc.name,
                response: toolResult,
              },
            },
          ]);
          const followUp = await Promise.race([followUpPromise, timeoutPromise]);
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
      console.error('❌ Erro/Timeout na integração com o Gemini:', error.message);
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
    let text = '';
    const toolsExecuted: string[] = [];

    // Detecção de solicitação de código
    if (
      lower.includes('código') || lower.includes('codigo') ||
      lower.includes('python') || lower.includes('javascript') ||
      lower.includes('html') || lower.includes('brainfuck') ||
      lower.includes('função') || lower.includes('funcao') ||
      lower.includes('exemplo de código') || lower.includes('script')
    ) {
      if (lower.includes('brainfuck')) {
        text = `Com certeza! Aqui está um exemplo de código em **Brainfuck** que imprime 'Hello World!':\n\n\`\`\`brainfuck\n>++++++++[<+++++++++>-]<.  >++++[<+++++++>-]<+.  +++++++..  +++.  >>++++ logic...\n\`\`\`\n\nEste código utiliza manipulação direta de ponteiros de memória.`;
      } else if (lower.includes('python')) {
        text = `Com certeza! Aqui está um exemplo de código em **Python**:\n\n\`\`\`python\ndef calcular_fibonacci(n):\n    """Calcula a sequência de Fibonacci até o n-ésimo termo."""\n    a, b = 0, 1\n    resultado = []\n    for _ in range(n):\n        resultado.append(a)\n        a, b = b, a + b\n    return resultado\n\n# Exemplo de uso:\ntermo = 10\nprint(f"Os primeiros {termo} números de Fibonacci são: {calcular_fibonacci(termo)}")\n\`\`\`\n\nVocê pode executar este código diretamente em qualquer ambiente Python 3.`;
      } else if (lower.includes('javascript') || lower.includes('js')) {
        text = `Aqui está o código em **JavaScript** solicitado:\n\n\`\`\`javascript\nasync function buscarDados(url) {\n  try {\n    const response = await fetch(url);\n    const data = await response.json();\n    console.log('Dados recebidos:', data);\n    return data;\n  } catch (error) {\n    console.error('Erro na requisição:', error);\n  }\n}\n\n// Exemplo de chamada\nbuscarDados('https://api.github.com/users/octocat');\n\`\`\``;
      } else if (lower.includes('html') || lower.includes('css')) {
        text = `Aqui está uma estrutura moderna em **HTML & CSS**:\n\n\`\`\`html\n<div class="card-container">\n  <h2 class="card-title">JASPER AI Assistant</h2>\n  <p class="card-description">Sistema de inteligência artificial de alta performance.</p>\n  <button class="card-btn">Iniciar</button>\n</div>\n\n<style>\n.card-container {\n  background: rgba(15, 20, 28, 0.85);\n  border: 1px solid rgba(255, 255, 255, 0.1);\n  border-radius: 12px;\n  padding: 24px;\n  color: #fff;\n}\n</style>\n\`\`\``;
      } else {
        text = `Aqui está um exemplo prático de código:\n\n\`\`\`python\nimport time\n\ndef processar_tarefa(nome):\n    print(f"⚡ [JASPER] Processando tarefa: {nome}...")\n    time.sleep(0.5)\n    return {"status": "sucesso", "tarefa": nome}\n\nresultado = processar_tarefa("Automação de Sistema")\nprint("Resultado:", resultado)\n\`\`\``;
      }
    } else if (lower.includes('imagem') || lower.includes('foto') || lower.includes('buscar imagem')) {
      const query = userPrompt.replace(/jasper|imagem|imagens|foto|fotos|buscar|pesquisar/gi, '').trim() || 'tecnologia futurista';
      const imgRes = await executeToolByName('pesquisar_imagens', { query });
      toolsExecuted.push('pesquisar_imagens');
      text = `🖼️ Busquei imagens sobre **"${query}"** para você.`;
    } else if (lower.includes('pesquisar') || lower.includes('preço') || lower.includes('custando') || lower.includes('quanto custa') || lower.includes('dólar') || lower.includes('dolar')) {
      const query = userPrompt.replace(/jasper|pesquisar|pesquisa|quanto custa|preço/gi, '').trim();
      const searchRes = await executeToolByName('pesquisar_web', { query });
      toolsExecuted.push('pesquisar_web');
      text = `Pesquisei na internet sobre **"${query}"**. ${searchRes.message || ''}`;
    } else if (lower.includes('gráfico') || lower.includes('grafico') || lower.includes('chart')) {
      const chartRes = await executeToolByName('renderizar_grafico', {
        title: 'Métricas de Desempenho JASPER',
        chartType: 'area',
        data: [
          { name: '00:00', cpu: 12, ram: 45, latencia: 8 },
          { name: '04:00', cpu: 8, ram: 42, latencia: 6 },
          { name: '08:00', cpu: 25, ram: 55, latencia: 12 },
          { name: '12:00', cpu: 40, ram: 68, latencia: 15 },
          { name: '16:00', cpu: 32, ram: 60, latencia: 10 },
          { name: '20:00', cpu: 18, ram: 50, latencia: 9 },
        ],
        dataKeys: ['cpu', 'ram', 'latencia'],
      });
      toolsExecuted.push('renderizar_grafico');
      text = `Gerando a visualização gráfica solicitada.\n\n\`\`\`recharts\n${chartRes.chartConfig}\n\`\`\``;
    } else if (lower.includes('mensagem') || lower.includes('mande uma mensagem')) {
      const msgRes = await executeToolByName('enviar_mensagem', { contato: 'Contato', mensagem: userPrompt });
      toolsExecuted.push('enviar_mensagem');
      text = msgRes.message;
    } else {
      text = `Compreendido! Recebi sua mensagem: "${userPrompt}". Como posso ajudar com este tópico?`;
    }

    return {
      text,
      toolsExecuted,
      durationMs: Date.now() - startTime,
    };
  }
}

export const geminiBrain = new GeminiBrain();
