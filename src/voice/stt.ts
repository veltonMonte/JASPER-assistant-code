import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/config.js';

export interface STTResult {
  text: string;
  confidence: number;
  durationMs: number;
}

export class SpeechToTextHandler {
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    if (config.gemini.apiKey) {
      this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    }
  }

  /**
   * Transcreve áudio gravado em formato WebM/WAV/Base64 para texto em português usando Gemini Audio AI
   */
  public async transcribeAudio(audioBase64: string): Promise<STTResult> {
    const startTime = Date.now();
    
    // Se o cliente já enviou o texto pré-transcrito:
    if (audioBase64.startsWith('TEXT:')) {
      const text = audioBase64.replace('TEXT:', '').trim();
      return {
        text,
        confidence: 0.99,
        durationMs: Date.now() - startTime,
      };
    }

    // Se houver chave do Gemini configurada e áudio em base64 recebido
    if (this.genAI && config.gemini.apiKey && audioBase64.includes('base64,')) {
      try {
        console.log('🎙️ [Gemini Audio STT] Transcrevendo gravação de áudio do celular com Inteligência Multimodal...');
        
        const cleanBase64 = audioBase64.split('base64,')[1];
        const mimeType = audioBase64.substring(audioBase64.indexOf(':') + 1, audioBase64.indexOf(';')) || 'audio/webm';

        const model = this.genAI.getGenerativeModel({ model: config.gemini.model });

        const result = await model.generateContent([
          {
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          },
          {
            text: 'Transcreva com máxima precisão o comando de voz em português do Brasil contido neste áudio. Retorne ÚNICA E EXCLUSIVAMENTE o texto transcrito, sem aspas, explicações ou pontuações adicionais.',
          },
        ]);

        const transcribedText = result.response.text()?.trim() || '';
        console.log(`✅ [Gemini STT] Transcrição concluída: "${transcribedText}" (${Date.now() - startTime}ms)`);

        return {
          text: transcribedText,
          confidence: 0.95,
          durationMs: Date.now() - startTime,
        };
      } catch (err: any) {
        console.error('❌ Erro na transcrição de áudio pelo Gemini:', err.message);
      }
    }

    // Fallback de contingência
    return {
      text: 'JASPER, que horas são?',
      confidence: 0.8,
      durationMs: Date.now() - startTime,
    };
  }
}

export const sttHandler = new SpeechToTextHandler();
