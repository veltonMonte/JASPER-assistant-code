import { useEffect, useState } from 'react'
import { Laptop, Smartphone, SlidersHorizontal } from 'lucide-react'
import type { JasperState } from '../hooks/useJasperWebSocket'

interface HeaderProps {
  isConnected: boolean
  state: JasperState
  activeMic?: 'womic' | 'notebook'
  onToggleSidebar: () => void
}

export default function Header({ isConnected, activeMic = 'notebook', onToggleSidebar }: HeaderProps) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return (
    <header className="header">
      <div className="header-left"><div className="logo-container"><h1 className="logo-text">JASPER<span className="brand-period">.</span></h1><span className="subtitle">Assistente pessoal</span></div><span className="header-divider" /><span className="workspace-name">Visão geral</span></div>
      <div className="header-right">
        <time className="header-clock" dateTime={now.toISOString()}><span>{now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')}</span>{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time>
        <span className="mic-source" title="Fonte de áudio selecionada">{activeMic === 'womic' ? <Smartphone size={14} /> : <Laptop size={14} />}<span>{activeMic === 'womic' ? 'WO Mic' : 'Notebook'}</span></span>
        <span className={`connection-status ${isConnected ? 'connected' : ''}`}><i />{isConnected ? 'Conectado' : 'Sem conexão'}</span>
        <button className="header-settings" onClick={onToggleSidebar} aria-label="Abrir controles" title="Abrir controles"><SlidersHorizontal size={18} /></button>
      </div>
    </header>
  )
}
