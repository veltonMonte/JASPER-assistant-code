export interface ChatMessage {
  role: 'user' | 'model' | 'function';
  parts: Array<{ text?: string; functionCall?: any; functionResponse?: any }>;
}

export class ContextManager {
  private messages: ChatMessage[] = [];
  private maxHistory: number = 10; // Mantém até 10 turnos de mensagem na memória temporária

  public addMessage(message: ChatMessage): void {
    this.messages.push(message);
    if (this.messages.length > this.maxHistory * 2) {
      this.messages = this.messages.slice(-this.maxHistory * 2);
    }
  }

  public addUserMessage(text: string): void {
    this.addMessage({
      role: 'user',
      parts: [{ text }],
    });
  }

  public addModelMessage(text: string): void {
    this.addMessage({
      role: 'model',
      parts: [{ text }],
    });
  }

  public getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  public clear(): void {
    this.messages = [];
  }
}

export const sessionContext = new ContextManager();
