import React from 'react';
import { Menu } from 'lucide-react';
import { JasperState } from '../hooks/useJasperWebSocket';

export interface HeaderProps {
  isConnected: boolean;
  state: JasperState;
  onToggleSidebar: () => void;
}

const Header: React.FC<HeaderProps> = ({ isConnected, onToggleSidebar }) => {
  return (
    <header className="header">
      <div className="header-left">
        <button className="menu-button" onClick={onToggleSidebar} aria-label="Toggle Sidebar">
          <Menu size={18} />
        </button>
        <div className="logo-container">
          <h1 className="logo-text">JASPER</h1>
          <span className="subtitle">Agente de sistema inteligente</span>
        </div>
      </div>
      <div className="header-right">
        <div className="status-pill">
          <span className={`dot ${isConnected ? 'online' : 'offline'}`}></span>
          <span className="label">{isConnected ? 'Online' : 'Offline'}</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
