import React, { useState, useEffect } from "react";
import { Menu, Smartphone, Laptop, Activity } from "lucide-react";
import { JasperState } from "../hooks/useJasperWebSocket";

export interface HeaderProps {
  isConnected: boolean;
  state: JasperState;
  activeMic?: "womic" | "notebook";
  onToggleSidebar: () => void;
}

const Header: React.FC<HeaderProps> = ({ isConnected, state, activeMic = "notebook", onToggleSidebar }) => {
  const [timeStr, setTimeStr] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toTimeString().split(" ")[0]);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="header hud-header">
      <div className="header-left">
        <button className="menu-button hud-btn-corner" onClick={onToggleSidebar} aria-label="Toggle Sidebar" title="Painel de Controle e Personalidade">
          <Menu size={16} />
          <span className="btn-bracket tl"></span>
          <span className="btn-bracket br"></span>
        </button>

        <div className="logo-container">
          <div className="logo-row">
            <h1 className="logo-text">JASPER</h1>
            <span className="hud-badge-version">v2.5 // TARS-LIVE</span>
          </div>
          <div className="hud-telemetry-row">
            <span className="telemetry-item"><span className="telemetry-dot"></span>SYS.ONLINE</span>
            <span className="telemetry-sep">/</span>
            <span className="telemetry-item"><span className="telemetry-code">0x7F00_0001</span></span>
          </div>
        </div>
      </div>

      <div className="header-center-telemetry">
        <div className="hud-clock-box">
          <span className="hud-clock-label">SYS.TIME</span>
          <span className="hud-clock-val">{timeStr || "--:--:--"}</span>
        </div>
        <div className="hud-state-indicator" data-state={state}>
          <Activity size={12} className="state-pulse-icon" />
          <span className="state-text">{state}</span>
        </div>
      </div>

      <div className="header-right">
        <div 
          className={`mic-pill hud-pill ${activeMic}`} 
          title={activeMic === "womic" ? "WO Mic (Celular) via PipeWire roteado" : "Microfone integrado do notebook ativo"}
        >
          {activeMic === "womic" ? <Smartphone size={13} className="mic-icon-active" /> : <Laptop size={13} />}
          <span className="label">{activeMic === "womic" ? "WO MIC // LINK" : "NOTEBOOK // MIC"}</span>
          <span className="mic-signal-waves">
            <span className="wave w1"></span>
            <span className="wave w2"></span>
          </span>
        </div>

        <div className={`status-pill hud-pill ${isConnected ? "online" : "offline"}`}>
          <span className="hud-radar-dot">
            <span className="radar-core"></span>
            <span className="radar-ping"></span>
          </span>
          <span className="label">{isConnected ? "QUANTUM LINK" : "DISCONNECTED"}</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
