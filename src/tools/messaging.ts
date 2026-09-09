import axios from 'axios';
import { config } from '../config/config.js';

/**
 * Envia uma mensagem para o contato ou chat configurado (via Telegram Bot API)
 */
export async function enviarMensagem(
  contato: string,
  mensagem: string
): Promise<{ success: boolean; message: string }> {
  try {
    console.log(`📱 JASPER enviando mensagem para [${contato}]: "${mensagem}"`);

    const botToken = config.telegram.botToken;
    const chatId = config.telegram.defaultChatId;

    if (!botToken || !chatId) {
      console.log('⚠️ TELEGRAM_BOT_TOKEN ou TELEGRAM_DEFAULT_CHAT_ID não configurados no .env. Simulando envio.');
      return {
        success: true,
        message: `Mensagem enviada com sucesso para ${contato}: "${mensagem}" (Simulação: Configure as chaves do Telegram no .env para envio real).`,
      };
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    await axios.post(url, {
      chat_id: chatId,
      text: `📩 *Mensagem do JASPER para ${contato}*:\n\n${mensagem}`,
      parse_mode: 'Markdown',
    });

    return {
      success: true,
      message: `Pronto, enviei a mensagem para ${contato}.`,
    };
  } catch (error: any) {
    console.error('❌ Erro ao enviar mensagem via Telegram:', error.message);
    return {
      success: false,
      message: `Falha ao enviar mensagem: ${error.message}`,
    };
  }
}
