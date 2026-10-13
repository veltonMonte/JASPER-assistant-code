import React, { useState, useEffect } from 'react';
import { X, MessageSquare, BrainCircuit, Cpu, Wrench, Monitor, Activity, Settings, Lightbulb, Power, Smartphone } from 'lucide-react';

export interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDiagnostic: () => void;
  onSendCommand: (cmd: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, onOpenDiagnostic, onSendCommand }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      // Impede o Chrome antigo de mostrar o prompt automaticamente
      e.preventDefault();
      // Salva o evento para acionar quando o botão for clicado
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    // Se o app já estiver instalado, ou se for PWA standalone, esconder o botão de instalar
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
      console.log('Usuário instalou o PWA!');
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
          {/* Link permanente para baixar o APK Nativo do Android */}
          <a 
            href="/jasper-mobile-v7.1.apk" 
            download
            className="flex items-center gap-2 p-2 mx-2 mb-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 transition-colors border border-emerald-500/20"
          >
            <Smartphone size={16} />
            <span className="text-sm font-medium">Baixar App Nativo v7.1</span>
          </a>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
