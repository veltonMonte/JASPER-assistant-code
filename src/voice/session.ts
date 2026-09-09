export type LiveSessionStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'LISTENING'
  | 'SPEAKING'
  | 'INTERRUPTED'
  | 'ERROR';

export class LiveAudioSession {
  private sessionId: string;
  private status: LiveSessionStatus = 'DISCONNECTED';
  private startTime: number;

  constructor(sessionId: string = `session_${Date.now()}`) {
    this.sessionId = sessionId;
    this.startTime = Date.now();
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public getStatus(): LiveSessionStatus {
    return this.status;
  }

  public setStatus(newStatus: LiveSessionStatus): void {
    console.log(`🎙️ [Sessão Live ${this.sessionId}] Alteração de estado: ${this.status} -> ${newStatus}`);
    this.status = newStatus;
  }

  public getUptimeMs(): number {
    return Date.now() - this.startTime;
  }
}
