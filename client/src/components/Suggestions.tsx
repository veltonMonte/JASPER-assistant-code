import React from 'react';
import { Search, Monitor, CheckSquare, MessageSquare } from 'lucide-react';

export interface SuggestionsProps {
  onSelect: (cmd: string) => void;
}

const Suggestions: React.FC<SuggestionsProps> = ({ onSelect }) => {
  return (
    <div className="suggestions-container">
      <div className="suggestions-grid">
        <button className="suggestion-btn" onClick={() => onSelect('Pesquise algo na web')}>
          <Search size={14} />
          <span>Pesquise algo</span>
        </button>
        <button className="suggestion-btn" onClick={() => onSelect('JASPER, ligar meu computador')}>
          <Monitor size={14} />
          <span>Controle meu PC</span>
        </button>
        <button className="suggestion-btn" onClick={() => onSelect('Resumo')}>
          <CheckSquare size={14} />
          <span>Faça um resumo</span>
        </button>
        <button className="suggestion-btn" onClick={() => onSelect('Vamos conversar')}>
          <MessageSquare size={14} />
          <span>Converse comigo</span>
        </button>
      </div>
    </div>
  );
};

export default Suggestions;
