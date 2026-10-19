import { useEffect, useState } from 'react'
import { Check, Loader2, Volume2 } from 'lucide-react'
import type { VoiceSettings } from '../hooks/useJasperWebSocket'
interface Snapshot { settings: VoiceSettings; voices: Array<{ id: string; label: string; description: string }> }
export default function VoiceControls({ isOpen, isBusy, request, onPreview }: {
  isOpen: boolean; isBusy: boolean;
  request: (path: string, init?: RequestInit) => Promise<Response>;
  onPreview: (settings: VoiceSettings) => void;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [draft, setDraft] = useState<VoiceSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    if (!isOpen) return
    const controller = new AbortController()
    setError(''); setSaved(false)
    request('preferences', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Não consegui carregar as vozes. Tente abrir os controles novamente.')
      const data: Snapshot = await response.json()
      if (!controller.signal.aborted) { setSnapshot(data); setDraft(data.settings) }
    }).catch(error => { if (error.name !== 'AbortError') setError(error.message) })
    return () => controller.abort()
  }, [isOpen, request])
  const save = async () => {
    if (!draft) return
    setSaving(true); setError(''); setSaved(false)
    try {
      const response = await request('preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar a voz.')
      setSnapshot(data); setDraft(data.settings); setSaved(true)
    } catch (error: unknown) { setError(error instanceof Error ? error.message : 'Não foi possível salvar a voz.') }
    finally { setSaving(false) }
  }
  const changed = !!draft && !!snapshot && (draft.voice !== snapshot.settings.voice || draft.pace !== snapshot.settings.pace)
  return <section className="voice-controls" aria-labelledby="voice-controls-title">
    <div className="section-label" id="voice-controls-title"><Volume2 size={14} /> Voz e presença</div>
    <p className="voice-intro">Formalidade, ironia fina e conversa espontânea. Encontre a voz que combina com você.</p>
    {error && <p className="voice-feedback error" role="alert">{error}</p>}
    {!draft && !error && <p className="voice-feedback">Carregando vozes…</p>}
    {draft && snapshot && <>
      <label className="voice-field">Voz<select value={draft.voice} disabled={saving || isBusy} onChange={event => { setDraft({ ...draft, voice: event.target.value }); setSaved(false) }}>
        {snapshot.voices.map(voice => <option key={voice.id} value={voice.id}>{voice.label} · {voice.description}</option>)}
      </select></label>
      <label className="voice-field">Ritmo<select value={draft.pace} disabled={saving || isBusy} onChange={event => { setDraft({ ...draft, pace: event.target.value as VoiceSettings['pace'] }); setSaved(false) }}>
        <option value="calm">Sereno</option><option value="natural">Natural</option><option value="brisk">Mais ágil</option>
      </select></label>
      <div className="voice-actions">
        <button type="button" disabled={saving || isBusy} onClick={() => onPreview(draft)}><Volume2 size={14} /> Ouvir prévia</button>
        <button type="button" className="voice-apply" disabled={!changed || saving || isBusy} onClick={save}>{saving ? <Loader2 size={14} className="spin" /> : saved ? <Check size={14} /> : null}{saving ? 'Aplicando…' : saved ? 'Aplicado' : 'Usar esta voz'}</button>
      </div>
      <p className="voice-feedback" role="status">{isBusy ? 'Espere o Jasper terminar a fala para testar ou trocar a voz.' : saved ? 'Voz aplicada às conversas e às notícias.' : changed ? 'Ouça antes de aplicar. A prévia não altera sua voz atual.' : 'A mesma voz nas conversas e nas notícias.'}</p>
    </>}
  </section>
}
