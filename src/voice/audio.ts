export interface AudioChunk {
  data: string; // Base64 do PCM
  sampleRate: number;
  mimeType: string;
}

export class AudioConverter {
  /**
   * Converte um buffer de PCM em string Base64 para envio à Gemini Live API
   */
  public static bufferToBase64(buffer: Buffer): string {
    return buffer.toString('base64');
  }

  /**
   * Converte string Base64 recebida da Gemini Live API em Buffer PCM
   */
  public static base64ToBuffer(base64: string): Buffer {
    return Buffer.from(base64, 'base64');
  }

  /**
   * Cria o objeto no formato esperado pela Gemini Live API (mediaChunks)
   */
  public static createRealtimeMediaChunk(base64Pcm: string, sampleRate: number = 16000): any {
    return {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: `audio/pcm;rate=${sampleRate}`,
            data: base64Pcm,
          },
        ],
      },
    };
  }
}
