import crypto from "crypto";
import { toolEvents } from "../events/toolEvents.js";
import { dbManager } from "../database/database.js";

export interface PendingDeviceRequest {
  id: string;
  deviceId: string;
  deviceName: string;
  ip: string;
  createdAt: number;
  timer: NodeJS.Timeout;
}

const pendingRequests = new Map<string, PendingDeviceRequest>();
const REQUEST_TIMEOUT_MS = 120_000; // 2 minutos

/**
 * Cria ou recupera uma solicitação pendente de acesso à rede para um dispositivo.
 */
export async function requestDeviceAccess(
  deviceId: string,
  deviceName: string,
  ip: string
): Promise<{ id: string; pending: boolean; immediate?: boolean; approved?: boolean; token?: string }> {
  // O ID do dispositivo não comprova posse. Sem o token, é preciso pedir
  // aprovação novamente. Reutiliza uma solicitação que ainda esteja pendente.
  for (const [id, req] of pendingRequests.entries()) {
    if (req.deviceId === deviceId) {
      return { id, pending: true, immediate: false };
    }
  }

  // 3. Cria nova solicitação pendente
  const id = "dev-req-" + Date.now();
  await dbManager.saveDeviceRequest(deviceId, deviceName, ip);

  const timer = setTimeout(() => {
    void resolveDeviceAccess(id, false, "timeout");
  }, REQUEST_TIMEOUT_MS);

  const pending: PendingDeviceRequest = {
    id,
    deviceId,
    deviceName,
    ip,
    createdAt: Date.now(),
    timer,
  };

  pendingRequests.set(id, pending);

  // Emite evento para os clientes Master (web principal) e Gemini
  toolEvents.emit("device_access_requested", {
    id,
    deviceId,
    deviceName,
    ip,
    requestedAt: pending.createdAt,
  });

  console.log(`[Dispositivos] Nova solicitação de acesso: "${deviceName}" (${deviceId}) de ${ip}`);
  return { id, pending: true, immediate: false };
}

/**
 * Resolve a solicitação de acesso (aprova ou nega).
 */
export async function resolveDeviceAccess(
  id?: string,
  approved: boolean = false,
  source: "voice" | "ui" | "tool" | "timeout" = "ui"
): Promise<{ success: boolean; approved: boolean; deviceName?: string; deviceId?: string; token?: string; message: string }> {
  if (source !== 'ui' && !(source === 'timeout' && !approved)) return { success: false, approved: false, message: 'A decisão de acesso deve ser registrada pela interface do computador principal.' };
  let req: PendingDeviceRequest | undefined;

  if (id) {
    req = pendingRequests.get(id);
  } else {
    // Pega a solicitação pendente mais recente
    const all = [...pendingRequests.values()];
    req = all[all.length - 1];
  }

  if (!req) {
    return {
      success: false,
      approved: false,
      message: "Nenhuma solicitação de dispositivo pendente no momento.",
    };
  }

  pendingRequests.delete(req.id);
  clearTimeout(req.timer);

  if (approved) {
    const token = "jasper_dev_" + crypto.randomUUID();
    await dbManager.approveDevice(req.deviceId, token);

    toolEvents.emit("device_access_resolved", {
      id: req.id,
      deviceId: req.deviceId,
      deviceName: req.deviceName,
      approved: true,
      token,
      source,
    });

    console.log(`[Dispositivos] Acesso PERMITIDO para "${req.deviceName}" (${source})`);
    return {
      success: true,
      approved: true,
      deviceId: req.deviceId,
      deviceName: req.deviceName,
      token,
      message: `Dispositivo "${req.deviceName}" autorizado com sucesso.`,
    };
  } else {
    await dbManager.denyDevice(req.deviceId);

    toolEvents.emit("device_access_resolved", {
      id: req.id,
      deviceId: req.deviceId,
      deviceName: req.deviceName,
      approved: false,
      source,
    });

    console.log(`[Dispositivos] Acesso NEGADO para "${req.deviceName}" (${source})`);
    return {
      success: true,
      approved: false,
      deviceId: req.deviceId,
      deviceName: req.deviceName,
      message: `Acesso negado para o dispositivo "${req.deviceName}".`,
    };
  }
}

/**
 * Retorna a solicitação pendente atual (se houver).
 */
export function getPendingDeviceRequest(): PendingDeviceRequest | null {
  const all = [...pendingRequests.values()];
  return all.length > 0 ? all[all.length - 1] : null;
}

/**
 * Lista todos os dispositivos registrados.
 */
export async function listarDispositivos(): Promise<any> {
  const list = await dbManager.listAuthorizedDevices();
  return {
    success: true,
    total: list.length,
    dispositivos: list,
  };
}

/**
 * Remove autorização de um dispositivo.
 */
export async function removerDispositivo(deviceId: string): Promise<any> {
  await dbManager.removeDevice(deviceId);
  return {
    success: true,
    message: "Dispositivo removido com sucesso.",
  };
}
