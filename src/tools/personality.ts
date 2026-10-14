import { dbManager, PersonalityConfig } from '../database/database.js';
import { formatTarsConfirmation } from '../ai/personality.js';
import { toolEvents } from '../events/toolEvents.js';

export async function ajustarPersonalidade(
  parametro: string,
  valor: number
): Promise<{ success: boolean; parametro: string; valor: number; message: string; personality: PersonalityConfig }> {
  const normParam = parametro.toLowerCase().trim() as keyof PersonalityConfig;
  const validTraits: Array<keyof PersonalityConfig> = [
    'humor',
    'honestidade',
    'sarcasmo',
    'formalidade',
    'verbosidade',
    'empatia',
  ];

  if (!validTraits.includes(normParam)) {
    throw new Error(
      `Parâmetro "${parametro}" inválido. Escolha entre: ${validTraits.join(', ')}.`
    );
  }

  const numVal = Math.max(0, Math.min(100, Math.round(Number(valor))));
  const updated = await dbManager.updatePersonality({ [normParam]: numVal });
  const message = formatTarsConfirmation(normParam, numVal, updated);

  // Notifica o WebSocket e o Gemini Live sobre a alteração
  toolEvents.emit('personality_updated', updated);

  return {
    success: true,
    parametro: normParam,
    valor: numVal,
    message,
    personality: updated,
  };
}

export async function consultarPersonalidade(
  parametro?: string
): Promise<{ success: boolean; message: string; personality: PersonalityConfig }> {
  const current = await dbManager.getPersonality();

  if (parametro) {
    const norm = parametro.toLowerCase().trim() as keyof PersonalityConfig;
    if (norm in current) {
      const val = current[norm];
      return {
        success: true,
        message: `Meu nível atual de ${norm} está calibrado em ${val}%.`,
        personality: current,
      };
    }
  }

  const message = formatTarsConfirmation('consulta', undefined, current);
  return {
    success: true,
    message,
    personality: current,
  };
}

export async function restaurarPersonalidadePadrao(): Promise<{
  success: boolean;
  message: string;
  personality: PersonalityConfig;
}> {
  const defaults = await dbManager.resetPersonality();
  const message = formatTarsConfirmation('padrao', undefined, defaults);

  toolEvents.emit('personality_updated', defaults);

  return {
    success: true,
    message,
    personality: defaults,
  };
}
