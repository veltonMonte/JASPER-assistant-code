import { useCallback, useEffect, useState } from 'react'
import { Bell, Check, ExternalLink, Loader2, Plus, RefreshCw, Volume2, X } from 'lucide-react'
import { useDialogFocus } from '../hooks/useDialogFocus'

interface Settings {
  enabled: boolean; news: boolean; topics: string[]; questions: boolean; clock: boolean;
  quietEnabled: boolean; quietStart: string; quietEnd: string; timezone: string;
}
interface Snapshot {
  settings: Settings; ready: boolean; lastCheckedAt: string | null; lastError: string | null;
  articles: Array<{ id: string; title: string; url: string; source: string; publishedAt: string; topic: string }>
}
const TOPICS = ['Fortaleza Esporte Clube', 'Futebol e placares', 'Política brasileira', 'Cinema e trailers', 'Tecnologia', 'Games']

export default function ProactivePanel({ isOpen, onClose, onPreview, audioReady, isBusy, request }: {
  isOpen: boolean; onClose: () => void; onPreview: (text: string) => void; audioReady: boolean; isBusy: boolean;
  request: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  const ref = useDialogFocus(isOpen, onClose)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [draft, setDraft] = useState<Settings | null>(null)
  const [customTopic, setCustomTopic] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await request('proactive', { signal })
    const contentType = response.headers.get('content-type') || ''
    if (!response.ok || !contentType.includes('application/json')) throw new Error('O monitor de notícias não respondeu. Verifique se o servidor Jasper foi atualizado e está conectado.')
    const data: Snapshot = await response.json()
    setSnapshot(data)
    return data
  }, [request])
  useEffect(() => {
    if (!isOpen) return
    const controller = new AbortController()
    setError(''); setBusy(true); setSaved(false)
    load(controller.signal).then(data => setDraft(data.settings)).catch(error => {
      if (error.name !== 'AbortError') setError(error.message)
    }).finally(() => { if (!controller.signal.aborted) setBusy(false) })
    return () => controller.abort()
  }, [isOpen, load])
  if (!isOpen) return null
  const update = (patch: Partial<Settings>) => { setDraft(previous => previous ? { ...previous, ...patch } : previous); setSaved(false) }
  const toggleTopic = (topic: string) => {
    if (!draft) return
    if (!draft.topics.includes(topic) && draft.topics.length >= 8) { setError('Você pode acompanhar até oito assuntos.'); return }
    update({ topics: draft.topics.includes(topic) ? draft.topics.filter(value => value !== topic) : [...draft.topics, topic] })
  }
  const save = async () => {
    if (!draft) return
    setBusy(true); setError('')
    try {
      const response = await request('proactive', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar.')
      setSnapshot(data); setDraft(data.settings); setSaved(true)
    } catch (error: any) { setError(error.message) }
    finally { setBusy(false) }
  }
  const refresh = async () => {
    setBusy(true); setError('')
    try { const response = await request('proactive/refresh', { method: 'POST' }); if (!response.ok) throw new Error('Não foi possível atualizar agora.'); await load() }
    catch (error: any) { setError(error.message) }
    finally { setBusy(false) }
  }
  const toggle = (key: 'enabled' | 'news' | 'questions' | 'clock' | 'quietEnabled', label: string, description: string) => draft && (
    <label className="preference-toggle"><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={draft[key]} onChange={event => update({ [key]: event.target.checked })} /></label>
  )
  return <div className="modal-backdrop proactive-backdrop" onClick={onClose}>
    <div className="proactive-panel" ref={ref} role="dialog" aria-modal="true" aria-labelledby="proactive-title" tabIndex={-1} onClick={event => event.stopPropagation()}>
      <div className="modal-header"><div><span className="panel-eyebrow"><Bell size={12} />JASPER POR PERTO</span><h2 id="proactive-title">O que vale sua atenção.</h2></div><button className="close-btn" onClick={onClose} aria-label="Fechar notícias e presença"><X size={19} /></button></div>
      <div className="proactive-body">
        {error && <p className="panel-error" role="alert">{error}</p>}
        {!draft && busy && <div className="media-loading"><Loader2 size={18} className="spin" />Carregando preferências…</div>}
        {draft && <>
          {toggle('enabled', 'Jasper pode puxar assunto', 'Novidades dos seus interesses e companhia em momentos tranquilos.')}
          <section className="proactive-section"><h3>Seus interesses</h3><p>Notícias novas têm prioridade. Política aparece com menos frequência.</p>
            <div className="topic-chips">{[...new Set([...TOPICS, ...draft.topics])].map(topic => <button key={topic} className={draft.topics.includes(topic) ? 'selected' : ''} aria-pressed={draft.topics.includes(topic)} onClick={() => toggleTopic(topic)}>{draft.topics.includes(topic) && <Check size={12} />}{topic}</button>)}</div>
            <form className="custom-topic" onSubmit={event => { event.preventDefault(); const topic = customTopic.trim(); if (topic && !draft.topics.includes(topic)) toggleTopic(topic); setCustomTopic('') }}><input aria-label="Adicionar assunto" placeholder="Outro assunto, filme ou campeonato…" maxLength={80} value={customTopic} onChange={event => setCustomTopic(event.target.value)} /><button aria-label="Adicionar interesse" disabled={!customTopic.trim() || draft.topics.length >= 8}><Plus size={17} /></button></form>
          </section>
          <section className="proactive-section">
            {toggle('news', 'Me avise das novidades', 'Consulta às fontes a cada dois minutos, com links e horário. Sem repetir manchetes.')}
            {toggle('questions', 'Perguntas de vez em quando', 'Entre 25 e 60 minutos, em intervalos aleatórios de inatividade.')}
            {toggle('clock', 'Comentários sobre a hora', 'Um lembrete ocasional, sem anúncio a cada hora.')}
          </section>
          <section className="proactive-section">
            {toggle('quietEnabled', 'Horário de silêncio', 'As notícias continuam disponíveis no painel, sem falas neste período.')}
            {draft.quietEnabled && <div className="quiet-times"><label>Das<input type="time" value={draft.quietStart} onChange={event => update({ quietStart: event.target.value })} /></label><span>até</span><label>Às<input type="time" value={draft.quietEnd} onChange={event => update({ quietEnd: event.target.value })} /></label><span className="timezone-label">{draft.timezone.replace('America/', '').replace('_', ' ')}</span></div>}
            <div className="voice-preview"><span><i className={audioReady ? 'ready' : ''} />{audioReady ? 'Áudio habilitado nesta sessão' : 'Clique em testar para habilitar a voz'}</span><button disabled={isBusy} title={isBusy ? 'Aguarde o Jasper terminar a resposta' : 'Ouvir uma demonstração'} onClick={() => onPreview('Estou por aqui. Vou acompanhar seus assuntos e avisar quando aparecer uma novidade, sem interromper nossa conversa.')}><Volume2 size={14} />Testar voz</button></div>
            <p className="proactive-note">O Jasper fala com a página aberta e visível, após você interagir com ela. Aguarda você terminar de falar ou escrever e não interfere em confirmações de comandos. Placares seguem as notícias publicadas; não são transmissão ao vivo.</p>
          </section>
          <section className="proactive-section"><div className="news-feed-heading"><h3>Nas fontes agora</h3><button disabled={busy} onClick={refresh} aria-label="Atualizar notícias"><RefreshCw size={13} className={busy ? 'spin' : ''} /></button></div>
            <p>{snapshot?.lastCheckedAt ? `Última consulta às ${new Date(snapshot.lastCheckedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Aguardando a primeira consulta às fontes.'}</p>
            {snapshot?.lastError && <p className="panel-error">{snapshot.lastError}</p>}
            <div className="news-feed">{snapshot?.articles.slice(0, 6).map(article => <a key={article.id} href={article.url} target="_blank" rel="noopener noreferrer"><span className="news-topic">{article.topic}</span><strong>{article.title}</strong><small>{article.source} · {new Date(article.publishedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}<ExternalLink size={11} /></small></a>)}{!snapshot?.articles.length && <span className="news-empty">As manchetes recentes dos seus assuntos aparecem aqui. Se não houver novidades, o Jasper aguarda.</span>}</div>
          </section>
        </>}
      </div>
      {draft && <div className="proactive-footer"><span role="status">{saved ? <><Check size={13} />Preferências salvas</> : 'Suas escolhas ficam salvas no Jasper.'}</span><button className="save-preferences" onClick={save} disabled={busy}>{busy ? <Loader2 size={15} className="spin" /> : null}Salvar preferências</button></div>}
    </div>
  </div>
}
