import { exec } from 'child_process';

/**
 * Solicita a abertura de um programa no computador
 */
export async function abrirPrograma(programa: string): Promise<{ success: boolean; message: string }> {
  try {
    console.log(`🚀 JASPER executando abertura do programa: "${programa}"`);

    // Mapeamento de nomes amigáveis para comandos executáveis
    const appMap: Record<string, string> = {
      'vs code': 'code',
      'vscode': 'code',
      'visual studio code': 'code',
      'chrome': 'google-chrome || chrome || start chrome',
      'navegador': 'google-chrome || start chrome',
      'firefox': 'firefox',
      'spotify': 'spotify',
      'steam': 'steam',
      'calculadora': 'calc',
      'bloco de notas': 'notepad',
    };

    const cmd = appMap[programa.toLowerCase()] || programa;

    // Executa comando localmente ou emite instrução para PC de destino
    exec(cmd, (err) => {
      if (err) {
        console.warn(`Aviso ao tentar executar programa localmente: ${err.message}`);
      }
    });

    return {
      success: true,
      message: `Abrindo o programa ${programa}.`,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Não foi possível abrir o programa ${programa}: ${error.message}`,
    };
  }
}
