import { WebSocket } from "ws";
import { dbManager } from "../database/database.js";
import { toolEvents } from "../events/toolEvents.js";

export interface TerminalAgent {
  ws: WebSocket;
  deviceId: string;
  deviceName: string;
  platform: string;
  connectedAt: number;
}

const connectedAgents = new Map<string, TerminalAgent>();

export async function registerTerminalAgent(
  ws: WebSocket,
  payload: { deviceId: string; deviceName: string; platform: string; token: string }
): Promise<boolean> {
  // Valida token no banco de dados
  const device = await dbManager.getDeviceByToken(payload.token);
  if (!device || device.device_id !== payload.deviceId) {
    console.warn(`[TerminalRemoto] Tentativa de registro de agente rejeitada para "${payload.deviceName}": token inválido.`);
    ws.send(JSON.stringify({ type: "TERMINAL_AGENT_ERROR", message: "Token de autenticação inválido ou não autorizado." }));
    return false;
  }

  const agent: TerminalAgent = {
    ws,
    deviceId: payload.deviceId,
    deviceName: payload.deviceName,
    platform: payload.platform || "unknown",
    connectedAt: Date.now(),
  };

  connectedAgents.set(payload.deviceId, agent);
  console.log(`💻 [TerminalRemoto] Agente de terminal conectado: "${payload.deviceName}" (${payload.platform})`);

  ws.send(JSON.stringify({
    type: "TERMINAL_AGENT_REGISTERED",
    success: true,
    message: `Terminal de "${payload.deviceName}" conectado ao JASPER.`,
  }));

  ws.on("close", () => {
    connectedAgents.delete(payload.deviceId);
    console.log(`💻 [TerminalRemoto] Agente de terminal desconectado: "${payload.deviceName}"`);
  });

  return true;
}

export function getConnectedTerminalAgents(): Array<{ deviceId: string; deviceName: string; platform: string }> {
  return [...connectedAgents.values()].map((a) => ({
    deviceId: a.deviceId,
    deviceName: a.deviceName,
    platform: a.platform,
  }));
}

export function executeOnRemoteAgent(
  targetDevice: string,
  command: string,
  timeoutMs: number = 30000
): Promise<{ success: boolean; comando: string; output: string; error?: string; message: string }> {
  return new Promise((resolve) => {
    // Procura agente por deviceId ou nome
    let agent: TerminalAgent | undefined;
    for (const a of connectedAgents.values()) {
      if (a.deviceId === targetDevice || a.deviceName.toLowerCase() === targetDevice.toLowerCase()) {
        agent = a;
        break;
      }
    }

    if (!agent || agent.ws.readyState !== WebSocket.OPEN) {
      return resolve({
        success: false,
        comando: command,
        output: "",
        error: "Dispositivo não encontrado ou agente de terminal desconectado.",
        message: `Não foi possível comunicar com o dispositivo "${targetDevice}". Verifique se o agente jasper-agent está em execução nele.`,
      });
    }

    const execId = "exec-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);

    const timer = setTimeout(() => {
      toolEvents.removeAllListeners("remote_exec_result_" + execId);
      resolve({
        success: false,
        comando: command,
        output: "",
        error: "Timeout na execução remota",
        message: `Tempo limite de ${timeoutMs / 1000}s excedido aguardando resposta de "${agent?.deviceName}".`,
      });
    }, timeoutMs);

    toolEvents.once("remote_exec_result_" + execId, (res: any) => {
      clearTimeout(timer);
      resolve({
        success: res.success,
        comando: command,
        output: res.output || "",
        error: res.error,
        message: res.success ? "Comando executado remotamente com sucesso." : "Falha na execução do comando remoto.",
      });
    });

    agent.ws.send(JSON.stringify({
      type: "EXECUTE_REMOTE_COMMAND",
      execId,
      command,
    }));
  });
}
