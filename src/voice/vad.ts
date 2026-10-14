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
  private noiseFloor = 800;
  private isSilence = true;
  private speakingStartTime = 0;

  public notifyAssistantSpeaking(speaking: boolean): void {
    if (speaking) {
      this.speakingStartTime = Date.now();
      this.reset();
    } else {
      this.speakingStartTime = 0;
    }
  }

  /**
   * Processa a entrada de voz do usuário. Se o JASPER estiver atualmente falando há pelo menos 600ms, dispara interrupção.
   */
  public onUserAudioReceived(isJasperSpeaking: boolean): boolean {
    if (!isJasperSpeaking) return false;
    
    // Ignora os primeiros 600ms de fala do assistente para evitar ecos residuais
    if (Date.now() - this.speakingStartTime < 600) return false;

    if (this.isUserCurrentlySpeaking) {
      console.log('⚡ [VAD Barge-in] Usuário começou a falar durante a resposta do JASPER! Interrompendo áudio imediatamente...');
      this.state.interrupted = true;
      this.emit('interrupted');
      return true;
    }
    return false;
  }

  /**
   * Analisa a energia do áudio para detectar fala com limiar dinâmico protegido contra saturação.
   */
  public processAudioEnergy(base64Pcm: string): boolean {
    const buffer = Buffer.from(base64Pcm, 'base64');
    let maxAmp = 0;
    
    // Calcula a amplitude máxima no chunk (16-bit PCM)
    for (let i = 0; i < buffer.length - 1; i += 2) {
      const sample = Math.abs(buffer.readInt16LE(i));
      if (sample > maxAmp) {
        maxAmp = sample;
      }
    }

    // Atualiza o piso de ruído apenas se for ruído ambiente baixo (evita que a voz humana infle o piso)
    if (maxAmp > 0 && maxAmp < 3000) {
      this.noiseFloor = (this.noiseFloor * 0.98) + (maxAmp * 0.02);
    }
    // Trava o piso de ruído em limites realistas
    this.noiseFloor = Math.max(400, Math.min(2500, this.noiseFloor));
    
    // Threshold calibrado para voz humana clara
    const threshold = Math.max(1800, this.noiseFloor * 1.8);
    const SILENCE_DURATION_MS = 1000;

    if (maxAmp > threshold) {
      this.isUserCurrentlySpeaking = true;
      this.isSilence = false;
      
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
      return true;
    } else {
      this.isSilence = true;
      if (this.isUserCurrentlySpeaking && !this.silenceTimer) {
        this.silenceTimer = setTimeout(() => {
          this.isUserCurrentlySpeaking = false;
          this.silenceTimer = null;
          this.emit('silence_detected');
        }, SILENCE_DURATION_MS);
      }
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
