import React from 'react';

/** Uma falha de uma cena não bloqueia a próxima apresentação. */
export default class PresentationErrorBoundary extends React.Component<
  { resetKey: string; onClose: () => void; onRetry?: () => void; children: React.ReactNode },
  { hasError: boolean; detail: string }
> {
  state = { hasError: false, detail: '' };

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, detail: error instanceof Error ? error.message.slice(0, 400) : 'Falha desconhecida ao abrir a apresentação.' };
  }

  componentDidCatch(error: Error) {
    console.error('Falha ao renderizar apresentação visual:', error);
  }

  componentDidUpdate(previous: Readonly<{resetKey: string}>) {
    if (this.state.hasError && previous.resetKey !== this.props.resetKey) this.setState({hasError: false, detail: ''});
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return <main className="presentation-screen" role="alert" style={{display:'grid',placeItems:'center',padding:24,background:'#0b1017'}}>
      <div style={{maxWidth:460,textAlign:'center',color:'#dce9ef'}}>
        <h2 style={{fontSize:20,marginBottom:8}}>Não foi possível abrir esta apresentação</h2>
        <p style={{color:'#8aa1b1',fontSize:14,lineHeight:1.5,marginBottom:16}}>Sua conversa foi preservada. Você pode tentar novamente ou voltar para pedir uma nova cena.</p>
        <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}>
          <button type="button" onClick={()=>{this.props.onRetry?.();this.setState({hasError:false,detail:''});}} style={{padding:'10px 18px',borderRadius:8,background:'#5ab3cf',color:'#08131a',border:0,fontWeight:600,cursor:'pointer'}}>Tentar novamente</button>
          <button type="button" onClick={this.props.onClose} style={{padding:'10px 18px',borderRadius:8,background:'#17232d',color:'#dce9ef',border:'1px solid #52626e',cursor:'pointer'}}>Voltar para a conversa</button>
        </div>
        <details style={{marginTop:20,textAlign:'left',color:'#8aa1b1',fontSize:12}}><summary>Detalhe para diagnóstico</summary><p style={{overflowWrap:'anywhere'}}>{this.state.detail}</p></details>
      </div>
    </main>;
  }
}
