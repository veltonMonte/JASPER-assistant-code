import React from "react";
import { Search, Monitor, Terminal, BarChart2 } from "lucide-react";

export interface SuggestionsProps {
  onSelect: (cmd: string) => void;
}

const SUGGESTION_ITEMS = [
  {
    id: "01",
    label: "Pesquisar na Web",
    cmd: "Pesquise na web as últimas notícias de tecnologia",
    icon: Search,
    code: "NET.QUERY"
  },
  {
    id: "02",
    label: "Gerar Gráfico",
    cmd: "Crie um gráfico comparando as linguagens de programação mais populares",
    icon: BarChart2,
    code: "DATA.RECHARTS"
  },
  {
    id: "03",
    label: "Ligar Computador",
    cmd: "JASPER, ligar meu computador",
    icon: Monitor,
    code: "WOL.MAGIC"
  },
  {
    id: "04",
    label: "Status do Sistema",
    cmd: "Verifique o uso de memória e CPU no terminal",
    icon: Terminal,
    code: "SYS.TELEMETRY"
  }
];

const Suggestions: React.FC<SuggestionsProps> = ({ onSelect }) => {
  return (
    <div className="suggestions-container hud-suggestions-container">
      <div className="suggestions-grid hud-suggestions-grid">
        {SUGGESTION_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className="suggestion-btn hud-suggestion-card"
              onClick={() => onSelect(item.cmd)}
            >
              <div className="card-brackets">
                <span className="bracket tl"></span>
                <span className="bracket br"></span>
              </div>
              <div className="suggestion-header">
                <span className="suggestion-code">[{item.id}] // {item.code}</span>
                <Icon size={14} className="suggestion-icon" />
              </div>
              <span className="suggestion-label">{item.label}</span>
              <div className="suggestion-sweep"></div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default Suggestions;
