import { spawnDetached } from '../security/process.js';

const APP_MAP: Record<string, { bin: string; args: string[] }> = {
  'vs code': { bin: 'code', args: [] }, vscode: { bin: 'code', args: [] },
  'visual studio code': { bin: 'code', args: [] }, chrome: { bin: 'google-chrome', args: [] },
  navegador: { bin: 'google-chrome', args: [] }, firefox: { bin: 'firefox', args: [] },
  spotify: { bin: 'spotify', args: [] }, steam: { bin: 'steam', args: [] },
  calculadora: { bin: 'gnome-calculator', args: [] }, 'bloco de notas': { bin: 'gedit', args: [] },
};

/**
 * Solicita a abertura de um programa no computador
 */
export async function abrirPrograma(programa: string): Promise<{ success: boolean; message: string }> {
  try {
    const name = typeof programa === 'string' ? programa.trim().toLowerCase() : '';
    const app = Object.hasOwn(APP_MAP, name) ? APP_MAP[name] : undefined;
    if (!app) return { success: false, message: 'Programa não permitido.' };
    await spawnDetached(app.bin, app.args);

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
