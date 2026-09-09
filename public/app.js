// JASPER AI Personal Assistant - Web Client (Gemini Live Audio Streaming)

let ws = null;
let isRecording = false;
let isLiveStreaming = false;
let geminiLiveConnected = false;
let mediaRecorder = null;
let audioChunks = [];
let recordTimeout = null;

// Web Audio API - PCM Player para Gemini Live
let audioContext = null;
let pcmQueue = [];
let isPlaying = false;
let nextPlayTime = 0;

// Streaming Mic (PCM capture)
let micStream = null;
let micProcessor = null;
let micSource = null;

// Elementos do DOM
const connectionStatus = document.getElementById('connectionStatus');
const statusMessage = document.getElementById('statusMessage');
const transcriptPreview = document.getElementById('transcriptPreview');
const chatFeed = document.getElementById('chatFeed');
const orbCore = document.getElementById('orbCore');
const cmdInput = document.getElementById('cmdInput');
const micBtn = document.getElementById('micBtn');

// Métricas de Telemetria
const metricStt = document.getElementById('metricStt');
const metricRouter = document.getElementById('metricRouter');
const metricGemini = document.getElementById('metricGemini');
const metricTools = document.getElementById('metricTools');
const metricTotal = document.getElementById('metricTotal');

// --- Inicializa AudioContext (necessário para reproduzir PCM) ---
function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    console.log('🔊 AudioContext inicializado (24kHz para Gemini Live)');
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

// --- 1. Conexão WebSocket ---
function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${location.host}/ws`;

  console.log(`🔌 Conectando ao WebSocket JASPER: ${wsUrl}`);
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('✅ WebSocket conectado ao servidor JASPER.');
    connectionStatus.className = 'connection-status online';
    connectionStatus.querySelector('.status-text').innerText = 'Online';
    addChatBubble('system', 'Conectado ao servidor JASPER.');
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleServerMessage(data);
    } catch (err) {
      console.error('Erro ao ler mensagem do servidor:', err);
    }
  };

  ws.onclose = () => {
    connectionStatus.className = 'connection-status offline';
    connectionStatus.querySelector('.status-text').innerText = 'Reconectando...';
    geminiLiveConnected = false;
    setTimeout(connectWebSocket, 3000);
  };
}

// --- 2. Trata Mensagens do Servidor ---
function handleServerMessage(data) {
  switch (data.type) {
    case 'STATE_CHANGE':
      if (!isRecording && !isLiveStreaming) {
        updateState(data.state);
      }
      break;

    case 'LIVE_STATUS':
      geminiLiveConnected = data.connected;
      console.log(`🎤 Gemini Live: ${data.connected ? 'CONECTADO ✅' : 'DESCONECTADO ❌'}`);
      if (data.connected) {
        addChatBubble('system', 'Voz Gemini Live conectada e ativa.');
      }
      break;

    case 'ASSISTANT_RESPONSE':
      console.log('💬 Resposta do JASPER (fallback):', data);

      if (data.transcribedText) {
        addChatBubble('user', data.transcribedText);
      }
      addChatBubble('assistant', data.text);
      updateTelemetry(data.metrics);

      // Se veio com áudio base64 (MP3/WAV), toca normalmente
      if (data.audioBase64) {
        playBase64Audio(data.audioBase64);
      } else if (data.useFallbackTTS && data.text) {
        // Usa speechSynthesis do browser como último recurso
        speakWithBrowserTTS(data.text);
      }
      break;

    case 'LIVE_AUDIO_CHUNK':
      // Áudio PCM 24kHz 16-bit do Gemini Live — reproduz via Web Audio API
      playPCMChunk(data.audioBase64, data.sampleRate || 24000);
      break;

    case 'LIVE_TEXT_CHUNK':
      // Texto parcial do Gemini Live (exibe no transcript)
      if (data.text) {
        transcriptPreview.innerText = data.text;
        
        // Append to existing assistant bubble or create new one
        let bubble = document.querySelector('.msg-assistant:last-child');
        if (!bubble) {
          bubble = addChatBubble('assistant', '');
        }
        const content = bubble.querySelector('.content');
        if (content) content.innerText += data.text;
        chatFeed.scrollTop = chatFeed.scrollHeight;
      }
      break;

    case 'TURN_COMPLETE':
      // Gemini Live terminou de falar
      transcriptPreview.innerText = 'Aguardando comando...';
      break;

    case 'INTERRUPT':
      stopAllAudio();
      updateState('IDLE');
      break;

    case 'ERROR':
      addChatBubble('system', `Falha: ${data.message}`);
      updateState('ERROR');
      break;
  }
}

// --- 3. Web Audio API: Reprodução de PCM em Tempo Real ---
function playPCMChunk(base64Data, sampleRate) {
  ensureAudioContext();
  if (!base64Data || !audioContext) return;

  try {
    // Decodifica Base64 para bytes
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Converte PCM 16-bit signed little-endian para Float32
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }

    // Cria AudioBuffer
    const audioBuffer = audioContext.createBuffer(1, float32.length, sampleRate);
    audioBuffer.getChannelData(0).set(float32);

    // Agenda a reprodução sequencial
    const currentTime = audioContext.currentTime;
    if (nextPlayTime < currentTime) {
      nextPlayTime = currentTime;
    }

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start(nextPlayTime);

    nextPlayTime += audioBuffer.duration;
    isPlaying = true;

    source.onended = () => {
      // Verifica se ainda há mais chunks pendentes
      if (audioContext && audioContext.currentTime >= nextPlayTime - 0.05) {
        isPlaying = false;
      }
    };

    updateState('SPEAKING');
  } catch (err) {
    console.error('Erro ao reproduzir chunk PCM:', err);
  }
}

// Fallback: reproduz base64 MP3/WAV via elemento <audio> temporário
function playBase64Audio(audioBase64) {
  ensureAudioContext();
  try {
    const audio = new Audio(audioBase64);
    audio.play().then(() => {
      updateState('SPEAKING');
    }).catch(() => {});
    audio.onended = () => {
      updateState('IDLE');
    };
  } catch (err) {
    console.error('Erro na reprodução de áudio base64:', err);
  }
}

// Fallback extremo: usa speechSynthesis do browser
function speakWithBrowserTTS(text) {
  if (!('speechSynthesis' in window)) return;

  const cleanText = text.replace(/[*_#`~[\]()]/g, '').replace(/https?:\/\/\S+/g, 'link').trim();
  if (!cleanText) return;

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = 'pt-BR';
  utterance.rate = 1.05;
  utterance.pitch = 0.9;

  utterance.onstart = () => updateState('SPEAKING');
  utterance.onend = () => updateState('IDLE');

  speechSynthesis.speak(utterance);
}

function stopAllAudio() {
  // Para reprodução PCM
  if (audioContext) {
    nextPlayTime = 0;
    isPlaying = false;
    // Cria novo AudioContext para limpar buffers agendados
    try {
      audioContext.close();
    } catch (e) {}
    audioContext = null;
  }

  // Para speechSynthesis
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
  }
}

// --- 4. Captura de Áudio do Microfone ---

// Modo Live Streaming: envia chunks PCM contínuos ao servidor
async function startLiveStreaming() {
  ensureAudioContext();

  if (isLiveStreaming) {
    stopLiveStreaming();
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const text = prompt('Microfone não disponível. Digite seu comando:');
    if (text) sendTextCommand(text);
    return;
  }

  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const micAudioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    micSource = micAudioContext.createMediaStreamSource(micStream);

    // ScriptProcessorNode para capturar PCM raw
    const bufferSize = 4096;
    micProcessor = micAudioContext.createScriptProcessor(bufferSize, 1, 1);

    micProcessor.onaudioprocess = (event) => {
      if (!isLiveStreaming) return;

      const float32Data = event.inputBuffer.getChannelData(0);

      // Converte Float32 para Int16 PCM
      const int16 = new Int16Array(float32Data.length);
      for (let i = 0; i < float32Data.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Data[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      // Converte para base64
      const uint8 = new Uint8Array(int16.buffer);
      let binary = '';
      for (let i = 0; i < uint8.length; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      const base64Chunk = btoa(binary);

      // Envia para o servidor via WebSocket
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'PCM_AUDIO_CHUNK',
          base64Pcm: base64Chunk,
        }));
      }
    };

    micSource.connect(micProcessor);
    micProcessor.connect(micAudioContext.destination);

    isLiveStreaming = true;
    updateState('LISTENING');
    transcriptPreview.innerText = 'Streaming de voz ativo — fale agora.';
    console.log('🎙️ Live streaming de áudio PCM iniciado (16kHz mono)');

  } catch (err) {
    console.warn('Erro ao acessar microfone:', err);
    isLiveStreaming = false;
    const text = prompt('Microfone não acessível. Digite seu comando:');
    if (text) sendTextCommand(text);
  }
}

function stopLiveStreaming() {
  isLiveStreaming = false;

  if (micProcessor) {
    micProcessor.disconnect();
    micProcessor = null;
  }
  if (micSource) {
    micSource.disconnect();
    micSource = null;
  }
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }

  updateState('IDLE');
  transcriptPreview.innerText = 'Aguardando comando...';
  console.log('🛑 Live streaming de áudio encerrado');
}

// Modo Gravação: grava blob de áudio completo e envia ao servidor
// Usado como fallback quando Gemini Live não está conectado
async function startVoiceRecording() {
  ensureAudioContext();

  if (isRecording) {
    stopVoiceRecording();
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const text = prompt('🎙️ Digite seu comando para o JASPER:');
    if (text) sendTextCommand(text);
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];

    let mimeType = 'audio/webm';
    if (!MediaRecorder.isTypeSupported('audio/webm')) {
      if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
      else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
      else mimeType = '';
    }

    mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      isRecording = false;
      stream.getTracks().forEach((track) => track.stop());

      if (audioChunks.length === 0) return;

      const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      transcriptPreview.innerText = 'Transcrevendo comando por IA...';
      updateState('PROCESSING');

      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = () => {
        const base64Audio = reader.result;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'VOICE_AUDIO_BLOB',
            audioBase64: base64Audio,
          }));
        }
      };
    };

    mediaRecorder.start();
    isRecording = true;
    updateState('LISTENING');
    transcriptPreview.innerText = 'Gravando voz... Fale seu comando agora.';

    clearTimeout(recordTimeout);
    recordTimeout = setTimeout(() => {
      if (isRecording) stopVoiceRecording();
    }, 5000);

  } catch (err) {
    console.warn('Microfone não acessível:', err);
    isRecording = false;
    updateState('IDLE');
    const text = prompt('Digite seu comando para o JASPER:');
    if (text) sendTextCommand(text);
  }
}

function stopVoiceRecording() {
  clearTimeout(recordTimeout);
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  isRecording = false;
}

// --- 5. Escolhe modo de captura baseado no estado do Gemini Live ---
function handleMicPress() {
  ensureAudioContext();

  // Se o JASPER está falando, interrompe
  if (isPlaying || (audioContext && audioContext.currentTime < nextPlayTime)) {
    stopAllAudio();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'USER_INTERRUPT' }));
    }
    updateState('IDLE');
    return;
  }

  // Se já está streamando, para
  if (isLiveStreaming) {
    stopLiveStreaming();
    return;
  }

  // Se Gemini Live está conectado, usa streaming PCM contínuo
  if (geminiLiveConnected) {
    startLiveStreaming();
  } else {
    // Fallback: gravação de blob completo
    startVoiceRecording();
  }
}

// --- 6. Atualiza Estado Visual ---
function updateState(state) {
  document.body.setAttribute('data-state', state);

  switch (state) {
    case 'IDLE':
      statusMessage.innerText = 'Em Espera';
      break;
    case 'LISTENING':
      statusMessage.innerText = 'Ouvindo...';
      break;
    case 'PROCESSING':
      statusMessage.innerText = 'Processando Instrução';
      break;
    case 'SPEAKING':
      statusMessage.innerText = 'Respondendo...';
      break;
    case 'ERROR':
      statusMessage.innerText = 'Não compreendido. Tente novamente.';
      break;
  }
}

// --- 7. Telemetria de Latência ---
function updateTelemetry(metrics) {
  if (!metrics) return;
  metricStt.innerText = `${metrics.sttMs || 0}ms`;
  metricRouter.innerText = `${metrics.routerMs || 0}ms`;
  metricGemini.innerText = `${metrics.geminiMs || 0}ms`;
  metricTools.innerText = `${metrics.toolMs || 0}ms`;
  metricTotal.innerText = `${metrics.totalMs || 0}ms`;
}

// --- 8. Envio de Comandos por Texto ---
function sendTextCommand(commandText) {
  ensureAudioContext();
  if (!commandText || commandText.trim().length === 0) return;

  addChatBubble('user', commandText);
  transcriptPreview.innerText = `Enviando: "${commandText}"`;
  updateState('PROCESSING');

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'TEXT_COMMAND',
      text: commandText,
      sttMs: 0,
    }));
  }
}

function sendQuickCommand(cmd) {
  ensureAudioContext();
  cmdInput.value = '';
  sendTextCommand(cmd);
}

function handleFormSubmit(e) {
  e.preventDefault();
  ensureAudioContext();
  const text = cmdInput.value.trim();
  if (!text) return;
  cmdInput.value = '';
  sendTextCommand(text);
}

// --- 9. Auxiliar de Chat ---
function addChatBubble(sender, text) {
  const div = document.createElement('div');
  
  if (sender === 'user') {
    div.className = 'msg msg-user';
    div.innerText = text;
  } else if (sender === 'assistant') {
    div.className = 'msg msg-assistant';
    div.innerText = text;
  } else if (sender === 'action') {
    div.className = 'msg msg-action';
    div.innerHTML = `<i class="ph ph-check-circle"></i> ${escapeHtml(text)}`;
  } else {
    div.className = 'msg system-msg';
    div.innerHTML = `<i class="ph ph-info"></i> ${escapeHtml(text)}`;
  }

  chatFeed.appendChild(div);
  chatFeed.scrollTop = chatFeed.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

window.addEventListener('DOMContentLoaded', () => {
  connectWebSocket();

  const agentCore = document.getElementById('agentCore');
  if (agentCore) {
    agentCore.addEventListener('click', handleMicPress);
  }

  if (micBtn) {
    micBtn.addEventListener('click', handleMicPress);
  }

  const togglePanelBtn = document.getElementById('togglePanelBtn');
  const closePanelBtn = document.getElementById('closePanelBtn');
  const contextPanel = document.getElementById('contextPanel');

  if (togglePanelBtn && contextPanel) {
    togglePanelBtn.addEventListener('click', () => {
      contextPanel.classList.toggle('open');
    });
  }
  if (closePanelBtn && contextPanel) {
    closePanelBtn.addEventListener('click', () => {
      contextPanel.classList.remove('open');
    });
  }

  // Desbloqueia AudioContext
  const unlockAudio = () => {
    ensureAudioContext();
  };

  document.body.addEventListener('touchstart', unlockAudio, { once: true });
  document.body.addEventListener('click', unlockAudio, { once: true });
});
