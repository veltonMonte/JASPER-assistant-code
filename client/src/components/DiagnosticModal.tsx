import { Activity, Laptop, Radio, Mic, X } from 'lucide-react'
import type { JasperState } from '../hooks/useJasperWebSocket'
import { useDialogFocus } from '../hooks/useDialogFocus'

interface DiagnosticModalProps {
  isOpen: boolean
  onClose: () => void
  state: JasperState
  isConnected: boolean
  activeMic?: 'womic' | 'notebook'
}
export default function DiagnosticModal({ isOpen, onClose, state, isConnected, activeMic }: DiagnosticModalProps) {
  const ref = useDialogFocus(isOpen, onClose)
  if (!isOpen) return null
  const labels: Record<JasperState, string> = { IDLE: 'Em espera', LISTENING: 'Ouvindo', PROCESSING: 'Processando', SPEAKING: 'Respondendo', ERROR: 'Requer atenção' }
  return <div className="modal-backdrop" onClick={onClose}>
    <div className="modal-content" ref={ref} role="dialog" aria-modal="true" aria-labelledby="diagnostic-title" tabIndex={-1} onClick={event => event.stopPropagation()}>
      <div className="modal-header"><h2 className="modal-title" id="diagnostic-title">Estado da conexão</h2><button className="close-btn" onClick={onClose} aria-label="Fechar diagnóstico"><X size={18} /></button></div>
      <div className="diagnostic-grid">
        <div className="diag-item"><Radio size={17} className="diag-icon" /><div className="diag-info"><span className="diag-label">Conexão com Jasper</span><span className={`diag-value ${isConnected ? 'online' : 'error'}`}>{isConnected ? 'Conectado' : 'Reconectando'}</span></div></div>
        <div className="diag-item"><Activity size={17} className="diag-icon" /><div className="diag-info"><span className="diag-label">Assistente</span><span className="diag-value">{isConnected ? labels[state] : 'Aguardando conexão'}</span></div></div>
        <div className="diag-item"><Laptop size={17} className="diag-icon" /><div className="diag-info"><span className="diag-label">Fonte de áudio selecionada</span><span className="diag-value">{activeMic === 'womic' ? 'WO Mic · Celular' : 'Microfone do notebook'}</span></div></div>
        <div className="diag-item"><Mic size={17} className="diag-icon" /><div className="diag-info"><span className="diag-label">Captura no navegador</span><span className="diag-value muted">{typeof navigator.mediaDevices?.getUserMedia === 'function' ? 'Compatível' : 'Requer contexto seguro'}</span></div></div>
      </div>
      <p className="diagnostic-note">A conexão indica o acesso ao servidor Jasper. A disponibilidade do modelo de IA e dos dispositivos depende das respectivas integrações.</p>
    </div>
  </div>
}
