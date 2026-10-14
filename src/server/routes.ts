import { jasperWsServer } from "./websocket.js";
import { Router, Request, Response } from 'express';
import { dbManager } from '../database/database.js';
import { wakeWordManager } from '../voice/wakeword.js';
import { jasperAgent } from '../agent/agent.js';

const router = Router();

/**
 * Health check do servidor
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'online',
    assistant: 'JASPER',
    state: wakeWordManager.getState(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Retorna as memórias salvas no SQLite
 */
router.get('/memory', async (req: Request, res: Response) => {
  try {
    const memories = await dbManager.getAllMemories();
    res.json({ success: true, memories });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Endpoint REST para envio de comandos em texto
 */
router.post('/command', async (req: Request, res: Response) => {
  try {
    const { command } = req.body;
    if (!command) {
      return res.status(400).json({ success: false, error: 'O parâmetro "command" é obrigatório.' });
    }

    wakeWordManager.setState('PROCESSING');
    const result = await jasperAgent.processCommand(command, 0);
    wakeWordManager.setState('SPEAKING');

    setTimeout(() => {
      wakeWordManager.setState('IDLE');
    }, 1500);

    res.json({
      success: true,
      result,
    });
  } catch (err: any) {
    wakeWordManager.setState('ERROR');
    res.status(500).json({ success: false, error: err.message });
  }
});


/**
 * Consulta e atualiza os parâmetros de personalidade TARS
 */
router.get("/personality", async (req: Request, res: Response) => {
  try {
    const personality = await dbManager.getPersonality();
    res.json({ success: true, personality });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/personality", async (req: Request, res: Response) => {
  try {
    const updated = await dbManager.updatePersonality(req.body);
    jasperWsServer.broadcastToClients({
      type: "PERSONALITY_UPDATE",
      personality: updated,
    });
    res.json({ success: true, personality: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Status do microfone ativo (WO Mic vs Notebook)
 */
router.get("/audio/mic-status", (req: Request, res: Response) => {
  res.json({ activeMic: jasperWsServer.getActiveMic() });
});

router.post("/audio/mic-status", (req: Request, res: Response) => {
  const { activeMic } = req.body;
  if (activeMic === "womic" || activeMic === "notebook") {
    jasperWsServer.setActiveMic(activeMic);
    res.json({ success: true, activeMic });
  } else {
    res.status(400).json({ success: false, error: "activeMic deve ser 'womic' ou 'notebook'" });
  }
});

export default router;
