import { withSceneSession } from '../presentation/scene-session.js';
import { beginSceneTurn } from '../presentation/scene-generation.js';
import { voicePreferences } from '../voice/preferences.js';
import { VOICE_OPTIONS, validateVoiceSettings } from '../voice/profiles.js';
import { jasperWsServer } from "./websocket.js";
import { Router, Request, Response } from 'express';
import { dbManager } from '../database/database.js';
import { wakeWordManager } from '../voice/wakeword.js';
import { jasperAgent } from '../agent/agent.js';

import { proactiveService } from '../proactive/runtime.js';
import { naturalSpeechService } from '../voice/natural-speech.js';
import { createRequireAuth } from '../security/auth.js';
import { config } from '../config/config.js';
import { verificarSegurancaSistema } from '../tools/system-security.js';

const router = Router();
const requireAuth = createRequireAuth(token => jasperWsServer.isVoiceSessionAuthorized(token), config.security.token);
router.use((req, res, next) => {
  if (req.method === 'GET' && req.path === '/health') { next(); return; }
  requireAuth(req, res, next);
});

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
    const visualSession=jasperWsServer.visualSessionForToken((req.header('authorization')||'').replace(/^Bearer\s+/i,''));
    beginSceneTurn(visualSession);
    const result = await withSceneSession(visualSession,()=>jasperAgent.processCommand(command,0));
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
 * Consulta e atualiza os preferências de conversa do Jasper
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
    await jasperWsServer.refreshVoice();
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

router.get('/voice/preferences', async (_req: Request, res: Response) => {
  try { res.json({ settings: await voicePreferences.get(), voices: VOICE_OPTIONS }); }
  catch { res.status(503).json({ error: 'Não foi possível carregar a voz.' }); }
});
router.put('/voice/preferences', async (req: Request, res: Response) => {
  if (wakeWordManager.getState() !== 'IDLE') { res.status(409).json({ error: 'Espere o Jasper terminar a conversa para trocar a voz.' }); return; }
  try {
    const settings = await voicePreferences.update(req.body);
    await jasperWsServer.refreshVoice();
    res.json({ settings, voices: VOICE_OPTIONS });
  } catch (error: any) { res.status(400).json({ error: error.message || 'Não foi possível salvar a voz.' }); }
});

router.post('/voice/speak', async (req: Request, res: Response) => {
  const { text, style } = req.body || {};
  if (typeof text !== 'string' || !text.trim() || text.length > 1200) {
    res.status(400).json({ error: 'Envie um texto entre 1 e 1200 caracteres para a leitura.' });
    return;
  }
  if (style !== undefined && style !== 'default' && style !== 'lesson') {
    res.status(400).json({ error: 'Estilo de voz inválido.' });
    return;
  }
  let preview;
  try { if (req.body.preview !== undefined) preview = validateVoiceSettings(req.body.preview, await voicePreferences.get()); }
  catch (error: any) { res.status(400).json({ error: error.message }); return; }
  const controller = new AbortController();
  const cancel = () => { if (!res.writableEnded) controller.abort(); };
  res.on('close', cancel);
  try {
    const wav = await naturalSpeechService.speak(text.trim(), controller.signal, preview, style || 'default');
    if (!controller.signal.aborted) {
      res.setHeader('Cache-Control', 'no-store');
      res.type('audio/wav').send(wav);
    }
  } catch {
    if (!controller.signal.aborted) res.status(503).json({ error: 'A voz natural está indisponível no momento. Tente ouvir novamente em instantes.' });
  } finally { res.off('close', cancel); }
});

router.get('/proactive', (_req: Request, res: Response) => {
  const snapshot = proactiveService.snapshot();
  res.status(snapshot.ready ? 200 : 503).json(snapshot);
});
router.put('/proactive', async (req: Request, res: Response) => {
  try { res.json(await proactiveService.update(req.body)); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});
router.post('/proactive/refresh', async (_req: Request, res: Response) => {
  try {
    // Honor the normal polling limit, including repeated clicks from multiple clients.
    await proactiveService.tick();
    res.json(proactiveService.snapshot());
  } catch { res.status(502).json({ error: 'Não foi possível consultar as notícias agora.' }); }
});

router.get('/security/status', async (_req: Request, res: Response) => {
  try {
    const report = await verificarSegurancaSistema(false);
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/security/scan', async (_req: Request, res: Response) => {
  try {
    const report = await verificarSegurancaSistema(true);
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
