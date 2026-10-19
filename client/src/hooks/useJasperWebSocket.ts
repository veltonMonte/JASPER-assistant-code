import { ensureAudioRunning, LiveVoiceTurn, canStartManualVoice } from '../lib/voicePlayback';
import { useState, useEffect, useRef, useCallback } from 'react';
import { AutomaticMicrophone } from '../lib/automaticMicrophone';
import type { Presentation } from '../lib/presentation';

export interface VoiceSettings { voice: string; pace: 'calm' | 'natural' | 'brisk' }

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
  notice?: { kind: 'news' | 'question' | 'clock'; sentAt: string; article?: { title: string; url: string; source: string; topic: string; publishedAt: string } };
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

export interface AuthStatus {
  isChecking: boolean;
  isMaster: boolean;
  isAuthorized: boolean;
  isPending: boolean;
  isDenied?: boolean;
  deviceName?: string;
}

export interface PendingDeviceRequest {
  id: string;
  deviceId: string;
  deviceName: string;
  ip: string;
  requestedAt: number;
}

export interface UseJasperReturn {
  state: JasperState;
  isConnected: boolean;
  isMicActive: boolean;
  isMicStarting: boolean;
  isVoiceReady: boolean;
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
  readProactive: (text: string) => void;
  previewVoice: (settings: VoiceSettings) => void;
  voiceRequest: (path: string, init?: RequestInit) => Promise<Response>;
  apiRequest: (path: string, init?: RequestInit) => Promise<Response>;
  getNarrationContext: () => AudioContext;
  proactiveAudioReady: boolean;
  presentation: Presentation | null;
  presentationOpen: boolean;
  presentationReady: boolean;
  closePresentation: () => void;
  activateScene: (id:string) => void;
  openPresentation: () => void;
  setPresentationNarrating: (value: boolean) => void;
  authStatus: AuthStatus;
  pendingDeviceRequests: PendingDeviceRequest[];
  requestDeviceAccess: (deviceName: string) => void;
  resolveDeviceAccess: (id: string, approved: boolean) => void;
}

function createMessageId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  if (!text) return "";
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "");

  // Strip ONLY leaked internal tool call JSONs (e.g. ```json \n {"tool": "pesquisar_web"} \n ```)
  // NEVER strip recharts, table, images, video, bash or genuine code blocks!
  cleaned = cleaned.replace(/```(?:json)?\n\s*\{\s*"(?:tool|name)"\s*:\s*"(?:pesquisar_web|acessar_site|ligar_pc|executar_terminal)"[\s\S]*?\}\s*\n```/gi, "");
  cleaned = cleaned.replace(/```[a-z]*\n\s*"[^"]+"\s*\n```/g, "");

  const lines = cleaned.split("\n");
  const finalLines: string[] = [];
  let inCodeBlock = false;

  const englishCommon = new Set([
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
    "this", "but", "his", "by", "from", "they", "we", "say", "her", "she", "or", "an", "will", "my", "one", "all", "would", "there",
    "their", "what", "so", "up", "out", "if", "about", "who", "get", "which", "go", "me", "when", "make", "can", "like", "time", "no",
    "just", "him", "know", "take", "people", "into", "year", "your", "good", "some", "could", "them", "see", "other", "than", "then",
    "now", "look", "only", "come", "its", "over", "think", "also", "back", "after", "use", "two", "how", "our", "work", "first",
    "well", "way", "even", "new", "want", "because", "any", "these", "give", "day", "most", "us", "user", "request", "focus",
    "action", "context", "specifics", "topic", "scope", "clarifying", "tool", "task", "query", "string", "details", "choice", "optimal",
    "built", "combining", "execute", "uncover", "information", "hopefully", "confirming", "denying", "specific", "release", "date", "assumption",
    "refining", "parameters", "zeroing", "movie", "given", "initial", "refined", "recognizing", "data", "imminent", "check", "pinpointing", "pre-sale", "determined"
  ]);

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      finalLines.push(line);
      continue;
    }

    // Inside ANY code block (recharts, table, code, bash, etc.), PRESERVE every single line untouched!
    if (inCodeBlock) {
      finalLines.push(line);
      continue;
    }

    const l = trimmed.toLowerCase();
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

    // If it is heavily English, it is a leaked thought, skip it
    if (engCount >= 2 && engCount >= words.length * 0.3) {
      continue;
    }

    if (l.includes("tool is") || l.includes("i've determined") || l.includes("now, i will")) {
      continue;
    }

    finalLines.push(line);
  }

  return finalLines.join("\n").trimStart();
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
  gain = 1.0
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
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    isChecking: true,
    isMaster: false,
    isAuthorized: false,
    isPending: false,
    isDenied: false,
  });
  const [pendingDeviceRequests, setPendingDeviceRequests] = useState<PendingDeviceRequest[]>([]);

  const [state, setState] = useState<JasperState>('IDLE');
  const stateRef = useRef<JasperState>('IDLE');
  stateRef.current = state;
  const [isConnected, setIsConnected] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [isMicStarting, setIsMicStarting] = useState(false);
  const [geminiLiveReady, setGeminiLiveReady] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(() => {
    try { return localStorage.getItem('jasper_microphone_paused') !== 'true'; } catch { return true; }
  });
  const automaticMicRef = useRef(new AutomaticMicrophone());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [proactiveAudioReady, setProactiveAudioReady] = useState(false);
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [presentationReady, setPresentationReady] = useState(false);
  const presentationPendingRef = useRef(false);
  const presentationOpenRef = useRef(false);
  const presentationNarratingRef = useRef(false);
  const presentationReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setPresentationNarrating = useCallback((value: boolean) => { presentationNarratingRef.current = value; if(localMicrophoneRef.current&&wsRef.current?.readyState===WebSocket.OPEN)wsRef.current.send(JSON.stringify({type:'PAUSE_LOCAL_MIC',paused:value||['SPEAKING','PROCESSING'].includes(stateRef.current)})); }, []);
  const closePresentation = useCallback(() => {
    if (presentationReadyTimerRef.current) clearTimeout(presentationReadyTimerRef.current);
    presentationReadyTimerRef.current = null;
    presentationPendingRef.current = false; presentationOpenRef.current = false; setPresentationOpen(false); presentationNarratingRef.current = false;
  }, []);
  const openPresentation = useCallback(() => { presentationOpenRef.current = true; setPresentationReady(true); setPresentationOpen(true); }, []);
  const audioUnlockedRef = useRef(false);
  const lastInteractionRef = useRef(Date.now());
  const receivedNoticesRef = useRef(new Set<string>());
  const clientBusyRef = useRef(false);
  clientBusyRef.current = messages.some(message => message.sender === 'terminal_approval' && (!message.approvalStatus || message.approvalStatus === 'pending'));
  const [transcript, setTranscript] = useState('');
  const [activeAlarm, setActiveAlarm] = useState<{ id: string, message: string } | null>(null);
  const [activeMic, setActiveMic] = useState<'womic' | 'notebook'>('notebook');
  const [personality, setPersonality] = useState<PersonalityConfig>({
    humor: 45,
    honestidade: 95,
    sarcasmo: 55,
    formalidade: 70,
    verbosidade: 35,
    empatia: 75,
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
  const voiceSessionTokenRef = useRef('');
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const geminiLiveConnectedRef = useRef(false);
  
  // Audio Playback
  const audioContextRef = useRef<AudioContext | null>(null);
  const pcmSourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const pcmGenerationRef = useRef(0);
  const liveVoiceTurnRef = useRef(new LiveVoiceTurn());
  const audioBlockedRef = useRef(false);
  const localSpeechAbortRef = useRef<AbortController | null>(null);
  const localSpeechSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const speechGenerationRef = useRef(0);
  const activeAlarmAudioRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const currentMessageIdRef = useRef<string | null>(null);
  const userVoiceMessageIdRef = useRef<string | null>(null);
  
  const micStartingRef = useRef(false);
  const micGenerationRef = useRef(0);
  const liveCaptureRef = useRef(false);
  const localMicrophoneRef = useRef(false);
  const discardRecordingRef = useRef(false);

  // Microphone Capture
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const micAudioContextRef = useRef<AudioContext | null>(null);

  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.connect(ctx.destination);
      analyserRef.current = analyser;
    }
    if (audioContextRef.current.state === 'suspended') {
      void audioContextRef.current.resume().catch(() => {});
    }
  }, []);

  const getNarrationContext = useCallback((): AudioContext => {
    initAudioContext();
    return audioContextRef.current!;
  }, [initAudioContext]);

  const playAudioChunk = useCallback(async (base64Audio: string) => {
    initAudioContext();
    const ctx=audioContextRef.current!,generation=pcmGenerationRef.current;
    try {
      if(!await ensureAudioRunning(ctx))throw new Error('O navegador bloqueou a saída de áudio.');
      if(generation!==pcmGenerationRef.current||ctx.state==='closed')return;
      const samples=base64ToFloat32Array(base64Audio);if(!samples.length)return;
      const buffer=ctx.createBuffer(1,samples.length,24000);buffer.getChannelData(0).set(samples);
      const source=ctx.createBufferSource();source.buffer=buffer;source.connect(analyserRef.current||ctx.destination);
      nextPlayTimeRef.current=Math.max(nextPlayTimeRef.current,ctx.currentTime+.025);
      if(nextPlayTimeRef.current-ctx.currentTime>12)throw new Error('A fila de voz ficou atrasada.');
      pcmSourcesRef.current.add(source);source.onended=()=>{source.disconnect();pcmSourcesRef.current.delete(source);if(!pcmSourcesRef.current.size&&!localSpeechSourceRef.current&&!localSpeechAbortRef.current)setState('IDLE');};
      source.start(nextPlayTimeRef.current);nextPlayTimeRef.current+=buffer.duration;
    } catch(error) {
      if(generation!==pcmGenerationRef.current)return;
      if(!audioBlockedRef.current){audioBlockedRef.current=true;console.warn('Não foi possível iniciar a saída de voz.',error);setMessages(previous=>[...previous,{id:`${Date.now()}-audio-blocked`,sender:'system',text:'Toque em Ouvir na resposta para ativar a saída de voz neste navegador.'}]);}
      setState('IDLE');
    }
  }, [initAudioContext]);

  const cancelLocalSpeech = useCallback(() => {
    speechGenerationRef.current++;
    localSpeechAbortRef.current?.abort();
    localSpeechAbortRef.current = null;
    if (localSpeechSourceRef.current) {
      localSpeechSourceRef.current.onended = null;
      try { localSpeechSourceRef.current.stop(); localSpeechSourceRef.current.disconnect(); } catch {}
      localSpeechSourceRef.current = null;
    }
  }, []);

  const stopAllAudio = useCallback(() => {
    cancelLocalSpeech();
    pcmGenerationRef.current++;
    for(const source of pcmSourcesRef.current){source.onended=null;try{source.stop();source.disconnect();}catch{}}
    pcmSourcesRef.current.clear();liveVoiceTurnRef.current.reset();audioBlockedRef.current=false;
    nextPlayTimeRef.current=audioContextRef.current?.currentTime||0;
    if(typeof window!=='undefined')window.dispatchEvent(new Event('jasper-audio-interrupt'));
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, [cancelLocalSpeech]);

  const stopAlarm = useCallback(() => {
    if (activeAlarmAudioRef.current) {
      activeAlarmAudioRef.current.close();
      activeAlarmAudioRef.current = null;
    }
    setActiveAlarm(null);
  }, []);

  // All standalone readings use the same configured Gemini voice as conversation.
  // Decode a complete WAV rather than concatenating browser/Translate TTS fragments.
  const speakText = useCallback(async (text: string, preview?: VoiceSettings) => {
    const speechContent = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/[*#_~]/g, '').trim().slice(0, 1200);
    if (!speechContent) return;
    cancelLocalSpeech();
    const generation = speechGenerationRef.current;
    const controller = new AbortController();
    localSpeechAbortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 50_000);
    setState('PROCESSING');
    try {
      initAudioContext();
      const response = await fetch('/api/voice/speak', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${voiceSessionTokenRef.current}` },
        body: JSON.stringify({ text: speechContent, preview }), signal: controller.signal,
      });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('audio/wav')) throw new Error('Voz natural indisponível.');
      const wav = await response.arrayBuffer();
      if (generation !== speechGenerationRef.current || controller.signal.aborted) return;
      const context = audioContextRef.current;
      if (!context || context.state === 'closed') throw new Error('Saída de áudio indisponível.');
      const audio = await context.decodeAudioData(wav);
      if (generation !== speechGenerationRef.current || controller.signal.aborted) return;
      if (audio.numberOfChannels !== 1 || !audio.length) throw new Error('Formato de voz inválido.');
      if(!await ensureAudioRunning(context))throw new Error('Toque em Ouvir para ativar o áudio neste navegador.');
      if (generation !== speechGenerationRef.current || controller.signal.aborted) return;
      const source = context.createBufferSource();
      source.buffer = audio;
      source.playbackRate.value = 1;
      source.connect(analyserRef.current || context.destination);
      localSpeechSourceRef.current = source;
      localSpeechAbortRef.current = null;
      source.onended = () => {
        if (generation !== speechGenerationRef.current) return;
        source.disconnect(); localSpeechSourceRef.current = null;
        setState('IDLE');
      };
      source.start(context.currentTime + .025);
      setState('SPEAKING');
    } catch (error) {
      if (generation !== speechGenerationRef.current) return;
      console.warn('Não foi possível reproduzir a leitura natural.',error);
      localSpeechAbortRef.current = null;
      setState('IDLE');
      setMessages(previous => [...previous, {
        id: `${Date.now()}-voice-unavailable`, sender: 'system',
        text: 'Não consegui reproduzir a voz natural agora. A mensagem continua no chat; tente Ouvir novamente em instantes.',
      }]);
    } finally { window.clearTimeout(timeout); }
  }, [cancelLocalSpeech, initAudioContext]);

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

  const speakTextRef = useRef(speakText);
  speakTextRef.current = speakText;
  const readProactive = useCallback((text: string) => {
    if (!canStartManualVoice(stateRef.current)) return;
    initAudioContext();
    audioUnlockedRef.current = true;
    setProactiveAudioReady(true);
    speakTextRef.current(text);
  }, [initAudioContext]);

  const apiRequest = useCallback((path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${voiceSessionTokenRef.current}`);
    return fetch(`/api/${path}`, { ...init, headers });
  }, []);
  const activateScene=useCallback((sceneId:string)=>{if(wsRef.current?.readyState===WebSocket.OPEN)wsRef.current.send(JSON.stringify({type:'ACTIVATE_SCENE',sceneId}));},[]);
  const voiceRequest = useCallback((path: string, init: RequestInit = {}) => apiRequest(`voice/${path}`, init), [apiRequest]);
  const previewVoice = useCallback((settings: VoiceSettings) => {
    if (!canStartManualVoice(stateRef.current)) return;
    initAudioContext();
    audioUnlockedRef.current = true;
    setProactiveAudioReady(true);
    void speakTextRef.current('À sua disposição. Vamos organizar o que realmente merece sua atenção. O restante pode esperar alguns segundos. Até o caos merece uma agenda.', settings);
  }, [initAudioContext]);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setAuthStatus({ isChecking: true, isMaster: false, isAuthorized: false, isPending: false });
      setIsConnected(true);
      console.log("WebSocket connected");
      let devId = localStorage.getItem("jasper_device_id");
      if (!devId) {
        devId = "dev_" + Math.random().toString(36).slice(2, 10);
        localStorage.setItem("jasper_device_id", devId);
      }
      const token = localStorage.getItem("jasper_auth_token") || "";
      ws.send(JSON.stringify({
        type: "AUTH_CHECK",
        deviceId: devId,
        token: token,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case "AUTH_STATUS":
            voiceSessionTokenRef.current = data.isAuthorized && typeof data.voiceToken === 'string' ? data.voiceToken : '';
            if (data.isMaster) {
              // Older versions saved a master credential in localStorage. The host
              // is recognized from its address, so that credential is obsolete.
              if (localStorage.getItem('jasper_is_master') === 'true') {
                localStorage.removeItem('jasper_auth_token');
              }
              localStorage.removeItem('jasper_is_master');
            }
            setAuthStatus({
              isChecking: false,
              isMaster: !!data.isMaster,
              isAuthorized: !!data.isAuthorized,
              isPending: false,
              deviceName: data.deviceName,
            });
            break;
          case "DEVICE_ACCESS_REQUEST":
            setPendingDeviceRequests(prev => [...prev.filter(r => r.id !== data.id), data]);
            speakTextRef.current(`O dispositivo ${data.deviceName} está pedindo para entrar na nossa rede.`);
            break;
          case "DEVICE_ACCESS_PENDING":
            setAuthStatus(prev => ({ ...prev, isPending: true, isDenied: false }));
            break;
          case "DEVICE_ACCESS_GRANTED":
            if (data.deviceId !== localStorage.getItem("jasper_device_id")) break;
            if (data.token) {
              localStorage.setItem("jasper_auth_token", data.token);
            }
            if (data.deviceName) {
              localStorage.setItem("jasper_device_name", data.deviceName);
            }
            setAuthStatus({
              isChecking: false,
              isMaster: false,
              isAuthorized: true,
              isPending: false,
              isDenied: false,
              deviceName: data.deviceName,
            });
            ws.send(JSON.stringify({ type: 'AUTH_CHECK', deviceId: data.deviceId, token: data.token }));
            break;
          case "DEVICE_ACCESS_DENIED":
            setAuthStatus(prev => ({
              ...prev,
              isPending: false,
              isAuthorized: false,
              isDenied: true,
            }));
            break;
          case "DEVICE_ACCESS_STATUS_UPDATE":
            setPendingDeviceRequests(prev => prev.filter(r => r.id !== data.id));
            break;
          case "SYSTEM_ANNOUNCEMENT":
            if (data.speak && data.text && !presentationOpenRef.current) {
              speakTextRef.current(data.text);
            }
            break;

          case 'STATE_CHANGE':
            if (!['IDLE', 'LISTENING', 'PROCESSING', 'SPEAKING', 'ERROR'].includes(data.state)) break;
            // A real conversational turn takes priority over a standalone reading.
            if (localSpeechAbortRef.current || localSpeechSourceRef.current) break;
            if(data.state==='IDLE'&&pcmSourcesRef.current.size)break;
            setState(data.state as JasperState);
            break;
          case 'PRESENTATION_OPEN':
            if (data.presentation?.id && Array.isArray(data.presentation.steps)) {
              presentationPendingRef.current = true;
              presentationOpenRef.current = true;
              if (presentationReadyTimerRef.current) clearTimeout(presentationReadyTimerRef.current);
              const currentAudio = audioContextRef.current;
              const remainingAudioMs = currentAudio?.state === 'running'
                ? Math.max(0, (nextPlayTimeRef.current - currentAudio.currentTime) * 1000) : 0;
              setPresentationReady(false);
              setPresentation(data.presentation as Presentation);
              setPresentationOpen(true);
              // Let the last words already queued by Gemini finish before the lesson starts.
              presentationReadyTimerRef.current = setTimeout(() => {
                presentationReadyTimerRef.current = null;
                if (!presentationOpenRef.current) return;
                cancelLocalSpeech();
                nextPlayTimeRef.current = 0;
                setPresentationReady(true);
              }, Math.max(180, remainingAudioMs + 120));
            }
            break;
          case 'PROACTIVE_NOTIFICATION': {
            const notice = data.notice;
            if (!notice?.id || typeof notice.text !== 'string' || receivedNoticesRef.current.has(notice.id)) break;
            receivedNoticesRef.current.add(notice.id);
            if (receivedNoticesRef.current.size > 200) receivedNoticesRef.current.delete(receivedNoticesRef.current.values().next().value!);
            setMessages(previous => [...previous, { id: notice.id, sender: 'assistant', text: notice.text, notice }]);
            if (stateRef.current === 'IDLE' && !presentationOpenRef.current && !clientBusyRef.current && !document.hidden && Date.now() - lastInteractionRef.current > 10_000 && audioUnlockedRef.current) speakTextRef.current(notice.text);
            break;
          }
          case 'LOCAL_MIC_STATUS':
            localMicrophoneRef.current=!!data.active;
            micStartingRef.current=false;
            setIsMicActive(!!data.active);setIsMicStarting(false);
            if(data.error)setMessages(previous=>[...previous,{id:createMessageId(),sender:'system',text:data.error}]);
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
            if (!data.connected) presentationPendingRef.current = false;
            setGeminiLiveReady(!!data.connected);
            // Keep the capture device open through short Live reconnects.
            // The audio callback pauses transmission until Gemini is ready again.
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
            const presentationResponse = presentationPendingRef.current;
            if (presentationPendingRef.current) presentationPendingRef.current = false;
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
            if (data.audioBase64 && !presentationResponse && !presentationNarratingRef.current) {
              if (localSpeechAbortRef.current || localSpeechSourceRef.current) cancelLocalSpeech();
              void playAudioChunk(data.audioBase64);
            } else if (data.text && !presentationResponse && !presentationNarratingRef.current) {
              speakTextRef.current(data.text);
            }
            break;
          }
          case 'LIVE_AUDIO_CHUNK':
            if(data.audioBase64)liveVoiceTurnRef.current.receivedAudio();
            if (data.audioBase64 && !presentationPendingRef.current && !presentationNarratingRef.current) {
              if (localSpeechAbortRef.current || localSpeechSourceRef.current) cancelLocalSpeech();
              void playAudioChunk(data.audioBase64);
              if (stateRef.current !== 'SPEAKING') {
                setState('SPEAKING');
              }
            }
            break;
          case 'LIVE_TEXT_CHUNK':
            if (data.text) {
              const textChunk = data.text;
              liveVoiceTurnRef.current.addText(textChunk);


              setMessages(prev => {
                const newMsgs = [...prev];
                if (currentMessageIdRef.current) {
                  const idx = newMsgs.findIndex(m => m.id === currentMessageIdRef.current);
                  if (idx >= 0) {
                    const rawCombined = newMsgs[idx].text + textChunk;
                    const cleaned = rawCombined;
                    newMsgs[idx] = { ...newMsgs[idx], text: cleaned };
                    return newMsgs;
                  }
                }
                const cleanedChunk = textChunk;
                const newId = Date.now().toString() + '-assistant';
                currentMessageIdRef.current = newId;
                newMsgs.push({ id: newId, sender: 'assistant', text: cleanedChunk });
                return newMsgs;
              });
            }
            break;
          case 'TURN_COMPLETE': {
            const voiceFallback=liveVoiceTurnRef.current.finish();
            if(voiceFallback&&!presentationPendingRef.current&&!presentationNarratingRef.current)void speakTextRef.current(voiceFallback);
            if (presentationPendingRef.current) presentationPendingRef.current = false;
            currentMessageIdRef.current = null;
            userVoiceMessageIdRef.current = null;
            setTranscript('');
            break;
          }
          case 'INTERRUPT':
            presentationPendingRef.current = false;
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
          case 'LIVE_TRANSCRIPT':
            if (data.transcript) {
              presentationPendingRef.current = false;
              setTranscript(data.transcript);
              if (!userVoiceMessageIdRef.current) userVoiceMessageIdRef.current = createMessageId();
              const id = userVoiceMessageIdRef.current;
              setMessages(previous => {
                const existing = previous.find(message => message.id === id);
                return existing ? previous.map(message => message.id === id ? { ...message, text: data.transcript } : message)
                  : [...previous, { id, sender: 'user', text: data.transcript }];
              });
            }
            break;
          case 'TERMINAL_APPROVAL_STATUS_UPDATE':
            setMessages(prev => prev.map(m => {
              if (m.id === data.id) {

  return {
                  ...m,
                  approvalStatus: data.approved ? (data.customCommand ? 'edited' : 'approved') : 'denied',
                  executedCommand: data.customCommand || m.command,
                  remember: data.remember,
                  output: data.result?.output,
                  error: data.result?.error,
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
      voiceSessionTokenRef.current = '';
      localMicrophoneRef.current=false;
      setIsConnected(false);
      setAuthStatus({ isChecking: true, isMaster: false, isAuthorized: false, isPending: false });
      geminiLiveConnectedRef.current = false;
      setGeminiLiveReady(false);
      stopAllAudio();
      stopRecording(false);
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
  }, [playAudioChunk, stopAllAudio, initAudioContext, cancelLocalSpeech]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (presentationReadyTimerRef.current) clearTimeout(presentationReadyTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      stopAllAudio();
      if(audioContextRef.current)void audioContextRef.current.close().catch(()=>{});
      audioContextRef.current=null;analyserRef.current=null;
      stopRecording(false);
    };
  }, [connect, stopAllAudio]);

  useEffect(() => {
    const rememberGesture = () => {
      lastInteractionRef.current = Date.now();
      if (micAudioContextRef.current?.state === 'suspended') void micAudioContextRef.current.resume().catch(() => {});
      initAudioContext();
      const context=audioContextRef.current;
      if(context)void ensureAudioRunning(context).then(running=>{audioUnlockedRef.current=running;if(running)audioBlockedRef.current=false;setProactiveAudioReady(running);});
    };
    document.addEventListener('pointerdown', rememberGesture, { passive: true });
    document.addEventListener('keydown', rememberGesture);
    return () => { document.removeEventListener('pointerdown', rememberGesture); document.removeEventListener('keydown', rememberGesture); };
  }, [initAudioContext]);

  useEffect(() => {
    if (!isConnected) return;
    const sendPresence = () => {
      const focused = document.activeElement as HTMLInputElement | null;
      const typing = !!focused && ['INPUT', 'TEXTAREA'].includes(focused.tagName) && !!focused.value?.trim();
      const modalOpen = !!document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"]');
      if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({
        type: 'CLIENT_PRESENCE', visible: !document.hidden, canSpeak: audioUnlockedRef.current,
        busy: stateRef.current !== 'IDLE' || typing || modalOpen || clientBusyRef.current || !!activeAlarm,
        activeAt: lastInteractionRef.current,
      }));
    };
    sendPresence();
    const timer = window.setInterval(sendPresence, 10_000);
    document.addEventListener('visibilitychange', sendPresence);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', sendPresence); };
  }, [isConnected, state, proactiveAudioReady, activeAlarm]);

  useEffect(()=>{
    if(localMicrophoneRef.current&&wsRef.current?.readyState===WebSocket.OPEN)wsRef.current.send(JSON.stringify({type:'PAUSE_LOCAL_MIC',paused:['SPEAKING','PROCESSING'].includes(state)||presentationNarratingRef.current||presentationPendingRef.current}));
  },[state,presentationOpen,presentationReady]);

  const sendText = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    presentationPendingRef.current = false;
    stopAllAudio();
    setMessages(prev => [...prev, { id: Date.now().toString(), sender: 'user', text }]);
    initAudioContext();
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      void audioContextRef.current.resume().catch(() => {});
    }
    wsRef.current.send(JSON.stringify({ type: 'TEXT_COMMAND', text, sttMs: 0 }));
  }, [stopAllAudio, initAudioContext]);

  const stopRecording = useCallback((submit = true) => {
    micGenerationRef.current++;
    micStartingRef.current = false;
    discardRecordingRef.current = !submit;
    const wasLive = liveCaptureRef.current || localMicrophoneRef.current;
    if(localMicrophoneRef.current&&wsRef.current?.readyState===WebSocket.OPEN)wsRef.current.send(JSON.stringify({type:'STOP_LOCAL_MIC'}));
    localMicrophoneRef.current=false;
    liveCaptureRef.current = false;
    setIsMicActive(false);
    setIsMicStarting(false);
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
    if (submit && wasLive && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'SPEECH_ENDED' }));
      setState('PROCESSING');
    } else if (!submit || !mediaRecorderRef.current) {
      setState('IDLE');
    }
  }, []);

  const startLiveStreaming = useCallback(async () => {
    if (micStartingRef.current || mediaStreamRef.current) return;
    micStartingRef.current = true;
    setIsMicStarting(true);
    const generation = ++micGenerationRef.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Abra o Jasper em localhost ou HTTPS para liberar o microfone.');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true, 
          autoGainControl: true 
        } 
      });
      if (generation !== micGenerationRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
      mediaStreamRef.current = stream;
      discardRecordingRef.current = false;
      setIsMicActive(true);
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const micCtx = new AudioCtx();
      micAudioContextRef.current = micCtx;
      if (micCtx.state === 'suspended') {
        // Browser autoplay policies can keep resume() pending until a gesture.
        // Do not block microphone setup while the audio context waits.
        void micCtx.resume().catch(() => {});
      }
      if (generation !== micGenerationRef.current) return;
      const inputSampleRate = micCtx.sampleRate || 48000;
      liveCaptureRef.current = true;
      stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => {
        if (mediaStreamRef.current === stream) stopRecording(false);
      }, { once: true }));
      const source = micCtx.createMediaStreamSource(stream);
      const processor = micCtx.createScriptProcessor(2048, 1, 1);
      
      processor.onaudioprocess = (e) => {
        // Silencia a saída do buffer para que o som do microfone não saia nos alto-falantes
        for (let ch = 0; ch < e.outputBuffer.numberOfChannels; ch++) {
          e.outputBuffer.getChannelData(ch).fill(0);
        }

        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !geminiLiveConnectedRef.current) return;
        // Evita feedback acústico: quando o assistente fala, pausa o streaming
        const playing = stateRef.current === 'SPEAKING' || presentationPendingRef.current || presentationNarratingRef.current || !!localSpeechAbortRef.current || !!localSpeechSourceRef.current
          || (audioContextRef.current?.state === 'running' && nextPlayTimeRef.current > audioContextRef.current.currentTime);
        if (playing || wsRef.current.bufferedAmount > 256_000) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const base64Audio = downsampleAndConvertToInt16Base64(inputData, inputSampleRate, 16000, 1.0);
        wsRef.current.send(JSON.stringify({
          type: 'PCM_AUDIO_CHUNK',
          base64Pcm: base64Audio
        }));
      };

      source.connect(processor);
      processor.connect(micCtx.destination);
      audioProcessorRef.current = processor;
      setIsMicStarting(false);
      // Capture stays armed while the server reports whether someone is actually speaking.
    } catch (err: any) {
      if (generation !== micGenerationRef.current) return;
      console.error('Error starting live streaming', err);
      stopRecording(false);
      setMessages(previous => [...previous, {
        id: createMessageId(), sender: 'system',
        text: err.name === 'NotAllowedError' || err.name === 'SecurityError'
          ? 'Permita o acesso ao microfone no navegador e toque no botão de voz para ativar a escuta automática.'
          : `Não consegui iniciar o microfone. ${err.message || 'Confira se ele está conectado e tente novamente.'}`,
      }]);
      throw err;
    } finally {
      if (generation === micGenerationRef.current) {
        micStartingRef.current = false;
        setIsMicStarting(false);
      }
    }
  }, [stopRecording]);

  useEffect(() => {
    // A temporary blob recording must give way to live capture when it recovers.
    if (geminiLiveReady && microphoneEnabled && mediaRecorderRef.current?.state === 'recording') {
      stopRecording(false);
    }
  }, [geminiLiveReady, microphoneEnabled, stopRecording]);

  const startBlobRecording = useCallback(async () => {
    if (micStartingRef.current || mediaStreamRef.current) return;
    micStartingRef.current = true;
    const generation = ++micGenerationRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true, 
          autoGainControl: true 
        } 
      });
      if (generation !== micGenerationRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
      mediaStreamRef.current = stream;
      discardRecordingRef.current = false;
      setIsMicActive(true);
      const supportedMime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      const mediaRecorder = new MediaRecorder(stream, supportedMime ? { mimeType: supportedMime } : undefined);
      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        if (mediaRecorderRef.current === mediaRecorder) mediaRecorderRef.current = null;
        if (discardRecordingRef.current || generation !== micGenerationRef.current - 1 || !chunks.length) return;
        setState('PROCESSING');
        const reader = new FileReader();
        reader.readAsDataURL(new Blob(chunks, { type: mediaRecorder.mimeType || supportedMime || chunks[0].type }));
        reader.onloadend = () => {
          if (!discardRecordingRef.current && generation === micGenerationRef.current - 1 && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
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
      if (generation !== micGenerationRef.current) return;
      console.error('Error starting blob recording', err);
      if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
        alert("🎤 Microfone bloqueado pelo Android. \n\n1. Vá nas Configurações do Android > Aplicativos > Jasper > Permissões e libere o Microfone.\n\n2. Se o erro persistir, o WebView exige HTTPS para liberar áudio.");
      } else {
        alert("Erro no microfone: " + (err.message || "desconhecido"));
      }
      stopRecording(false);
      setState('ERROR');
    } finally {
      if (generation === micGenerationRef.current) micStartingRef.current = false;
    }
  }, [stopRecording]);

  useEffect(() => {
    const resumeMicrophone = () => {
      void automaticMicRef.current.resume({
        enabled: microphoneEnabled && typeof navigator.mediaDevices?.getUserMedia === 'function', connected: isConnected, authorized: authStatus.isAuthorized,
        liveReady: geminiLiveReady, visible: !document.hidden,
        capturing: localMicrophoneRef.current || !!mediaStreamRef.current || micStartingRef.current,
      }, startLiveStreaming);
    };
    resumeMicrophone();
    const recoveryTimer = window.setInterval(resumeMicrophone, 3000);
    document.addEventListener('visibilitychange', resumeMicrophone);
    return () => {
      window.clearInterval(recoveryTimer);
      document.removeEventListener('visibilitychange', resumeMicrophone);
    };
  }, [microphoneEnabled, isConnected, authStatus.isAuthorized, geminiLiveReady, isMicActive, startLiveStreaming]);

  const toggleMic = useCallback(() => {
    if (mediaStreamRef.current || micStartingRef.current || localMicrophoneRef.current) {
      setMicrophoneEnabled(false);
      try { localStorage.setItem('jasper_microphone_paused', 'true'); } catch {}
      stopRecording();
    } else {
      if (wsRef.current?.readyState !== WebSocket.OPEN || !authStatus.isAuthorized) return;
      setMicrophoneEnabled(true);
      try { localStorage.removeItem('jasper_microphone_paused'); } catch {}
      automaticMicRef.current.allowRetry();
      stopAllAudio();
      initAudioContext();
      userVoiceMessageIdRef.current = null;
      setTranscript('');
      if(authStatus.isMaster&&activeMic==='womic'){
        localMicrophoneRef.current=true;micStartingRef.current=true;setIsMicStarting(true);
        wsRef.current.send(JSON.stringify({type:'START_LOCAL_MIC'}));return;
      }
      if (geminiLiveConnectedRef.current) void automaticMicRef.current.resume({
        enabled: true, connected: true, authorized: true, liveReady: true, visible: true, capturing: false,
      }, startLiveStreaming);
      else void startBlobRecording();
    }
  }, [authStatus.isAuthorized, authStatus.isMaster, activeMic, stopRecording, stopAllAudio, initAudioContext, startLiveStreaming, startBlobRecording]);

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

  const requestDeviceAccess = useCallback((deviceName: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const deviceId = localStorage.getItem("jasper_device_id") || ("dev_" + Math.random().toString(36).slice(2, 10));
    localStorage.setItem("jasper_device_id", deviceId);
    localStorage.setItem("jasper_device_name", deviceName);
    setAuthStatus(prev => ({ ...prev, isPending: true, isDenied: false }));
    wsRef.current.send(JSON.stringify({
      type: "REQUEST_DEVICE_ACCESS",
      deviceId,
      deviceName,
    }));
  }, []);

  const resolveDeviceAccess = useCallback((id: string, approved: boolean) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      type: "RESOLVE_DEVICE_ACCESS",
      id,
      approved,
    }));
    setPendingDeviceRequests(prev => prev.filter(r => r.id !== id));
  }, []);

  return {
    state,
    isConnected,
    isMicActive,
    isMicStarting,
    isVoiceReady: geminiLiveReady,
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
    stopAlarm,
    readProactive,
    previewVoice,
    voiceRequest,
    apiRequest,
    getNarrationContext,
    proactiveAudioReady,
    presentation,
    presentationOpen,
    presentationReady,
    closePresentation,
    activateScene,
    openPresentation,
    setPresentationNarrating,
    authStatus,
    pendingDeviceRequests,
    requestDeviceAccess,
    resolveDeviceAccess,
  };
}
