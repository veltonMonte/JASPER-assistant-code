export type AssistantState =
  | 'IDLE'
  | 'LISTENING'
  | 'PROCESSING'
  | 'EXECUTING'
  | 'SPEAKING'
  | 'ERROR';

export class WakeWordManager {
  private currentState: AssistantState = 'IDLE';
  private wakeWord: string = 'JASPER';

  public getState(): AssistantState {
    return this.currentState;
  }

  public setState(newState: AssistantState): void {
    console.log(`🔄 [Estado JASPER] ${this.currentState} -> ${newState}`);
    this.currentState = newState;
  }

  public isWakeWordDetected(text: string): boolean {
    const clean = text.toLowerCase();
    return clean.includes('jasper') || clean.includes('cody') || clean.includes('jaspe');
  }

  public extractCommandAfterWakeWord(text: string): string {
    const clean = text.trim();
    const match = clean.match(/(?:jasper|cody|jaspe)[,\s]*(.*)/i);
    if (match && match[1]) {
      return match[1].trim();
    }
    return text;
  }
}

export const wakeWordManager = new WakeWordManager();
