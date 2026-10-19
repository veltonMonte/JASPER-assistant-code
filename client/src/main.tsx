import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

class AppErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    console.error('Jasper não conseguiu exibir a interface:', error)
  }

  render() {
    if (this.state.failed) {
      return <main role="alert" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#0b0f14', color: '#dce9ef', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, fontWeight: 500 }}>O Jasper precisa recarregar</h1>
          <p style={{ color: '#9cb0bd', lineHeight: 1.6 }}>Houve uma falha ao mostrar esta tela. Sua conversa pode ser retomada após atualizar a página.</p>
          <button type="button" onClick={() => window.location.reload()} style={{ marginTop: 14, padding: '12px 18px', border: '1px solid #a6d1df', borderRadius: 9, background: '#a6d1df', color: '#10212b', font: 'inherit', cursor: 'pointer' }}>Recarregar Jasper</button>
        </div>
      </main>
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary><App /></AppErrorBoundary>,
)

// Service Worker registration
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
