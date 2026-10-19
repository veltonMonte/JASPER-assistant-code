/**
 * TTS Handler - Módulo de Fallback Mínimo
 * 
 * A voz principal do JASPER vem diretamente do Gemini Live API (áudio PCM nativo).
 * Este módulo existe apenas como fallback extremo caso o Gemini Live não esteja disponível.
 * Nesse caso, o cliente solicita um WAV de voz natural ao endpoint /api/voice/speak.
 */

export interface TTSResult {
  audioBase64: string | null;
  text: string;
  durationMs: number;
}

export class TextToSpeechHandler {
  /**
   * Fallback mínimo - retorna null para audioBase64
   * O cliente usa a voz Gemini configurada, sem sintetizador robótico do navegador
   */
  public async synthesize(text: string): Promise<TTSResult> {
    const startTime = Date.now();
    console.log(`🔊 [TTS Fallback] Áudio natural será solicitado pelo cliente para: "${text.substring(0, 50)}..."`);

    return {
      audioBase64: null,
      text,
      durationMs: Date.now() - startTime,
    };
  }
}

export const ttsHandler = new TextToSpeechHandler();
