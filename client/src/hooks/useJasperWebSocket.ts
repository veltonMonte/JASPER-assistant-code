import { useState, useEffect, useRef, useCallback } from 'react';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system' | 'action' | 'terminal_approval';
  text: string;
  actionStatus?: 'running' | 'done' | 'error';
  command?: string;
  riskLevel?: 'safe' | 'medium' | 'high';
  approvalStatus?: 'pending' | 'approved' | 'denied' | 'edited';
  executedCommand?: string;
  remember?: boolean;
  tool?: string;
  durationMs?: number;
  output?: string;
  error?: string;
}

export type JasperState = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'ERROR';

export interface PersonalityConfig {
  humor: number;
  honestidade: number;
  sarcasmo: number;
  formalidade: number;
  verbosidade: number;
  empatia: number;
}

export interface UseJasperReturn {
  state: JasperState;
  isConnected: boolean;
  messages: ChatMessage[];
  transcript: string;
  activeMic: 'womic' | 'notebook';
  personality: PersonalityConfig;
  updatePersonality: (trait: keyof PersonalityConfig, value: number) => void;
  resetPersonality: () => void;
  sendText: (text: string) => void;
  sendTerminalApproval: (id: string, approved: boolean, customCommand?: string, remember?: boolean) => void;
  toggleMic: () => void;
  getAudioLevel: () => number;
  activeAlarm: { id: string, message: string } | null;
  stopAlarm: () => void;
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
    'locating information', 'initiating search', 'outlining', 'constructing', 'defining', 'generating',
    'addressing the timeout', 're-testing terminal access', 'testing terminal', 'addressing', 'test execution'
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
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  
  // Remove markdown blocks that are leaked tool calls or raw arguments
  cleaned = cleaned.replace(/```[a-z]*\n[\s\S]*?\n```/gi, (match) => {
    if (match.includes('pesquisar_web') || match.includes('acessar_site') || match.includes('ligar_pc') || match.includes('renderizar_grafico') || match.includes('renderizar_tabela')) {
      return '';
    }
    if (match.match(/```[a-z]*\n\s*"[^"]+"\s*\n```/)) {
        return '';
    }
    return match;
  });

  const lines = cleaned.split('\n');
  const finalLines = [];
  
  const englishCommon = new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
    'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there',
    'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no',
    'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then',
    'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first',
    'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us', 'user', 'request', 'focus',
    'action', 'context', 'specifics', 'topic', 'scope', 'clarifying', 'tool', 'task', 'query', 'string', 'details', 'choice', 'optimal',
    'built', 'combining', 'execute', 'uncover', 'information', 'hopefully', 'confirming', 'denying', 'specific', 'release', 'date', 'assumption',
    'refining', 'parameters', 'zeroing', 'movie', 'given', 'initial', 'refined', 'recognizing', 'data', 'imminent', 'check', 'pinpointing', 'pre-sale', 'determined'
  ]);

  for (const line of lines) {
    const l = line.toLowerCase().trim();
    if (!l) {
      finalLines.push(line);
      continue;
    }
    
    // Ignore stray punctuation left over from removed markdown
    if (l.length < 3 && l.match(/^[. ,!?;]+$/)) continue;

    const words = l.match(/[a-z]+/g) || [];
    let engCount = 0;

    for (const w of words) {
      if (englishCommon.has(w)) engCount++;
    }

    // If it's heavily English, it's a leaked thought, skip it
    if (engCount >= 2 && engCount >= words.length * 0.3) {
      continue;
    }
    
    if (l.includes('tool is') || l.includes("i've determined") || l.includes('now, i will')) {
        continue;
    }

    finalLines.push(line);
  }

  return finalLines.join('\n').trimStart();
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

function downsampleAndConvertToInt16Base64(
  input: Float32Array,
  inSampleRate: number,
  outSampleRate = 16000,
  gain = 2.5
): string {
  let int16Array: Int16Array;
  
  if (!inSampleRate || inSampleRate === outSampleRate) {
    int16Array = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i] * gain));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
  } else {
    const ratio = inSampleRate / outSampleRate;
    const newLength = Math.round(input.length / ratio);
    int16Array = new Int16Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const pos = i * ratio;
      const index = Math.floor(pos);
      const frac = pos - index;
      const s1 = input[index] || 0;
      const s2 = input[index + 1] !== undefined ? input[index + 1] : s1;
      const s = Math.max(-1, Math.min(1, (s1 + frac * (s2 - s1)) * gain));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
  }

  const bytes = new Uint8Array(int16Array.buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function float32ToInt16Base64(float32Array: Float32Array): string {
  return downsampleAndConvertToInt16Base64(float32Array, 16000, 16000);
}

export function useJasperWebSocket(): UseJasperReturn {
  const [state, setState] = useState<JasperState>('IDLE');
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [transcript, setTranscript] = useState('');
  const [activeAlarm, setActiveAlarm] = useState<{ id: string, message: string } | null>(null);
  const [activeMic, setActiveMic] = useState<'womic' | 'notebook'>('notebook');
  const [personality, setPersonality] = useState<PersonalityConfig>({
    humor: 60,
    honestidade: 90,
    sarcasmo: 40,
    formalidade: 30,
    verbosidade: 50,
    empatia: 70,
  });

  const updatePersonality = useCallback((trait: keyof PersonalityConfig, value: number) => {
    const val = Math.max(0, Math.min(100, Math.round(value)));
    setPersonality(prev => ({ ...prev, [trait]: val }));
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'SET_PERSONALITY',
        personality: { [trait]: val }
      }));
    }
  }, []);

  const resetPersonality = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'RESET_PERSONALITY' }));
    }
  }, []);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const geminiLiveConnectedRef = useRef(false);
  
  // Audio Playback
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeAlarmAudioRef = useRef<AudioContext | null>(null);
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
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const stopAlarm = useCallback(() => {
    if (activeAlarmAudioRef.current) {
      activeAlarmAudioRef.current.close();
      activeAlarmAudioRef.current = null;
    }
    setActiveAlarm(null);
  }, []);

  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const updateVoices = () => {
      const vList = window.speechSynthesis.getVoices();
      if (vList && vList.length > 0) {
        setAvailableVoices(vList);
      }
    };
    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
  }, []);

  const speakText = useCallback((text: string) => {
    if (typeof window === 'undefined') return;

    let speechContent = text
      .replace(/```[\s\S]*?```/g, 'Aqui está o código gerado.')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/[*#_~]/g, '')
      .trim();

    if (!speechContent) return;

    // Check available high-quality voices
    const voices = availableVoices.length > 0 ? availableVoices : (window.speechSynthesis?.getVoices() || []);
    const ptVoices = voices.filter(v => v.lang.startsWith('pt') || v.lang.includes('BR'));
    
    const naturalVoice = ptVoices.find(v => {
      const name = v.name.toLowerCase();
      return (name.includes('google') || name.includes('natural') || name.includes('neural') || name.includes('online') || name.includes('helena') || name.includes('luciana') || name.includes('francisca') || name.includes('antonio'));
    });

    const isOnlyRoboticEspeak = ptVoices.length > 0 && ptVoices.every(v => v.name.toLowerCase().includes('espeak'));

    // If no natural voice is found, or only eSpeak is available, use Google TTS Audio Fallback!
    if (!naturalVoice || isOnlyRoboticEspeak) {
      console.log('🤖 Apenas vozes robóticas locais detectadas (eSpeak). Utilizando Google TTS Cloud de alta qualidade.');
      
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      setState('SPEAKING');

      // Split text into safe chunks for Google Translate TTS (<200 chars per chunk, splitting on punctuation or spaces)
      const sentences = speechContent.match(/[^.!?]+[.!?]*|.{1,150}(?:\s|$)/g) || [speechContent];
      let currentIdx = 0;

      const playNextTTSChunk = () => {
        if (currentIdx >= sentences.length) {
          setState('IDLE');
          return;
        }
        
        const chunk = sentences[currentIdx].trim();
        if (!chunk) {
          currentIdx++;
          playNextTTSChunk();
          return;
        }

        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=pt-BR&client=tw-ob`;
        const audio = new Audio(url);
        
        audio.onended = () => {
          currentIdx++;
          playNextTTSChunk();
        };
        
        audio.onerror = () => {
          console.warn('Google TTS falhou, tentando o próximo chunk...');
          currentIdx++;
          playNextTTSChunk();
        };

        audio.play().catch(err => {
          console.warn('Erro no Google TTS:', err);
          setState('IDLE');
        });
      };

      playNextTTSChunk();
      return;
    }

    // Se temos uma voz local de alta qualidade (Google/Natural/Neural), usamos speechSynthesis nativo
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      
      if (speechContent.length > 500) {
        speechContent = speechContent.slice(0, 500) + '...';
      }

      const utterance = new SpeechSynthesisUtterance(speechContent);
      utterance.lang = 'pt-BR';
      utterance.rate = 1.0;
      utterance.pitch = 0.98;
      utterance.voice = naturalVoice || ptVoices[0];

      utterance.onstart = () => setState('SPEAKING');
      utterance.onend = () => setState('IDLE');
      utterance.onerror = () => setState('IDLE');

      window.speechSynthesis.speak(utterance);
    }
  }, [availableVoices]);

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
          case 'MIC_STATUS':
            if (data.activeMic === 'womic' || data.activeMic === 'notebook') {
              setActiveMic(data.activeMic);
            }
            break;
          case 'PERSONALITY_UPDATE':
            if (data.personality) {
              setPersonality(prev => ({ ...prev, ...data.personality }));
            }
            break;
          case 'LIVE_STATUS':
            geminiLiveConnectedRef.current = !!data.connected;
            break;
          case 'PIPELINE_ACTION': {
            setMessages(prev => {
              const lastIdx = prev.length - 1;
              if (
                lastIdx >= 0 &&
                prev[lastIdx].sender === 'action' &&
                prev[lastIdx].tool === data.tool &&
                prev[lastIdx].actionStatus === 'running'
              ) {
                const updated = [...prev];
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  text: data.action,
                  actionStatus: data.status,
                  durationMs: data.durationMs || updated[lastIdx].durationMs,
                  command: data.command || updated[lastIdx].command,
                  output: data.output || updated[lastIdx].output,
                  error: data.error || updated[lastIdx].error,
                };
                return updated;
              }
              return [...prev, {
                id: Date.now().toString() + '-action-' + Math.random().toString(36).substring(2, 6),
                sender: 'action',
                text: data.action,
                actionStatus: data.status,
                tool: data.tool,
                durationMs: data.durationMs,
                command: data.command,
                output: data.output,
                error: data.error,
              }];
            });
            break;
          }
          case 'ASSISTANT_RESPONSE': {
            setTranscript('');
            if (data.transcribedText) {
              setMessages(prev => {
                const textTrim = data.transcribedText.trim();
                const exists = prev.some(m => m.sender === 'user' && m.text.trim() === textTrim);
                if (exists) return prev;
                return [...prev, {
                  id: Date.now().toString() + '-user',
                  sender: 'user',
                  text: data.transcribedText
                }];
              });
            }
            if (data.text) {
              setMessages(prev => [...prev, {
                id: Date.now().toString() + '-assistant',
                sender: 'assistant',
                text: data.text || ''
              }]);
            }
            if (data.audioBase64) {
              playAudioChunk(data.audioBase64);
            } else if (data.text) {
              speakText(data.text);
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
          case 'ALARM_TRIGGER':
            try {
              const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
              activeAlarmAudioRef.current = audioCtx;
              
              // Tocar loop de alarme continuamente até ser parado
              const beepInterval = setInterval(() => {
                if (!activeAlarmAudioRef.current || activeAlarmAudioRef.current.state === 'closed') {
                  clearInterval(beepInterval);
                  return;
                }
                const ctx = activeAlarmAudioRef.current;
                const startTime = ctx.currentTime;
                
                const oscillator = ctx.createOscillator();
                const gainNode = ctx.createGain();
                
                oscillator.type = 'square';
                oscillator.frequency.setValueAtTime(880, startTime);
                
                gainNode.gain.setValueAtTime(0, startTime);
                gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
                gainNode.gain.linearRampToValueAtTime(0, startTime + 0.3);
                
                oscillator.connect(gainNode);
                gainNode.connect(ctx.destination);
                
                oscillator.start(startTime);
                oscillator.stop(startTime + 0.3);
              }, 600); // Toca a cada 600ms
              
            } catch (e) {
              console.warn("AudioContext not supported or blocked", e);
            }

            // Exibir no painel do usuário
            setActiveAlarm({ id: data.alarmId, message: data.message });

            // Adicionar ao chat como system message
            setMessages(prev => [...prev, {
              id: Date.now().toString() + '-alarm',
              sender: 'system',
              text: `⏰ Alarme Disparado: ${data.message}`
            }]);
            break;
          case 'TERMINAL_APPROVAL_REQUEST':
            setMessages(prev => [...prev, {
              id: data.id,
              sender: 'terminal_approval',
              text: 'Permissão para Terminal Solicitada',
              command: data.command,
              riskLevel: data.riskLevel || 'medium',
              approvalStatus: 'pending'
            }]);
            break;
          case 'TERMINAL_APPROVAL_STATUS_UPDATE':
            setMessages(prev => prev.map(m => {
              if (m.id === data.id) {
                return {
                  ...m,
                  approvalStatus: data.approved ? (data.customCommand ? 'edited' : 'approved') : 'denied',
                  executedCommand: data.customCommand || m.command,
                  remember: data.remember,
                };
              }
              return m;
            }));
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
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
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
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true, 
          autoGainControl: true 
        } 
      });
      mediaStreamRef.current = stream;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      // Não passar { sampleRate: 16000 } no Firefox para evitar erro de AudioNodes com sample-rate diferente
      const micCtx = new AudioCtx();
      micAudioContextRef.current = micCtx;
      const inputSampleRate = micCtx.sampleRate || 48000;
      const source = micCtx.createMediaStreamSource(stream);
      const processor = micCtx.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const base64Audio = downsampleAndConvertToInt16Base64(inputData, inputSampleRate, 16000);
        wsRef.current.send(JSON.stringify({
          type: 'PCM_AUDIO_CHUNK',
          base64Pcm: base64Audio
        }));
      };

      source.connect(processor);
      processor.connect(micAudioContextRef.current.destination);
      audioProcessorRef.current = processor;
      setState('LISTENING');
    } catch (err: any) {
      console.error('Error starting live streaming', err);
      if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
        alert("🎤 Microfone bloqueado pelo Android. \n\n1. Vá nas Configurações do Android > Aplicativos > Jasper > Permissões e libere o Microfone.\n\n2. Se o erro persistir, o WebView exige HTTPS para liberar áudio.");
      } else {
        alert("Erro no microfone: " + (err.message || "desconhecido"));
      }
      setState('ERROR');
    }
  }, []);

  const startBlobRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true, 
          autoGainControl: true 
        } 
      });
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
    } catch (err: any) {
      console.error('Error starting blob recording', err);
      if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
        alert("🎤 Microfone bloqueado pelo Android. \n\n1. Vá nas Configurações do Android > Aplicativos > Jasper > Permissões e libere o Microfone.\n\n2. Se o erro persistir, o WebView exige HTTPS para liberar áudio.");
      } else {
        alert("Erro no microfone: " + (err.message || "desconhecido"));
      }
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

  const sendTerminalApproval = useCallback((id: string, approved: boolean, customCommand?: string, remember?: boolean) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'TERMINAL_APPROVAL_RESPONSE', id, approved, customCommand, remember }));
    setMessages(prev => prev.map(m => {
      if (m.id === id) {
        return {
          ...m,
          approvalStatus: approved ? (customCommand ? 'edited' : 'approved') : 'denied',
          executedCommand: customCommand || m.command,
          remember,
        };
      }
      return m;
    }));
  }, []);

  return {
    state,
    isConnected,
    messages,
    transcript,
    activeMic,
    personality,
    updatePersonality,
    resetPersonality,
    sendText,
    sendTerminalApproval,
    toggleMic,
    getAudioLevel,
    activeAlarm,
    stopAlarm
  };
}
