import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { config } from '../config/config.js';
import { JASPER_SYSTEM_PROMPT } from './prompts.js';
import { geminiToolDeclarations, executeToolByName } from '../tools/index.js';
import { dbManager } from '../database/database.js';

export class GeminiLiveSession extends EventEmitter {
  private ws: WebSocket | null = null;
  private isConnected: boolean = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private setupComplete: boolean = false;

  constructor() {
    super();
    this.on('error', (err: any) => {
      console.warn('⚠️ [GeminiLive] Erro capturado:', err.message || err);
    });
  }

  public isLiveConnected(): boolean {
    return this.isConnected && this.setupComplete && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public async connect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (!config.gemini.apiKey) {
      console.warn('⚠️ GEMINI_API_KEY não configurada no .env.');
      this.isConnected = false;
      return;
    }

    const host = 'generativelanguage.googleapis.com';
    const uri = `wss://${host}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${config.gemini.apiKey}`;

    console.log(`🔌 Conectando à Gemini Live API (${config.gemini.liveModel}, voz: ${config.gemini.voice})...`);

    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(uri);

        const connectionTimeout = setTimeout(() => {
          if (!this.isConnected) {
            console.warn('⚠️ Timeout ao conectar com a Gemini Live API.');
            if (this.ws) this.ws.close();
            this.scheduleReconnect();
            resolve();
          }
        }, 8000);

        this.ws.on('open', async () => {
          clearTimeout(connectionTimeout);
          console.log('✅ Conexão WebSocket com a Gemini Live API estabelecida!');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          await this.sendSetupHandshake();
          resolve();
        });

        this.ws.on('message', async (data: Buffer) => {
          try {
            const response = JSON.parse(data.toString());
            await this.handleGeminiMessage(response);
          } catch (err: any) {
            console.error('Erro ao ler mensagem da Gemini Live API:', err.message);
          }
        });

        this.ws.on('error', (err) => {
          clearTimeout(connectionTimeout);
          console.warn('⚠️ Erro na conexão Gemini Live WebSocket:', err.message);
          this.isConnected = false;
          this.setupComplete = false;
          this.emit('error', err);
          resolve();
        });

        this.ws.on('close', (code, reason) => {
          const reasonStr = reason ? reason.toString() : 'sem motivo';
          console.log(`🔌 Gemini Live WebSocket desconectado (code: ${code}, reason: ${reasonStr})`);
          this.isConnected = false;
          this.setupComplete = false;
          this.scheduleReconnect();
        });
      } catch (err) {
        this.isConnected = false;
        this.setupComplete = false;
        this.scheduleReconnect();
        resolve();
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('⚠️ Máximo de tentativas de reconexão atingido.');
      return;
    }

    const delay = Math.min(2000 * Math.pow(1.5, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    console.log(`🔄 Reconectando ao Gemini Live em ${Math.round(delay / 1000)}s (tentativa ${this.reconnectAttempts})...`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      await this.connect();
    }, delay);
  }

  private async sendSetupHandshake(): Promise<void> {
    if (!this.ws || !this.isConnected) return;

    const memories = await dbManager.getAllMemories();
    let memorySummary = '';
    if (memories.length > 0) {
      memorySummary = '\nMEMÓRIAS PERSISTENTES DO USUÁRIO:\n' +
        memories.map((m) => `- ${m.key}: ${m.value}`).join('\n') + '\n';
    }

    const now = new Date();
    const fmtStr = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now);
    
    // Calcula o ISO string no fuso horário correto
    const tzDate = new Date(now.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
    const isoStr = tzDate.getFullYear() + "-" + String(tzDate.getMonth()+1).padStart(2, '0') + "-" + String(tzDate.getDate()).padStart(2, '0') + " " + String(tzDate.getHours()).padStart(2, '0') + ":" + String(tzDate.getMinutes()).padStart(2, '0') + ":" + String(tzDate.getSeconds()).padStart(2, '0');
    
    const timeContext = `\n[CONTEXTO DE TEMPO DA CONEXÃO]\nO horário que esta sessão iniciou em Brasília (America/Sao_Paulo) foi: ${fmtStr}.\n(Formato ISO: ${isoStr}).\nATENÇÃO: Este horário pode estar desatualizado! Você DEVE SEMPRE chamar a ferramenta 'consultarHorario' ANTES de agendar qualquer alarme para saber a hora ATUAL exata e calcular o tempo corretamente!\n`;

    const fullPrompt = JASPER_SYSTEM_PROMPT + memorySummary + timeContext +
      '\nVocê é JASPER e está conversando por voz em tempo real. Responda com voz natural e objetiva em português do Brasil.';

    const setupPayload = {
      setup: {
        model: `models/${config.gemini.liveModel}`,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: config.gemini.voice || 'Charon',
              },
            },
          },
        },
        systemInstruction: {
          parts: [{ text: fullPrompt }],
        },
        tools: [
          {
            functionDeclarations: geminiToolDeclarations as any,
          },
        ],
      },
    };

    this.ws.send(JSON.stringify(setupPayload));
    console.log(`⚙️ Handshake Setup enviado (voz: ${config.gemini.voice || 'Charon'}).`);
  }

  public sendAudioChunk(base64PcmAudio: string, sampleRate: number = 16000): boolean {
    if (!this.isLiveConnected()) return false;

    const audioPayload = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: `audio/pcm;rate=${sampleRate}`,
            data: base64PcmAudio,
          },
        ],
      },
    };

    this.ws!.send(JSON.stringify(audioPayload));
    return true;
  }

  public forceTurnComplete(): boolean {
    // No Gemini Live API, o streaming de áudio já utiliza o VAD neural automático do servidor Gemini.
    // Enviar clientContent sem turns gera erro 1007 (invalid argument) e derruba a conexão WebSocket.
    return true;
  }

  public sendTextPrompt(text: string): boolean {
    if (!this.isLiveConnected()) return false;

    const textPayload = {
      clientContent: {
        turns: [
          {
            role: 'user',
            parts: [{ text }],
          },
        ],
        turnComplete: true,
      },
    };

    this.ws!.send(JSON.stringify(textPayload));
    return true;
  }

  private async handleGeminiMessage(response: any): Promise<void> {
    if (response.setupComplete) {
      console.log('✅ Gemini Live Setup concluído com sucesso!');
      this.setupComplete = true;
      this.emit('setup_complete');
      return;
    }

    if (response.toolCall) {
      const functionCalls = response.toolCall.functionCalls;
      if (functionCalls && Array.isArray(functionCalls)) {
        for (const fc of functionCalls) {
          console.log(`🛠️ Gemini Live solicitou chamada de função: [${fc.name}]`, fc.args);
          
          // Emite evento de status da pipeline para a interface web/mobile
          this.emit('tool_call_start', { name: fc.name, args: fc.args });

          try {
            const toolResult = await executeToolByName(fc.name, fc.args || {});
            this.emit('tool_call_end', { name: fc.name, result: toolResult });
            this.sendToolResponse(fc.id || fc.name, fc.name, toolResult);
          } catch (err: any) {
            console.error(`❌ Erro ao executar ferramenta [${fc.name}]:`, err.message);
            this.emit('tool_call_end', { name: fc.name, error: err.message });
            this.sendToolResponse(fc.id || fc.name, fc.name, { error: err.message });
          }
        }
      }
      return;
    }

    const serverContent = response.serverContent;
    if (!serverContent) return;

    // serverContent received (omitted raw base64 audio dump to save log space)

    if (serverContent.interrupted) {
      console.log('⚡ Gemini Live confirmou interrupção!');
      this.emit('interrupted');
      return;
    }

    const parts = serverContent.modelTurn?.parts;
    if (parts && Array.isArray(parts)) {
      for (const part of parts) {
        // Part received

        if (part.inlineData && part.inlineData.data) {
          this.emit('audio_chunk', part.inlineData.data);
        }

        if (part.text) {
          this.emit('text_chunk', part.text);
        }
      }
    }

    if (serverContent.turnComplete) {
      console.log('🏁 Gemini turnComplete');
      this.emit('turn_complete');
    }
  }

  private sendToolResponse(callId: string, name: string, result: any): void {
    if (!this.ws || !this.isConnected || this.ws.readyState !== WebSocket.OPEN) return;

    const responsePayload = {
      toolResponse: {
        functionResponses: [
          {
            name: name,
            id: callId,
            response: { output: result },
          },
        ],
      },
    };

    this.ws.send(JSON.stringify(responsePayload));
    console.log(`✅ Resultado da ferramenta [${name}] enviado para o Gemini Live.`);
  }

  public close(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
      this.setupComplete = false;
    }
  }
}
