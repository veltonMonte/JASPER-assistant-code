import { dbManager } from '../database/database.js';

/**
 * Retorna o horário e a data atual formatados em português do Brasil
 */
export async function consultarHorario(): Promise<{ data: string; hora: string; message: string }> {
  const agora = new Date();
  
  const optionsHora: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  };
  
  const optionsData: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Sao_Paulo',
  };

  const hora = agora.toLocaleTimeString('pt-BR', optionsHora);
  const data = agora.toLocaleDateString('pt-BR', optionsData);

  return {
    data,
    hora,
    message: `Hoje é ${data} e agora são ${hora}.`,
  };
}

/**
 * Cria um lembrete para o usuário
 */
export async function criarLembrete(
  dataHorario: string,
  texto: string
): Promise<{ success: boolean; message: string }> {
  const key = `lembrete_${Date.now()}`;
  const val = JSON.stringify({ dataHorario, texto, criadoEm: new Date().toISOString() });
  
  await dbManager.saveMemory(key, val, 'lembrete');
  
  return {
    success: true,
    message: `Lembrete agendado para "${dataHorario}": ${texto}`,
  };
}

/**
 * Agenda um alarme ou compromisso no sistema ativo
 */
export async function agendarAlarme(
  tipo: 'alarm' | 'agenda',
  dataHorario: string,
  mensagem: string
): Promise<{ success: boolean; message: string }> {
  // dataHorario esperado no formato YYYY-MM-DD HH:MM:SS
  try {
    await dbManager.createAlarm(tipo, dataHorario, mensagem);
    return {
      success: true,
      message: `✅ ${tipo === 'alarm' ? 'Alarme' : 'Compromisso'} agendado com sucesso para ${dataHorario}.`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Erro ao agendar: ${err.message}`,
    };
  }
}

/**
 * Salva uma informação na memória persistente SQLite do JASPER
 */
export async function salvarMemoria(
  chave: string,
  valor: string,
  categoria: string = 'general'
): Promise<{ success: boolean; message: string }> {
  await dbManager.saveMemory(chave, valor, categoria);
  return {
    success: true,
    message: `Informação "${chave}" salva na memória com sucesso.`,
  };
}

/**
 * Busca uma informação da memória persistente
 */
export async function buscarMemoria(chave: string): Promise<{ encontrada: boolean; valor: string | null; message: string }> {
  const valor = await dbManager.getMemory(chave);
  if (valor !== null) {
    return {
      encontrada: true,
      valor,
      message: `Encontrado na memória para "${chave}": ${valor}`,
    };
  }
  return {
    encontrada: false,
    valor: null,
    message: `Nenhuma informação registrada para "${chave}".`,
  };
}
