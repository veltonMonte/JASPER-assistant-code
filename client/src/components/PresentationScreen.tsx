import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Box, Network, Pause, Pencil, Play, RotateCcw, X } from 'lucide-react';
import Presentation3D from './Presentation3D';
import PresentationDrawing from './PresentationDrawing';
import type { Presentation, PresentationStep } from '../lib/presentation';

function Diagram({ step }: { step: PresentationStep }) {
  const nodes = step?.nodes || [];
  const byId = new Map(nodes.map(node => [node.id, node]));
  const markerId = 'presentation-arrow';

  return (
    <div className="presentation-diagram" role="img" aria-label={`Diagrama: ${step?.title || ''}`}>
      <svg className="presentation-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <marker id={markerId} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0 0 L7 3.5 L0 7" fill="none" stroke="#97cfdd" strokeWidth="1.3" />
          </marker>
        </defs>
        {(step?.links || []).map((link, index) => {
          const from = byId.get(link.from);
          const to = byId.get(link.to);
          if (!from || !to) return null;
          const fx = Number.isFinite(from.x) ? from.x : 50;
          const fy = Number.isFinite(from.y) ? from.y : 50;
          const tx = Number.isFinite(to.x) ? to.x : 50;
          const ty = Number.isFinite(to.y) ? to.y : 50;
          const dx = tx - fx, dy = ty - fy;
          const length = Math.hypot(dx, dy) || 1;
          const pad = 6.5;
          const x1 = fx + (dx / length) * pad;
          const y1 = fy + (dy / length) * pad;
          const x2 = tx - (dx / length) * pad;
          const y2 = ty - (dy / length) * pad;
          return (
            <g key={`${link.from}-${link.to}-${index}`}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#527283" strokeWidth="0.8" markerEnd={`url(#${markerId})`} />
              {link.label && (
                <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 2} fill="#9cb0bd" fontSize="2.5" textAnchor="middle">
                  {link.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {nodes.map((node, index) => (
        <div
          key={node.id || index}
          className="presentation-node"
          style={{
            left: `${Math.max(5, Math.min(90, Number.isFinite(node.x) ? node.x : 50))}%`,
            top: `${Math.max(5, Math.min(85, Number.isFinite(node.y) ? node.y : 50))}%`,
            '--node-color': node.color || '#5ab3cf',
          } as React.CSSProperties}
        >
          <span className="presentation-node-index">{String(index + 1).padStart(2, '0')}</span>
          <strong>{node.label || 'Bloco'}</strong>
          {node.detail && <small>{node.detail}</small>}
        </div>
      ))}
    </div>
  );
}

function playbackRange(audio: AudioBuffer): { offset: number; duration: number } {
  try {
    if (!audio || !audio.sampleRate || audio.length === 0) {
      return { offset: 0, duration: 1 };
    }
    const samples = audio.getChannelData(0);
    const maxTrim = Math.floor(audio.sampleRate * 0.14);
    let start = 0;
    let end = samples.length - 1;
    while (start < maxTrim && Math.abs(samples[start] || 0) < 0.0015) start++;
    while (end > samples.length - 1 - maxTrim && Math.abs(samples[end] || 0) < 0.0015) end--;
    const offset = Math.max(0, start / audio.sampleRate - 0.012);
    const duration = Math.max(0.1, (end + 1) / audio.sampleRate - offset);
    return { offset, duration };
  } catch {
    return { offset: 0, duration: audio?.duration || 1 };
  }
}

export default function PresentationScreen({
  presentation,
  ready,
  request,
  getNarrationContext,
  onClose,
  onNarratingChange,
}: {
  presentation: Presentation;
  ready: boolean;
  request: (path: string, init?: RequestInit) => Promise<Response>;
  getNarrationContext: () => AudioContext;
  onClose: () => void;
  onNarratingChange: (value: boolean) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [error, setError] = useState('');

  const step = presentation.steps[stepIndex];

  useEffect(() => {
    setStepIndex(0);
    setPlaying(true);
    setError('');
  }, [presentation.id]);

  const clipCache = useRef(new Map<number, Promise<ArrayBuffer>>());
  const clipAbort = useRef(new AbortController());

  useEffect(() => {
    clipAbort.current.abort();
    clipAbort.current = new AbortController();
    clipCache.current.clear();
    return () => {
      clipAbort.current.abort();
      clipCache.current.clear();
    };
  }, [presentation.id]);

  const getSafeContext = useCallback((): AudioContext => {
    try {
      if (typeof getNarrationContext === 'function') {
        const ctx = getNarrationContext();
        if (ctx) return ctx;
      }
    } catch {}
    return new (window.AudioContext || (window as any).webkitAudioContext)();
  }, [getNarrationContext]);

  const loadClip = useCallback(
    (index: number): Promise<ArrayBuffer> => {
      const cached = clipCache.current.get(index);
      if (cached) return cached;
      const stepItem = presentation.steps[index];
      if (!stepItem || !stepItem.narration) {
        return Promise.reject(new Error('Etapa sem narração'));
      }
      const pending = request('speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: stepItem.narration, style: 'lesson' }),
        signal: clipAbort.current.signal,
      })
        .then(async response => {
          if (!response.ok || !response.headers.get('content-type')?.startsWith('audio/wav')) {
            const detail = await response.json().catch(() => null);
            throw new Error(typeof detail?.error === 'string' ? detail.error : 'A narração está indisponível.');
          }
          return response.arrayBuffer();
        })
        .catch(cause => {
          clipCache.current.delete(index);
          throw cause;
        });
      clipCache.current.set(index, pending);
      return pending;
    },
    [presentation, request]
  );

  // Load current step immediately
  useEffect(() => {
    if (presentation.steps[stepIndex]) {
      void loadClip(stepIndex).catch(() => {});
    }
  }, [stepIndex, loadClip, presentation.steps]);

  // Background prefetch for next step only
  useEffect(() => {
    let cancelled = false;
    const nextIndex = stepIndex + 1;
    if (nextIndex < presentation.steps.length) {
      const timer = setTimeout(() => {
        if (!cancelled) void loadClip(nextIndex).catch(() => {});
      }, 500);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }
  }, [stepIndex, loadClip, presentation.steps.length]);

  useEffect(() => {
    onNarratingChange(ready && playing);
    return () => onNarratingChange(false);
  }, [ready, playing, onNarratingChange]);

  useEffect(() => {
    if (!ready || !playing || !step) return;
    let source: AudioBufferSourceNode | null = null;
    let disposed = false;
    setAudioPlaying(false);
    setError('');

    const speak = async () => {
      try {
        const wav = await loadClip(stepIndex);
        if (disposed) return;
        const context = getSafeContext();
        if (context.state === 'suspended') {
          const resumed = await Promise.race([
            context.resume().then(() => true).catch(() => false),
            new Promise<boolean>(resolve => setTimeout(() => resolve(false), 800)),
          ]);
          if (!resumed) {
            throw new Error('Toque em reproduzir para iniciar a fala.');
          }
        }
        if (disposed) return;
        const audio = await context.decodeAudioData(wav.slice(0));
        if (disposed) return;

        source = context.createBufferSource();
        source.buffer = audio;
        source.connect(context.destination);
        source.onended = () => {
          if (disposed) return;
          if (stepIndex < presentation.steps.length - 1) {
            setStepIndex(stepIndex + 1);
          } else {
            setPlaying(false);
          }
        };
        const { offset, duration } = playbackRange(audio);
        source.start(0, offset, duration);
        setAudioPlaying(true);
      } catch (cause) {
        if (disposed || clipAbort.current.signal.aborted) return;
        setPlaying(false);
        setError(cause instanceof Error ? cause.message : 'Não foi possível reproduzir a narração.');
      }
    };

    void speak();

    return () => {
      disposed = true;
      if (source) {
        source.onended = null;
        try {
          source.stop();
        } catch {}
        source.disconnect();
      }
    };
  }, [ready, playing, presentation.id, presentation.steps.length, step, stepIndex, loadClip, getSafeContext]);

  const goTo = (index: number) => {
    try {
      void getSafeContext().resume().catch(() => {});
    } catch {}
    setStepIndex(Math.max(0, Math.min(presentation.steps.length - 1, index)));
    setPlaying(true);
    setError('');
  };

  return (
    <main className="presentation-screen" id="main">
      <header className="presentation-header">
        <div>
          <span className="stage-eyebrow">JASPER / ESTÚDIO VISUAL</span>
          <h1>{presentation.title}</h1>
          <p>{presentation.subtitle || 'Uma ideia ganha forma, etapa por etapa.'}</p>
        </div>
        <button type="button" className="presentation-close" onClick={onClose} aria-label="Voltar à conversa">
          <X size={20} />
          <span>Voltar à conversa</span>
        </button>
      </header>
      <div className="presentation-layout">
        <section className="presentation-stage" aria-label="Representação visual">
          <div className="presentation-stage-top">
            <span>
              {step?.kind === 'model3d' ? (
                <>
                  <Box size={15} /> MODELO 3D
                </>
              ) : step?.kind === 'drawing' ? (
                <>
                  <Pencil size={15} /> DESENHO
                </>
              ) : (
                <>
                  <Network size={15} /> DIAGRAMA
                </>
              )}
            </span>
            <span>
              ETAPA {String(stepIndex + 1).padStart(2, '0')} / {String(presentation.steps.length).padStart(2, '0')}
            </span>
          </div>
          {step?.kind === 'model3d' ? (
            <Presentation3D parts={step.parts || []} step={step} />
          ) : step?.kind === 'drawing' ? (
            <PresentationDrawing key={stepIndex} step={step} />
          ) : (
            <Diagram key={stepIndex} step={step} />
          )}
          {step?.kind === 'model3d' && <div className="presentation-hint">Arraste para girar · Role para ampliar</div>}
        </section>
        <aside className="presentation-side">
          <div className="presentation-step-heading">
            <span>AGORA EM EXIBIÇÃO</span>
            <h2 key={stepIndex}>{step?.title || ''}</h2>
          </div>
          <p className="presentation-narration" key={stepIndex}>
            {step?.narration || ''}
          </p>
          {step?.kind === 'model3d' && (
            <div className="presentation-parts">
              {[...new Set((step.parts || []).map(part => part.label).filter(Boolean))].map(label => (
                <span key={label}>{label}</span>
              ))}
            </div>
          )}
          {error && (
            <p className="presentation-error" role="alert">
              {error} Você pode avançar ou tentar reproduzir novamente.
            </p>
          )}
          <div className="presentation-side-bottom">
            <div className="presentation-progress" aria-label="Etapas da apresentação">
              {presentation.steps.map((item, index) => (
                <button
                  type="button"
                  key={index}
                  className={index === stepIndex ? 'active' : ''}
                  onClick={() => goTo(index)}
                  aria-label={`Ir para etapa ${index + 1}: ${item.title}`}
                />
              ))}
            </div>
            <div className="presentation-controls">
              <button type="button" onClick={() => goTo(stepIndex - 1)} disabled={stepIndex === 0} aria-label="Etapa anterior">
                <ArrowLeft size={18} />
              </button>
              <button
                type="button"
                className="presentation-play"
                onClick={() => {
                  if (!playing) {
                    try {
                      void getSafeContext().resume().catch(() => {});
                    } catch {}
                  }
                  setPlaying(!playing);
                  setError('');
                }}
                aria-label={playing ? 'Pausar narração' : 'Reproduzir narração'}
              >
                {playing ? (
                  <Pause size={18} />
                ) : stepIndex === presentation.steps.length - 1 && !error ? (
                  <RotateCcw size={18} />
                ) : (
                  <Play size={18} />
                )}
              </button>
              <button
                type="button"
                onClick={() => goTo(stepIndex + 1)}
                disabled={stepIndex === presentation.steps.length - 1}
                aria-label="Próxima etapa"
              >
                <ArrowRight size={18} />
              </button>
            </div>
            <span className="presentation-voice-status">
              {!ready || (playing && !audioPlaying)
                ? 'Preparando narração…'
                : playing
                ? 'Jasper está apresentando'
                : 'Apresentação pausada'}
            </span>
          </div>
        </aside>
      </div>
    </main>
  );
}
