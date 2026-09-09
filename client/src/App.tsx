import { useState, useCallback } from 'react'
import { useJasperWebSocket } from './hooks/useJasperWebSocket'
import Header from './components/Header'
import Orb from './components/Orb'
import ChatFeed from './components/ChatFeed'
import InputBar from './components/InputBar'
import Sidebar from './components/Sidebar'
import Suggestions from './components/Suggestions'
import DiagnosticModal from './components/DiagnosticModal'

const STATUS_LABELS: Record<string, string> = {
  IDLE: 'Em Espera',
  LISTENING: 'Ouvindo...',
  PROCESSING: 'Processando',
  SPEAKING: 'Respondendo...',
  ERROR: 'Erro',
}

const cleanText = (text: string) => {
  if (!text) return '';
  return text
    .replace(/\*\*.*?\*\*/gs, '') // Remove closed blocks
    .replace(/\*\*.*$/s, '')      // Remove open blocks (streaming)
    .trim();
}

export default function App() {
  const { state, isConnected, messages, transcript, sendText, toggleMic, getAudioLevel } = useJasperWebSocket()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [diagnosticOpen, setDiagnosticOpen] = useState(false)

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev)
  }, [])

  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false)
  }, [])

  const handleSendCommand = useCallback((cmd: string) => {
    sendText(cmd)
  }, [sendText])

  const orbState = state === 'ERROR' ? 'IDLE' : state

  const hasMessages = messages.length > 0

  return (
    <div className={`app ${hasMessages ? 'chat-mode' : 'initial-mode'}`}>
      <Header isConnected={isConnected} state={state} onToggleSidebar={handleToggleSidebar} />

      <main className="main-content">
        <div className="orb-background-container">
          <Orb 
            state={orbState as 'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING'} 
            getAudioLevel={getAudioLevel}
          />
          <span className="status-label">{STATUS_LABELS[state] || 'Em Espera'}</span>
          <p className="transcript-text">{cleanText(transcript)}</p>
        </div>

        {!hasMessages ? (
          <div className="initial-suggestions">
            <Suggestions onSelect={handleSendCommand} />
          </div>
        ) : (
          <div className="chat-container">
            <ChatFeed messages={messages} />
          </div>
        )}
      </main>

      <div className="input-container">
        <InputBar
          onSendText={sendText}
          onToggleMic={toggleMic}
          isListening={state === 'LISTENING'}
        />
      </div>

      <Sidebar
        isOpen={sidebarOpen}
        onClose={handleCloseSidebar}
        onOpenDiagnostic={() => setDiagnosticOpen(true)}
        onSendCommand={handleSendCommand}
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
