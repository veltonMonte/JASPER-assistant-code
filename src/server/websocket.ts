import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { wakeWordManager } from '../voice/wakeword.js';
import { GeminiLiveSession } from '../ai/gemini-live.js';
import { jasperAgent } from '../agent/agent.js';
import { vadManager } from '../voice/vad.js';

export class JasperWebSocketServer {
  private wss: WebSocketServer | null = null;
  private geminiLive: GeminiLiveSession | null = null;

  public init(server: Server): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    console.log('📡 Servidor WebSocket inicializado no endpoint /ws');

    this.initGeminiLiveSession();

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('📱 Cliente conectado ao WebSocket.');

      this.sendState(ws, wakeWordManager.getState());

      this.sendToClient(ws, {
        type: 'LIVE_STATUS',
        connected: this.geminiLive?.isLiveConnected() || false,
      });

      ws.on('message', async (data: Buffer | string, isBinary: boolean) => {
        if (isBinary || (Buffer.isBuffer(data) && data[0] !== 123)) {
          const base64Pcm = data.toString('base64');
          
          const isSpeaking = wakeWordManager.getState() === 'SPEAKING';
          const wasInterrupted = vadManager.onUserAudioReceived(isSpeaking);
          if (wasInterrupted) {
            wakeWordManager.setState('LISTENING');
            this.broadcastState('LISTENING');
            this.broadcastToClients({ type: 'INTERRUPT' });
          }

          if (wakeWordManager.getState() !== 'LISTENING') {
            wakeWordManager.setState('LISTENING');
            this.broadcastState('LISTENING');
          }

          if (this.geminiLive) {
            this.geminiLive.sendAudioChunk(base64Pcm, 16000);
          }
          return;
        }

        try {
          const textData = data.toString();
          const payload = JSON.parse(textData);
          await this.handleClientMessage(ws, payload);
        } catch (error: any) {
          console.error('❌ Erro ao ler mensagem WebSocket:', error.message);
        }
      });

      ws.on('close', () => {
        console.log('📱 Cliente desconectado.');
      });
    });
  }

  private turnAccumulatedText: string = '';
  private lastCleanText: string = '';

  private isThinkingLine(line: string): boolean {
    const l = line.toLowerCase().trim();
    if (!l) return false;

    const thinkingKeywords = [
      'clarifying the',
      'grappling with',
      'lack of context',
      'my focus is',
      'need specifics',
      'responding to',
      'processed the',
      'decided a simple',
      'maintaining a natural',
      'my current plan',
      'i will follow',
      "i'll follow",
      'standard offer',
      'outlining response',
      'assistant persona',
      'the user wants',
      'the user is',
      'user actually wants',
      'narrow down the scope',
      'allow me to move forward',
      'taking action',
      'prevent me from',
      'ambiguity of',
      'locating information',
      'initiating search',
      'outlining'
    ];

    if (thinkingKeywords.some(kw => l.includes(kw))) {
      return true;
    }

    const words = l.match(/[a-záàâãéèêíïóôõöúçñ]+/g) || [];
    if (words.length < 4) return false;

    const englishCommon = new Set([
      'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
      'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there',
      'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no',
      'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then',
      'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first',
      'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us', 'user', 'request', 'focus',
      'action', 'context', 'specifics', 'topic', 'scope', 'clarifying'
    ]);

    const ptCommon = new Set([
      'o', 'a', 'os', 'as', 'que', 'de', 'da', 'do', 'em', 'para', 'com', 'não', 'um', 'uma', 'eu', 'você', 'se', 'por', 'mais',
      'como', 'mas', 'foi', 'ao', 'ele', 'das', 'dos', 'ter', 'seu', 'sua', 'ou', 'quando', 'muito', 'nos', 'já', 'também', 'só',
      'pelo', 'pela', 'até', 'isso', 'ela', 'entre', 'depois', 'sem', 'mesmo', 'aos', 'seus', 'quem', 'nas', 'me', 'esse', 'eles',
      'essa', 'num', 'nem', 'suas', 'meu', 'às', 'minha', 'numa', 'pelos', 'elas', 'qual', 'nós', 'lhe', 'deles', 'essas', 'esses',
      'pelas', 'este', 'dele', 'sobre', 'gostaria', 'resumo', 'notícias', 'jogo', 'assunto', 'fazer', 'ajudar'
    ]);

    let engCount = 0;
    let ptCount = 0;

    for (const w of words) {
      if (englishCommon.has(w)) engCount++;
      if (ptCommon.has(w)) ptCount++;
    }

    return engCount >= 3 && engCount > ptCount * 2;
  }

  private cleanTextMonologue(text: string): string {
    if (!text) return '';
    const lines = text.split('\n');
    const cleanLines = lines.filter(line => !this.isThinkingLine(line));
    return cleanLines.join('\n').trimStart();
  }

  private async initGeminiLiveSession(): Promise<void> {
    try {
      this.geminiLive = new GeminiLiveSession();

      this.geminiLive.on('audio_chunk', (pcm24kBase64: string) => {
        if (wakeWordManager.getState() !== 'SPEAKING') {
          wakeWordManager.setState('SPEAKING');
          this.broadcastState('SPEAKING');
        }

        this.broadcastToClients({
          type: 'LIVE_AUDIO_CHUNK',
          audioBase64: pcm24kBase64,
          sampleRate: 24000,
          format: 'pcm16',
        });
      });

      this.geminiLive.on('text_chunk', (text: string) => {
        this.turnAccumulatedText += text;
        const newCleanText = this.cleanTextMonologue(this.turnAccumulatedText);

        if (newCleanText.length > this.lastCleanText.length) {
          const delta = newCleanText.slice(this.lastCleanText.length);
          this.lastCleanText = newCleanText;

          if (wakeWordManager.getState() !== 'SPEAKING') {
            wakeWordManager.setState('SPEAKING');
            this.broadcastState('SPEAKING');
          }

          this.broadcastToClients({
            type: 'LIVE_TEXT_CHUNK',
            text: delta,
          });
        }
      });

      this.geminiLive.on('tool_call_start', (data: { name: string; args: any }) => {
        let actionLabel = `Executando ${data.name}...`;
        if (data.name === 'pesquisar_web') {
          actionLabel = `🔍 Pesquisando na web: "${data.args?.query || ''}"`;
        } else if (data.name === 'acessar_site') {
          actionLabel = `🌐 Lendo site: "${data.args?.url || ''}"`;
        } else if (data.name === 'ligar_pc') {
          actionLabel = `💻 Ligando computador...`;
        }

        this.broadcastToClients({
          type: 'PIPELINE_ACTION',
          action: actionLabel,
          status: 'running',
          tool: data.name
        });
      });

      this.geminiLive.on('tool_call_end', (data: { name: string; result?: any; error?: string }) => {
        this.broadcastToClients({
          type: 'PIPELINE_ACTION',
          action: `Concluído: ${data.name}`,
          status: data.error ? 'error' : 'done',
          tool: data.name
        });

        if (data.name === 'renderizar_grafico' && !data.error && data.result?.chartConfig) {
          this.broadcastToClients({
            type: 'LIVE_TEXT_CHUNK',
            text: `\n\`\`\`recharts\n${data.result.chartConfig}\n\`\`\`\n`
          });
        }
      });

      this.geminiLive.on('interrupted', () => {
        console.log('⚡ Barge-in: cancelando áudio no cliente.');
        this.turnAccumulatedText = '';
        this.lastCleanText = '';
        wakeWordManager.setState('LISTENING');
        this.broadcastState('LISTENING');
        this.broadcastToClients({ type: 'INTERRUPT' });
      });

      this.geminiLive.on('turn_complete', () => {
        this.turnAccumulatedText = '';
        this.lastCleanText = '';
        setTimeout(() => {
          const state = wakeWordManager.getState();
          if (state === 'SPEAKING' || state === 'PROCESSING') {
            wakeWordManager.setState('IDLE');
            this.broadcastState('IDLE');
          }
        }, 500);

        this.broadcastToClients({ type: 'TURN_COMPLETE' });
      });

      this.geminiLive.on('setup_complete', () => {
        console.log('🎤 Gemini Live pronto para receber áudio/texto!');
        this.broadcastToClients({
          type: 'LIVE_STATUS',
          connected: true,
        });
      });

      await this.geminiLive.connect();
    } catch (err: any) {
      console.warn('⚠️ Erro na inicialização do Gemini Live:', err.message);
    }
  }

  private async handleClientMessage(ws: WebSocket, payload: any): Promise<void> {
    const { type, base64Pcm, text, audioBase64 } = payload;

    switch (type) {
      case 'PCM_AUDIO_CHUNK': {
        if (!base64Pcm) return;

        const isSpeaking = wakeWordManager.getState() === 'SPEAKING';
        const wasInterrupted = vadManager.onUserAudioReceived(isSpeaking);
        if (wasInterrupted) {
          wakeWordManager.setState('LISTENING');
          this.broadcastState('LISTENING');
          this.broadcastToClients({ type: 'INTERRUPT' });
        }

        if (wakeWordManager.getState() !== 'LISTENING') {
          wakeWordManager.setState('LISTENING');
          this.broadcastState('LISTENING');
        }

        if (this.geminiLive) {
          this.geminiLive.sendAudioChunk(base64Pcm, 16000);
        }
        break;
      }

      case 'VOICE_AUDIO_BLOB': {
        wakeWordManager.setState('PROCESSING');
        this.broadcastState('PROCESSING');

        const safetyTimer = setTimeout(() => {
          if (wakeWordManager.getState() === 'PROCESSING') {
            wakeWordManager.setState('IDLE');
            this.broadcastState('IDLE');
          }
        }, 15000);

        await this.processCommandFallback(ws, audioBase64 || '');
        clearTimeout(safetyTimer);
        break;
      }

      case 'TEXT_COMMAND':
      case 'VOICE_COMMAND': {
        if (!text) return;
        console.log(`💬 Comando recebido: "${text}"`);

        wakeWordManager.setState('PROCESSING');
        this.broadcastState('PROCESSING');

        const liveSent = this.geminiLive?.isLiveConnected()
          ? this.geminiLive.sendTextPrompt(text)
          : false;

        const lowerText = text.toLowerCase();
        const needsCodeOrDetail = lowerText.includes('código') || lowerText.includes('codigo') ||
                                  lowerText.includes('python') || lowerText.includes('javascript') ||
                                  lowerText.includes('script') || lowerText.includes('html') ||
                                  lowerText.includes('função') || lowerText.includes('pesquis') ||
                                  lowerText.includes('fortaleza') || lowerText.includes('gráfico') ||
                                  lowerText.includes('grafico');

        if (!liveSent || needsCodeOrDetail) {
          await this.processTextFallback(ws, text);
        }
        break;
      }

      case 'USER_INTERRUPT': {
        console.log('🛑 Usuário solicitou interrupção.');
        wakeWordManager.setState('IDLE');
        this.broadcastState('IDLE');
        this.broadcastToClients({ type: 'INTERRUPT' });
        break;
      }

      default:
        break;
    }
  }

  private async processTextFallback(ws: WebSocket, commandText: string): Promise<void> {
    try {
      const result = await jasperAgent.processCommand(commandText, 0);

      wakeWordManager.setState('SPEAKING');
      this.broadcastState('SPEAKING');

      this.sendToClient(ws, {
        type: 'ASSISTANT_RESPONSE',
        text: result.responseText,
        routeType: result.routeType,
        toolsExecuted: result.toolsExecuted,
        metrics: result.metrics,
        audioBase64: null,
        transcribedText: commandText,
        useFallbackTTS: true,
      });

      setTimeout(() => {
        wakeWordManager.setState('IDLE');
        this.broadcastState('IDLE');
      }, 1500);
    } catch (err: any) {
      console.error('❌ Erro no processamento fallback:', err.message);
      this.sendToClient(ws, {
        type: 'ERROR',
        message: err.message,
      });
      wakeWordManager.setState('IDLE');
      this.broadcastState('IDLE');
    }
  }

  private async processCommandFallback(ws: WebSocket, audioBase64: string): Promise<void> {
    try {
      const { sttHandler } = await import('../voice/stt.js');
      const sttRes = await sttHandler.transcribeAudio(audioBase64);
      const commandText = sttRes.text || 'JASPER, que horas são?';

      await this.processTextFallback(ws, commandText);
    } catch (err: any) {
      console.error('❌ Erro no processamento de áudio fallback:', err.message);
      wakeWordManager.setState('IDLE');
      this.broadcastState('IDLE');
    }
  }

  public broadcastState(state: string): void {
    this.broadcastToClients({ type: 'STATE_CHANGE', state });
  }

  private sendState(ws: WebSocket, state: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'STATE_CHANGE', state }));
    }
  }

  private sendToClient(ws: WebSocket, payload: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  private broadcastToClients(payload: any): void {
    if (!this.wss) return;
    const json = JSON.stringify(payload);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    });
  }
}

export const jasperWsServer = new JasperWebSocketServer();
