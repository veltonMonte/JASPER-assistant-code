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

  /**
   * Processa a entrada de voz do usuário. Se o JASPER estiver atualmente falando, dispara um evento de interrupção (Barge-in).
   */
  public onUserAudioReceived(isJasperSpeaking: boolean): boolean {
    if (isJasperSpeaking) {
      console.log('⚡ [VAD Barge-in] Usuário começou a falar durante a resposta do JASPER! Interrompendo áudio imediatamente...');
      this.state.interrupted = true;
      this.emit('interrupted');
      return true; // Retorna true para indicar que uma interrupção ocorreu
    }
    return false;
  }

  public reset(): void {
    this.state = {
      isSpeaking: false,
      userSpeechActive: false,
      interrupted: false,
    };
  }

  public getState(): VADState {
    return { ...this.state };
  }
}

export const vadManager = new VoiceActivityDetector();
