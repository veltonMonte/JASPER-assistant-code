import React, { useState, useRef } from "react";
import { Mic, Send } from "lucide-react";

export interface InputBarProps {
  onSendText: (text: string) => void;
  onToggleMic: () => void;
  isListening: boolean;
}

const InputBar: React.FC<InputBarProps> = ({ onSendText, onToggleMic, isListening }) => {
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const triggerSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setIsSending(true);
    setTimeout(() => {
      onSendText(trimmed);
      setText("");
      setIsSending(false);
    }, 120);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      triggerSend();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    triggerSend();
  };

  const hasText = text.trim().length > 0;

  return (
    <footer className="input-bar hud-input-bar">
      <div className={`input-wrapper hud-input-wrapper ${isFocused ? "focused" : ""} ${isListening ? "listening" : ""}`}>
        {/* Sci-fi Corner Brackets */}
        <span className="input-bracket tl"></span>
        <span className="input-bracket tr"></span>
        <span className="input-bracket bl"></span>
        <span className="input-bracket br"></span>

        <button
          type="button"
          className={`input-btn mic hud-mic-btn ${isListening ? "active" : ""}`}
          onClick={onToggleMic}
          aria-label="Toggle Microphone"
          title={isListening ? "Microfone ativado - Ouvindo sua voz" : "Ativar microfone"}
        >
          {isListening ? (
            <div className="mic-listening-visualizer">
              <span className="visualizer-bar bar1"></span>
              <span className="visualizer-bar bar2"></span>
              <span className="visualizer-bar bar3"></span>
              <span className="visualizer-bar bar4"></span>
              <span className="mic-radar-wave"></span>
            </div>
          ) : (
            <Mic size={18} />
          )}
        </button>

        <textarea
          ref={textareaRef}
          className="input-field hud-input-field"
          placeholder={isListening ? "Ouvindo... fale seu comando ou pergunta..." : "Transmitir comando ou mensagem para o JASPER..."}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          rows={1}
        />

        <button
          type="button"
          onClick={handleSubmit}
          className={`input-btn send hud-send-btn ${hasText ? "has-text" : ""} ${isSending ? "sending" : ""}`}
          aria-label="Send Message"
          disabled={!hasText}
          title="Transmitir mensagem (Enter)"
        >
          <Send size={16} className={`send-icon ${isSending ? "rocket" : ""}`} />
          <span className="send-glow-ripple"></span>
        </button>
      </div>

      <div className="input-telemetry-hint">
        <span className="hint-label">COMMAND.IN //</span>
        <span className="hint-text">PRESS [ENTER] TO EXECUTE · [SHIFT+ENTER] MULTILINE</span>
      </div>
    </footer>
  );
};

export default InputBar;
