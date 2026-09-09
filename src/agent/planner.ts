export interface SubTask {
  id: number;
  description: string;
  toolName?: string;
  args?: any;
  status: 'pending' | 'executing' | 'completed' | 'failed';
}

export class TaskPlanner {
  public plan(userPrompt: string): SubTask[] {
    const clean = userPrompt.toLowerCase();
    const tasks: SubTask[] = [];

    if (clean.includes('ligue meu pc e pesquise')) {
      tasks.push({
        id: 1,
        description: 'Ligar o computador do usuário via Wake-on-LAN',
        toolName: 'ligar_pc',
        status: 'pending',
      });
      tasks.push({
        id: 2,
        description: 'Realizar a pesquisa solicitada na web',
        toolName: 'pesquisar_web',
        status: 'pending',
      });
    } else {
      tasks.push({
        id: 1,
        description: 'Processar a solicitação com o cérebro principal Gemini',
        status: 'pending',
      });
    }

    return tasks;
  }
}

export const taskPlanner = new TaskPlanner();
