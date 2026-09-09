import React from 'react';
import { Menu } from 'lucide-react';
import { JasperState } from '../hooks/useJasperWebSocket';

export interface HeaderProps {
  isConnected: boolean;
  state: JasperState;
  onToggleSidebar: () => void;
}

const Header: React.FC<HeaderProps> = ({ isConnected, state, onToggleSidebar }) => {
  return (
    <header className="header" style={{ padding: '0.5rem 1rem' }}>
      <div className="header-left">
        <button className="menu-button" onClick={onToggleSidebar} aria-label="Toggle Sidebar">
          <Menu size={20} />
        </button>
        <div className="logo-container">
          <h1 className="logo-text">JASPER</h1>
          <span className="subtitle" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            Agente de Sistema Inteligente
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: isConnected ? '#22c55e' : '#ef4444' }}></span>
            <span style={{ fontSize: '0.7rem' }}>{isConnected ? 'Online' : 'Offline'}</span>
          </span>
        </div>
      </div>
      <div className="header-right">
        {isConnected ? (
          <div className="status-indicator online">
            <span className="status-dot-pulse"></span>
            <span className="status-text">Online</span>
          </div>
        ) : (
          <div className="status-indicator error">
            <span className="status-dot-solid"></span>
            <span className="status-text">Offline</span>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
