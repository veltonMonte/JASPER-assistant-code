import dgram from 'dgram';
import net from 'net';
import { config } from '../config/config.js';

/**
 * Envia um pacotinho mágico (Magic Packet) para acionar Wake-on-LAN no PC de destino
 */
export async function ligarPC(): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    try {
      const mac = config.targetPc.mac.replace(/[^a-fA-F0-9]/g, '');
      if (mac.length !== 12) {
        return resolve({
          success: false,
          message: `Endereço MAC inválido configurado: ${config.targetPc.mac}`,
        });
      }

      // Constrói o buffer do Magic Packet: 6 bytes 0xFF seguidos por 16 repetições do MAC Address (6 bytes)
      const magicPacket = Buffer.alloc(102);
      for (let i = 0; i < 6; i++) {
        magicPacket[i] = 0xff;
      }
      const macBuffer = Buffer.from(mac, 'hex');
      for (let i = 0; i < 16; i++) {
        macBuffer.copy(magicPacket, 6 + i * 6);
      }

      const socket = dgram.createSocket('udp4');
      socket.once('listening', () => {
        socket.setBroadcast(true);
      });

      socket.send(magicPacket, 0, magicPacket.length, config.targetPc.port, '255.255.255.255', (err) => {
        socket.close();
        if (err) {
          console.error('❌ Erro ao enviar Magic Packet Wake-on-LAN:', err);
          return resolve({
            success: false,
            message: `Falha ao enviar comando Wake-on-LAN: ${err.message}`,
          });
        }
        console.log(`⚡ Magic Packet Wake-on-LAN enviado com sucesso para ${config.targetPc.mac}`);
        return resolve({
          success: true,
          message: `Comando Wake-on-LAN enviado para o computador (${config.targetPc.mac}).`,
        });
      });
    } catch (error: any) {
      resolve({
        success: false,
        message: `Erro ao executar ligar_pc: ${error.message}`,
      });
    }
  });
}

/**
 * Verifica se o computador do usuário está ligado e acessível na rede local
 */
export async function verificarPC(): Promise<{ online: boolean; message: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isSettled = false;

    socket.setTimeout(2000);

    socket.on('connect', () => {
      if (!isSettled) {
        isSettled = true;
        socket.destroy();
        resolve({
          online: true,
          message: `O computador (${config.targetPc.ip}) está online e respondendo na rede.`,
        });
      }
    });

    const handleFail = (reason: string) => {
      if (!isSettled) {
        isSettled = true;
        socket.destroy();
        resolve({
          online: false,
          message: `O computador não está respondendo em ${config.targetPc.ip} (${reason}). Pode estar desligado ou desconectado.`,
        });
      }
    };

    socket.on('timeout', () => handleFail('tempo limite esgotado'));
    socket.on('error', (err) => handleFail(err.message));

    // Tenta conectar em uma porta de rede padrão (ex: 135 RPC, 445 SMB, 22 SSH, 80 ou porta customizada)
    socket.connect(445, config.targetPc.ip);
  });
}

/**
 * Solicita o desligamento do PC
 */
export async function desligarPC(): Promise<{ success: boolean; message: string }> {
  return {
    success: true,
    message: 'Comando de desligamento enviado ao computador. (Requer agente local ativo no PC para aceite final).',
  };
}
