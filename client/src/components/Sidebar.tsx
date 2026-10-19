import VoiceControls from './VoiceControls';
import React, { useState, useEffect } from 'react';
import { 
  X, MessageSquare, BrainCircuit, Cpu, Wrench, Monitor, Activity, 
  Settings, Lightbulb, Power, Smartphone, Sliders, RotateCcw,
  Bell, Smile, ShieldCheck, Zap, Award, AlignLeft, Heart
} from 'lucide-react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import type { VoiceSettings, PersonalityConfig } from '../hooks/useJasperWebSocket';

export interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDiagnostic: () => void;
  onOpenProactive: () => void;
  onSendCommand: (cmd: string) => void;
  isConnected: boolean;
  isBusy: boolean;
  voiceRequest: (path: string, init?: RequestInit) => Promise<Response>;
  onPreviewVoice: (settings: VoiceSettings) => void;
  personality?: PersonalityConfig;
  onUpdatePersonality?: (trait: keyof PersonalityConfig, value: number) => void;
  onResetPersonality?: () => void;
}

const TRAIT_CONFIG: Array<{
  key: keyof PersonalityConfig;
  label: string;
  icon: React.ReactNode;
  desc: string;
}> = [
  { key: 'humor', label: 'Humor', icon: <Smile size={16} />, desc: 'Piadas e comentários espirituosos' },
  { key: 'honestidade', label: 'Franqueza', icon: <ShieldCheck size={16} />, desc: 'Como dizer a verdade: com mais tato ou mais franqueza' },
  { key: 'sarcasmo', label: 'Sarcasmo', icon: <Zap size={16} />, desc: 'Ironia fina, sem perder a elegância' },
  { key: 'formalidade', label: 'Formalidade', icon: <Award size={16} />, desc: 'Escolha das palavras e grau de formalidade' },
  { key: 'verbosidade', label: 'Verbosidade', icon: <AlignLeft size={16} />, desc: 'Respostas concisas ou aprofundadas' },
  { key: 'empatia', label: 'Empatia', icon: <Heart size={16} />, desc: 'Acolhimento vs foco prático na tarefa' },
];

const Sidebar: React.FC<SidebarProps> = ({ 
  isOpen, 
  onClose, 
  onOpenDiagnostic,
  onOpenProactive,
  onSendCommand,
  personality,
  onUpdatePersonality,
  onResetPersonality,
  isConnected, isBusy, voiceRequest, onPreviewVoice
}) => {
  const panelRef = useDialogFocus(isOpen, onClose);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [showPersonality, setShowPersonality] = useState(true);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstallable(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
    }
    setDeferredPrompt(null);
  };

  return (
    <>
      <div className={`sidebar-backdrop ${isOpen ? 'open' : ''}`} onClick={onClose} />
      <div ref={panelRef} className={`sidebar ${isOpen ? 'open' : ''}`} role="dialog" aria-modal={isOpen || undefined} aria-hidden={!isOpen} aria-labelledby="controls-title" tabIndex={-1}>
        <div className="sidebar-header">
          <span className="sidebar-title" id="controls-title">Seu Jasper</span>
          <button className="close-btn" onClick={onClose} aria-label="Fechar controles"><X size={20} /></button>
        </div>
        
        <div className="sidebar-menu">
          <button className="sidebar-menu-item" onClick={() => { onClose(); onOpenProactive(); }}><Bell size={16} /> Notícias e presença</button>
          <button className="sidebar-menu-item" disabled={!isConnected} onClick={() => onSendCommand('Mostrar conversas')}>
            <MessageSquare size={16} /> Conversas
          </button>
          <button className="sidebar-menu-item" disabled={!isConnected} onClick={() => onSendCommand('Ver memórias')}>
            <BrainCircuit size={16} /> Memórias
          </button>
          <button className="sidebar-menu-item" disabled={!isConnected} onClick={() => onSendCommand('Automação')}>
            <Cpu size={16} /> Automação
          </button>
          <button className="sidebar-menu-item" disabled={!isConnected} onClick={() => onSendCommand('Ferramentas')}>
            <Wrench size={16} /> Ferramentas
          </button>
        </div>

        <VoiceControls isOpen={isOpen} isBusy={isBusy} request={voiceRequest} onPreview={onPreviewVoice} />
        {personality && onUpdatePersonality && (
          <div className="personality-section">
            <button type="button" aria-expanded={showPersonality}
              className="section-label personality-header-toggle" 
              onClick={() => setShowPersonality(prev => !prev)}
            >
              <span className="flex-title"><Sliders size={14} /> Personalidade</span>
              <span className="toggle-indicator">{showPersonality ? '−' : '+'}</span>
            </button>

            {showPersonality && (
              <div className="personality-sliders-container">
                {TRAIT_CONFIG.map(({ key, label, icon, desc }) => {
                  const val = personality[key] ?? 50;
                  return (
                    <div key={key} className="personality-slider-row" title={desc}>
                      <div className="slider-label-row">
                        <span className="slider-name">
                          {icon}
                          <span>{label}</span>
                        </span>
                        <span className="slider-value">{val}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={val}
                        aria-label={`Ajustar ${label}`}
                        className="tars-slider"
                        disabled={!isConnected}
                        onChange={(e) => onUpdatePersonality(key, Number(e.target.value))}
                      />
                    </div>
                  );
                })}

                {onResetPersonality && (
                  <button 
                    className="tars-reset-btn"
                    disabled={!isConnected}
                    onClick={onResetPersonality}
                    title="Restaurar o estilo formal, espontâneo e com ironia discreta"
                  >
                    <RotateCcw size={13} />
                    <span>Restaurar padrão</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="device-section">
          <div className="section-label">Dispositivos</div>
          
          <div className="device-row">
            <span className="device-icon"><Monitor size={20} /></span>
            <div className="device-meta">
              <span className="device-label">Workstation</span>
              <span className="device-state">Consultar disponibilidade</span>
            </div>
            <button className="power-btn" disabled={!isConnected} aria-label="Ligar computador" title="Ligar computador" onClick={() => onSendCommand('JASPER, ligar meu computador')}><Power size={14} /></button>
          </div>
          
          <div className="device-row">
            <span className="device-icon"><Lightbulb size={20} /></span>
            <div className="device-meta">
              <span className="device-label">Iluminação Principal</span>
              <span className="device-state">Controle por comando</span>
            </div>
            <button className="power-btn" disabled={!isConnected} aria-label="Ligar iluminação do escritório" title="Ligar iluminação" onClick={() => onSendCommand('JASPER, ligar luz do escritório')}><Power size={14} /></button>
          </div>
        </div>

        <div className="sidebar-footer">
          <button className="sidebar-menu-item" onClick={() => { onClose(); onOpenDiagnostic(); }}>
            <Activity size={16} /> Diagnóstico
          </button>
          <button className="sidebar-menu-item" disabled={!isConnected} onClick={() => onSendCommand('Configurações')}>
            <Settings size={16} /> Configurações
          </button>
          {isInstallable && (
            <button className="sidebar-menu-item download-app-btn" onClick={handleInstallClick}>
              <Smartphone size={16} /> Instalar Aplicativo (PWA)
            </button>
          )}
        </div>
      </div>
    </>
  );
};

export default Sidebar;
