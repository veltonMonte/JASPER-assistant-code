import type { PresentationStep } from '../lib/presentation';

export default function PresentationDrawing({ step }: { step: PresentationStep }) {
  const elements = step?.elements || [];

  return (
    <div className="presentation-drawing" role="img" aria-label={`Desenho explicativo: ${step?.title || ''}`}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {elements.map((element, index) => {
          try {
            switch (element.type) {
              case 'path':
                return (
                  <path
                    key={index}
                    d={element.d || 'M 0 0'}
                    stroke={element.color || '#5ab3cf'}
                    fill={element.fill || 'none'}
                    strokeWidth={Number.isFinite(element.width) ? element.width : 1}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              case 'ellipse':
                return (
                  <ellipse
                    key={index}
                    cx={Number.isFinite(element.x) ? element.x : 50}
                    cy={Number.isFinite(element.y) ? element.y : 50}
                    rx={Math.max(0.1, Number.isFinite(element.rx) ? element.rx : 5)}
                    ry={Math.max(0.1, Number.isFinite(element.ry) ? element.ry : 5)}
                    stroke={element.color || '#5ab3cf'}
                    fill={element.fill || 'none'}
                    strokeWidth={Number.isFinite(element.width) ? element.width : 1}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              case 'rect':
                return (
                  <rect
                    key={index}
                    x={Number.isFinite(element.x) ? element.x : 0}
                    y={Number.isFinite(element.y) ? element.y : 0}
                    width={Math.max(0.1, Number.isFinite(element.width) ? element.width : 10)}
                    height={Math.max(0.1, Number.isFinite(element.height) ? element.height : 10)}
                    rx={Math.max(0, Number.isFinite(element.radius) ? element.radius : 0)}
                    stroke={element.color || '#5ab3cf'}
                    fill={element.fill || 'none'}
                    strokeWidth={Number.isFinite(element.strokeWidth) ? element.strokeWidth : 1}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              case 'text':
                return (
                  <text
                    key={index}
                    x={Number.isFinite(element.x) ? element.x : 50}
                    y={Number.isFinite(element.y) ? element.y : 50}
                    fill={element.color || '#dce9ef'}
                    fontSize={Math.max(1, Number.isFinite(element.size) ? element.size : 4)}
                    textAnchor="middle"
                  >
                    {element.text || ''}
                  </text>
                );
              default:
                return null;
            }
          } catch {
            return null;
          }
        })}
      </svg>
    </div>
  );
}
