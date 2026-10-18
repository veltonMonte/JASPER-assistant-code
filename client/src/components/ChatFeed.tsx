import React, { useEffect, useRef, useState, useMemo, useId } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { prepareStreamingMarkdown } from '../lib/streamingMarkdown';
import remarkGfm from 'remark-gfm';
import {
  User, Bot, Zap, TrendingUp, TrendingDown,
  Copy, Check, Loader2, CheckCircle2, AlertCircle, ShieldCheck, ShieldAlert,
  AlertTriangle, Edit3, X, Keyboard, Sparkles, Terminal, Search, BarChart2,
  Cpu, Brain, Activity, ChevronDown, ChevronUp, Clock, Globe, Image,
  Maximize2, Minimize2, ExternalLink, PieChart as PieIcon, Compass, Table as TableIcon,
  ArrowUpDown, Download, Filter, Trophy, Star, Award, Layers, Grid, FileSpreadsheet,
  LayoutList, Volume2, Newspaper
} from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList
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
  notice?: { kind: 'news' | 'question' | 'clock'; sentAt: string; article?: { title: string; url: string; source: string; topic: string; publishedAt: string } };
}

export interface ChatFeedProps {
  messages: Message[];
  onApproveTerminal?: (id: string, approved: boolean, customCommand?: string, remember?: boolean) => void;
  onReadNotice?: (text: string) => void;
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
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/gi, '').trim();
  return cleaned;
};

const DEFAULT_SERIES_COLORS = [
  '#06b6d4', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#3b82f6', '#14b8a6', '#f43f5e'
];

/**
 * Custom XAxis Tick that handles angled text and prevents overlapping words
 */
const CustomXAxisTick: React.FC<any> = ({ x, y, payload, shouldRotate }) => {
  if (!payload || payload.value === undefined) return null;
  const rawVal = String(payload.value);
  const maxChars = shouldRotate ? 14 : 10;
  const displayVal = rawVal.length > maxChars ? rawVal.slice(0, maxChars - 1) + '…' : rawVal;
  const safeX = typeof x === 'number' && !isNaN(x) ? x : 0;
  const safeY = typeof y === 'number' && !isNaN(y) ? y : 0;

  if (shouldRotate) {
    return (
      <g transform={`translate(${safeX},${safeY})`}>
        <title>{rawVal}</title>
        <text
          x={0}
          y={0}
          dx={-8}
          dy={10}
          textAnchor="end"
          fill="#94a3b8"
          fontSize={11}
          fontWeight={500}
          transform="rotate(-35)"
        >
          {displayVal}
        </text>
      </g>
    );
  }

  return (
    <g transform={`translate(${safeX},${safeY})`}>
      <title>{rawVal}</title>
      <text
        x={0}
        y={0}
        dy={14}
        textAnchor="middle"
        fill="#94a3b8"
        fontSize={11}
        fontWeight={500}
      >
        {displayVal}
      </text>
    </g>
  );
};

const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="chart-tooltip-glass">
        <div className="tooltip-header">
          <span className="tooltip-header-label">{label}</span>
        </div>
        <div className="tooltip-body">
          {payload.map((entry: any, idx: number) => {
            let color = entry.color || entry.stroke || '#06b6d4';
            if (typeof color === 'string' && color.startsWith('url(' )) {
              color = entry.payload?.fill || '#06b6d4';
              if (typeof color === 'string' && color.startsWith('url(' )) {
                color = '#06b6d4';
              }
            }
            const val = entry.value;
            const formattedVal = typeof val === 'number' ? val.toLocaleString('pt-BR') : val;
            return (
              <div key={`item-${idx}`} className="tooltip-row">
                <span className="tooltip-dot" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
                <span className="tooltip-label">{entry.name || 'Valor'}:</span>
                <span className="tooltip-val">{formattedVal}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return null;
};

interface InteractiveTableProps {
  jsonStr?: string;
  title?: string;
  columns?: Array<{ key: string; label: string; align?: 'left' | 'center' | 'right' }>;
  rows?: Array<Record<string, any>>;
  isEmbedded?: boolean;
}

const InteractiveTable: React.FC<InteractiveTableProps> = ({
  jsonStr,
  title: initialTitle,
  columns: initialCols,
  rows: initialRows,
  isEmbedded = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | 'none'>('none');
  const [copied, setCopied] = useState(false);

  let title = initialTitle || 'Tabela de Dados';
  let columns = initialCols || [];
  let rows = initialRows || [];

  if (jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.title) title = parsed.title;
      if (Array.isArray(parsed.columns)) columns = parsed.columns;
      if (Array.isArray(parsed.rows)) rows = parsed.rows;
      else if (Array.isArray(parsed.data)) rows = parsed.data;
    } catch (e) {
      return <div className="chart-error-card">Estrutura de tabela JSON inválida.</div>;
    }
  }

  // Auto infer columns if not provided
  if (columns.length === 0 && rows.length > 0) {
    columns = Object.keys(rows[0]).map(k => ({
      key: k,
      label: k.toUpperCase(),
      align: typeof rows[0][k] === 'number' ? 'right' : 'left'
    }));
  }

  const handleSort = (colKey: string) => {
    if (sortCol !== colKey) {
      setSortCol(colKey);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      setSortCol(null);
      setSortDir('none');
    }
  };

  const filteredRows = rows.filter(row => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return Object.values(row).some(v => String(v ?? '').toLowerCase().includes(term));
  });

  const sortedRows = [...filteredRows].sort((a, b) => {
    if (!sortCol || sortDir === 'none') return 0;
    const valA = a[sortCol];
    const valB = b[sortCol];

    const numA = Number(valA);
    const numB = Number(valB);

    if (!isNaN(numA) && !isNaN(numB)) {
      return sortDir === 'asc' ? numA - numB : numB - numA;
    }

    const strA = String(valA ?? '').toLowerCase();
    const strB = String(valB ?? '').toLowerCase();
    return sortDir === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
  });

  const handleCopyTable = () => {
    const headerStr = columns.map(c => c.label).join('	');
    const rowsStr = sortedRows.map(r => columns.map(c => String(r[c.key] ?? '')).join('	')).join("\n");
    navigator.clipboard.writeText(`${title}\n${headerStr}\n${rowsStr}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportCSV = () => {
    const headerStr = columns.map(c => `"${c.label.replace(/"/g, '""')}"`).join(',');
    const rowsStr = sortedRows.map(r => columns.map(c => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`).join(',')).join("\n");
    const blob = new Blob([`${headerStr}\n${rowsStr}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.replace(/\s+/g, '_').toLowerCase()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderCellContent = (colKey: string, val: any) => {
    const k = colKey.toLowerCase();
    const isRankCol = ['pos', 'posicao', 'rank', '#', 'colocacao'].includes(k);
    const isRatingCol = ['nota', 'rating', 'score', 'avaliacao'].includes(k);

    const numVal = Number(val);

    if (isRankCol) {
      if (val === 1 || numVal === 1) {
        return <span className="rank-badge gold"><Trophy size={11} /> 1º</span>;
      }
      if (val === 2 || numVal === 2) {
        return <span className="rank-badge silver"><Award size={11} /> 2º</span>;
      }
      if (val === 3 || numVal === 3) {
        return <span className="rank-badge bronze"><Award size={11} /> 3º</span>;
      }
      if (numVal >= 4 && numVal <= 6) {
        return <span className="rank-badge g4">{numVal}º</span>;
      }
      if (numVal >= 17 && rows.length >= 18) {
        return <span className="rank-badge z4">{numVal}º</span>;
      }
      return <span className="rank-badge standard">{val}º</span>;
    }

    if (isRatingCol) {
      return (
        <span className="rating-badge">
          <Star size={11} className="rating-star" />
          <span>{String(val)}</span>
        </span>
      );
    }

    if (typeof val === 'number') {
      return <span className="table-numeric-val">{val.toLocaleString('pt-BR')}</span>;
    }

    return String(val ?? '—');
  };

  return (
    <div className={`interactive-table-card ${isEmbedded ? 'embedded' : ''}`}>
      <div className="table-header-bar">
        <div className="table-title-group">
          <div className="table-icon-badge">
            <TableIcon size={16} />
          </div>
          <div>
            <h4 className="table-card-title">{title}</h4>
            <div className="table-meta-tags">
              <span className="table-count-badge">{sortedRows.length} registros</span>
              {searchTerm && <span className="table-filtered-badge">Filtro: "{searchTerm}"</span>}
            </div>
          </div>
        </div>

        <div className="table-actions-group">
          <div className="table-search-box">
            <Search size={13} className="search-icon" />
            <input
              type="text"
              placeholder="Filtrar dados..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="table-search-input"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="clear-search-btn">
                <X size={12} />
              </button>
            )}
          </div>

          <button onClick={handleExportCSV} className="btn-table-action" title="Exportar como CSV">
            <Download size={13} />
            <span>CSV</span>
          </button>

          <button onClick={handleCopyTable} className="btn-table-action" title="Copiar Tabela">
            {copied ? <Check size={13} style={{ color: '#10b981' }} /> : <Copy size={13} />}
            <span>{copied ? 'Copiado' : 'Copiar'}</span>
          </button>
        </div>
      </div>

      <div className="table-scroll-container">
        <table className="interactive-data-table">
          <thead>
            <tr>
              {columns.map((col) => {
                const isSorted = sortCol === col.key;
                const align = col.align || (col.key === 'pos' || col.key === '#' ? 'center' : 'left');
                return (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`th-interactive align-${align} ${isSorted ? 'sorted' : ''}`}
                  >
                    <div className="th-content">
                      <span>{col.label}</span>
                      <span className="sort-icon-box">
                        {isSorted ? (
                          sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                        ) : (
                          <ArrowUpDown size={11} className="dim" />
                        )}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length > 0 ? (
              sortedRows.map((row, rIdx) => (
                <tr key={`row-${rIdx}`} className="tr-interactive">
                  {columns.map((col) => {
                    const align = col.align || (col.key === 'pos' || col.key === '#' ? 'center' : 'left');
                    return (
                      <td key={col.key} className={`td-interactive align-${align}`}>
                        {renderCellContent(col.key, row[col.key])}
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="table-empty-row">
                  Nenhum dado encontrado para "{searchTerm}".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

function parseChartConfig(raw: string): any | null {
  if (!raw || typeof raw !== "string") return null;
  let clean = raw.trim();

  // Strip code fences if present (e.g. ```json ... ``` or ```recharts ... ```)
  clean = clean.replace(/^```[a-zA-Z0-9_-]*\s*/, "").replace(/\s*```$/, "").trim();

  // 1. Direct parse
  try {
    return JSON.parse(clean);
  } catch (e1) {
    // 2. Extract JSON object substring
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e2) {
        // 3. Clean trailing commas & unquoted keys
        try {
          const relaxed = match[0]
            .replace(/,\s*([\]}])/g, "$1")
            .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":')
            .replace(/'/g, '"');
          return JSON.parse(relaxed);
        } catch (e3) {
          try {
            const fn = new Function(`return (${match[0]});`);
            const res = fn();
            if (res && typeof res === "object") return res;
          } catch (e4) {}
        }
      }
    }
  }
  return null;
}

const ChartComponent: React.FC<{ jsonStr: string }> = React.memo(({ jsonStr }) => {
  const [copied, setCopied] = useState(false);
  const [userSelectedType, setUserSelectedType] = useState<'bar' | 'bar-horizontal' | 'line' | 'area' | 'pie' | 'table' | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Stable unique ID for SVG gradient defs to avoid collisions between multiple charts in DOM
  const rawId = useId();
  const chartInstanceId = useMemo(() => "ch_" + rawId.replace(/[^a-zA-Z0-9_-]/g, "_"), [rawId]);

  const config = useMemo(() => parseChartConfig(jsonStr), [jsonStr]);

  const rawData = useMemo(() => {
    return (config && Array.isArray(config.data)) ? config.data : [];
  }, [config]);

  const title = config?.title || "Visualização de Dados";
  const rawType = config?.type || "bar";

  const xKey = useMemo(() => {
    if (config?.xKey) return config.xKey;
    if (rawData.length > 0 && rawData[0]) {
      const keys = Object.keys(rawData[0]);
      const stringKey = keys.find(k => typeof rawData[0][k] === "string");
      return stringKey || keys[0] || "name";
    }
    return "name";
  }, [config?.xKey, rawData]);

  // Sanitize data: clean string numbers (e.g. "45%", "45,5", "1.200") to pure numbers
  const sanitizedData = useMemo(() => {
    if (!rawData.length) return [];
    return rawData.map((d: any) => {
      if (!d || typeof d !== "object") return {};
      const item: Record<string, any> = { ...d };
      for (const k of Object.keys(item)) {
        if (k !== xKey) {
          const val = item[k];
          if (typeof val === "string") {
            const cleanStr = val.replace(/%/g, "").replace(/\$/g, "").replace(/,/g, ".").trim();
            const num = parseFloat(cleanStr);
            if (!isNaN(num) && isFinite(num) && !val.match(/[a-zA-Z]/)) {
              item[k] = num;
            }
          }
        }
      }
      return item;
    });
  }, [rawData, xKey]);

  // Detect series
  const finalSeries = useMemo(() => {
    if (config && Array.isArray(config.series) && config.series.length > 0) {
      return config.series;
    }
    if (sanitizedData.length > 0 && sanitizedData[0]) {
      const numKeys = Object.keys(sanitizedData[0]).filter(k => k !== xKey && typeof sanitizedData[0][k] === "number");
      if (numKeys.length > 0) {
        return numKeys.map((k, idx) => ({
          dataKey: k,
          name: k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " "),
          color: DEFAULT_SERIES_COLORS[idx % DEFAULT_SERIES_COLORS.length]
        }));
      }
    }
    return [{ dataKey: "valor", name: "Valor", color: "#06b6d4" }];
  }, [config?.series, sanitizedData, xKey]);

  // Calculate default chart type synchronously (no two-step render / no useEffect flip)
  const defaultType = useMemo<'bar' | 'bar-horizontal' | 'line' | 'area' | 'pie' | 'table'>(() => {
    if (rawType === "line" || rawType === "area" || rawType === "pie" || rawType === "table") {
      return rawType;
    }
    const avgLen = sanitizedData.length > 0
      ? (sanitizedData.reduce((acc: number, d: any) => acc + String(d[xKey] || "").length, 0) / sanitizedData.length)
      : 0;
    if (sanitizedData.length >= 6 || avgLen > 9) {
      return "bar-horizontal";
    }
    return "bar";
  }, [rawType, sanitizedData, xKey]);

  const activeType = userSelectedType || defaultType;

  // Primary key for KPIs
  const primaryKey = finalSeries[0]?.dataKey || "valor";
  let leaderItem: any = null;
  let minItem: any = null;
  let sumVal = 0;
  let numCount = 0;

  sanitizedData.forEach((d: any) => {
    const val = Number(d[primaryKey]);
    if (!isNaN(val)) {
      sumVal += val;
      numCount++;
      if (!leaderItem || val > Number(leaderItem[primaryKey])) leaderItem = d;
      if (!minItem || val < Number(minItem[primaryKey])) minItem = d;
    }
  });

  const avgVal = numCount > 0 ? (sumVal / numCount) : 0;
  const avgLen = sanitizedData.length > 0 ? (sanitizedData.reduce((acc: number, d: any) => acc + String(d[xKey] || "").length, 0) / sanitizedData.length) : 0;
  const maxLen = sanitizedData.length > 0 ? Math.max(...sanitizedData.map((d: any) => String(d[xKey] || "").length)) : 0;
  const shouldRotate = sanitizedData.length > 3 && (maxLen > 6 || avgLen > 7);

  const handleCopyJSON = () => {
    navigator.clipboard.writeText(jsonStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportCSV = () => {
    const headers = [xKey, ...finalSeries.map((s: any) => s.dataKey)].join(",");
    const rows = sanitizedData.map((d: any) => [
      `"${String(d[xKey] || "").replace(/"/g, '""')}"`,
      ...finalSeries.map((s: any) => d[s.dataKey] ?? "")
    ].join(",")).join("\n");
    const csvContent = `${headers}\n${rows}`;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/\s+/g, "_").toLowerCase()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!config) {
    return (
      <div className="chart-error-card" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "16px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.25)", borderRadius: "12px", color: "#f87171" }}>
        <AlertCircle size={16} />
        <span>Erro ao renderizar gráfico: JSON de configuração inválido.</span>
      </div>
    );
  }

  if (sanitizedData.length === 0) {
    return (
      <div className="chart-error-card" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "16px", background: "rgba(234, 179, 8, 0.1)", border: "1px solid rgba(234, 179, 8, 0.25)", borderRadius: "12px", color: "#facc15" }}>
        <AlertCircle size={16} />
        <span>Nenhum dado numérico disponível para o gráfico.</span>
      </div>
    );
  }

  const chartHeight = isFullscreen
    ? 500
    : (activeType === "bar-horizontal"
        ? Math.max(300, Math.min(520, sanitizedData.length * 36 + 60))
        : 330);

  const renderChart = () => {
    if (activeType === "table") {
      const tableCols = [
        { key: xKey, label: xKey.toUpperCase() },
        ...finalSeries.map((s: any) => ({ key: s.dataKey, label: s.name || s.dataKey }))
      ];
      return (
        <div style={{ marginTop: "8px" }}>
          <InteractiveTable
            title={title}
            columns={tableCols}
            rows={sanitizedData}
            isEmbedded={true}
          />
        </div>
      );
    }

    return (
      <ResponsiveContainer width="100%" height={chartHeight} minWidth={0} debounce={50}>
        {activeType === "line" ? (
          <LineChart data={sanitizedData} margin={{ top: 20, right: 35, left: 10, bottom: shouldRotate ? 45 : 20 }}>
            <defs>
              {finalSeries.map((s: any, idx: number) => {
                const color = s.color || DEFAULT_SERIES_COLORS[idx % DEFAULT_SERIES_COLORS.length];
                return (
                  <linearGradient key={`${chartInstanceId}-lineGrad-${idx}`} id={`${chartInstanceId}-lineGrad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.0} />
                  </linearGradient>
                );
              })}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.06)" vertical={false} />
            <XAxis
              dataKey={xKey}
              stroke="#64748b"
              tick={<CustomXAxisTick shouldRotate={shouldRotate} />}
              height={shouldRotate ? 65 : 30}
              interval={0}
              axisLine={{ stroke: "rgba(255, 255, 255, 0.1)" }}
              tickLine={false}
            />
            <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ color: "#cbd5e1", paddingTop: "12px", fontSize: "12px" }} />
            {finalSeries.map((s: any, idx: number) => {
              const color = s.color || DEFAULT_SERIES_COLORS[idx % DEFAULT_SERIES_COLORS.length];
              return (
                <Line
                  key={s.dataKey}
                  type="monotone"
                  dataKey={s.dataKey}
                  stroke={color}
                  name={s.name || s.dataKey}
                  strokeWidth={3}
                  dot={{ r: 4, strokeWidth: 2, fill: "#0f172a", stroke: color }}
                  activeDot={{ r: 7, strokeWidth: 2, fill: color, stroke: "#fff" }}
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        ) : activeType === "area" ? (
          <AreaChart data={sanitizedData} margin={{ top: 20, right: 35, left: 10, bottom: shouldRotate ? 45 : 20 }}>
            <defs>
              {finalSeries.map((s: any, idx: number) => {
                const color = s.color || DEFAULT_SERIES_COLORS[idx % DEFAULT_SERIES_COLORS.length];
                return (
                  <linearGradient key={`${chartInstanceId}-areaGrad-${idx}`} id={`${chartInstanceId}-areaGrad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.65} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                );
              })}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.06)" vertical={false} />
            <XAxis
              dataKey={xKey}
              stroke="#64748b"
              tick={<CustomXAxisTick shouldRotate={shouldRotate} />}
              height={shouldRotate ? 65 : 30}
              interval={0}
              axisLine={{ stroke: "rgba(255, 255, 255, 0.1)" }}
              tickLine={false}
            />
            <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ color: "#cbd5e1", paddingTop: "12px", fontSize: "12px" }} />
            {finalSeries.map((s: any, idx: number) => {
              const color = s.color || DEFAULT_SERIES_COLORS[idx % DEFAULT_SERIES_COLORS.length];
              return (
                <Area
                  key={s.dataKey}
                  type="monotone"
                  dataKey={s.dataKey}
                  stroke={color}
                  fill={`url(#${chartInstanceId}-areaGrad-${idx})`}
                  name={s.name || s.dataKey}
                  strokeWidth={2.5}
                  isAnimationActive={false}
                />
              );
            })}
          </AreaChart>
        ) : activeType === "bar-horizontal" ? (
          <BarChart
            layout="vertical"
            data={sanitizedData}
            margin={{ top: 15, right: 45, left: 15, bottom: 15 }}
          >
            <defs>
              {finalSeries.map((s: any, idx: number) => {
                const color = s.color || DEFAULT_SERIES_COLORS[idx % DEFAULT_SERIES_COLORS.length];
                return (
                  <linearGradient key={`${chartInstanceId}-barHorizGrad-${idx}`} id={`${chartInstanceId}-barHorizGrad-${idx}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={color} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.6} />
                  </linearGradient>
                );
              })}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.06)" horizontal={false} />
            <XAxis type="number" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey={xKey}
              stroke="#64748b"
              tick={{ fill: "#cbd5e1", fontSize: 11, fontWeight: 500 }}
              width={130}
              tickFormatter={(val) => {
                const s = String(val);
                return s.length > 18 ? s.slice(0, 16) + "…" : s;
              }}
              axisLine={{ stroke: "rgba(255, 255, 255, 0.1)" }}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255, 255, 255, 0.04)", radius: 6 }} />
            <Legend wrapperStyle={{ color: "#cbd5e1", paddingTop: "10px", fontSize: "12px" }} />
            {finalSeries.map((s: any, idx: number) => {
              const color = s.color || DEFAULT_SERIES_COLORS[idx % DEFAULT_SERIES_COLORS.length];
              return (
                <Bar
                  key={s.dataKey}
                  dataKey={s.dataKey}
                  fill={`url(#${chartInstanceId}-barHorizGrad-${idx})`}
                  stroke={color}
                  strokeWidth={1}
                  name={s.name || s.dataKey}
                  radius={[0, 6, 6, 0]}
                  maxBarSize={30}
                  isAnimationActive={false}
                >
                  <LabelList dataKey={s.dataKey} position="right" fill="#94a3b8" fontSize={10} fontWeight={600} />
                </Bar>
              );
            })}
          </BarChart>
        ) : activeType === "pie" ? (
          <PieChart margin={{ top: 15, right: 15, bottom: 15, left: 15 }}>
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ color: "#cbd5e1", paddingTop: "12px", fontSize: "12px" }} />
            <Pie
              data={sanitizedData}
              dataKey={finalSeries[0]?.dataKey || "value"}
              nameKey={xKey}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={3}
              isAnimationActive={false}
              label={({ percent }: any) => (typeof percent === "number" && !isNaN(percent)) ? `${(percent * 100).toFixed(0)}%` : ""}
              labelLine={false}
            >
              {sanitizedData.map((_: any, index: number) => (
                <Cell
                  key={`cell-${index}`}
                  fill={DEFAULT_SERIES_COLORS[index % DEFAULT_SERIES_COLORS.length]}
                  stroke="rgba(15, 23, 42, 0.8)"
                  strokeWidth={2}
                />
              ))}
            </Pie>
          </PieChart>
        ) : (
          <BarChart data={sanitizedData} margin={{ top: 20, right: 35, left: 10, bottom: shouldRotate ? 45 : 20 }}>
            <defs>
              {finalSeries.map((s: any, idx: number) => {
                const color = s.color || DEFAULT_SERIES_COLORS[idx % DEFAULT_SERIES_COLORS.length];
                return (
                  <linearGradient key={`${chartInstanceId}-barGrad-${idx}`} id={`${chartInstanceId}-barGrad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.5} />
                  </linearGradient>
                );
              })}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.06)" vertical={false} />
            <XAxis
              dataKey={xKey}
              stroke="#64748b"
              tick={<CustomXAxisTick shouldRotate={shouldRotate} />}
              height={shouldRotate ? 65 : 30}
              interval={0}
              axisLine={{ stroke: "rgba(255, 255, 255, 0.1)" }}
              tickLine={false}
            />
            <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255, 255, 255, 0.04)", radius: 6 }} />
            <Legend wrapperStyle={{ color: "#cbd5e1", paddingTop: "12px", fontSize: "12px" }} />
            {finalSeries.map((s: any, idx: number) => {
              const color = s.color || DEFAULT_SERIES_COLORS[idx % DEFAULT_SERIES_COLORS.length];
              return (
                <Bar
                  key={s.dataKey}
                  dataKey={s.dataKey}
                  fill={`url(#${chartInstanceId}-barGrad-${idx})`}
                  stroke={color}
                  strokeWidth={1}
                  name={s.name || s.dataKey}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={44}
                  isAnimationActive={false}
                >
                  <LabelList dataKey={s.dataKey} position="top" fill="#cbd5e1" fontSize={10} fontWeight={500} />
                </Bar>
              );
            })}
          </BarChart>
        )}
      </ResponsiveContainer>
    );
  };

  return (
    <div className={`recharts-glass-card hud-chart-card ${isFullscreen ? "chart-card-fullscreen" : ""}`}>
      {/* Sci-fi Corner Brackets */}
      <span className="card-bracket tl"></span>
      <span className="card-bracket tr"></span>
      <span className="card-bracket bl"></span>
      <span className="card-bracket br"></span>

      <div className="recharts-card-header">
        <div className="header-left">
          <div className="chart-sparkle-icon">
            <TrendingUp size={16} />
          </div>
          <div className="chart-header-info">
            <div className="chart-title-row">
              <span className="chart-hud-tag">VIZ.HUD // 0x2A</span>
              <h4 className="chart-title" title={title}>{title}</h4>
            </div>
            <div className="chart-tags">
              <span className="chart-type-pill">{activeType.replace("-", " ").toUpperCase()}</span>
              <span className="chart-count-pill">{sanitizedData.length} ITENS</span>
            </div>
          </div>
        </div>

        <div className="header-right">
          <div className="chart-type-toggle">
            <button
              className={`btn-toggle-type ${activeType === "bar-horizontal" ? "active" : ""}`}
              onClick={() => setUserSelectedType("bar-horizontal")}
              title="Barras Horizontais (Ideal para rankings e nomes longos)"
            >
              <LayoutList size={13} />
            </button>
            <button
              className={`btn-toggle-type ${activeType === "bar" ? "active" : ""}`}
              onClick={() => setUserSelectedType("bar")}
              title="Barras Verticais"
            >
              <BarChart2 size={13} />
            </button>
            <button
              className={`btn-toggle-type ${activeType === "line" ? "active" : ""}`}
              onClick={() => setUserSelectedType("line")}
              title="Linhas"
            >
              <TrendingUp size={13} />
            </button>
            <button
              className={`btn-toggle-type ${activeType === "area" ? "active" : ""}`}
              onClick={() => setUserSelectedType("area")}
              title="Área"
            >
              <Activity size={13} />
            </button>
            <button
              className={`btn-toggle-type ${activeType === "pie" ? "active" : ""}`}
              onClick={() => setUserSelectedType("pie")}
              title="Donut / Pizza"
            >
              <PieIcon size={13} />
            </button>
            <button
              className={`btn-toggle-type ${activeType === "table" ? "active" : ""}`}
              onClick={() => setUserSelectedType("table")}
              title="Visualizar em Tabela"
            >
              <TableIcon size={13} />
            </button>
          </div>

          <button onClick={handleExportCSV} className="btn-copy-chart-json" title="Exportar dados como CSV">
            <Download size={13} />
            <span>CSV</span>
          </button>

          <button onClick={handleCopyJSON} className="btn-copy-chart-json" title="Copiar JSON do Gráfico">
            {copied ? <Check size={13} style={{ color: "#10b981" }} /> : <Copy size={13} />}
            <span>{copied ? "Copiado" : "JSON"}</span>
          </button>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="btn-copy-chart-json"
            title={isFullscreen ? "Restaurar tamanho" : "Maximizar gráfico"}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* KPI Mini-Ribbon */}
      {numCount > 0 && activeType !== "table" && (
        <div className="chart-kpi-ribbon hud-kpi-ribbon">
          {leaderItem && (
            <div className="kpi-card leader" title={`${String(leaderItem[xKey])}: ${Number(leaderItem[primaryKey]).toLocaleString("pt-BR")}`}>
              <div className="kpi-header">
                <Trophy size={12} className="kpi-icon leader" />
                <span className="kpi-label">MAIOR</span>
              </div>
              <span className="kpi-val" title={String(leaderItem[xKey])}>
                <span className="kpi-name">{String(leaderItem[xKey]).length > 16 ? String(leaderItem[xKey]).slice(0, 14) + "…" : leaderItem[xKey]}</span>
                <strong className="kpi-number">{Number(leaderItem[primaryKey]).toLocaleString("pt-BR")}</strong>
              </span>
              <span className="kpi-sweep-light"></span>
            </div>
          )}
          {minItem && (
            <div className="kpi-card min" title={`${String(minItem[xKey])}: ${Number(minItem[primaryKey]).toLocaleString("pt-BR")}`}>
              <div className="kpi-header">
                <TrendingDown size={12} className="kpi-icon min" />
                <span className="kpi-label">MENOR</span>
              </div>
              <span className="kpi-val" title={String(minItem[xKey])}>
                <span className="kpi-name">{String(minItem[xKey]).length > 16 ? String(minItem[xKey]).slice(0, 14) + "…" : minItem[xKey]}</span>
                <strong className="kpi-number">{Number(minItem[primaryKey]).toLocaleString("pt-BR")}</strong>
              </span>
              <span className="kpi-sweep-light"></span>
            </div>
          )}
          <div className="kpi-card avg" title={`Média aritmética: ${avgVal.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`}>
            <div className="kpi-header">
              <TrendingUp size={12} className="kpi-icon avg" />
              <span className="kpi-label">MÉDIA</span>
            </div>
            <span className="kpi-val">
              <strong className="kpi-number">{avgVal.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</strong>
            </span>
            <span className="kpi-sweep-light"></span>
          </div>
          <div className="kpi-card count" title={`Total de amostras: ${sanitizedData.length}`}>
            <div className="kpi-header">
              <Layers size={12} className="kpi-icon count" />
              <span className="kpi-label">TOTAL</span>
            </div>
            <span className="kpi-val">
              <strong className="kpi-number">{sanitizedData.length}</strong> <small>itens</small>
            </span>
            <span className="kpi-sweep-light"></span>
          </div>
        </div>
      )}

      <div className="recharts-card-body" style={{ width: "100%", minHeight: chartHeight, height: chartHeight, position: "relative" }}>
        {renderChart()}
      </div>
    </div>
  );
});

const StableImage = React.memo(({ image, thumbnail, title }: { image: string; thumbnail?: string; title: string }) => {
  const [fallback, setFallback] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const source = fallback ? image : thumbnail || image;
  if (failed || !source || !/^https?:\/\//i.test(source)) return <span className="image-unavailable"><Image size={20} /><span>Imagem indisponível</span></span>;
  return <img src={source} alt={title} loading="lazy" decoding="async" className={loaded ? 'image-ready' : 'image-pending'} onLoad={() => setLoaded(true)} onError={() => {
    if (!fallback && image && image !== source) { setFallback(true); setLoaded(false); }
    else setFailed(true);
  }} />;
});

const ImageGalleryWidget = React.memo(({ jsonStr }: { jsonStr: string }) => {
  const [selectedImage, setSelectedImage] = useState<any | null>(null);
  const lightboxRef = useDialogFocus(!!selectedImage, () => setSelectedImage(null));

  try {
    const data = JSON.parse(jsonStr);
    const images = data.images || [];
    const query = data.query || 'Imagens';

    if (!images || images.length === 0) {
      return (
        <div className="image-gallery-empty-card">
          <Image size={18} />
          <span>Nenhuma imagem encontrada para esta busca.</span>
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
              <span className="gallery-title">Galeria de imagens</span>
              <span className="gallery-query">"{query}"</span>
            </div>
          </div>
          <span className="gallery-count-badge">{images.length} {images.length === 1 ? 'imagem' : 'imagens'}</span>
        </div>

        <div className="image-gallery-grid">
          {images.map((img: any, idx: number) => (
            <div key={`${img.image || img.thumbnail}-${idx}`} className="image-grid-item">
              <button type="button" className="image-thumb-container" aria-label={`Ampliar ${img.title || query}`} onClick={() => setSelectedImage(img)}>
                <StableImage key={img.image || img.thumbnail} thumbnail={img.thumbnail} image={img.image} title={img.title || query} />
                <div className="image-hover-glass">
                  <Maximize2 size={20} className="icon-zoom" />
                  <span className="hover-title">{img.title}</span>
                </div>
              </button>
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
            <div className="image-lightbox-dialog" ref={lightboxRef} role="dialog" aria-modal="true" aria-label="Visualizar imagem" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
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
                  <button onClick={() => setSelectedImage(null)} className="btn-lightbox-close" aria-label="Fechar imagem">
                    <X size={18} />
                  </button>
                </div>
              </div>
              <div className="lightbox-image-wrapper">
                <StableImage key={selectedImage.image} image={selectedImage.image} title={selectedImage.title || query} />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div className="image-gallery-error-card">Erro ao renderizar galeria de imagens.</div>;
  }
});

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

  // A aprovação exige foco no botão; Escape continua disponível para negar.
  useEffect(() => {
    if (!isPending || !isLatestPending) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
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
          {riskLevel === 'safe' && !isEditing && <div className="terminal-approval-remember">
            <label className="remember-checkbox-label">
              <input
                type="checkbox"
                checked={rememberChoice}
                onChange={(e) => setRememberChoice(e.target.checked)}
              />
              <span>Permitir este mesmo comando de leitura por 30 minutos</span>
            </label>
          </div>}

          <div className="terminal-approval-actions">
            <button
              onClick={() => onApproveTerminal?.(msg.id, true, isEditing ? editedCommand : undefined, rememberChoice)}
              className="btn-approve"
              title="Permitir execução do comando exibido"
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
            <span>{riskLevel === 'high' ? 'Revise o comando literal e use o botão Permitir.' : 'Use o botão Permitir ou diga “sim, execute”.'} Esc para negar.</span>
          </div>
        </>
      ) : (
        <div className="terminal-approval-resolved-status">
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            {status === 'approved' && <span className="status-badge approved"><Check size={14} /> Permitido ✓</span>}
            {status === 'edited' && <span className="status-badge edited"><Edit3 size={14} /> Permitido com Alteração ✎</span>}
            {status === 'denied' && <span className="status-badge denied"><X size={14} /> Negado ✕</span>}
            {msg.remember && <span className="status-badge remembered"><ShieldCheck size={14} /> Salvo na Whitelist 🛡️</span>}
          </div>
          {(msg.output || msg.error) && (
            <div className="terminal-approval-output" style={{ marginTop: "10px", background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.08)", padding: "10px 12px", borderRadius: "6px", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", maxHeight: "180px", overflowY: "auto" }}>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: msg.error ? "#f87171" : "#a7f3d0" }}>
                {msg.output || msg.error}
              </pre>
            </div>
          )}
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
    const output = lines.slice(1).join("\n").trim();
    return { command: rawCmd.trim(), output };
  }

  if (lines.length > 1 && (lines[0].startsWith('ls') || lines[0].startsWith('cat') || lines[0].startsWith('git') || lines[0].startsWith('node') || lines[0].startsWith('npm') || lines[0].startsWith('python') || lines[0].startsWith('echo') || lines[0].startsWith('pwd'))) {
    return { command: lines[0].trim(), output: lines.slice(1).join("\n").trim() };
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
    <div className={`pipeline-group-card hud-pipeline-card ${isRunning ? 'running' : 'completed'}`} aria-live="polite">
      <span className="card-bracket tl"></span>
      <span className="card-bracket tr"></span>
      <span className="card-bracket bl"></span>
      <span className="card-bracket br"></span>

      {/* Glowing progress line at top */}
      <div className={`pipeline-progress-track ${isRunning ? 'active' : 'done'}`}>
        <div className="progress-shimmer"></div>
      </div>

      <div className="pipeline-header" role="button" tabIndex={0} aria-expanded={isOpen} aria-label="Mostrar ou ocultar atividade" onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setIsOpen(!isOpen); } }} onClick={() => setIsOpen(!isOpen)}>
        <div className="pipeline-header-left">
          <div className="pipeline-sparkle-badge">
            <Terminal size={13} className="hud-term-icon" />
          </div>
          <div className="pipeline-title-group">
            <span className="pipeline-hud-tag">EXEC.STREAM // LOG</span>
            <span className="pipeline-title">Atividade do Jasper</span>
          </div>
          <span className="pipeline-step-count">
            {actions.length} {actions.length === 1 ? 'ETAPA' : 'ETAPAS'}
          </span>
        </div>

        <div className="pipeline-header-right">
          {isRunning && (
            <span className="pipeline-status-pill running">
              <span className="segmented-ring-spinner"></span>
              <span>Em andamento</span>
            </span>
          )}
          {!isRunning && hasError && (
            <span className="pipeline-status-pill error">
              <AlertCircle size={12} /> Falha
            </span>
          )}
          {!isRunning && !hasError && (
            <span className="pipeline-status-pill done">
              <CheckCircle2 size={12} className="snap-check" /> Concluído {totalDuration > 0 ? `[+${totalDuration}ms]` : ''}
            </span>
          )}

          <span className="btn-toggle-pipeline" aria-hidden="true">
            {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
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
                <div key={act.id} className={`pipeline-step-item hud-step-item ${status}`}>
                  <div className={`step-node-icon ${status}`}>
                    {status === 'running' ? (
                      <span className="mini-segmented-spinner"></span>
                    ) : status === 'error' ? (
                      <AlertCircle size={12} className="icon-err" />
                    ) : (
                      <Check size={12} className="icon-check-snap" />
                    )}
                  </div>
                  <div className="step-content-wrapper">
                    <div className="step-content">
                      <span className="step-tool-tag">{act.tool ? `// ${act.tool.toUpperCase()}` : '// STEP'}</span>
                      <span className="step-text typewriter-text">{act.text}</span>
                      <span className="step-time-tag">
                        <Clock size={10} /> {act.durationMs && act.durationMs > 0 ? `+${act.durationMs}ms` : '+45ms'}
                      </span>
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

// Stable component identities preserve chart controls, loaded images and video playback.
const MARKDOWN_COMPONENTS: Components = {
  pre({ children }) { return <>{children}</>; },

                      table({ children }) {
                        return (
                          <div className="custom-table-container">
                            <table className="custom-markdown-table">{children}</table>
                          </div>
                        );
                      },
                      thead({ children }) {
                        return <thead className="custom-thead">{children}</thead>;
                      },
                      tbody({ children }) {
                        return <tbody className="custom-tbody">{children}</tbody>;
                      },
                      tr({ children }) {
                        return <tr className="custom-tr">{children}</tr>;
                      },
                      th({ children }) {
                        return <th className="custom-th">{children}</th>;
                      },
                      td({ children }) {
                        return <td className="custom-td">{children}</td>;
                      },
                      code({ node, inline, className, children, ...props }: any) {
                        const match = /language-(\w+)/.exec(className || '');
                        const language = match ? match[1] : '';

                        const isBlock = !!match || String(children).endsWith('\n');

                        if (isBlock) {
                          if (language === 'recharts') {
                            return <ChartComponent jsonStr={String(children)} />;
                          }
                          if (language === 'table' || language === 'tabela' || language === 'json-table') {
                            return <InteractiveTable jsonStr={String(children)} />;
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
};

const AssistantMarkdown = React.memo(({ text }: { text: string }) => {
  const prepared = useMemo(() => prepareStreamingMarkdown(text), [text]);
  return <>
    <ReactMarkdown remarkPlugins={MARKDOWN_PLUGINS} components={MARKDOWN_COMPONENTS}>{prepared.markdown}</ReactMarkdown>
    {prepared.pending && <div className="media-loading" role="status"><Loader2 size={17} className="spin" /><span>Preparando {prepared.pending === 'images' ? 'imagens' : prepared.pending === 'recharts' ? 'gráfico' : 'conteúdo'}…</span></div>}
  </>;
});
const MARKDOWN_PLUGINS = [remarkGfm];

const ChatFeed: React.FC<ChatFeedProps> = ({ messages, onApproveTerminal, onReadNotice }) => {
  const feedRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);

  useEffect(() => {
    if (feedRef.current && followLatest.current) {
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
    <div className="chat-feed" ref={feedRef} onScroll={() => { const feed = feedRef.current; if (feed) followLatest.current = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 90; }}>
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
                <div className="assistant-msg-header hud-asst-header">
                  <div className="assistant-capsule-badge">
                    <span className="mini-orb-ring"></span>
                    <Orb state="IDLE" animated={false} />
                  </div>
                  <div className="assistant-meta-block">
                    <span className="assistant-name-tag">JASPER</span>
                    <span className="assistant-telemetry-pill">Assistente pessoal</span>
                  </div>
                </div>
                <div className="markdown-body">
                  {msg.notice && <div className="notice-heading"><Newspaper size={13} /><span>{msg.notice.article?.topic || (msg.notice.kind === 'clock' ? 'Agora' : 'Jasper por perto')}</span><time>{new Date(msg.notice.sentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time></div>}
                  <AssistantMarkdown text={textToDisplay} />
                  {msg.notice && <div className="notice-actions">{msg.notice.article && <a href={msg.notice.article.url} target="_blank" rel="noopener noreferrer">{msg.notice.article.source}<ExternalLink size={12} /></a>}{onReadNotice && <button onClick={() => onReadNotice(textToDisplay)}><Volume2 size={13} />Ouvir</button>}</div>}
                  {!msg.notice && onReadNotice && textToDisplay && <div className="notice-actions"><button onClick={() => onReadNotice(textToDisplay)}><Volume2 size={13} />Ouvir resposta</button></div>}
                </div>
              </>
            ) : (
              <div className="user-msg-bubble hud-user-bubble">
                <span className="card-bracket tr"></span>
                <div className="user-msg-header">
                  <span className="user-tag">Você</span>
                </div>
                <div className="user-msg-content">{textToDisplay}</div>
                {textToDisplay && (textToDisplay.includes('youtube.com/') || textToDisplay.includes('youtu.be/') || textToDisplay.includes('.mp4')) && (
                  <div style={{ marginTop: '12px', maxWidth: '600px' }}>
                    <VideoPlayerWidget jsonStr={JSON.stringify({ url: textToDisplay.match(/https?:\/\/[^\s]+/)?.[0] || textToDisplay })} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default React.memo(ChatFeed);

