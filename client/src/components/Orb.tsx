import React, { useRef, useEffect } from 'react';

export type OrbState = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING';

interface OrbProps {
  state: OrbState;
  getAudioLevel?: () => number;
}

// Simple deterministic pseudo-random function
function hash(x: number, y: number): number {
  const dot = x * 12.9898 + y * 78.233;
  return (Math.sin(dot) * 43758.5453123) % 1;
}

// Simple 2D value noise
function noise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);

  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  return a * (1 - ux) * (1 - uy) +
         b * ux * (1 - uy) +
         c * (1 - ux) * uy +
         d * ux * uy;
}

export default function Orb({ state, getAudioLevel }: OrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 200;
    const radius = 50;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    // Pre-generate noise texture
    const noiseCanvas = document.createElement('canvas');
    noiseCanvas.width = size;
    noiseCanvas.height = size;
    const noiseCtx = noiseCanvas.getContext('2d')!;
    const noiseData = noiseCtx.createImageData(size, size);
    for (let i = 0; i < noiseData.data.length; i += 4) {
      const v = Math.random() * 255;
      noiseData.data[i] = v;
      noiseData.data[i + 1] = v;
      noiseData.data[i + 2] = v;
      noiseData.data[i + 3] = 20; // light opacity for grain
    }
    noiseCtx.putImageData(noiseData, 0, 0);

    let animationFrameId: number;
    let time = 0;
    let globalPhase = 0;
    let smoothedSpeedMult = 0.5;
    let smoothedErratic = 0;
    let smoothedScale = 1;
    let smoothedAudioLvl = 0;
    
    // Blob definitions originais (lava lamp luminosa sem pontos escuros)
    const blobs = [
      { color: '#ffb3ba', size: 36, speedX: 1, speedY: 1.2, offset: 0 },
      { color: '#fed7f2', size: 34, speedX: -1.5, speedY: 0.8, offset: 2 },
      { color: '#c4b5fd', size: 42, speedX: 0.8, speedY: -1.3, offset: 4 },
      { color: '#60a5fa', size: 38, speedX: -1.1, speedY: -1.1, offset: 6 },
      { color: '#22d3ee', size: 34, speedX: 1.3, speedY: 1.5, offset: 8 },
    ];

    const render = () => {
      const currentState = stateRef.current;
      time += 0.01; // Real continuous time for rhythmic pulsing

      let targetSpeedMult = 1;
      let targetErratic = 0;
      let targetScale = 1;
      let currentAudioLvl = 0;

      // Base parameters based on state
      switch (currentState) {
        case 'IDLE':
          targetScale = 1 + Math.sin(time * 2) * 0.02; // slow breathing
          targetSpeedMult = 0.5;
          targetErratic = 0;
          break;
        case 'LISTENING':
          targetScale = 1.05 + Math.sin(time * 4) * 0.03; // slightly elevated
          targetSpeedMult = 1.0;
          targetErratic = 0.3;
          break;
        case 'PROCESSING':
          targetScale = 0.95 + Math.sin(time * 6) * 0.03; // tight, fast throb (focused thinking)
          targetSpeedMult = 0.2; // slow drift like a lava lamp deep in thought
          targetErratic = 0.5; // organic shifting
          break;
        case 'SPEAKING': {
          if (getAudioLevel) {
            currentAudioLvl = getAudioLevel();
          }
          // Suaviza a transição do nível de áudio (fator menor = menos brusco)
          smoothedAudioLvl += (currentAudioLvl - smoothedAudioLvl) * 0.08;
          
          const audioBoost = smoothedAudioLvl; 
          // A pulsação agora depende puramente do áudio (removemos o Math.sin base)
          targetScale = 1.0 + (audioBoost * 0.25); 
          targetSpeedMult = 1.0 + (audioBoost * 0.5); // lava lamp acelera bem sutilmente
          targetErratic = 0.5 + (audioBoost * 0.2); // pouquíssima distorção base
          break;
        }
      }

      // Suavização das transições para que nada "pule"
      smoothedSpeedMult += (targetSpeedMult - smoothedSpeedMult) * 0.05;
      smoothedErratic += (targetErratic - smoothedErratic) * 0.05;
      smoothedScale += (targetScale - smoothedScale) * 0.1;

      // Integrador de fase: avança continuamente baseado na velocidade atual (nunca retrocede ou salta)
      globalPhase += 0.01 * smoothedSpeedMult;

      ctx.clearRect(0, 0, size, size);

      ctx.save();
      // Center and scale
      ctx.translate(size / 2, size / 2);
      ctx.scale(smoothedScale, smoothedScale);

      // Formato Cápsula (Ondas ativadas EXCLUSIVAMENTE ao falar - SPEAKING)
      const drawOrbPath = () => {
        ctx.beginPath();
        const baseRx = 76;
        const baseRy = 48;
        
        const isSpeaking = currentState === 'SPEAKING';
        const audioAmp = isSpeaking ? Math.max(smoothedAudioLvl, 0.15) : 0;

        const straightWidth = Math.max(0, baseRx - baseRy);

        if (isSpeaking && audioAmp > 0.01) {
          const numSteps = 72;
          const points: { x: number; y: number }[] = [];

          for (let i = 0; i <= numSteps; i++) {
            const u = i / numSteps;
            const angle = u * Math.PI * 2;

            let px = 0;
            let py = 0;
            let nx = Math.cos(angle);
            let ny = Math.sin(angle);

            if (u < 0.25) {
              const t = u / 0.25;
              px = -straightWidth + t * (2 * straightWidth);
              py = -baseRy;
              nx = 0; ny = -1;
            } else if (u < 0.5) {
              const t = (u - 0.25) / 0.25;
              const a = -Math.PI / 2 + t * Math.PI;
              px = straightWidth + Math.cos(a) * baseRy;
              py = Math.sin(a) * baseRy;
              nx = Math.cos(a); ny = Math.sin(a);
            } else if (u < 0.75) {
              const t = (u - 0.5) / 0.25;
              px = straightWidth - t * (2 * straightWidth);
              py = baseRy;
              nx = 0; ny = 1;
            } else {
              const t = (u - 0.75) / 0.25;
              const a = Math.PI / 2 + t * Math.PI;
              px = -straightWidth + Math.cos(a) * baseRy;
              py = Math.sin(a) * baseRy;
              nx = Math.cos(a); ny = Math.sin(a);
            }

            // Deformação de ruído 2D ativada apenas na fala do assistente
            const nSpaceX = Math.cos(angle) * 1.5;
            const nSpaceY = Math.sin(angle) * 1.5;
            const n = noise(nSpaceX + time * 5, nSpaceY + time * 5);
            
            const deformation = (n - 0.5) * (audioAmp * 10);

            px += nx * deformation;
            py += ny * deformation;

            points.push({ x: px, y: py });
          }

          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
          }
          ctx.closePath();
        } else {
          ctx.moveTo(-straightWidth, -baseRy);
          ctx.lineTo(straightWidth, -baseRy);
          ctx.arc(straightWidth, 0, baseRy, -Math.PI / 2, Math.PI / 2, false);
          ctx.lineTo(-straightWidth, baseRy);
          ctx.arc(-straightWidth, 0, baseRy, Math.PI / 2, -Math.PI / 2, false);
          ctx.closePath();
        }
      };

      // Weak white glow when processing
      if (currentState === 'PROCESSING') {
        ctx.save();
        drawOrbPath();
        ctx.shadowColor = 'rgba(255, 255, 255, 0.4)'; // Weak white light
        ctx.shadowBlur = 25;
        // Draw a completely transparent shape just to trigger the shadow
        ctx.fillStyle = 'rgba(255, 255, 255, 0.01)'; 
        ctx.fill();
        ctx.restore();
      }

      // Create circular clipping mask for the orb constraint
      drawOrbPath();
      ctx.clip();

      // Clear background inside clip with illuminated deep violet tone (eliminando pontos escuros)
      ctx.fillStyle = '#221c38';
      ctx.fill();

      // Apply blur to all blobs
      ctx.filter = 'blur(12px)';

      blobs.forEach((blob, i) => {
        const t = globalPhase + blob.offset;
        
        let nx = noise(t * 0.5, i * 10);
        let ny = noise(t * 0.5 + 100, i * 10);

        // Movimento orgânico (lava lamp)
        let x = Math.sin(t * blob.speedX) * 20;
        let y = Math.cos(t * blob.speedY) * 20;
        let currentBlobSize = blob.size;

        // Efeito Onda Sonora: vibração de alta frequência durante a fala
        if (currentState === 'SPEAKING' && smoothedAudioLvl > 0.005) {
          const waveAmplitude = smoothedAudioLvl * 12; // Bem mais suave (era 60)
          
          // Frequências ligeiramente reduzidas para não parecer um glitch
          const freqY = 30 + (i * 10);
          const freqX = 20 + (i * 8);
          
          y += Math.sin(time * freqY) * waveAmplitude;
          x += Math.cos(time * freqX) * (waveAmplitude * 0.2); // Quase zero tremor horizontal
          
          currentBlobSize += smoothedAudioLvl * 4; // Quase não infla para evitar pulos
        }

        if (smoothedErratic > 0) {
          x += (nx - 0.5) * 30 * smoothedErratic;
          y += (ny - 0.5) * 30 * smoothedErratic;
        }

        ctx.beginPath();
        ctx.arc(x, y, currentBlobSize, 0, Math.PI * 2);
        ctx.fillStyle = blob.color;
        ctx.fill();
      });

      ctx.filter = 'none';

      // Draw noise overlay
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.4;
      
      // Moving noise texture
      const noiseOffsetX = Math.sin(globalPhase) * 10;
      const noiseOffsetY = Math.cos(globalPhase) * 10;
      
      ctx.drawImage(
        noiseCanvas, 
        -size/2 + noiseOffsetX, 
        -size/2 + noiseOffsetY, 
        size, 
        size
      );

      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = 'source-over';

      // Contorno branco elegante e luminoso ao redor da cápsula
      drawOrbPath();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.shadowColor = 'rgba(255, 255, 255, 0.6)';
      ctx.shadowBlur = 10;
      ctx.stroke();

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="orb-wrapper" style={{ display: 'inline-flex', justifyContent: 'center', alignItems: 'center' }}>
      <canvas 
        ref={canvasRef} 
        className="orb-canvas" 
        style={{ width: '200px', height: '200px', display: 'block' }} 
      />
    </div>
  );
}
