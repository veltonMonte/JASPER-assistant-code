import { dbManager } from '../database/database.js';

export class AgentMemoryManager {
  /**
   * Salva um fato importante na memória permanente
   */
  public async rememberFact(key: string, value: string, category: string = 'general'): Promise<void> {
    await dbManager.saveMemory(key, value, category);
  }

  /**
   * Resgata uma informação da memória
   */
  public async recallFact(key: string): Promise<string | null> {
    return await dbManager.getMemory(key);
  }

  /**
   * Retorna resumo de todas as memórias ativas
   */
  public async getMemorySummary(): Promise<string> {
    const list = await dbManager.getAllMemories();
    if (list.length === 0) return 'Nenhuma memória registrada.';
    return list.map((item) => `[${item.category}] ${item.key}: ${item.value}`).join('; ');
  }
}

export const memoryManager = new AgentMemoryManager();
