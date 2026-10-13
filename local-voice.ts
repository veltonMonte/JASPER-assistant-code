import { WebSocket } from 'ws';
import { spawn, ChildProcess } from 'child_process';

const WS_URL = 'ws://localhost:3000/ws';

console.log('🤖 Iniciando Cliente Local de Voz (Notebook)...');
console.log(`Conectando em ${WS_URL}...`);

const ws = new WebSocket(WS_URL);

let isAssistantSpeaking = false;
let arecord: ChildProcess | null = null;
let aplay: ChildProcess | null = null;

ws.on('open', () => {
  console.log('✅ Conectado ao servidor JASPER!');
  
  // Inicia o processo de gravação do microfone local
  // Formato: 16-bit PCM, 1 canal (Mono), 16000 Hz, raw
  arecord = spawn('arecord', ['-f', 'S16_LE', '-c', '1', '-r', '16000', '-t', 'raw']);
  
  // Inicia o processo de reprodução no alto-falante
  // Formato do Gemini: 16-bit PCM, 1 canal (Mono), 24000 Hz, raw
  aplay = spawn('aplay', ['-f', 'S16_LE', '-c', '1', '-r', '24000', '-t', 'raw']);

  arecord.stdout?.on('data', (chunk: Buffer) => {
    if (ws.readyState === WebSocket.OPEN && !isAssistantSpeaking) {
      ws.send(JSON.stringify({
        type: 'PCM_AUDIO_CHUNK',
        base64Pcm: chunk.toString('base64')
      }));
    }
  });

  arecord.stderr?.on('data', (data) => {
    // Ignorar avisos de overrun do arecord
  });

  arecord.on('close', (code) => {
    console.log(`🎙️ Processo do microfone encerrado (código ${code})`);
  });

  aplay.on('close', (code) => {
    console.log(`🔊 Processo de áudio encerrado (código ${code})`);
  });
});

ws.on('message', (data: Buffer) => {
  try {
    const msg = JSON.parse(data.toString());
    
    if (msg.type === 'STATE_CHANGE') {
      isAssistantSpeaking = (msg.state === 'SPEAKING');
      console.log(`[JASPER] Estado alterado para: ${msg.state}`);
      
      if (msg.state === 'SPEAKING') {
        console.log('🔊 JASPER está falando (Microfone temporariamente mutado)');
      } else if (msg.state === 'LISTENING') {
        console.log('🎤 JASPER está ouvindo (Pode falar!)');
      }
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
      console.log('\n✅ Fim da resposta.');
    }
  } catch (err) {
    // Pode ser áudio binário ou JSON inválido, ignora
  }
});

ws.on('close', () => {
  console.log('❌ Conexão com o servidor encerrada.');
  if (arecord) arecord.kill();
  if (aplay) aplay.kill();
  process.exit(1);
});

ws.on('error', (err) => {
  console.error('❌ Erro no WebSocket:', err.message);
});

process.on('SIGINT', () => {
  console.log('Encerrando cliente local...');
  if (arecord) arecord.kill();
  if (aplay) aplay.kill();
  process.exit(0);
});
