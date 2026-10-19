export interface MicrophoneConditions {
  enabled: boolean;
  connected: boolean;
  authorized: boolean;
  liveReady: boolean;
  visible: boolean;
  capturing: boolean;
}

/** Serializes capture and retries transient failures without repeating a denied permission prompt. */
export class AutomaticMicrophone {
  private pending = false;
  private blocked = false;
  private failures = 0;
  private retryAt = 0;

  allowRetry(): void { this.blocked = false; this.failures = 0; this.retryAt = 0; }

  async resume(conditions: MicrophoneConditions, start: () => Promise<void>): Promise<void> {
    if (this.pending || this.blocked || Date.now() < this.retryAt || !conditions.enabled || !conditions.connected || !conditions.authorized
      || !conditions.liveReady || !conditions.visible || conditions.capturing) return;
    this.pending = true;
    try { await start(); this.failures = 0; this.retryAt = 0; }
    catch (error) {
      const name = error instanceof Error ? error.name : '';
      const message = error instanceof Error ? error.message : String(error);
      if (['NotAllowedError', 'SecurityError', 'PermissionDeniedError'].includes(name) || /NotAllowedError|Permission denied/i.test(message)) {
        this.blocked = true;
      } else {
        this.failures++;
        this.retryAt = Date.now() + Math.min(1000 * 2 ** (this.failures - 1), 10_000);
      }
    }
    finally { this.pending = false; }
  }
}
