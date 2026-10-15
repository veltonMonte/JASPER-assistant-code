import { useState, useCallback, useEffect } from "react"
import { useJasperWebSocket } from "./hooks/useJasperWebSocket"
import Header from "./components/Header"
import Orb from "./components/Orb"
import ChatFeed from "./components/ChatFeed"
import InputBar from "./components/InputBar"
import Sidebar from "./components/Sidebar"
import Suggestions from "./components/Suggestions"
import DiagnosticModal from "./components/DiagnosticModal"

const STATUS_LABELS: Record<string, string> = {
  IDLE: "Em Espera",
  LISTENING: "Ouvindo...",
  PROCESSING: "Processando...",
  SPEAKING: "Respondendo...",
  ERROR: "Erro no Sistema",
}

const cleanText = (text: string) => {
  if (!text) return "";
  return text
    .replace(/\*\*.*?\*\*/gs, "")
    .replace(/\*\*.*$/s, "")
    .trim();
}

export default function App() {
  const { 
    state, 
    isConnected, 
    messages, 
    transcript, 
    activeMic,
    personality,
    updatePersonality,
    resetPersonality,
    sendText, 
    toggleMic, 
    getAudioLevel, 
    sendTerminalApproval, 
    activeAlarm, 
    stopAlarm 
  } = useJasperWebSocket()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [diagnosticOpen, setDiagnosticOpen] = useState(false)

  // Interactive mouse light tracking on document
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      document.documentElement.style.setProperty("--mouse-x", `${e.clientX}px`);
      document.documentElement.style.setProperty("--mouse-y", `${e.clientY}px`);
    };
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev)
  }, [])

  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false)
  }, [])

  const handleSendCommand = useCallback((cmd: string) => {
    sendText(cmd)
  }, [sendText])

  const orbState = state === "ERROR" ? "IDLE" : state
  const hasMessages = messages.length > 0

  return (
    <div className={`app hud-app ${hasMessages ? "chat-mode" : "initial-mode"}`}>
      
      {/* Sci-fi Live Background Layers */}
      <div className="hud-ambient-backdrop" aria-hidden="true">
        <div className="hud-grid-plane"></div>
        <div className="hud-scan-beam"></div>
        <div className="hud-scanlines-noise"></div>
        <div className="hud-vignette"></div>
      </div>

      {activeAlarm && (
        <div className="alarm-overlay modern">
          <div className="alarm-content">
            <div className="alarm-time">
               {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </div>
            <h2 className="alarm-title">Alarme</h2>
            <p className="alarm-message">{activeAlarm.message}</p>
          </div>
          <div className="alarm-actions">
             <button className="alarm-snooze-btn" onClick={stopAlarm}>Soneca</button>
             <button className="alarm-stop-btn-modern" onClick={stopAlarm}>Parar</button>
          </div>
        </div>
      )}

      <Header 
        isConnected={isConnected} 
        state={state} 
        activeMic={activeMic}
        onToggleSidebar={handleToggleSidebar} 
      />

      <main className="main-content">
        <div className="orb-background-container">
          {/* Surrounding Sci-fi HUD Frame - BEHIND Orb, zero modification to Orb itself */}
          <div className="orb-hud-frame" data-state={orbState} aria-hidden="true">
            <div className="orb-hud-rings">
              <div className="hud-ring ring-outer"></div>
              <div className="hud-ring ring-segmented"></div>
              <div className="hud-ring ring-inner"></div>
            </div>
            <div className="orb-hud-rail rail-left">
              <span className="rail-glow-line"></span>
              <span className="rail-pulse-slug"></span>
              <span className="rail-tick t1"></span>
              <span className="rail-tick t2"></span>
              <span className="rail-telemetry-tag">PWR.LINK</span>
            </div>
            <div className="orb-hud-rail rail-right">
              <span className="rail-glow-line"></span>
              <span className="rail-pulse-slug"></span>
              <span className="rail-tick t1"></span>
              <span className="rail-tick t2"></span>
              <span className="rail-telemetry-tag">SYN.44K</span>
            </div>
          </div>

          <Orb 
            state={orbState as "IDLE" | "LISTENING" | "PROCESSING" | "SPEAKING"} 
            getAudioLevel={getAudioLevel}
          />

          <span className="status-label hud-status-label" data-state={orbState}>
            <span className="status-marker"></span>
            {STATUS_LABELS[state] || "Em Espera"}
          </span>
          <p className="transcript-text hud-transcript-text">{cleanText(transcript)}</p>
        </div>

        {!hasMessages ? (
          <div className="initial-suggestions">
            <Suggestions onSelect={handleSendCommand} />
          </div>
        ) : (
          <div className="chat-container">
            <ChatFeed messages={messages} onApproveTerminal={sendTerminalApproval} />
          </div>
        )}
      </main>

      <div className="input-container">
        <InputBar
          onSendText={sendText}
          onToggleMic={toggleMic}
          isListening={state === "LISTENING"}
        />
      </div>

      <Sidebar
        isOpen={sidebarOpen}
        onClose={handleCloseSidebar}
        onOpenDiagnostic={() => setDiagnosticOpen(true)}
        onSendCommand={handleSendCommand}
        personality={personality}
        onUpdatePersonality={updatePersonality}
        onResetPersonality={resetPersonality}
      />
      
      <DiagnosticModal
        isOpen={diagnosticOpen}
        onClose={() => setDiagnosticOpen(false)}
        state={state}
        isConnected={isConnected}
      />
    </div>
  )
}
