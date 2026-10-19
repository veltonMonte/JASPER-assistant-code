import { ArrowUpRight, Boxes, Monitor, Terminal, ChartNoAxesCombined } from 'lucide-react'

const ITEMS = [
  { label: 'Apresente uma ideia', description: 'Diagramas e modelos 3D', command: 'Jasper, me explique o fluxo de uma API em uma apresentação visual narrada', icon: Boxes },
  { label: 'Veja além dos dados', description: 'Transforme em gráficos', command: 'Crie um gráfico de exemplo com os valores 12, 28 e 43 para Janeiro, Fevereiro e Março', icon: ChartNoAxesCombined },
  { label: 'Seu espaço, conectado', description: 'Ligue seu computador', command: 'JASPER, ligar meu computador', icon: Monitor },
  { label: 'Tudo sob controle', description: 'Consulte seu sistema', command: 'Verifique o uso de memória e CPU no terminal', icon: Terminal },
]
export default function Suggestions({ onSelect, disabled = false }: { onSelect: (cmd: string) => void; disabled?: boolean }) {
  return <section className="suggestions-container" aria-label="Atalhos para começar">
    <div className="suggestions-heading"><span>POR ONDE COMEÇAMOS?</span><span>Algumas possibilidades</span></div>
    <div className="suggestions-grid">{ITEMS.map(({ label, description, command, icon: Icon }, index) => (
      <button key={label} className="suggestion-btn" onClick={() => onSelect(command)} disabled={disabled} style={{ animationDelay: `${index * 65 + 180}ms` }}>
        <div className="suggestion-icon-row"><Icon size={18} strokeWidth={1.5} /><ArrowUpRight className="suggestion-arrow" size={15} /></div>
        <span className="suggestion-label">{label}</span><span className="suggestion-description">{description}</span>
      </button>
    ))}</div>
  </section>
}
