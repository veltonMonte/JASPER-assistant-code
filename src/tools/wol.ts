import wol from 'wake_on_lan';
import { env } from '../config/config';

/**
 * Liga o computador desktop via Wake-on-LAN.
 */
export async function turnOnPC(): Promise<string> {
  const macAddress = env.DESKTOP_MAC_ADDRESS || '00:00:00:00:00:00';
  
  if (macAddress === '00:00:00:00:00:00') {
    return 'O endereço MAC do computador não foi configurado. Por favor, adicione o DESKTOP_MAC_ADDRESS no arquivo .env.';
  }

  return new Promise((resolve) => {
    wol.wake(macAddress, (error: any) => {
      if (error) {
        console.error('❌ [JASPER] Erro ao enviar Magic Packet (WoL):', error);
        resolve(`Houve um erro ao tentar ligar o computador: ${error.message || error}`);
      } else {
        console.log(`🚀 [JASPER] Pacote Wake-on-LAN enviado para MAC: ${macAddress}`);
        resolve('O pacote mágico foi enviado com sucesso. O computador deve estar ligando agora.');
      }
    });
  });
}
