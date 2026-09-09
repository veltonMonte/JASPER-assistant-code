import React, { useState } from 'react';
import { Mic, Send } from 'lucide-react';

export interface InputBarProps {
  onSendText: (text: string) => void;
  onToggleMic: () => void;
  isListening: boolean;
}

const InputBar: React.FC<InputBarProps> = ({ onSendText, onToggleMic, isListening }) => {
  const [text, setText] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const trimmed = text.trim();
      if (trimmed) {
        onSendText(trimmed);
        setText('');
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed) {
      onSendText(trimmed);
      setText('');
    }
  };

  return (
    <footer className="input-bar">
      <div className="input-wrapper">
        <button
          type="button"
          className={`input-btn mic ${isListening ? 'active' : ''}`}
          onClick={onToggleMic}
          aria-label="Toggle Microphone"
        >
          <Mic size={18} />
        </button>
        <textarea
          className="input-field"
          placeholder="Faça uma pergunta ou comando..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button
          type="button"
          onClick={handleSubmit}
          className="input-btn send"
          aria-label="Send Message"
          disabled={!text.trim()}
        >
          <Send size={18} />
        </button>
      </div>
    </footer>
  );
};

export default InputBar;
