import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Copy, Check, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
export interface Message {
  id: string;
  sender: 'user' | 'assistant' | 'system' | 'action';
  text: string;
  actionStatus?: 'running' | 'done' | 'error';
}

function isThinkingLine(line: string): boolean {
  const l = line.toLowerCase().trim();
  if (!l) return false;

  const thinkingKeywords = [
    'clarifying the',
    'grappling with',
    'lack of context',
    'my focus is',
    'need specifics',
    'responding to',
    'processed the',
    'decided a simple',
    'maintaining a natural',
    'my current plan',
    'i will follow',
    "i'll follow",
    'standard offer',
    'outlining response',
    'assistant persona',
    'the user wants',
    'the user is',
    'user actually wants',
    'narrow down the scope',
    'allow me to move forward',
    'taking action',
    'prevent me from',
    'ambiguity of',
    'locating information',
    'initiating search',
    'outlining'
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
    'action', 'context', 'specifics', 'topic', 'scope', 'clarifying'
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

const cleanText = (text: string) => {
  if (!text) return '';
  if (text.includes('```')) {
    const lines = text.split('\n');
    let inCode = false;
    const cleanLines = lines.filter(line => {
      if (line.includes('```')) {
        inCode = !inCode;
        return true;
      }
      if (inCode) return true;
      return !isThinkingLine(line);
    });
    return cleanLines.join('\n').trim();
  }

  const lines = text.split('\n');
  const cleanLines = lines.filter(line => !isThinkingLine(line));
  return cleanLines.join('\n').trim();
};

export interface ChatFeedProps {
  messages: Message[];
}

const ChartComponent: React.FC<{ jsonStr: string }> = ({ jsonStr }) => {
  try {
    const config = JSON.parse(jsonStr);
    const { type, data, xKey, series } = config;

    if (!data || !series) return <div className="text-red-400 p-2">Configuração de gráfico inválida.</div>;

    const renderChart = () => {
      switch (type) {
        case 'line':
          return (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
              <XAxis dataKey={xKey || 'name'} stroke="#8b949e" tick={{ fill: '#8b949e' }} />
              <YAxis stroke="#8b949e" tick={{ fill: '#8b949e' }} />
              <Tooltip contentStyle={{ backgroundColor: '#161b22', borderColor: '#30363d', color: '#c9d1d9' }} />
              <Legend wrapperStyle={{ color: '#c9d1d9', paddingTop: '10px' }} />
              {series.map((s: any) => (
                <Line key={s.dataKey} type="monotone" dataKey={s.dataKey} stroke={s.color || '#06b6d4'} name={s.name || s.dataKey} strokeWidth={2} />
              ))}
            </LineChart>
          );
        case 'bar':
          return (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
              <XAxis dataKey={xKey || 'name'} stroke="#8b949e" tick={{ fill: '#8b949e' }} />
              <YAxis stroke="#8b949e" tick={{ fill: '#8b949e' }} />
              <Tooltip contentStyle={{ backgroundColor: '#161b22', borderColor: '#30363d', color: '#c9d1d9' }} cursor={{ fill: '#30363d', opacity: 0.4 }} />
              <Legend wrapperStyle={{ color: '#c9d1d9', paddingTop: '10px' }} />
              {series.map((s: any) => (
                <Bar key={s.dataKey} dataKey={s.dataKey} fill={s.color || '#06b6d4'} name={s.name || s.dataKey} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          );
        default:
          return <div className="text-[#8b949e]">Tipo de gráfico não suportado: {type}</div>;
      }
    };

    return (
      <div style={{ width: '100%', height: '300px', backgroundColor: '#0d1117', padding: '16px', borderRadius: '12px', border: '1px solid #30363d', margin: '16px 0', overflow: 'hidden' }}>
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
    );
  } catch (err) {
    return <div className="text-red-400 p-2">Erro ao renderizar gráfico: JSON inválido</div>;
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
    <div className="code-block-container">
      <div className="code-block-header">
        <span className="code-language-tag">{language}</span>
        <button onClick={handleCopy} className="code-copy-btn" title="Copiar código">
          {copied ? (
            <>
              <Check size={14} style={{ color: '#10b981' }} />
              <span style={{ color: '#10b981' }}>Copiado!</span>
            </>
          ) : (
            <>
              <Copy size={14} />
              <span>Copiar Código</span>
            </>
          )}
        </button>
      </div>
      <div className="code-block-body">
        <SyntaxHighlighter
          language={language}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            padding: '16px',
            background: '#0d1117',
            fontSize: '13px',
            lineHeight: '1.6',
          }}
          codeTagProps={{
            style: { fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', monospace" }
          }}
        >
          {codeString}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

const ChatFeed: React.FC<ChatFeedProps> = ({ messages }) => {
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="chat-feed" ref={feedRef}>
      {messages.map((msg) => {
        if (msg.sender === 'action') {
          return (
            <div key={msg.id} className="msg msg-action flex items-center space-x-2 py-2 px-4 bg-[#161b22] border border-[#30363d] rounded-xl my-1 text-xs text-[#8b949e]">
              {msg.actionStatus === 'running' && <Loader2 size={14} className="animate-spin text-[#06b6d4]" />}
              {msg.actionStatus === 'done' && <CheckCircle2 size={14} className="text-green-400" />}
              {msg.actionStatus === 'error' && <AlertCircle size={14} className="text-red-400" />}
              <span className="font-mono">{msg.text}</span>
            </div>
          );
        }

        const textToDisplay = msg.sender === 'assistant' ? cleanText(msg.text) : msg.text;
        if (msg.sender === 'assistant' && !textToDisplay) return null;
        
        return (
          <div key={msg.id} className={`msg msg-${msg.sender}`}>
            {msg.sender === 'assistant' ? (
              <div className="markdown-body text-sm leading-relaxed">
                <ReactMarkdown
                  components={{
                    code({ node, inline, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || '');
                      const language = match ? match[1] : '';

                      if (!inline && String(children).includes('\n')) {
                        if (language === 'recharts') {
                          return <ChartComponent jsonStr={String(children)} />;
                        }
                        return <CodeBlock className={className}>{children}</CodeBlock>;
                      }
                      return (
                        <code className="bg-[#1f242c] text-[#06b6d4] px-1.5 py-0.5 rounded font-mono text-xs" {...props}>
                          {children}
                        </code>
                      );
                    }
                  }}
                >
                  {textToDisplay}
                </ReactMarkdown>
              </div>
            ) : (
              textToDisplay
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ChatFeed;
