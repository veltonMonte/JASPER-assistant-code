import { useState, useEffect, useRef, useCallback } from 'react';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system' | 'action';
  text: string;
  actionStatus?: 'running' | 'done' | 'error';
}

export type JasperState = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'ERROR';

export interface UseJasperReturn {
  state: JasperState;
  isConnected: boolean;
  messages: ChatMessage[];
  transcript: string;
  sendText: (text: string) => void;
  toggleMic: () => void;
  getAudioLevel: () => number;
}

function isThinkingLine(line: string): boolean {
  const l = line.toLowerCase().trim();
  if (!l) return false;

  const thinkingKeywords = [
    'clarifying the', 'grappling with', 'lack of context', 'my focus is', 'need specifics',
    'responding to', 'processed the', 'decided a simple', 'maintaining a natural', 'my current plan',
    'i will follow', "i'll follow", 'standard offer', 'outlining response', 'assistant persona',
    'the user wants', 'the user is', 'user actually wants', 'narrow down the scope',
    'allow me to move forward', 'taking action', 'prevent me from', 'ambiguity of',
    'locating information', 'initiating search', 'outlining', 'constructing', 'defining', 'generating'
  ];

  if (thinkingKeywords.some(kw => l.includes(kw))) {
    return true;
  }

  const words = l.match(/[a-záàâãéèêíïóôõöúçñ]+/g) || [];
  if (words.length < 4) return false;

  const englishCommon = new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
    'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there',
    'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no',
    'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then',
    'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first',
    'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us', 'user', 'request', 'focus',
    'action', 'context', 'specifics', 'topic', 'scope', 'clarifying', 'chart', 'data', 'structure', 'line'
  ]);

  const ptCommon = new Set([
    'o', 'a', 'os', 'as', 'que', 'de', 'da', 'do', 'em', 'para', 'com', 'não', 'um', 'uma', 'eu', 'você', 'se', 'por', 'mais',
    'como', 'mas', 'foi', 'ao', 'ele', 'das', 'dos', 'ter', 'seu', 'sua', 'ou', 'quando', 'muito', 'nos', 'já', 'também', 'só',
    'pelo', 'pela', 'até', 'isso', 'ela', 'entre', 'depois', 'sem', 'mesmo', 'aos', 'seus', 'quem', 'nas', 'me', 'esse', 'eles',
    'essa', 'num', 'nem', 'suas', 'meu', 'às', 'minha', 'numa', 'pelos', 'elas', 'qual', 'nós', 'lhe', 'deles', 'essas', 'esses',
    'pelas', 'este', 'dele', 'sobre', 'gostaria', 'resumo', 'notícias', 'jogo', 'assunto', 'fazer', 'ajudar'
  ]);

  let engCount = 0;
  let ptCount = 0;

  for (const w of words) {
    if (englishCommon.has(w)) engCount++;
    if (ptCommon.has(w)) ptCount++;
  }

  return engCount >= 3 && engCount > ptCount * 2;
}

function cleanTextMonologue(text: string): string {
  if (!text) return '';
  const lines = text.split('\n');
  const cleanLines = lines.filter(line => !isThinkingLine(line));
  return cleanLines.join('\n').trimStart();
}

function base64ToFloat32Array(base64: string): Float32Array {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const int16View = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16View.length);
  for (let i = 0; i < int16View.length; i++) {
    float32[i] = int16View[i] / 32768.0;
  }
  return float32;
}

function float32ToInt16Base64(float32Array: Float32Array): string {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  const bytes = new Uint8Array(int16Array.buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export function useJasperWebSocket(): UseJasperReturn {
  const [state, setState] = useState<JasperState>('IDLE');
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [transcript, setTranscript] = useState('');
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const geminiLiveConnectedRef = useRef(false);
  
  // Audio Playback
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const currentMessageIdRef = useRef<string | null>(null);
  
  // Microphone Capture
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const micAudioContextRef = useRef<AudioContext | null>(null);

  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.connect(ctx.destination);
      analyserRef.current = analyser;
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  }, []);

  const playAudioChunk = useCallback((base64Audio: string) => {
    initAudioContext();
    const ctx = audioContextRef.current!;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const float32Data = base64ToFloat32Array(base64Audio);
    const buffer = ctx.createBuffer(1, float32Data.length, 24000);
    buffer.getChannelData(0).set(float32Data);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    if (analyserRef.current) {
      source.connect(analyserRef.current);
    } else {
      source.connect(ctx.destination);
    }

    const currentTime = ctx.currentTime;
    if (nextPlayTimeRef.current < currentTime) {
      nextPlayTimeRef.current = currentTime + 0.08;
    }

    source.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += buffer.duration;
  }, [initAudioContext]);

  const stopAllAudio = useCallback(() => {
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    nextPlayTimeRef.current = 0;
  }, []);

  const getAudioLevel = useCallback(() => {
    if (!analyserRef.current) return 0;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    return (sum / dataArray.length) / 255.0;
  }, []);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case 'STATE_CHANGE':
            setState(data.state as JasperState);
            break;
          case 'LIVE_STATUS':
            geminiLiveConnectedRef.current = !!data.connected;
            break;
          case 'PIPELINE_ACTION': {
            setMessages(prev => [...prev, {
              id: Date.now().toString() + '-action',
              sender: 'action',
              text: data.action,
              actionStatus: data.status
            }]);
            break;
          }
          case 'ASSISTANT_RESPONSE': {
            setTranscript('');
            if (data.transcribedText) {
              setMessages(prev => [...prev, {
                id: Date.now().toString() + '-user',
                sender: 'user',
                text: data.transcribedText
              }]);
            }
            setMessages(prev => [...prev, {
              id: Date.now().toString(),
              sender: 'assistant',
              text: data.text || ''
            }]);
            if (data.audioBase64) {
              playAudioChunk(data.audioBase64);
            }
            break;
          }
          case 'LIVE_AUDIO_CHUNK':
            if (data.audioBase64) {
              playAudioChunk(data.audioBase64);
              setState('SPEAKING');
            }
            break;
          case 'LIVE_TEXT_CHUNK':
            if (data.text) {
              const textChunk = data.text;
              setTranscript(prev => cleanTextMonologue(prev + textChunk));

              setMessages(prev => {
                const newMsgs = [...prev];
                if (currentMessageIdRef.current) {
                  const idx = newMsgs.findIndex(m => m.id === currentMessageIdRef.current);
                  if (idx >= 0) {
                    const rawCombined = newMsgs[idx].text + textChunk;
                    const cleaned = cleanTextMonologue(rawCombined);
                    newMsgs[idx] = { ...newMsgs[idx], text: cleaned };
                    return newMsgs;
                  }
                }
                const cleanedChunk = cleanTextMonologue(textChunk);
                const newId = Date.now().toString() + '-assistant';
                currentMessageIdRef.current = newId;
                newMsgs.push({ id: newId, sender: 'assistant', text: cleanedChunk });
                return newMsgs;
              });
            }
            break;
          case 'TURN_COMPLETE':
            currentMessageIdRef.current = null;
            setTranscript('');
            break;
          case 'INTERRUPT':
            stopAllAudio();
            break;
          case 'ERROR':
            setMessages(prev => [...prev, {
              id: Date.now().toString(),
              sender: 'system',
              text: `Error: ${data.message}`
            }]);
            break;
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      geminiLiveConnectedRef.current = false;
      stopAllAudio();
      stopRecording();
      console.log('WebSocket disconnected. Reconnecting in 3s...');
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => connect(), 3000);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    const unlockAudio = () => {
      initAudioContext();
    };
    document.body.addEventListener('click', unlockAudio, { once: true });
    document.body.addEventListener('touchstart', unlockAudio, { once: true });
  }, [playAudioChunk, stopAllAudio, initAudioContext]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      stopAllAudio();
      stopRecording();
    };
  }, [connect, stopAllAudio]);

  const sendText = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setMessages(prev => [...prev, { id: Date.now().toString(), sender: 'user', text }]);
    initAudioContext();
    wsRef.current.send(JSON.stringify({ type: 'TEXT_COMMAND', text, sttMs: 0 }));
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (audioProcessorRef.current) {
      audioProcessorRef.current.disconnect();
      audioProcessorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (micAudioContextRef.current) {
      micAudioContextRef.current.close();
      micAudioContextRef.current = null;
    }
    setState('IDLE');
  }, []);

  const startLiveStreaming = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      micAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const source = micAudioContextRef.current.createMediaStreamSource(stream);
      const processor = micAudioContextRef.current.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const base64Audio = float32ToInt16Base64(inputData);
        wsRef.current.send(JSON.stringify({
          type: 'PCM_AUDIO_CHUNK',
          base64Pcm: base64Audio
        }));
      };

      source.connect(processor);
      processor.connect(micAudioContextRef.current.destination);
      audioProcessorRef.current = processor;
      setState('LISTENING');
    } catch (err) {
      console.error('Error starting live streaming', err);
      setState('ERROR');
    }
  }, []);

  const startBlobRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const reader = new FileReader();
        reader.readAsDataURL(new Blob(chunks, { type: 'audio/webm' }));
        reader.onloadend = () => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'VOICE_AUDIO_BLOB',
              audioBase64: reader.result
            }));
          }
        };
      };

      mediaRecorder.start();
      setState('LISTENING');
    } catch (err) {
      console.error('Error starting blob recording', err);
      setState('ERROR');
    }
  }, []);

  const toggleMic = useCallback(() => {
    if (state === 'LISTENING') {
      stopRecording();
    } else {
      stopAllAudio();
      if (geminiLiveConnectedRef.current) {
        startLiveStreaming();
      } else {
        startBlobRecording();
      }
    }
  }, [state, stopRecording, stopAllAudio, startLiveStreaming, startBlobRecording]);

  return {
    state,
    isConnected,
    messages,
    transcript,
    sendText,
    toggleMic,
    getAudioLevel
  };
}
