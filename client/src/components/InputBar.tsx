import React, { useEffect, useRef, useState } from 'react'
import { ArrowUp, Mic, Square } from 'lucide-react'

interface InputBarProps {
  onSendText: (text: string) => void
  onToggleMic: () => void
  isListening: boolean
  isMicStarting: boolean
  isVoiceReady: boolean
  canUseLocalMicrophone?: boolean
  isConnected: boolean
}

export default function InputBar({ onSendText, onToggleMic, isListening, isMicStarting, isVoiceReady, isConnected, canUseLocalMicrophone = false }: InputBarProps) {
  const microphoneAvailable = canUseLocalMicrophone || typeof navigator.mediaDevices?.getUserMedia === 'function'
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const input = inputRef.current
    if (input) { input.style.height = '24px'; input.style.height = `${Math.min(input.scrollHeight, 120)}px` }
  }, [text])
  const submit = () => {
    if (!text.trim() || !isConnected) return
    onSendText(text.trim())
    setText('')
  }
  return <footer className="input-bar">
    <form className={`input-wrapper ${isListening ? 'listening' : ''}`} onSubmit={e => { e.preventDefault(); submit() }}>
      <span className="composer-symbol" aria-hidden="true">/</span>
      <textarea id="message-input" ref={inputRef} className="input-field" aria-label="Mensagem para o Jasper" placeholder={isListening ? 'Estou ouvindo. Pode falar…' : 'O que vamos fazer agora?'} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }} rows={1} />
      <button type="button" className={`input-btn mic ${isListening || isMicStarting ? 'active' : ''}`} onClick={onToggleMic} disabled={!isConnected || !microphoneAvailable} aria-label={isMicStarting ? 'Cancelar ativação do microfone' : isListening ? 'Parar de ouvir' : 'Ativar microfone'} aria-pressed={isListening || isMicStarting} title={!microphoneAvailable ? 'O microfone exige HTTPS ao acessar pelo IP' : isMicStarting ? 'Aguardando permissão do microfone' : isListening ? 'Parar de ouvir' : 'Conversar por voz'}>{isListening || isMicStarting ? <Square size={15} fill="currentColor" /> : <Mic size={19} />}</button>
      <span className="input-divider" />
      <button type="submit" className="input-btn send" aria-label="Enviar mensagem" title="Enviar mensagem (Enter)" disabled={!text.trim() || !isConnected}><ArrowUp size={20} /></button>
    </form>
    <div className="input-hint"><span>{!isConnected ? 'Reconectando ao Jasper. Sua mensagem será mantida aqui.' : !microphoneAvailable ? 'Texto disponível. Para usar o microfone pelo IP, abra o Jasper com HTTPS.' : isMicStarting ? 'Aguardando permissão do microfone no navegador…' : isListening ? 'Microfone ativo · Toque no quadrado para encerrar' : !isVoiceReady ? 'Serviço de voz reconectando. Você pode escrever enquanto isso.' : 'Toque no microfone para falar ou escreva sua mensagem'}</span><span className="keyboard-hint"><kbd>↵</kbd> enviar <span>·</span> <kbd>shift ↵</kbd> nova linha</span></div>
  </footer>
}
