/**
 * Alterna o estado de um dispositivo da casa (Mockup para Home Assistant / Tuya / etc)
 */
export async function toggleDevice(deviceName: string, state: 'on' | 'off'): Promise<string> {
  console.log(`🏠 [JASPER Smart Home] Recebida solicitação para alterar [${deviceName}] para [${state}]`);
  
  // Aqui entraria a chamada real para o Home Assistant via REST/WebSocket
  // Ex: await axios.post(`http://homeassistant.local:8123/api/services/switch/turn_${state}`, ...)
  
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(`O dispositivo ${deviceName} foi ${state === 'on' ? 'ligado' : 'desligado'} com sucesso.`);
    }, 500);
  });
}

/**
 * Consulta o status atual de um dispositivo (Mockup)
 */
export async function getDeviceStatus(deviceName: string): Promise<string> {
  console.log(`🏠 [JASPER Smart Home] Consultando status de [${deviceName}]`);
  
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(`O dispositivo ${deviceName} parece estar desligado no momento.`);
    }, 300);
  });
}
