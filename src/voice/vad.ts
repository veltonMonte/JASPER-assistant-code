import { EventEmitter } from 'events';

export interface VADState {
  isSpeaking: boolean;
  userSpeechActive: boolean;
  interrupted: boolean;
}

export class VoiceActivityDetector extends EventEmitter {
  private state: VADState = {
    isSpeaking: false,
    userSpeechActive: false,
    interrupted: false,
  };

  private silenceTimer: NodeJS.Timeout | null = null;
  public isUserCurrentlySpeaking = false;
  private noiseFloor = 1000;
  private isSilence = true;

  /**
   * Processa a entrada de voz do usuário. Se o JASPER estiver atualmente falando, dispara um evento de interrupção (Barge-in).
   */
  public onUserAudioReceived(isJasperSpeaking: boolean): boolean {
    if (isJasperSpeaking && this.isUserCurrentlySpeaking) {
      console.log('⚡ [VAD Barge-in] Usuário começou a falar durante a resposta do JASPER! Interrompendo áudio imediatamente...');
      this.state.interrupted = true;
      this.emit('interrupted');
      return true;
    }
    return false;
  }

  /**
   * Analisa a energia do áudio para detectar fim de fala usando piso de ruído dinâmico.
   */
  public processAudioEnergy(base64Pcm: string): boolean {
    const buffer = Buffer.from(base64Pcm, 'base64');
    let maxAmp = 0;
    
    // Calcula a amplitude máxima no chunk (16-bit PCM)
    for (let i = 0; i < buffer.length - 1; i += 2) {
      const sample = buffer.readInt16LE(i);
      if (Math.abs(sample) > maxAmp) {
        maxAmp = Math.abs(sample);
      }
    }

    // Atualiza o piso de ruído dinamicamente (adapta-se ao ambiente)
    if (maxAmp > 0) {
      this.noiseFloor = (this.noiseFloor * 0.99) + (maxAmp * 0.01);
    }
    // Evita que o noiseFloor suba muito rápido durante a fala
    const threshold = Math.max(1000, this.noiseFloor * 2.5); 

    const SILENCE_DURATION_MS = 1200; // 1.2s de silêncio

    if (maxAmp > threshold) {
      // Usuário está falando
      this.isUserCurrentlySpeaking = true;
      this.isSilence = false;
      
      // Reseta o timer de silêncio
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
      return true; // Áudio com fala
    } else {
      this.isSilence = true;
      // Silêncio detectado (energia baixa)
      if (this.isUserCurrentlySpeaking && !this.silenceTimer) {
        this.silenceTimer = setTimeout(() => {
          console.log(`🔇 [VAD] Silêncio detectado no servidor. NoiseFloor: ${this.noiseFloor.toFixed(0)}, Threshold: ${threshold.toFixed(0)}, MaxAmp: ${maxAmp}`);
          this.isUserCurrentlySpeaking = false;
          this.silenceTimer = null;
          this.emit('silence_detected');
        }, SILENCE_DURATION_MS);
      }
      // Mesmo com energia baixa, se o usuário estava falando recentemente, repassa o áudio para o Gemini processar o silêncio final
      return this.isUserCurrentlySpeaking;
    }
  }

  public reset(): void {
    this.state = {
      isSpeaking: false,
      userSpeechActive: false,
      interrupted: false,
    };
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = null;
    this.isUserCurrentlySpeaking = false;
  }

  public getState(): VADState {
    return { ...this.state };
  }
}

export const vadManager = new VoiceActivityDetector();
