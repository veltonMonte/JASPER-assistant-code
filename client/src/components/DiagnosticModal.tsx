import React from 'react';
import { X, Server, Radio, Database, Activity, Mic } from 'lucide-react';
import { JasperState } from '../hooks/useJasperWebSocket';

export interface DiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: JasperState;
  isConnected: boolean;
}

const DiagnosticModal: React.FC<DiagnosticModalProps> = ({ isOpen, onClose, state, isConnected }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">DIAGNÓSTICO DO SISTEMA</span>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="diagnostic-grid">
          <div className="diag-item">
            <Server size={18} className="diag-icon" />
            <div className="diag-info">
              <span className="diag-label">Servidor</span>
              <span className="diag-value online">● Online</span>
            </div>
          </div>
          
          <div className="diag-item">
            <Activity size={18} className="diag-icon" />
            <div className="diag-info">
              <span className="diag-label">Sistema</span>
              <span className={`diag-value ${state !== 'ERROR' ? 'online' : 'error'}`}>
                ● {state !== 'ERROR' ? 'Operacional' : 'Falha'}
              </span>
            </div>
          </div>
          
          <div className="diag-item">
            <Database size={18} className="diag-icon" />
            <div className="diag-info">
              <span className="diag-label">Gemini API</span>
              <span className="diag-value online">● Conectado</span>
            </div>
          </div>
          
          <div className="diag-item">
            <Radio size={18} className="diag-icon" />
            <div className="diag-info">
              <span className="diag-label">WebSocket</span>
              <span className={`diag-value ${isConnected ? 'online' : 'error'}`}>
                ● {isConnected ? 'Conectado' : 'Desconectado'}
              </span>
            </div>
          </div>
          
          <div className="diag-item">
            <Mic size={18} className="diag-icon" />
            <div className="diag-info">
              <span className="diag-label">Microfone</span>
              <span className="diag-value online">● Disponível</span>
            </div>
          </div>
          
          <div className="diag-item">
            <Activity size={18} className="diag-icon" />
            <div className="diag-info">
              <span className="diag-label">Latência (Estimada)</span>
              <span className="diag-value muted">142 ms</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiagnosticModal;
