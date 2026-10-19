import React, { useState, useCallback, lazy, Suspense } from 'react'
import { Activity, Bell, AudioLines, BrainCircuit, Command, MessageSquare, SlidersHorizontal, Workflow, PanelsTopLeft } from 'lucide-react'
import { useJasperWebSocket } from './hooks/useJasperWebSocket'
import Header from './components/Header'
import Orb from './components/Orb'
import ChatFeed from './components/ChatFeed'
import InputBar from './components/InputBar'
import Sidebar from './components/Sidebar'
import Suggestions from './components/Suggestions'
import DiagnosticModal from './components/DiagnosticModal'
import ProactivePanel from './components/ProactivePanel'
import DeviceGatekeeperModal from "./components/DeviceGatekeeperModal"
import DeviceApprovalBanner from "./components/DeviceApprovalBanner"
import PresentationErrorBoundary from './components/PresentationErrorBoundary'
import { loadWithRetry } from './lib/loadWithRetry'
const PresentationScreen = lazy(() => loadWithRetry(() => import('./components/PresentationScreen')))

import { proseFromStreamingMarkdown } from './lib/streamingMarkdown'

const STATUS_LABELS: Record<string, string> = {
  IDLE: 'Pronto para ajudar', LISTENING: 'Estou ouvindo', PROCESSING: 'Pensando na sua resposta',
  SPEAKING: 'Respondendo', ERROR: 'Atenção necessária',
}
const HEADINGS: Record<string, string> = {
  IDLE: 'À sua escuta.', LISTENING: 'Pode falar.', PROCESSING: 'Conectando as ideias.',
  SPEAKING: 'Vamos em frente.', ERROR: 'Vamos reconectar.',
}


export default function App() {
  const { state, isConnected, isMicActive, isMicStarting, isVoiceReady, messages, transcript, activeMic, personality, updatePersonality,
    resetPersonality, sendText, toggleMic, getAudioLevel, sendTerminalApproval, activeAlarm, stopAlarm, readProactive, previewVoice, voiceRequest, proactiveAudioReady, authStatus, pendingDeviceRequests, requestDeviceAccess, resolveDeviceAccess,
    presentation, presentationOpen, presentationReady, closePresentation, openPresentation, setPresentationNarrating, activateScene, getNarrationContext, apiRequest } = useJasperWebSocket()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [proactiveOpen, setProactiveOpen] = useState(false)
  const [diagnosticOpen, setDiagnosticOpen] = useState(false)
  const handleSendCommand = useCallback((cmd: string) => {
    sendText(cmd)
    setSidebarOpen(false)
  }, [sendText])
  const hasMessages = messages.length > 0
  const orbState = state === 'ERROR' ? 'IDLE' : state

  return (
    <div className={`app ${hasMessages ? 'chat-mode' : 'initial-mode'}`} data-state={state}>
      <div className="ambient-light" aria-hidden="true" />
      <a className="skip-link" href="#message-input">Ir para a mensagem</a>
      <nav className="navigation-rail" aria-label="Navegação principal">
        <a className="brand-mark" href="#main" aria-label="Jasper, início"><Command size={23} strokeWidth={1.5} /></a>
        <div className="rail-main">
          <button className={`rail-button ${presentationOpen ? '' : 'selected'}`} aria-label="Conversa" title="Conversa" onClick={() => { closePresentation(); requestAnimationFrame(() => document.getElementById('message-input')?.focus()) }}><MessageSquare size={20} /></button>
          <button className={`rail-button ${presentationOpen ? 'selected' : ''}`} aria-label="Apresentação visual" title="Apresentação visual" disabled={!presentation} onClick={openPresentation}><PanelsTopLeft size={20} /></button>
          <button className="rail-button" aria-label="Consultar memórias" title="Memórias" disabled={!isConnected} onClick={() => handleSendCommand('Ver memórias')}><BrainCircuit size={20} /></button>
          <button className="rail-button" aria-label="Automações" title="Automações" disabled={!isConnected} onClick={() => handleSendCommand('Mostre as automações disponíveis')}><Workflow size={20} /></button>
        </div>
        <div className="rail-bottom">
          <button className="rail-button" aria-label="Notícias e presença" title="Notícias e presença" onClick={() => setProactiveOpen(true)}><Bell size={20} /></button>
          <button className="rail-button" aria-label="Diagnóstico" title="Diagnóstico" onClick={() => setDiagnosticOpen(true)}><Activity size={20} /></button>
          <button className="rail-button" aria-label="Personalidade e controles" title="Personalidade e controles" onClick={() => setSidebarOpen(true)}><SlidersHorizontal size={20} /></button>
          <span className="rail-signature">J</span>
        </div>
      </nav>
      <div className="workspace">
        {presentationOpen && presentation ? (
          <PresentationErrorBoundary resetKey={presentation.id} onClose={closePresentation}>
            <Suspense fallback={<div className="presentation-loading">Preparando estúdio visual…</div>}>
              <PresentationScreen
                presentation={presentation}
                ready={presentationReady}
                request={voiceRequest}
                getNarrationContext={getNarrationContext}
                onClose={closePresentation}
                onSceneActive={activateScene}
                onNarratingChange={setPresentationNarrating}
              />
            </Suspense>
          </PresentationErrorBoundary>
        ) : <>
        <Header isConnected={isConnected} state={state} activeMic={activeMic} onToggleSidebar={() => setSidebarOpen(true)} />
        <main className="main-content" id="main">
          <section className="orb-stage" aria-label="Assistente Jasper">
            <span className="stage-eyebrow" aria-hidden={hasMessages}>SEU ESPAÇO. SUA INTELIGÊNCIA.</span>
            <div className="core-instrument" data-state={state} aria-hidden="true">
              <div className="core-halo" />
              <div className="instrument-ring ring-track" />
              <div className="instrument-ring ring-orbit"><span /></div>
              <div className="instrument-ring ring-inner" />
              <span className="core-axis axis-left" /><span className="core-axis axis-right" />
              <span className="core-coordinate coordinate-left">J / 01</span>
              <span className="core-coordinate coordinate-right">VOICE + TEXT</span>
              <Orb state={orbState} getAudioLevel={getAudioLevel} />
            </div>
            <div className="hero-copy" aria-hidden={hasMessages}>
              <h2 key={state}>{HEADINGS[state]}</h2>
              <p>Uma ideia, uma pergunta ou o próximo passo.</p>
            </div>
            <div className="live-status" role="status" aria-live="polite">
              <span className={`state-dot ${isConnected ? state.toLowerCase() : 'offline'}`} />
              <span>{isConnected ? STATUS_LABELS[state] : 'Aguardando conexão'}</span>
            </div>
            {transcript && <p className="transcript-text">{proseFromStreamingMarkdown(transcript)}</p>}
          </section>
          {hasMessages ? (
            <div className="chat-container"><ChatFeed messages={messages} onApproveTerminal={sendTerminalApproval} onReadNotice={readProactive} /></div>
          ) : (
            <div className="initial-suggestions"><Suggestions onSelect={handleSendCommand} disabled={!isConnected} /></div>
          )}
        </main>
        <div className="input-container">
          <InputBar canUseLocalMicrophone={authStatus.isMaster && authStatus.isAuthorized && activeMic === 'womic'} onSendText={sendText} onToggleMic={toggleMic} isListening={isMicActive} isMicStarting={isMicStarting} isVoiceReady={isVoiceReady} isConnected={isConnected} />
          <div className="workspace-footer"><span><AudioLines size={12} /> Voz e texto, em sintonia.</span><span className="footer-signature">JASPER <span>/</span> PERSONAL ASSISTANT</span></div>
        </div>
        </>}
      </div>
      {activeAlarm && (
        <div className="alarm-overlay" role="alertdialog" aria-modal="true" aria-labelledby="alarm-title">
          <div className="alarm-content"><span className="stage-eyebrow">LEMBRETE</span><div className="alarm-time">{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div><h2 id="alarm-title">Hora de uma pausa.</h2><p>{activeAlarm.message}</p></div>
          <button className="alarm-stop-btn-modern" autoFocus onClick={stopAlarm}>Dispensar alarme</button>
        </div>
      )}
      <ProactivePanel request={apiRequest} isOpen={proactiveOpen} onClose={() => setProactiveOpen(false)} onPreview={readProactive} audioReady={proactiveAudioReady} isBusy={state !== 'IDLE'} />
      <Sidebar isBusy={state !== 'IDLE'} voiceRequest={voiceRequest} onPreviewVoice={previewVoice} onOpenProactive={() => setProactiveOpen(true)} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} onOpenDiagnostic={() => setDiagnosticOpen(true)} onSendCommand={handleSendCommand} personality={personality} onUpdatePersonality={updatePersonality} onResetPersonality={resetPersonality} isConnected={isConnected} />
      <DeviceApprovalBanner requests={pendingDeviceRequests} onResolve={resolveDeviceAccess} />
      {isConnected && !authStatus.isChecking && !authStatus.isMaster && !authStatus.isAuthorized && (
        <DeviceGatekeeperModal authStatus={authStatus} onRequestAccess={requestDeviceAccess} isConnected={isConnected} />
      )}
      <DiagnosticModal isOpen={diagnosticOpen} onClose={() => setDiagnosticOpen(false)} state={state} isConnected={isConnected} activeMic={activeMic} />
    </div>
  )
}
