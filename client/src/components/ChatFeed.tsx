import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  User, Bot, Zap, TrendingUp,
  Copy, Check, Loader2, CheckCircle2, AlertCircle, ShieldCheck, ShieldAlert,
  AlertTriangle, Edit3, X, Keyboard, Sparkles, Terminal, Search, BarChart2,
  Cpu, Brain, Activity, ChevronDown, ChevronUp, Clock, Globe, Image,
  Maximize2, ExternalLink
} from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import Orb from './Orb';
export interface Message {
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

export interface ChatFeedProps {
  messages: Message[];
  onApproveTerminal?: (id: string, approved: boolean, customCommand?: string, remember?: boolean) => void;
}

function isThinkingLine(line: string): boolean {
  const l = line.toLowerCase().trim();
  if (!l) return false;
  const explicitThinkingKeywords = [
    'clarifying the user', 'grappling with the', 'my focus is to', 'outlining response to',
    'initiating search for', 'refining pipeline action'
  ];
  return explicitThinkingKeywords.some(kw => l.includes(kw));
}

const cleanText = (text: string) => {
  if (!text) return '';
  // Remove explicit <think>...</think> tags if model emits them
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  return cleaned;
};

const DEFAULT_SERIES_COLORS = ['#38bdf8', '#818cf8', '#34d399', '#f472b6', '#fbbf24', '#a78bfa', '#2dd4bf'];

const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="chart-tooltip-glass">
        <div className="tooltip-header">{label}</div>
        <div className="tooltip-body">
          {payload.map((entry: any, idx: number) => (
            <div key={`item-${idx}`} className="tooltip-row">
              <span className="tooltip-dot" style={{ backgroundColor: entry.color || entry.fill || '#06b6d4' }} />
              <span className="tooltip-label">{entry.name}:</span>
              <span className="tooltip-val">
                {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

const ChartComponent: React.FC<{ jsonStr: string }> = ({ jsonStr }) => {
  const [copied, setCopied] = useState(false);
  const [chartTypeState, setChartTypeState] = useState<'line' | 'bar' | 'area'>('bar');

  try {
    const config = JSON.parse(jsonStr);
    const { type = 'bar', data, xKey = 'name', series = [], title = 'Visualização de Dados' } = config;

    useEffect(() => {
      if (type === 'line' || type === 'bar' || type === 'area') {
        setChartTypeState(type);
      }
    }, [type]);

    if (!data || !Array.isArray(data) || !series || !Array.isArray(series)) {
      return <div className="chart-error-card">Configuração de gráfico Recharts inválida ou incompleta.</div>;
    }

    const handleCopyJSON = () => {
      navigator.clipboard.writeText(jsonStr);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    const renderChart = () => {
      const activeType = chartTypeState;

      return (
        <ResponsiveContainer width="100%" height={290}>
          {activeType === 'line' ? (
            <LineChart data={data} margin={{ top: 15, right: 45, left: 10, bottom: 20 }}>
              <defs>
                {series.map((s: any, idx: number) => {
                  const color = s.color || DEFAULT_SERIES_COLORS[idx % DEFAULT_SERIES_COLORS.length];
                  return (
                    <linearGradient key={`grad-${idx}`} id={`lineGrad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={color} stopOpacity={0.0} />
                    </linearGradient>
                  );
                })}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.07)" vertical={false} />
              <XAxis dataKey={xKey} stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} padding={{ left: 15, right: 30 }} axisLine={false} tickLine={false} />
              <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ color: '#cbd5e1', paddingTop: '12px', fontSize: '13px' }} />
              {series.map((s: any, idx: number) => {
                const color = s.color || DEFAULT_SERIES_COLORS[idx % DEFAULT_SERIES_COLORS.length];
                return (
                  <Line
                    key={s.dataKey}
                    type="monotone"
                    dataKey={s.dataKey}
                    stroke={color}
                    name={s.name || s.dataKey}
                    strokeWidth={3}
                    dot={{ r: 4, strokeWidth: 2, fill: '#0f172a', stroke: color }}
                    activeDot={{ r: 7, strokeWidth: 0, fill: color }}
                  />
                );
              })}
            </LineChart>
          ) : activeType === 'area' ? (
            <AreaChart data={data} margin={{ top: 15, right: 45, left: 10, bottom: 20 }}>
              <defs>
                {series.map((s: any, idx: number) => {
                  const color = s.color || DEFAULT_SERIES_COLORS[idx % DEFAULT_SERIES_COLORS.length];
                  return (
                    <linearGradient key={`grad-area-${idx}`} id={`areaGrad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.6} />
                      <stop offset="95%" stopColor={color} stopOpacity={0.05} />
                    </linearGradient>
                  );
                })}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.07)" vertical={false} />
              <XAxis dataKey={xKey} stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} padding={{ left: 15, right: 30 }} axisLine={false} tickLine={false} />
              <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ color: '#cbd5e1', paddingTop: '12px', fontSize: '13px' }} />
              {series.map((s: any, idx: number) => {
                const color = s.color || DEFAULT_SERIES_COLORS[idx % DEFAULT_SERIES_COLORS.length];
                return (
                  <Area
                    key={s.dataKey}
                    type="monotone"
                    dataKey={s.dataKey}
                    stroke={color}
                    fill={`url(#areaGrad-${idx})`}
                    name={s.name || s.dataKey}
                    strokeWidth={2}
                  />
                );
              })}
            </AreaChart>
          ) : (
            <BarChart data={data} margin={{ top: 15, right: 45, left: 10, bottom: 20 }}>
              <defs>
                {series.map((s: any, idx: number) => {
                  const color = s.color || DEFAULT_SERIES_COLORS[idx % DEFAULT_SERIES_COLORS.length];
                  return (
                    <linearGradient key={`grad-bar-${idx}`} id={`barGrad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.9} />
                      <stop offset="100%" stopColor={color} stopOpacity={0.5} />
                    </linearGradient>
                  );
                })}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.07)" vertical={false} />
              <XAxis dataKey={xKey} stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} padding={{ left: 15, right: 30 }} axisLine={false} tickLine={false} />
              <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.04)', radius: 6 }} />
              <Legend wrapperStyle={{ color: '#cbd5e1', paddingTop: '12px', fontSize: '13px' }} />
              {series.map((s: any, idx: number) => {
                const color = s.color || DEFAULT_SERIES_COLORS[idx % DEFAULT_SERIES_COLORS.length];
                return (
                  <Bar
                    key={s.dataKey}
                    dataKey={s.dataKey}
                    fill={`url(#barGrad-${idx})`}
                    stroke={color}
                    strokeWidth={1}
                    name={s.name || s.dataKey}
                    radius={[6, 6, 0, 0]}
                  />
                );
              })}
            </BarChart>
          )}
        </ResponsiveContainer>
      );
    };

    return (
      <div className="recharts-glass-card">
        <div className="recharts-card-header">
          <div className="header-left">
            <div className="chart-sparkle-icon">
              <TrendingUp size={16} />
            </div>
            <div className="chart-header-info">
              <h4 className="chart-title">{title}</h4>
              <div className="chart-tags">
                <span className="chart-type-pill">{chartTypeState.toUpperCase()}</span>
                <span className="chart-count-pill">{data.length} registros</span>
              </div>
            </div>
          </div>

          <div className="header-right">
            <div className="chart-type-toggle">
              <button
                className={`btn-toggle-type ${chartTypeState === 'bar' ? 'active' : ''}`}
                onClick={() => setChartTypeState('bar')}
                title="Visão em Barras"
              >
                <BarChart2 size={13} />
              </button>
              <button
                className={`btn-toggle-type ${chartTypeState === 'line' ? 'active' : ''}`}
                onClick={() => setChartTypeState('line')}
                title="Visão em Linhas"
              >
                <TrendingUp size={13} />
              </button>
              <button
                className={`btn-toggle-type ${chartTypeState === 'area' ? 'active' : ''}`}
                onClick={() => setChartTypeState('area')}
                title="Visão em Área"
              >
                <Activity size={13} />
              </button>
            </div>

            <button onClick={handleCopyJSON} className="btn-copy-chart-json" title="Copiar JSON do Gráfico">
              {copied ? <Check size={13} style={{ color: '#10b981' }} /> : <Copy size={13} />}
              <span>{copied ? 'Copiado' : 'JSON'}</span>
            </button>
          </div>
        </div>

        <div className="recharts-card-body">
          {renderChart()}
        </div>
      </div>
    );
  } catch (err) {
    return <div className="chart-error-card">Erro ao renderizar gráfico: JSON de configuração inválido.</div>;
  }
};

const ImageGalleryWidget: React.FC<{ jsonStr: string }> = ({ jsonStr }) => {
  const [selectedImage, setSelectedImage] = useState<any | null>(null);

  try {
    const data = JSON.parse(jsonStr);
    const images = data.images || [];
    const query = data.query || 'Imagens';

    if (!images || images.length === 0) {
      return (
        <div className="image-gallery-empty-card">
          <Loader2 size={18} className="spin icon-loader" />
          <span>Buscando resultados atuais na web...</span>
        </div>
      );
    }

    return (
      <div className="image-gallery-card">
        <div className="image-gallery-header">
          <div className="header-left">
            <div className="gallery-icon-pill">
              <Image size={16} />
            </div>
            <div className="gallery-header-text">
              <span className="gallery-title">Galeria de Imagens</span>
              <span className="gallery-query">"{query}"</span>
            </div>
          </div>
          <span className="gallery-count-badge">{images.length} fotos</span>
        </div>

        <div className="image-gallery-grid">
          {images.map((img: any, idx: number) => (
            <div key={idx} className="image-grid-item" onClick={() => setSelectedImage(img)}>
              <div className="image-thumb-container">
                <img
                  src={img.thumbnail || img.image}
                  alt={img.title || query}
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLElement).setAttribute('src', img.image);
                  }}
                />
                <div className="image-hover-glass">
                  <Maximize2 size={20} className="icon-zoom" />
                  <span className="hover-title">{img.title}</span>
                </div>
              </div>
              <div className="image-item-footer">
                <span className="item-title">{img.title || query}</span>
                <a
                  href={img.url || img.image}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="btn-open-source"
                  title="Abrir página de origem"
                >
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          ))}
        </div>

        {selectedImage && (
          <div className="image-lightbox-backdrop" onClick={() => setSelectedImage(null)}>
            <div className="image-lightbox-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="lightbox-header">
                <span className="lightbox-title">{selectedImage.title || query}</span>
                <div className="lightbox-actions">
                  <a
                    href={selectedImage.image}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-lightbox-link"
                  >
                    <ExternalLink size={14} /> Ver Original
                  </a>
                  <button onClick={() => setSelectedImage(null)} className="btn-lightbox-close">
                    <X size={18} />
                  </button>
                </div>
              </div>
              <div className="lightbox-image-wrapper">
                <img src={selectedImage.image} alt={selectedImage.title || query} />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div className="image-gallery-error-card">Erro ao renderizar galeria de imagens.</div>;
  }
};

const VideoPlayerWidget: React.FC<{ jsonStr: string }> = ({ jsonStr }) => {
  try {
    const data = JSON.parse(jsonStr);
    const url = data.url;
    if (!url) return <div className="video-player-error-card">URL de vídeo não fornecida.</div>;

    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
    
    let embedUrl = url;
    if (isYouTube) {
      const videoIdMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
      if (videoIdMatch && videoIdMatch[1]) {
        embedUrl = `https://www.youtube.com/embed/${videoIdMatch[1]}`;
      }
    }

    return (
      <div className="video-player-card">
        <div className="video-player-header">
          <div className="header-left">
            <div className="gallery-icon-pill">
              <Maximize2 size={16} />
            </div>
            <span className="gallery-title">Reprodutor de Vídeo</span>
          </div>
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn-open-source" title="Abrir link original">
            <ExternalLink size={14} />
          </a>
        </div>
        <div className="video-player-body">
          {isYouTube ? (
            <iframe 
              src={embedUrl} 
              frameBorder="0" 
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
              allowFullScreen
              className="video-iframe"
            />
          ) : (
            <video controls className="video-html5">
              <source src={url} />
              Seu navegador não suporta o elemento de vídeo.
            </video>
          )}
        </div>
      </div>
    );
  } catch (err) {
    return <div className="video-player-error-card">Erro ao renderizar vídeo: configuração inválida.</div>;
  }
};

const CodeBlock: React.FC<{ children: any; className?: string }> = ({ children, className }) => {
  const [copied, setCopied] = useState(false);
  const codeString = String(children).replace(/\n$/, '');
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : 'python';

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block-container" style={{ margin: '12px 0', background: '#0d1117', borderRadius: '8px', overflow: 'hidden', border: '1px solid #30363d' }}>
      <div className="code-block-header" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#161b22', borderBottom: '1px solid #30363d', color: '#8b949e', fontSize: '12px' }}>
        <span className="code-language-tag">{language}</span>
        <button onClick={handleCopy} className="code-copy-btn" title="Copiar código" style={{ background: 'transparent', border: 'none', color: '#8b949e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
          {copied ? (
            <>
              <Check size={14} style={{ color: '#10b981' }} />
              <span style={{ color: '#10b981' }}>Copiado!</span>
            </>
          ) : (
            <>
              <Copy size={14} />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>
      <div className="code-block-body" style={{ padding: '16px', overflowX: 'auto' }}>
        <pre style={{ margin: 0, fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', monospace", fontSize: '13px', color: '#c9d1d9' }}>
          <code>{codeString}</code>
        </pre>
      </div>
    </div>
  );
};

const TerminalApprovalCard: React.FC<{
  msg: Message;
  onApproveTerminal?: (id: string, approved: boolean, customCommand?: string, remember?: boolean) => void;
  isLatestPending: boolean;
}> = ({ msg, onApproveTerminal, isLatestPending }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedCommand, setEditedCommand] = useState(msg.command || '');
  const [rememberChoice, setRememberChoice] = useState(false);

  const status = msg.approvalStatus || 'pending';
  const isPending = status === 'pending';

  // Keyboard shortcut for approval (Enter = approve, Esc = deny)
  useEffect(() => {
    if (!isPending || !isLatestPending) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea') {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          onApproveTerminal?.(msg.id, true, isEditing ? editedCommand : undefined, rememberChoice);
        }
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        onApproveTerminal?.(msg.id, true, isEditing ? editedCommand : undefined, rememberChoice);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onApproveTerminal?.(msg.id, false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPending, isLatestPending, isEditing, editedCommand, rememberChoice, msg.id, onApproveTerminal]);

  const riskLevel = msg.riskLevel || 'medium';

  const riskConfig = {
    safe: { label: 'Leitura / Seguro', icon: <ShieldCheck size={14} />, class: 'risk-safe' },
    medium: { label: 'Modificação de Arquivos', icon: <AlertTriangle size={14} />, class: 'risk-medium' },
    high: { label: 'Comando Crítico / Sensível', icon: <ShieldAlert size={14} />, class: 'risk-high' }
  }[riskLevel];

  const commandToDisplay = msg.executedCommand || msg.command || 'ls -la';

  return (
    <div className={`msg-terminal-approval ${riskConfig.class} ${status !== 'pending' ? 'resolved' : ''}`}>
      <div className="terminal-approval-header">
        <div className="header-title">
          <AlertCircle size={18} className="icon-alert" />
          <span>Permissão de Sistema Solicitada</span>
        </div>
        <div className={`risk-badge ${riskConfig.class}`}>
          {riskConfig.icon}
          <span>{riskConfig.label}</span>
        </div>
      </div>

      <div className="terminal-approval-intent">
        <span className="intent-label">O JASPER deseja executar o seguinte comando no terminal local:</span>
      </div>

      {!isEditing ? (
        <div className="terminal-approval-code">
          <code>$ {commandToDisplay}</code>
        </div>
      ) : (
        <div className="terminal-approval-edit-container">
          <label htmlFor={`edit-cmd-${msg.id}`} className="edit-label">Editar comando antes de autorizar:</label>
          <textarea
            id={`edit-cmd-${msg.id}`}
            value={editedCommand}
            onChange={(e) => setEditedCommand(e.target.value)}
            className="terminal-edit-input"
            rows={2}
          />
          <div className="edit-actions">
            <button
              onClick={() => {
                onApproveTerminal?.(msg.id, true, editedCommand, rememberChoice);
              }}
              className="btn-confirm-edit"
            >
              <Check size={14} /> Executar Comando Editado
            </button>
            <button onClick={() => setIsEditing(false)} className="btn-cancel-edit">
              <X size={14} /> Cancelar Edição
            </button>
          </div>
        </div>
      )}

      {isPending ? (
        <>
          <div className="terminal-approval-remember">
            <label className="remember-checkbox-label">
              <input
                type="checkbox"
                checked={rememberChoice}
                onChange={(e) => setRememberChoice(e.target.checked)}
              />
              <span>Lembrar decisão para comandos semelhantes nesta sessão</span>
            </label>
          </div>

          <div className="terminal-approval-actions">
            <button
              onClick={() => onApproveTerminal?.(msg.id, true, isEditing ? editedCommand : undefined, rememberChoice)}
              className="btn-approve"
              title="Permitir execução (Atalho: Enter)"
            >
              <Check size={15} /> Permitir
            </button>
            <button
              onClick={() => onApproveTerminal?.(msg.id, true, isEditing ? editedCommand : undefined, true)}
              className="btn-always"
              title="Sempre permitir esse tipo de comando"
            >
              <ShieldCheck size={14} /> Sempre permitir esse tipo de comando
            </button>
            <button
              onClick={() => onApproveTerminal?.(msg.id, false)}
              className="btn-deny"
              title="Negar execução (Atalho: Esc)"
            >
              <X size={15} /> Negar
            </button>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`btn-edit ${isEditing ? 'active' : ''}`}
              title="Editar comando"
            >
              <Edit3 size={14} /> {isEditing ? 'Fechar' : 'Editar'}
            </button>
          </div>

          <div className="terminal-approval-hint">
            <Keyboard size={13} />
            <span>Pressione <b>Enter</b> para permitir, <b>Esc</b> para negar ou diga <i>"Sim, pode rodar"</i> por voz</span>
          </div>
        </>
      ) : (
        <div className="terminal-approval-resolved-status">
          {status === 'approved' && <span className="status-badge approved"><Check size={14} /> Permitido ✓</span>}
          {status === 'edited' && <span className="status-badge edited"><Edit3 size={14} /> Permitido com Alteração ✎</span>}
          {status === 'denied' && <span className="status-badge denied"><X size={14} /> Negado ✕</span>}
          {msg.remember && <span className="status-badge remembered"><ShieldCheck size={14} /> Salvo na Whitelist 🛡️</span>}
        </div>
      )}
    </div>
  );
};

function getToolStepIcon(tool?: string, text?: string) {
  const t = (tool || text || '').toLowerCase();
  if (t.includes('imagem') || t.includes('foto') || t.includes('galeria')) {
    return <Image size={13} className="step-icon image" />;
  }
  if (t.includes('pesquis') || t.includes('web') || t.includes('site') || t.includes('http')) {
    return <Search size={13} className="step-icon search" />;
  }
  if (t.includes('terminal') || t.includes('comando') || t.includes('executar')) {
    return <Terminal size={13} className="step-icon terminal" />;
  }
  if (t.includes('grafico') || t.includes('gráfico') || t.includes('chart') || t.includes('recharts')) {
    return <BarChart2 size={13} className="step-icon chart" />;
  }
  if (t.includes('pc') || t.includes('computador') || t.includes('device') || t.includes('ligar')) {
    return <Cpu size={13} className="step-icon cpu" />;
  }
  if (t.includes('memoria') || t.includes('memória') || t.includes('banco') || t.includes('context')) {
    return <Brain size={13} className="step-icon brain" />;
  }
  return <Activity size={13} className="step-icon activity" />;
}

function parseBashBlock(codeString: string): { command: string; output: string } {
  const clean = codeString.trim();
  const lines = clean.split('\n');

  if (lines.length > 0 && (lines[0].startsWith('$ ') || lines[0].startsWith('# $ '))) {
    const rawCmd = lines[0].startsWith('$ ') ? lines[0].substring(2) : lines[0].substring(4);
    const output = lines.slice(1).join('\n').trim();
    return { command: rawCmd.trim(), output };
  }

  if (lines.length > 1 && (lines[0].startsWith('ls') || lines[0].startsWith('cat') || lines[0].startsWith('git') || lines[0].startsWith('node') || lines[0].startsWith('npm') || lines[0].startsWith('python') || lines[0].startsWith('echo') || lines[0].startsWith('pwd'))) {
    return { command: lines[0].trim(), output: lines.slice(1).join('\n').trim() };
  }

  return { command: '', output: clean };
}

const TerminalWindowWidget: React.FC<{
  command?: string;
  output?: string;
  error?: string;
  durationMs?: number;
}> = ({ command, output, error, durationMs }) => {
  const [copied, setCopied] = useState(false);
  const textToCopy = output || error || '';

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="terminal-window-card" onClick={(e) => e.stopPropagation()}>
      <div className="terminal-window-header">
        <div className="terminal-window-controls">
          <span className="dot red" />
          <span className="dot yellow" />
          <span className="dot green" />
          <span className="terminal-title-text">{command ? `jaspershell — $ ${command}` : 'jaspershell — bash'}</span>
        </div>
        <div className="terminal-header-actions">
          {durationMs && durationMs > 0 ? (
            <span className="terminal-exec-time">
              <Clock size={11} /> {durationMs}ms
            </span>
          ) : null}
          {textToCopy && (
            <button onClick={handleCopy} className="btn-copy-terminal-out" title="Copiar saída do terminal">
              {copied ? <Check size={12} style={{ color: '#10b981' }} /> : <Copy size={12} />}
              <span>{copied ? 'Copiado' : 'Copiar'}</span>
            </button>
          )}
        </div>
      </div>

      <div className="terminal-window-body">
        {command && (
          <div className="terminal-prompt-line">
            <span className="prompt-symbol">$</span>
            <span className="prompt-cmd">{command}</span>
          </div>
        )}

        {output && (
          <pre className="terminal-stdout-text">{output}</pre>
        )}

        {error && (
          <pre className="terminal-stderr-text">{error}</pre>
        )}

        {!output && !error && (
          <div className="terminal-status-empty">
            <span className="terminal-empty-text">[Comando concluído com código de saída 0]</span>
          </div>
        )}
      </div>
    </div>
  );
};

const PipelineGroupCard: React.FC<{ actions: Message[] }> = ({ actions }) => {
  const [isOpen, setIsOpen] = useState(true);

  if (!actions || actions.length === 0) return null;

  const isRunning = actions.some(a => a.actionStatus === 'running');
  const hasError = actions.some(a => a.actionStatus === 'error');

  const totalDuration = actions.reduce((acc, a) => acc + (a.durationMs || 0), 0);

  return (
    <div className={`pipeline-group-card ${isRunning ? 'running' : 'completed'}`}>
      <div className="pipeline-header" onClick={() => setIsOpen(!isOpen)}>
        <div className="pipeline-header-left">
          <div className="pipeline-sparkle-badge">
            <Sparkles size={14} />
          </div>
          <span className="pipeline-title">Pipeline de Execução & Raciocínio</span>
          <span className="pipeline-step-count">
            {actions.length} {actions.length === 1 ? 'etapa' : 'etapas'}
          </span>
        </div>

        <div className="pipeline-header-right">
          {isRunning && (
            <span className="pipeline-status-pill running">
              <Loader2 size={12} className="spin" /> Executando
            </span>
          )}
          {!isRunning && hasError && (
            <span className="pipeline-status-pill error">
              <AlertCircle size={12} /> Erro na etapa
            </span>
          )}
          {!isRunning && !hasError && (
            <span className="pipeline-status-pill done">
              <CheckCircle2 size={12} /> Concluído {totalDuration > 0 ? `(${totalDuration}ms)` : ''}
            </span>
          )}

          <button className="btn-toggle-pipeline" aria-label="Toggle pipeline view">
            {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="pipeline-body">
          <div className="pipeline-timeline-line" />
          <div className="pipeline-steps-list">
            {actions.map((act) => {
              const status = act.actionStatus || 'done';
              const isTerminalStep = act.tool === 'executar_terminal' || !!act.command || !!act.output || act.text.toLowerCase().includes('terminal');

              return (
                <div key={act.id} className={`pipeline-step-item ${status}`}>
                  <div className={`step-node-icon ${status}`}>
                    {status === 'running' ? (
                      <Loader2 size={13} className="spin" />
                    ) : status === 'error' ? (
                      <AlertCircle size={13} className="icon-err" />
                    ) : (
                      getToolStepIcon(act.tool, act.text)
                    )}
                  </div>
                  <div className="step-content-wrapper">
                    <div className="step-content">
                      <span className="step-text">{act.text}</span>
                      {act.durationMs && act.durationMs > 0 ? (
                        <span className="step-time-tag">
                          <Clock size={10} /> {act.durationMs}ms
                        </span>
                      ) : null}
                    </div>

                    {isTerminalStep && (act.command || act.output || act.error) && (
                      <TerminalWindowWidget
                        command={act.command}
                        output={act.output}
                        error={act.error}
                        durationMs={act.durationMs}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const ChatFeed: React.FC<ChatFeedProps> = ({ messages, onApproveTerminal }) => {
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages]);

  const pendingApprovals = messages.filter(m => m.sender === 'terminal_approval' && (m.approvalStatus || 'pending') === 'pending');
  const latestPendingId = pendingApprovals.length > 0 ? pendingApprovals[pendingApprovals.length - 1].id : null;

  // Group adjacent action messages into pipeline groups
  const groupedFeed: Array<{ type: 'single'; message: Message } | { type: 'pipeline'; actions: Message[]; id: string }> = [];
  let currentActions: Message[] = [];

  messages.forEach((msg) => {
    if (msg.sender === 'action') {
      currentActions.push(msg);
    } else {
      if (currentActions.length > 0) {
        groupedFeed.push({
          type: 'pipeline',
          actions: [...currentActions],
          id: `pipeline-${currentActions[0].id}`
        });
        currentActions = [];
      }
      groupedFeed.push({ type: 'single', message: msg });
    }
  });

  if (currentActions.length > 0) {
    groupedFeed.push({
      type: 'pipeline',
      actions: [...currentActions],
      id: `pipeline-${currentActions[0].id}`
    });
  }

  return (
    <div className="chat-feed" ref={feedRef}>
      {groupedFeed.map((item) => {
        if (item.type === 'pipeline') {
          return <PipelineGroupCard key={item.id} actions={item.actions} />;
        }

        const msg = item.message;

        if (msg.sender === 'terminal_approval') {
          return (
            <TerminalApprovalCard
              key={msg.id}
              msg={msg}
              onApproveTerminal={onApproveTerminal}
              isLatestPending={msg.id === latestPendingId}
            />
          );
        }

        const textToDisplay = msg.sender === 'assistant' ? cleanText(msg.text) : msg.text;
        if (msg.sender === 'assistant' && !textToDisplay) return null;
        
        return (
          <div key={msg.id} className={`msg msg-${msg.sender}`}>
            {msg.sender === 'assistant' ? (
              <>
                <div className="assistant-msg-header">
                  <div className="assistant-capsule-badge">
                    <Orb state="IDLE" />
                  </div>
                  <span className="assistant-name-tag">JASPER</span>
                </div>
                <div className="markdown-body">
                  <ReactMarkdown
                    components={{
                      code({ node, inline, className, children, ...props }: any) {
                        const match = /language-(\w+)/.exec(className || '');
                        const language = match ? match[1] : '';

                        const isBlock = !inline || !!match || String(children).includes('\n');

                        if (isBlock) {
                          if (language === 'recharts') {
                            return <ChartComponent jsonStr={String(children)} />;
                          }
                          if (language === 'images') {
                            return <ImageGalleryWidget jsonStr={String(children)} />;
                          }
                          if (language === 'video') {
                            return <VideoPlayerWidget jsonStr={String(children)} />;
                          }
                          if (['bash', 'sh', 'terminal', 'zsh', 'shell', 'cmd'].includes(language)) {
                            const { command, output } = parseBashBlock(String(children));
                            return <TerminalWindowWidget command={command} output={output} />;
                          }
                          return <CodeBlock className={className}>{children}</CodeBlock>;
                        }
                        return (
                          <code className="inline-code" {...props}>
                            {children}
                          </code>
                        );
                      }
                    }}
                  >
                    {textToDisplay}
                  </ReactMarkdown>
                </div>
              </>
            ) : (
              <>
                {textToDisplay}
                {textToDisplay && (textToDisplay.includes('youtube.com/') || textToDisplay.includes('youtu.be/') || textToDisplay.includes('.mp4')) && (
                  <div style={{ marginTop: '12px', maxWidth: '600px' }}>
                    <VideoPlayerWidget jsonStr={JSON.stringify({ url: textToDisplay.match(/https?:\/\/[^\s]+/)?.[0] || textToDisplay })} />
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ChatFeed;

