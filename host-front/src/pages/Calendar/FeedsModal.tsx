import { AlertTriangle, ArrowLeft, CheckCircle2, Link2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Segmented } from '../../components/ui/Segmented'
import { ApiError, calendarApi, type CalendarFeed, type CalendarFeedInput, type Platform } from '../../services/api'
import { PLATFORM_LABEL, PLATFORM_OPTIONS } from '../Reservations/options'
import { COLOR_SWATCHES, PLATFORM_COLOR } from './calendar'

interface Props {
  open: boolean
  onClose: () => void
  /** Chamado após criar/editar/excluir — a página recarrega o calendário. */
  onChanged: (message: string) => void
  propertySuggestions: string[]
}

/** Onde encontrar o link de exportação (iCal) em cada plataforma. */
const HOW_TO: Partial<Record<Platform, string>> = {
  AIRBNB: 'Anúncios › escolha o anúncio › Disponibilidade › Conectar calendários › Exportar calendário › copie o link.',
  BOOKING: 'Extranet › Tarifas e disponibilidade › Sincronizar calendários › Adicionar conexão › Exportar › copie o link.',
  VRBO: 'Calendário › Importar e exportar › Exportar calendário › copie o link (.ics).',
  DIRETO: 'Qualquer calendário que gere um link iCal (.ics), como Google Agenda ou outro sistema de reservas.',
  OUTRA: 'Procure por “exportar calendário”, “iCal” ou “sincronizar calendário” nas configurações da plataforma.',
}

const emptyForm = (platform: Platform = 'AIRBNB'): CalendarFeedInput => ({
  name: PLATFORM_LABEL[platform],
  platform,
  url: '',
  color: PLATFORM_COLOR[platform],
  propertyName: '',
  active: true,
})

export function FeedsModal({ open, onClose, onChanged, propertySuggestions }: Props) {
  const [feeds, setFeeds] = useState<CalendarFeed[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [editing, setEditing] = useState<CalendarFeed | 'new' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    calendarApi
      .feeds(controller.signal)
      .then(({ data }) => {
        setFeeds(data)
        setLoadError('')
        // Primeira vez: já abre o formulário
        if (!data.length) setEditing('new')
      })
      .catch((err) => !controller.signal.aborted && setLoadError(err.message ?? 'Erro ao carregar os links'))
    return () => controller.abort()
  }, [open, reloadKey])

  function close() {
    setEditing(null)
    setConfirmDelete(null)
    onClose()
  }

  async function remove(feed: CalendarFeed) {
    setBusyId(feed.id)
    try {
      await calendarApi.removeFeed(feed.id)
      setConfirmDelete(null)
      setReloadKey((k) => k + 1)
      onChanged('Link removido')
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Não foi possível remover')
    } finally {
      setBusyId(null)
    }
  }

  async function toggleActive(feed: CalendarFeed) {
    setBusyId(feed.id)
    try {
      await calendarApi.updateFeed(feed.id, { ...feed, propertyName: feed.propertyName ?? '', active: !feed.active })
      setReloadKey((k) => k + 1)
      onChanged(feed.active ? 'Link pausado' : 'Link reativado')
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Não foi possível alterar')
    } finally {
      setBusyId(null)
    }
  }

  if (editing) {
    return (
      <FeedForm
        key={editing === 'new' ? 'new' : editing.id}
        open={open}
        feed={editing === 'new' ? null : editing}
        canGoBack={!!feeds?.length}
        propertySuggestions={propertySuggestions}
        onBack={() => setEditing(null)}
        onClose={close}
        onSaved={(isNew) => {
          setEditing(null)
          setReloadKey((k) => k + 1)
          onChanged(isNew ? 'Link adicionado — sincronizando…' : 'Link atualizado')
        }}
      />
    )
  }

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      title="Plataformas conectadas"
      subtitle="Links de calendário (iCal) de onde o imóvel está anunciado. Somente leitura."
      footer={
        <>
          <button type="button" className="ui-btn ui-btn--ghost" onClick={close}>
            Fechar
          </button>
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => setEditing('new')}>
            <Plus strokeWidth={2.2} />
            Adicionar link
          </button>
        </>
      }
    >
      {loadError && <p className="guest-form__alert">{loadError}</p>}
      {!feeds ? (
        <div className="finance__loading">
          <span className="spinner spinner--lg" />
        </div>
      ) : (
        <ul className="feeds">
          {feeds.map((f) => (
            <li key={f.id} className={`feeds__item ${f.active ? '' : 'is-paused'}`}>
              <span className="calendar__dot calendar__dot--lg" style={{ background: f.color }} aria-hidden />
              <div className="feeds__info">
                <strong>
                  {f.name}
                  <small>{PLATFORM_LABEL[f.platform]}</small>
                </strong>
                {f.propertyName && <span className="feeds__property">{f.propertyName}</span>}
                <span className="feeds__url" title={f.url}>
                  {f.url}
                </span>
                <span className={`feeds__status ${f.lastError ? 'is-error' : ''}`}>
                  {!f.active ? (
                    'Pausado — não aparece no calendário'
                  ) : f.lastError ? (
                    <>
                      <AlertTriangle strokeWidth={2} aria-hidden /> {f.lastError}
                    </>
                  ) : f.lastSyncAt ? (
                    <>
                      <CheckCircle2 strokeWidth={2} aria-hidden />
                      {f.lastEvents ?? 0} marcação(ões) · sincronizado em{' '}
                      {new Date(f.lastSyncAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    </>
                  ) : (
                    'Ainda não sincronizado'
                  )}
                </span>
              </div>
              <div className="feeds__actions">
                {confirmDelete === f.id ? (
                  <>
                    <button
                      type="button"
                      className="ui-btn ui-btn--ghost ui-btn--sm feeds__danger"
                      onClick={() => remove(f)}
                      disabled={busyId === f.id}
                    >
                      Remover
                    </button>
                    <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setConfirmDelete(null)}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <label className={`ui-switch ui-switch--compact ${f.active ? 'is-on' : ''}`} title={f.active ? 'Pausar' : 'Reativar'}>
                      <input
                        type="checkbox"
                        checked={f.active}
                        disabled={busyId === f.id}
                        onChange={() => toggleActive(f)}
                        aria-label={f.active ? `Pausar ${f.name}` : `Reativar ${f.name}`}
                      />
                      <span className="ui-switch__track">
                        <span className="ui-switch__thumb" />
                      </span>
                    </label>
                    <button type="button" className="icon-btn" onClick={() => setEditing(f)} aria-label={`Editar ${f.name}`} title="Editar">
                      <Pencil />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => setConfirmDelete(f.id)}
                      aria-label={`Remover ${f.name}`}
                      title="Remover"
                    >
                      <Trash2 />
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------------------

interface FormProps {
  open: boolean
  feed: CalendarFeed | null
  canGoBack: boolean
  propertySuggestions: string[]
  onBack: () => void
  onClose: () => void
  onSaved: (isNew: boolean) => void
}

function FeedForm({ open, feed, canGoBack, propertySuggestions, onBack, onClose, onSaved }: FormProps) {
  const [form, setForm] = useState<CalendarFeedInput>(() =>
    feed ? { ...feed, propertyName: feed.propertyName ?? '' } : emptyForm(),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [alert, setAlert] = useState('')
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof CalendarFeedInput>(key: K, value: CalendarFeedInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: '' }))
  }

  function choosePlatform(platform: Platform) {
    setForm((f) => {
      // Troca nome/cor sugeridos se o usuário ainda não os personalizou
      const nameIsDefault = !f.name.trim() || f.name === PLATFORM_LABEL[f.platform]
      const colorIsDefault = f.color === PLATFORM_COLOR[f.platform]
      return {
        ...f,
        platform,
        name: nameIsDefault ? PLATFORM_LABEL[platform] : f.name,
        color: colorIsDefault ? PLATFORM_COLOR[platform] : f.color,
      }
    })
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    const next: Record<string, string> = {}
    if (form.name.trim().length < 2) next.name = 'Informe um nome para o calendário'
    const url = form.url.trim()
    if (!url) next.url = 'Cole o link do calendário'
    else if (!/^(https?|webcal):\/\/\S+$/i.test(url)) next.url = 'Link inválido — cole o endereço completo (https://…)'
    setErrors(next)
    if (Object.keys(next).length) return

    setSaving(true)
    setAlert('')
    try {
      const input = { ...form, name: form.name.trim(), url, propertyName: form.propertyName.trim() }
      if (feed) await calendarApi.updateFeed(feed.id, input)
      else await calendarApi.createFeed(input)
      onSaved(!feed)
    } catch (err) {
      if (err instanceof ApiError && err.errors.length) {
        setErrors(Object.fromEntries(err.errors.map((e) => [e.field, e.message])))
      } else setAlert(err instanceof ApiError ? err.message : 'Não foi possível salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={feed ? 'Editar link' : 'Adicionar plataforma'}
      subtitle="O sistema só lê o calendário — nada é enviado para a plataforma."
      footer={
        <>
          {canGoBack ? (
            <button type="button" className="ui-btn ui-btn--ghost" onClick={onBack}>
              <ArrowLeft strokeWidth={1.8} />
              Voltar
            </button>
          ) : (
            <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose}>
              Cancelar
            </button>
          )}
          <button type="submit" form="feed-form" className="ui-btn ui-btn--primary" disabled={saving}>
            {saving ? <span className="spinner" /> : <Link2 strokeWidth={1.8} />}
            {feed ? 'Salvar' : 'Adicionar'}
          </button>
        </>
      }
    >
      <form id="feed-form" className="guest-form feed-form" onSubmit={submit} noValidate>
        {alert && <p className="guest-form__alert">{alert}</p>}

        <div className="ui-field">
          <span className="ui-field__label">Plataforma</span>
          <Segmented<Platform> ariaLabel="Plataforma" value={form.platform} onChange={choosePlatform} options={PLATFORM_OPTIONS} />
        </div>

        <p className="feed-form__howto">
          <strong>Onde encontro o link?</strong> {HOW_TO[form.platform]}
        </p>

        <div className={`ui-field ${errors.url ? 'has-error' : ''}`}>
          <label htmlFor="feed-url">
            Link do calendário (iCal)<span className="req">*</span>
          </label>
          <input
            id="feed-url"
            className="ui-input guest-form__mono"
            type="url"
            inputMode="url"
            placeholder="https://www.airbnb.com.br/calendar/ical/….ics"
            value={form.url}
            onChange={(e) => set('url', e.target.value)}
            data-autofocus
            autoComplete="off"
            spellCheck={false}
          />
          {errors.url ? <p className="ui-field__error">{errors.url}</p> : <p className="ui-field__hint">Guarde este link com cuidado: quem o tiver consegue ver as datas ocupadas.</p>}
        </div>

        <div className="guest-form__grid">
          <div className={`ui-field ${errors.name ? 'has-error' : ''}`}>
            <label htmlFor="feed-name">
              Nome<span className="req">*</span>
            </label>
            <input
              id="feed-name"
              className="ui-input"
              value={form.name}
              maxLength={80}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ex.: Airbnb — Apto 101"
            />
            {errors.name && <p className="ui-field__error">{errors.name}</p>}
          </div>
          <div className={`ui-field ${errors.propertyName ? 'has-error' : ''}`}>
            <label htmlFor="feed-property">Imóvel (opcional)</label>
            <input
              id="feed-property"
              className="ui-input"
              value={form.propertyName}
              maxLength={120}
              list="feed-property-list"
              onChange={(e) => set('propertyName', e.target.value)}
              placeholder="Igual ao do cadastro de reservas"
            />
            <datalist id="feed-property-list">
              {propertySuggestions.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            {errors.propertyName && <p className="ui-field__error">{errors.propertyName}</p>}
          </div>
        </div>

        <div className="ui-field">
          <span className="ui-field__label">Cor no calendário</span>
          <div className="feed-form__colors" role="radiogroup" aria-label="Cor no calendário">
            {COLOR_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={form.color.toLowerCase() === c.toLowerCase()}
                aria-label={c}
                className="feed-form__color"
                style={{ background: c }}
                onClick={() => set('color', c)}
              />
            ))}
            <label className="feed-form__color feed-form__color--custom" title="Outra cor">
              <input type="color" value={form.color} onChange={(e) => set('color', e.target.value)} aria-label="Outra cor" />
            </label>
          </div>
        </div>

        <label className={`ui-switch ${form.active ? 'is-on' : ''}`}>
          <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
          <span className="ui-switch__track">
            <span className="ui-switch__thumb" />
          </span>
          <span className="ui-switch__text">
            Mostrar no calendário
            <small>Desligue para pausar este link sem apagá-lo.</small>
          </span>
        </label>
      </form>
    </Modal>
  )
}
