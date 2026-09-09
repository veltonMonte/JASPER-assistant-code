/**
 * TTS Handler - Módulo de Fallback Mínimo
 * 
 * A voz principal do JASPER vem diretamente do Gemini Live API (áudio PCM nativo).
 * Este módulo existe apenas como fallback extremo caso o Gemini Live não esteja disponível.
 * Nesse caso, o cliente usará a Web Speech API (speechSynthesis) do navegador.
 */

export interface TTSResult {
  audioBase64: string | null;
  text: string;
  durationMs: number;
}

export class TextToSpeechHandler {
  /**
   * Fallback mínimo - retorna null para audioBase64
   * O cliente usará speechSynthesis do navegador como último recurso
   */
  public async synthesize(text: string): Promise<TTSResult> {
    const startTime = Date.now();
    console.log(`🔊 [TTS Fallback] Áudio será sintetizado pelo navegador para: "${text.substring(0, 50)}..."`);

    return {
      audioBase64: null,
      text,
      durationMs: Date.now() - startTime,
    };
  }
}

export const ttsHandler = new TextToSpeechHandler();
