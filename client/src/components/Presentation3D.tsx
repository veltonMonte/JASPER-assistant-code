import { useEffect, useMemo, useRef, useState } from 'react';
import type { PresentationPart, PresentationStep } from '../lib/presentation';
import { getPresetDefinition } from '../../../shared/presentation-presets';
import { initialQuality, type QualityTier } from '../presentation/runtime/quality';
import { SceneRuntime, type SceneStats } from '../presentation/runtime/SceneRuntime';

const EMPTY_PARTS: PresentationPart[] = [];

function FallbackScene({ step }: { step: PresentationStep }) {
  const preset = step.preset || 'custom';
  const title = getPresetDefinition(preset).label;
  return <svg className="presentation-3d-fallback" viewBox="0 0 100 100" aria-label={`Esquema leve: ${step.title}`}>
    <g fill="none" stroke="#8fcbdc" strokeWidth=".6">
      {preset === 'atom' && <><ellipse cx="50" cy="48" rx="30" ry="14" /><ellipse cx="50" cy="48" rx="30" ry="14" transform="rotate(60 50 48)" /><ellipse cx="50" cy="48" rx="30" ry="14" transform="rotate(120 50 48)" /><circle cx="50" cy="48" r="6" fill="#c67183" /></>}
      {preset === 'cyber_car' && <><path d="M18 59 L20 45 L33 42 L42 32 L65 32 L76 43 L84 47 L84 59 Z M33 42 H76 M42 32 L41 42 M65 32 L68 43" /><circle cx="32" cy="59" r="7" /><circle cx="72" cy="59" r="7" /></>}
      {preset === 'solar_system' && <><circle cx="50" cy="48" r="7" fill="#e5ad64" />{[15,24,33].map((radius,index)=><g key={radius}><ellipse cx="50" cy="48" rx={radius} ry={radius * .5} /><circle cx={50+radius} cy="48" r={2+index} fill="#79b5cc" /></g>)}</>}
      {preset === 'flow_field' && <path d="M50 45 C10 10 5 90 45 65 C85 35 85 10 65 22 C40 40 12 70 32 76 C65 90 95 20 60 28 C20 40 10 50 30 66" />}
      {preset === 'neural_network' && [25,50,75].map((x,index)=><g key={x}>{[30,48,66].map(y=><g key={y}><circle cx={x} cy={y} r="3" fill="#26556a" />{index < 2 && [30,48,66].map(target=><path key={target} d={`M${x+3} ${y} L${x+22} ${target}`} opacity=".45" />)}</g>)}</g>)}
      {preset === 'custom' && (step.parts || []).slice(0,24).map((part,index)=>{const [x,y,z]=part.position;return <g key={index}><circle cx={50+(x-z*.5)*5} cy={47-(y+(x+z)*.25)*5} r={Math.max(2,part.size[0]*2)} fill={part.color} /><text x={50+(x-z*.5)*5} y={54-(y+(x+z)*.25)*5} fontSize="2.5" fill="#d0e4ef" stroke="none" textAnchor="middle">{part.label}</text></g>;})}
    </g>
    <text x="50" y="84" textAnchor="middle" fill="#c5dbe6" fontSize="3.5">{title}</text>
    <text x="50" y="90" textAnchor="middle" fill="#7f9baa" fontSize="2.5">Representação leve disponível neste navegador</text>
  </svg>;
}

export default function Presentation3D({ parts = EMPTY_PARTS, step }: { parts?: PresentationPart[]; step?: PresentationStep }) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<SceneRuntime | null>(null);
  const [fallback, setFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SceneStats | null>(null);
  const [rotating, setRotating] = useState(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [quality, setQuality] = useState<QualityTier>(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem('jasper_3d_quality'); } catch (error) { console.warn('A qualidade 3D não pôde ser recuperada.', error); }
    return initialQuality({ query: new URLSearchParams(location.search).get('quality'), saved, cores: navigator.hardwareConcurrency, memory: (navigator as any).deviceMemory, pixelRatio: devicePixelRatio, width: innerWidth });
  });
  const debug = new URLSearchParams(location.search).get('debug') === '1';
  const currentStep = useMemo<PresentationStep>(() => step || { kind: 'model3d', preset: 'custom', title: 'Objeto', narration: '', parts }, [step, parts]);

  useEffect(() => {
    if (!host.current) return;
    try {
      const scene = new SceneRuntime(host.current, quality, { onStats: next => { setStats(next); setQuality(next.tier); }, onError: () => { setFallback(true); setLoading(false); }, onLoading: setLoading });
      runtime.current = scene;
      return () => { scene.dispose(); runtime.current = null; };
    } catch (error) { console.error('A renderização 3D não pôde ser iniciada.', error); setFallback(true); setLoading(false); }
  }, []);
  useEffect(() => { if (runtime.current) void runtime.current.setSubject(currentStep); }, [currentStep]);

  const chooseQuality = (tier: QualityTier) => {
    setQuality(tier); runtime.current?.setQuality(tier);
    try { localStorage.setItem('jasper_3d_quality', tier); } catch (error) { console.warn('A preferência de qualidade não pôde ser salva.', error); }
  };
  return <div className="presentation-3d-canvas" ref={host} role="img" aria-label={fallback ? `Esquema visual de ${currentStep.title}` : `Modelo 3D interativo: ${currentStep.title}`}>
    {fallback ? <FallbackScene step={currentStep} /> : <>
      {loading && <span className="scene-loading" role="status">Construindo a representação…</span>}
      <div className="scene-quality-controls">
        <button type="button" onClick={() => { const value = !rotating; setRotating(value); runtime.current?.setAutoRotate(value); }} aria-pressed={rotating}>{rotating ? 'Pausar câmera' : 'Girar câmera'}</button>
        <label>Qualidade<select aria-label="Qualidade do 3D" value={quality} onChange={event => chooseQuality(event.target.value as QualityTier)}><option value="low">Leve</option><option value="medium">Equilibrada</option><option value="high">Alta</option></select></label>
      </div>
      {debug && stats && <output className="scene-debug" aria-label="Depuração 3D">
        {`${stats.fps.toFixed(1)} FPS · quadro ${stats.frameMs.toFixed(1)} ms · pior ${stats.worstMs.toFixed(1)} ms\nQualidade ${stats.tier} · pontos ${stats.points}/${stats.maxPoints} · desenhados ${stats.renderedPoints}\nChamadas ${stats.calls} · geometrias ${stats.geometries} · texturas ${stats.textures}\nContextos ${stats.contexts} · geração ${stats.generationMs.toFixed(1)} ms${stats.heapMB ? ` · memória JS ${stats.heapMB.toFixed(1)} MB` : ''}\n${stats.history.join(' → ')}`}
      </output>}
    </>}
  </div>;
}
