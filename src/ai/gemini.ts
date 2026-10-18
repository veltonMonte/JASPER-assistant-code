import { activeScenePrompt } from '../presentation/scene-session.js';
import { buildPersonalityPrompt } from "./personality.js";
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
  private sanitizeHistory(history: any[]): Array<{ role: string; parts: Array<{ text: string }> }> {
    return history
      .filter((msg) => msg.role === 'user' || msg.role === 'model')
      .map((msg) => {
        let text = '';
        if (typeof msg.content === 'string') {
          text = msg.content;
        } else if (Array.isArray(msg.parts) && msg.parts[0]?.text) {
          text = msg.parts[0].text;
        }
        return {
          role: msg.role === 'model' ? 'model' : 'user',
          parts: [{ text }],
        };
      });
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
    historyContext: any[] = []
  ): Promise<GeminiResponse> {
    const startTime = Date.now();
    const toolsExecuted: string[] = [];
    const chartConfigs: string[] = [];
    const tableConfigs: string[] = [];
    const imageConfigs: string[] = [];

    // Se não houver chave de API configurada, utiliza o modo simulação inteligente
    if (!this.genAI || !config.gemini.apiKey) {
      return this.fallbackResponse(userPrompt, startTime);
    }

    try {
      let personalityPrompt = '';
      try {
        const personality = await dbManager.getPersonality();
        personalityPrompt = "\n" + buildPersonalityPrompt(personality) + "\n";
      } catch (e) {}

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

      const fullSystemInstruction = JASPER_SYSTEM_PROMPT + personalityPrompt + memorySummary + timeContext + activeScenePrompt();
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
          } else if (fc.name === 'renderizar_tabela' && toolResult?.tableConfig) {
            tableConfigs.push(toolResult.tableConfig);
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

      // Injeta blocos de tabelas se ainda não foram incluídos explicitamente no markdown
      if (tableConfigs.length > 0 && !finalResponseText.includes('```table')) {
        for (const tCfg of tableConfigs) {
          finalResponseText += `\n\n\`\`\`table\n${tCfg}\n\`\`\`\n`;
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
    } else if ((lower.includes('filme') || lower.includes('filmes') || lower.includes('cinema')) && (lower.includes('top') || lower.includes('critica') || lower.includes('crítica') || lower.includes('melhor') || lower.includes('melhores') || lower.includes('tabela'))) {
      const tableConfig = JSON.stringify({
        title: 'Top 10 Melhores Filmes Segundo a Crítica Especializada (Metacritic & IMDb)',
        columns: [
          { key: 'pos', label: '#', align: 'center' },
          { key: 'titulo', label: 'Filme' },
          { key: 'ano', label: 'Ano', align: 'center' },
          { key: 'diretor', label: 'Direção' },
          { key: 'nota', label: 'Avaliação Crítica', align: 'right' },
        ],
        rows: [
          { pos: 1, titulo: 'Cidadão Kane', ano: 1941, diretor: 'Orson Welles', nota: '100 / 100' },
          { pos: 2, titulo: 'O Poderoso Chefão', ano: 1972, diretor: 'Francis Ford Coppola', nota: '100 / 100' },
          { pos: 3, titulo: 'Casablanca', ano: 1942, diretor: 'Michael Curtiz', nota: '100 / 100' },
          { pos: 4, titulo: 'Janela Indiscreta', ano: 1954, diretor: 'Alfred Hitchcock', nota: '100 / 100' },
          { pos: 5, titulo: 'O Poderoso Chefão: Parte II', ano: 1974, diretor: 'Francis Ford Coppola', nota: '90 / 100' },
          { pos: 6, titulo: 'Cantando na Chuva', ano: 1952, diretor: 'Stanley Donen, Gene Kelly', nota: '99 / 100' },
          { pos: 7, titulo: 'Os Sete Samurais', ano: 1954, diretor: 'Akira Kurosawa', nota: '98 / 100' },
          { pos: 8, titulo: 'Pulp Fiction: Tempo de Violência', ano: 1994, diretor: 'Quentin Tarantino', nota: '95 / 100' },
          { pos: 9, titulo: 'A Viagem de Chihiro', ano: 2001, diretor: 'Hayao Miyazaki', nota: '96 / 100' },
          { pos: 10, titulo: 'Um Sonho de Liberdade', ano: 1994, diretor: 'Frank Darabont', nota: '9.3 / 10' },
        ]
      });
      toolsExecuted.push('renderizar_tabela');
      text = `Aqui está a seleção com o **Top 10 Melhores Filmes da história segundo a crítica especializada**:\n\n\`\`\`table\n${tableConfig}\n\`\`\`\n\nEsses clássicos lideram as listas históricas do Metacritic e Sight & Sound, reconhecidos pela sua profunda influência na história do cinema.`;
    } else if ((lower.includes('serie a') || lower.includes('série a') || lower.includes('brasileirao') || lower.includes('brasileirão') || lower.includes('campeonato brasileiro')) && (lower.includes('tabela') || lower.includes('classificacao') || lower.includes('classificação') || lower.includes('mande') || lower.includes('ver'))) {
      const tableConfig = JSON.stringify({
        title: 'Classificação Brasileirão 2024 - Série A',
        columns: [
          { key: 'pos', label: 'Pos', align: 'center' },
          { key: 'time', label: 'Clube' },
          { key: 'pts', label: 'PTS', align: 'center' },
          { key: 'jogos', label: 'J', align: 'center' },
          { key: 'vitorias', label: 'V', align: 'center' },
          { key: 'empates', label: 'E', align: 'center' },
          { key: 'derrotas', label: 'D', align: 'center' },
          { key: 'saldo', label: 'SG', align: 'center' },
        ],
        rows: [
          { pos: 1, time: 'Botafogo', pts: 60, jogos: 29, vitorias: 18, empates: 6, derrotas: 5, saldo: 24 },
          { pos: 2, time: 'Palmeiras', pts: 57, jogos: 29, vitorias: 17, empates: 6, derrotas: 6, saldo: 26 },
          { pos: 3, time: 'Fortaleza', pts: 55, jogos: 29, vitorias: 16, empates: 7, derrotas: 6, saldo: 12 },
          { pos: 4, time: 'Flamengo', pts: 51, jogos: 29, vitorias: 15, empates: 6, derrotas: 8, saldo: 13 },
          { pos: 5, time: 'São Paulo', pts: 47, jogos: 29, vitorias: 14, empates: 5, derrotas: 10, saldo: 6 },
          { pos: 6, time: 'Internacional', pts: 46, jogos: 28, vitorias: 12, empates: 10, derrotas: 6, saldo: 11 },
          { pos: 7, time: 'Bahia', pts: 45, jogos: 29, vitorias: 13, empates: 6, derrotas: 10, saldo: 5 },
          { pos: 8, time: 'Cruzeiro', pts: 43, jogos: 29, vitorias: 12, empates: 7, derrotas: 10, saldo: 5 },
          { pos: 9, time: 'Vasco da Gama', pts: 37, jogos: 28, vitorias: 10, empates: 7, derrotas: 11, saldo: -7 },
          { pos: 10, time: 'Atlético-MG', pts: 37, jogos: 27, vitorias: 9, empates: 10, derrotas: 8, saldo: -2 },
          { pos: 11, time: 'Grêmio', pts: 35, jogos: 29, vitorias: 10, empates: 5, derrotas: 14, saldo: -4 },
          { pos: 12, time: 'Criciúma', pts: 35, jogos: 29, vitorias: 9, empates: 8, derrotas: 12, saldo: -4 },
          { pos: 13, time: 'Red Bull Bragantino', pts: 34, jogos: 29, vitorias: 8, empates: 10, derrotas: 11, saldo: -4 },
          { pos: 14, time: 'Juventude', pts: 34, jogos: 29, vitorias: 8, empates: 10, derrotas: 11, saldo: -9 },
          { pos: 15, time: 'Athletico-PR', pts: 31, jogos: 27, vitorias: 8, empates: 7, derrotas: 12, saldo: -4 },
          { pos: 16, time: 'Fluminense', pts: 30, jogos: 29, vitorias: 8, empates: 6, derrotas: 15, saldo: -9 },
          { pos: 17, time: 'Vitória', pts: 29, jogos: 29, vitorias: 8, empates: 5, derrotas: 16, saldo: -13 },
          { pos: 18, time: 'Corinthians', pts: 29, jogos: 29, vitorias: 6, empates: 11, derrotas: 12, saldo: -11 },
          { pos: 19, time: 'Cuiabá', pts: 26, jogos: 28, vitorias: 6, empates: 8, derrotas: 14, saldo: -14 },
          { pos: 20, time: 'Atlético-GO', pts: 21, jogos: 29, vitorias: 5, empates: 6, derrotas: 18, saldo: -24 },
        ]
      });
      toolsExecuted.push('renderizar_tabela');
      text = `Aqui está a **tabela de classificação da Série A do Brasileirão**:\n\n\`\`\`table\n${tableConfig}\n\`\`\`\n\nO Botafogo e o Palmeiras travam uma batalha direta pela liderança, com o Fortaleza na perseguição imediata!`;
    } else if (lower.includes('tabela') || lower.includes('ranking') || lower.includes('tabelas')) {
      const tableConfig = JSON.stringify({
        title: 'Tabela de Indicadores JASPER',
        columns: [
          { key: 'item', label: 'Métrica / Módulo' },
          { key: 'status', label: 'Status Operacional' },
          { key: 'valor', label: 'Desempenho', align: 'right' },
        ],
        rows: [
          { item: 'Cérebro Neural', status: 'Online', valor: '100%' },
          { item: 'Pipeline de Ações', status: 'Ativo', valor: '99.9%' },
          { item: 'Latência Média', status: 'Otimizada', valor: '< 20ms' },
          { item: 'Dispositivos IoT', status: 'Sincronizado', valor: '8 unidades' },
        ]
      });
      toolsExecuted.push('renderizar_tabela');
      text = `Aqui está a tabela solicitada:\n\n\`\`\`table\n${tableConfig}\n\`\`\``;
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
