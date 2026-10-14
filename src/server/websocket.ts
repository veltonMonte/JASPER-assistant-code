import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { wakeWordManager } from '../voice/wakeword.js';
import { GeminiLiveSession } from '../ai/gemini-live.js';
import { jasperAgent } from '../agent/agent.js';
import { vadManager } from '../voice/vad.js';
import { toolEvents } from '../events/toolEvents.js';

export class JasperWebSocketServer {
  private wss: WebSocketServer | null = null;
  private geminiLive: GeminiLiveSession | null = null;
  private pendingTerminalApprovalId: string | null = null;
  private activeClient: WebSocket | null = null;

  public init(server: Server): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    console.log('📡 Servidor WebSocket inicializado no endpoint /ws');

    // Subscribe to tool events
    toolEvents.on('request_terminal_approval', (payload: { id: string; command: string; riskLevel?: string }) => {
      this.pendingTerminalApprovalId = payload.id;
      this.broadcastToClients({
        type: 'TERMINAL_APPROVAL_REQUEST',
        id: payload.id,
        command: payload.command,
        riskLevel: payload.riskLevel || 'medium',
      });
    });

    vadManager.on('silence_detected', () => {
      if (this.geminiLive && this.geminiLive.isLiveConnected()) {
        console.log('🔇 [WebSocket] Silêncio detectado pelo VAD, aguardando Gemini processar.');
        this.geminiLive.forceTurnComplete();
        wakeWordManager.setState('PROCESSING');
        this.broadcastState('PROCESSING');
      }
    });

    toolEvents.on('pipeline_action_start', (payload: { tool: string; args?: any }) => {
      let actionText = `Executando ${payload.tool}...`;
      if (payload.tool === 'pesquisar_web') actionText = `Pesquisando na web: "${payload.args?.query || ''}"`;
      else if (payload.tool === 'pesquisar_imagens') actionText = `🖼️ Buscando imagens na web: "${payload.args?.query || ''}"`;
      else if (payload.tool === 'acessar_site') actionText = `Lendo site: "${payload.args?.url || ''}"`;
      else if (payload.tool === 'executar_terminal') actionText = `Executando comando no terminal: "${payload.args?.comando || ''}"`;
      else if (payload.tool === 'renderizar_grafico') actionText = `Gerando estrutura de gráfico Recharts`;
      else if (payload.tool === 'salvar_memoria') actionText = `Registrando memória: "${payload.args?.chave || ''}"`;
      else if (payload.tool === 'buscar_memoria') actionText = `Buscando memórias gravadas`;
      else if (payload.tool === 'toggle_device') actionText = `Alterando dispositivo "${payload.args?.deviceName}" para ${payload.args?.state}`;

      this.broadcastToClients({
        type: 'PIPELINE_ACTION',
        action: actionText,
        status: 'running',
        tool: payload.tool,
        args: payload.args,
      });
    });

    toolEvents.on('pipeline_action_end', (payload: { tool: string; durationMs: number; success: boolean; args?: any; result?: any }) => {
      let actionText = `Concluído: ${payload.tool}`;
      if (payload.tool === 'pesquisar_web') actionText = `Pesquisa concluída (${payload.durationMs}ms)`;
      else if (payload.tool === 'pesquisar_imagens') actionText = `Galeria de imagens pronta (${payload.durationMs}ms)`;
      else if (payload.tool === 'acessar_site') actionText = `Página analisada com sucesso`;
      else if (payload.tool === 'executar_terminal') actionText = `Comando finalizado no terminal: "${payload.args?.comando || ''}"`;
      else if (payload.tool === 'renderizar_grafico') actionText = `Gráfico renderizado`;
      else if (payload.tool === 'renderizar_video') actionText = `Reprodutor de vídeo exibido`;
      else if (payload.tool === 'salvar_memoria') actionText = `Memória persistida no banco`;

      this.broadcastToClients({
        type: 'PIPELINE_ACTION',
        action: actionText,
        status: payload.success ? 'done' : 'error',
        tool: payload.tool,
        durationMs: payload.durationMs,
        command: payload.args?.comando,
        output: payload.result?.output || payload.result?.message,
        error: payload.result?.error,
      });

      if (payload.tool === 'renderizar_tabela' && payload.success && payload.result?.tableConfig) {
        this.broadcastToClients({
          type: 'LIVE_TEXT_CHUNK',
          text: `\n\`\`\`table\n${payload.result.tableConfig}\n\`\`\`\n`
        });
      }

      if (payload.tool === 'pesquisar_imagens' && payload.success && payload.result?.images?.length > 0) {
        this.broadcastToClients({
          type: 'LIVE_TEXT_CHUNK',
          text: `\n\`\`\`images\n${JSON.stringify({ query: payload.result.query, images: payload.result.images })}\n\`\`\`\n`
        });
      }

      if (payload.tool === 'renderizar_video' && payload.success && payload.result?.url) {
        this.broadcastToClients({
          type: 'LIVE_TEXT_CHUNK',
          text: `\n\`\`\`video\n${JSON.stringify({ url: payload.result.url })}\n\`\`\`\n`
        });
      }

      if (payload.tool === 'executar_terminal' && payload.success) {
        const cmd = payload.args?.comando || '';
        const out = payload.result?.output || payload.result?.message || '';
        if (cmd || out) {
          this.broadcastToClients({
            type: 'LIVE_TEXT_CHUNK',
            text: `\n\`\`\`bash\n$ ${cmd}\n${out}\n\`\`\`\n`
          });
        }
      }
    });

    this.initGeminiLiveSession();

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('📱 Cliente conectado ao WebSocket.');

      // Reseta o estado global para IDLE sempre que um novo cliente conectar
      // Isso evita que o servidor fique travado em PROCESSING/SPEAKING se uma conexão anterior cair.
      wakeWordManager.setState('IDLE');

      this.sendState(ws, wakeWordManager.getState());

      this.sendToClient(ws, {
        type: 'LIVE_STATUS',
        connected: this.geminiLive?.isLiveConnected() || false,
      });

      ws.on('message', async (data: Buffer | string, isBinary: boolean) => {
        if (isBinary || (Buffer.isBuffer(data) && data[0] !== 123)) {
          const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as string);
          const base64Pcm = buf.toString('base64');
          
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

          // Analisa energia do áudio para controle de silêncio e conclusão de turno
          vadManager.processAudioEnergy(base64Pcm);

          if (this.geminiLive) {
            this.geminiLive.sendAudioChunk(base64Pcm, 16000);
          } else {
            console.warn('⚠️ [MOBILE] GeminiLive NÃO está conectado! Áudio descartado.');
          }
          return;
        }

        try {
          const textData = data.toString();
          const payload = JSON.parse(textData);
          if (payload.type !== "PCM_AUDIO_CHUNK") {
          console.log(`📨 [MSG] type=${payload.type} | keys=${Object.keys(payload).join(',')}`);
          }
          
          // Tratar mensagem "setup" do APK nativo (ignorar, já configuramos no server)
          if (payload.type === 'setup') {
            console.log('📱 [MOBILE] Mensagem de setup recebida do APK nativo (ignorada, já configurado).');
            return;
          }
          
          await this.handleClientMessage(ws, payload);
        } catch (error: any) {
          console.error('❌ Erro ao ler mensagem WebSocket:', error.message);
        }
      });

      ws.on('close', () => {
        console.log('📱 Cliente desconectado.');
        if (this.activeClient === ws) {
          this.activeClient = null;
        }
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
      'locating information',
      'initiating search',
      'outlining',
      'addressing the timeout',
      're-testing terminal access',
      'testing terminal',
      'addressing',
      'test execution'
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
    return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trimStart();
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

        if (data.name === 'renderizar_tabela' && !data.error && data.result?.tableConfig) {
          this.broadcastToClients({
            type: 'LIVE_TEXT_CHUNK',
            text: `\n\`\`\`table\n${data.result.tableConfig}\n\`\`\`\n`
          });
        }
        if (data.name === 'renderizar_video' && !data.error && data.result?.url) {
          this.broadcastToClients({
            type: 'LIVE_TEXT_CHUNK',
            text: `\n\`\`\`video\n${JSON.stringify({ url: data.result.url })}\n\`\`\`\n`
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
    
    // O cliente que enviou a mensagem se torna o cliente ativo
    this.activeClient = ws;

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

        if (wakeWordManager.getState() === 'IDLE') {
          wakeWordManager.setState('LISTENING');
          this.broadcastState('LISTENING');
        }

        // Analisa a energia do áudio para controle de estado local e barge-in
        vadManager.processAudioEnergy(base64Pcm);

        if (this.geminiLive && this.geminiLive.isLiveConnected()) {
          this.geminiLive.sendAudioChunk(base64Pcm, 16000);
        }
        break;
      }

      case 'SPEECH_ENDED': {
        console.log('🔇 [WebSocket] SPEECH_ENDED recebido do APK Nativo. Aguardando Gemini VAD processar silêncio.');
        vadManager.reset();
        if (this.geminiLive && this.geminiLive.isLiveConnected()) {
          this.geminiLive.forceTurnComplete();
          wakeWordManager.setState('PROCESSING');
          this.broadcastState('PROCESSING');
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

      case 'TERMINAL_APPROVAL_RESPONSE': {
        const { id, approved, customCommand, remember } = payload;
        if (id === this.pendingTerminalApprovalId) {
          this.pendingTerminalApprovalId = null;
        }
        toolEvents.emit(`terminal_approval_response_${id}`, { approved, customCommand, remember });
        this.broadcastToClients({
          type: 'TERMINAL_APPROVAL_STATUS_UPDATE',
          id,
          approved,
          customCommand,
          remember,
        });
        break;
      }

      case 'MOBILE_LOG':
        if (text) console.log(`📱 [MOBILE_LOG] ${text}`);
        break;

      case 'TEXT_COMMAND':
      case 'VOICE_COMMAND': {
        if (!text) return;
        console.log(`💬 Comando recebido: "${text}"`);

        const lowerText = text.toLowerCase().trim();
        
        // Dynamic voice/text approval recognition for pending requests
        if (this.pendingTerminalApprovalId) {
          const isAffirmative = isAffirmativeApproval(lowerText);
          const isNegative = isNegativeDenial(lowerText);

          if (isAffirmative) {
            console.log(`[Terminal] Comando aprovado por voz/texto: "${text}"`);
            const approvalId = this.pendingTerminalApprovalId;
            this.pendingTerminalApprovalId = null;
            toolEvents.emit(`terminal_approval_response_${approvalId}`, { approved: true });
            this.broadcastToClients({
              type: 'TERMINAL_APPROVAL_STATUS_UPDATE',
              id: approvalId,
              approved: true,
            });
            return; // Consume turn
          }

          if (isNegative) {
            console.log(`[Terminal] Comando negado por voz/texto: "${text}"`);
            const approvalId = this.pendingTerminalApprovalId;
            this.pendingTerminalApprovalId = null;
            toolEvents.emit(`terminal_approval_response_${approvalId}`, { approved: false });
            this.broadcastToClients({
              type: 'TERMINAL_APPROVAL_STATUS_UPDATE',
              id: approvalId,
              approved: false,
            });
            return; // Consume turn
          }
        }

        if (this.geminiLive && this.geminiLive.isLiveConnected()) {
          console.log(`[WebSocket] Roteando comando de texto para Gemini Live: "${text}"`);
          this.geminiLive.sendTextPrompt(text);
          wakeWordManager.setState('PROCESSING');
          this.broadcastState('PROCESSING');
        } else {
          console.log(`[WebSocket] Gemini Live indisponível, usando fallback de texto: "${text}"`);
          wakeWordManager.setState('PROCESSING');
          this.broadcastState('PROCESSING');
          await this.processTextFallback(ws, text);
        }
        break;
      }

      case 'USER_INTERRUPT': {
        console.log('🛑 Usuário solicitou interrupção.');
        if (this.pendingTerminalApprovalId) {
          toolEvents.emit(`terminal_approval_response_${this.pendingTerminalApprovalId}`, { approved: false });
          this.pendingTerminalApprovalId = null;
        }
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

      if (this.geminiLive && this.geminiLive.isLiveConnected()) {
        console.log(`[WebSocket] Roteando Blob de áudio transcrito para Gemini Live: "${commandText}"`);
        this.geminiLive.sendTextPrompt(commandText);
      } else {
        await this.processTextFallback(ws, commandText);
      }
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

  public broadcastToClients(payload: any): void {
    if (!this.wss) return;
    const json = JSON.stringify(payload);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    });
  }

  public sendToActiveClient(payload: any): void {
    if (this.activeClient && this.activeClient.readyState === WebSocket.OPEN) {
      this.activeClient.send(JSON.stringify(payload));
    } else {
      // Fallback: se não tiver activeClient, faz broadcast
      this.broadcastToClients(payload);
    }
  }
}

export const jasperWsServer = new JasperWebSocketServer();

function isAffirmativeApproval(text: string): boolean {
  const clean = text.toLowerCase().trim().replace(/[.,!?;:]/g, '');
  
  const exactAffirmatives = [
    'sim', 's', 'y', 'yes', 'ok', 'pode', 'pode rodar', 'pode executar',
    'manda ver', 'executa', 'executar', 'autorizado', 'aprovar', 'aprovo',
    'confirmo', 'confirmado', 'vai em frente', 'pode ser', 'positivo',
    'claro', 'bora', 'com certeza', 'autorizo', 'vai', 'manda', 'faça isso',
    'mandar bala', 'roda aí', 'manda ver jasper', 'vai lá', 'dale',
    'de acordo', 'permito', 'permitido', 'aceito', 'pode fazer', 'faz aí', 'faz isso'
  ];
  
  if (exactAffirmatives.includes(clean)) return true;

  const phraseTriggers = [
    'pode rodar', 'pode executar', 'pode fazer', 'manda ver', 'pode ir',
    'está autorizado', 'esta autorizado', 'comando aprovado', 'pode dar o comando',
    'pode dar enter', 'executa aí', 'executa ai', 'roda o comando', 'manda bala',
    'vai em frente', 'pode dar segmento', 'com certeza pode', 'claro que sim'
  ];
  
  return phraseTriggers.some(trigger => clean.includes(trigger));
}

function isNegativeDenial(text: string): boolean {
  const clean = text.toLowerCase().trim().replace(/[.,!?;:]/g, '');
  
  const exactNegatives = [
    'não', 'nao', 'n', 'no', 'negar', 'cancelar', 'recusar', 'parar',
    'aborta', 'abortar', 'nem pensar', 'esquece', 'cancela', 'não pode',
    'nao pode', 'negado', 'recusado', 'pare', 'parar', 'não autorizo'
  ];

  if (exactNegatives.includes(clean)) return true;

  const phraseTriggers = [
    'não rode', 'nao rode', 'não execute', 'nao execute', 'não faça',
    'nao faça', 'cancela isso', 'não autorizo', 'nao autorizo', 'parar execução',
    'de jeito nenhum', 'de forma alguma', 'deixa para lá', 'deixa pra lá'
  ];

  return phraseTriggers.some(trigger => clean.includes(trigger));
}
