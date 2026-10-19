import { WebSocket } from 'ws';
import { spawn, ChildProcess, execSync } from 'child_process';

const args = process.argv.slice(2);
function getArg(name: string, def: string): string {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return def;
}
const rawServerUrl = getArg('--server', getArg('--host', process.env.JASPER_SERVER_URL || 'ws://localhost:3000/ws'));
let WS_URL = rawServerUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
if (!WS_URL.endsWith('/ws')) {
  WS_URL = WS_URL.replace(/\/$/, '') + '/ws';
}

console.log('🤖 Iniciando Cliente Local de Voz do JASPER (Notebook / Satélite)...');

let isAssistantSpeaking = false;
let arecord: ChildProcess | null = null;
let aplay: ChildProcess | null = null;
let ws: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;

function startAplay() {
  if (aplay) {
    try { aplay.kill('SIGKILL'); } catch (e) {}
    aplay = null;
  }
  aplay = spawn('aplay', ['-f', 'S16_LE', '-c', '1', '-r', '24000', '-t', 'raw']);
  aplay.on('close', (code) => {
    console.log(`🔊 Processo de áudio encerrado (código ${code})`);
  });
}

function connect() {
  console.log(`🔌 Conectando em ${WS_URL}...`);
  ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('✅ Conectado ao servidor JASPER!');
    
    // Dispositivo de entrada: usa o microfone padrão do sistema (gerenciado pelo PipeWire)
    // Suporta tanto o microfone do notebook quanto o WO Mic (via troca de source)
    const micDevice = process.env.MIC_DEVICE || "";
    console.log(`🎙️ Dispositivo de entrada: ${micDevice || "Padrão do Sistema (Notebook / WO Mic)"}`);

    if (arecord) {
      arecord.kill();
      arecord = null;
    }
    startAplay();
    console.log('🔊 Alto-falante ativo via aplay nas caixas do dispositivo.');

    const arecordArgs = micDevice
      ? ['-D', micDevice, '-f', 'S16_LE', '-c', '1', '-r', '16000', '-t', 'raw']
      : ['-f', 'S16_LE', '-c', '1', '-r', '16000', '-t', 'raw'];
    
    arecord = spawn('arecord', arecordArgs);

    // Envio contínuo de áudio para permitir detecção de interrupção (barge-in) pelo servidor/Gemini Live
    arecord.stdout?.on('data', (chunk: Buffer) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'PCM_AUDIO_CHUNK',
          base64Pcm: chunk.toString('base64')
        }));
      }
    });

    arecord.stderr?.on('data', () => {});
    arecord.on('close', (code) => {
      console.log(`🎙️ Processo do microfone encerrado (código ${code})`);
    });
  });

  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());
      
      if (msg.type === 'STATE_CHANGE') {
        isAssistantSpeaking = (msg.state === 'SPEAKING');
        if (msg.state === 'SPEAKING') {
          console.log('🔊 JASPER está falando (Microfone ativo para interrupção natural)');
        } else if (msg.state === 'LISTENING') {
          console.log('🎤 JASPER está ouvindo...');
        }
      }

      if (msg.type === 'INTERRUPT') {
        console.log('⚡ [Barge-in] Interrupção detectada! Cortando áudio imediatamente...');
        isAssistantSpeaking = false;
        startAplay();
      }

      if (msg.type === 'LIVE_AUDIO_CHUNK' && msg.audioBase64) {
        const pcmBuffer = Buffer.from(msg.audioBase64, 'base64');
        if (aplay?.stdin && !aplay.stdin.destroyed) {
          aplay.stdin.write(pcmBuffer);
        }
      }
      
      if (msg.type === 'LIVE_TEXT_CHUNK' && msg.text) {
        process.stdout.write(msg.text);
      }
      
      if (msg.type === 'TURN_COMPLETE') {
        console.log('\n✅ Fim da resposta.\n');
      }
    } catch (err) {}
  });

  ws.on('close', () => {
    console.log('⚠️ Conexão perdida. Tentando reconectar em 3s...');
    if (arecord) {
      try { arecord.kill('SIGKILL'); } catch(e) {}
      arecord = null;
    }
    if (aplay) {
      try { aplay.kill('SIGKILL'); } catch(e) {}
      aplay = null;
    }
    if (ws) {
      ws.removeAllListeners();
      ws = null;
    }
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 3000);
    }
  });

  ws.on('error', (err) => {
    console.error('❌ Erro no WebSocket:', err.message);
  });
}

connect();

process.on('SIGINT', () => {
  console.log('Encerrando cliente local...');
  if (arecord) arecord.kill();
  if (aplay) aplay.kill();
  process.exit(0);
});
