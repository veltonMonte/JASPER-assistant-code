import React, { useState, useEffect } from 'react';
import { 
  X, MessageSquare, BrainCircuit, Cpu, Wrench, Monitor, Activity, 
  Settings, Lightbulb, Power, Smartphone, Sliders, RotateCcw,
  Smile, ShieldCheck, Zap, Award, AlignLeft, Heart
} from 'lucide-react';
import { PersonalityConfig } from '../hooks/useJasperWebSocket';

export interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDiagnostic: () => void;
  onSendCommand: (cmd: string) => void;
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
  { key: 'honestidade', label: 'Honestidade', icon: <ShieldCheck size={16} />, desc: 'Verdades diretas sem rodeios (TARS 90%)' },
  { key: 'sarcasmo', label: 'Sarcasmo', icon: <Zap size={16} />, desc: 'Ironia militar e cinismo sutil' },
  { key: 'formalidade', label: 'Formalidade', icon: <Award size={16} />, desc: 'Protocolo formal vs parceiro de missão' },
  { key: 'verbosidade', label: 'Verbosidade', icon: <AlignLeft size={16} />, desc: 'Respostas concisas ou aprofundadas' },
  { key: 'empatia', label: 'Empatia', icon: <Heart size={16} />, desc: 'Acolhimento vs foco prático na tarefa' },
];

const Sidebar: React.FC<SidebarProps> = ({ 
  isOpen, 
  onClose, 
  onOpenDiagnostic, 
  onSendCommand,
  personality,
  onUpdatePersonality,
  onResetPersonality
}) => {
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
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <span className="sidebar-title">CONTROLE DO SISTEMA</span>
          <button className="close-btn" onClick={onClose} aria-label="Close Sidebar"><X size={20} /></button>
        </div>
        
        <div className="sidebar-menu">
          <button className="sidebar-menu-item" onClick={() => onSendCommand('Mostrar conversas')}>
            <MessageSquare size={16} /> Conversas
          </button>
          <button className="sidebar-menu-item" onClick={() => onSendCommand('Ver memórias')}>
            <BrainCircuit size={16} /> Memórias
          </button>
          <button className="sidebar-menu-item" onClick={() => onSendCommand('Automação')}>
            <Cpu size={16} /> Automação
          </button>
          <button className="sidebar-menu-item" onClick={() => onSendCommand('Ferramentas')}>
            <Wrench size={16} /> Ferramentas
          </button>
        </div>

        {/* Painel de Personalidade TARS (Interestelar) */}
        {personality && onUpdatePersonality && (
          <div className="personality-section">
            <div 
              className="section-label personality-header-toggle" 
              onClick={() => setShowPersonality(prev => !prev)}
            >
              <span className="flex-title"><Sliders size={14} /> Personalidade (TARS)</span>
              <span className="toggle-indicator">{showPersonality ? '−' : '+'}</span>
            </div>

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
                        onChange={(e) => onUpdatePersonality(key, Number(e.target.value))}
                      />
                    </div>
                  );
                })}

                {onResetPersonality && (
                  <button 
                    className="tars-reset-btn" 
                    onClick={onResetPersonality}
                    title="Restaura os valores nominais do TARS (Humor 60%, Honestidade 90%, Sarcasmo 40%, etc)"
                  >
                    <RotateCcw size={13} />
                    <span>Restaurar Padrão TARS</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="device-section">
          <div className="section-label">Dispositivos</div>
          
          <div className="device-row active">
            <span className="device-icon"><Monitor size={20} /></span>
            <div className="device-meta">
              <span className="device-label">Workstation</span>
              <span className="device-state">Online</span>
            </div>
            <button className="power-btn on" onClick={() => onSendCommand('JASPER, desligar meu PC')}><Power size={14} /></button>
          </div>
          
          <div className="device-row">
            <span className="device-icon"><Lightbulb size={20} /></span>
            <div className="device-meta">
              <span className="device-label">Iluminação Principal</span>
              <span className="device-state">Desligado</span>
            </div>
            <button className="power-btn" onClick={() => onSendCommand('JASPER, ligar luz do escritório')}><Power size={14} /></button>
          </div>
        </div>

        <div className="sidebar-footer">
          <button className="sidebar-menu-item" onClick={() => { onClose(); onOpenDiagnostic(); }}>
            <Activity size={16} /> Diagnóstico
          </button>
          <button className="sidebar-menu-item" onClick={() => onSendCommand('Configurações')}>
            <Settings size={16} /> Configurações
          </button>
          {isInstallable && (
            <button className="sidebar-menu-item download-app-btn" onClick={handleInstallClick}>
              <Smartphone size={16} /> Instalar Aplicativo (PWA)
            </button>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
