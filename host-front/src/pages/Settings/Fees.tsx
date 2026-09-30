import { Percent } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError, settingsApi, type Platform, type PlatformFee } from '../../services/api'
import { formatPercent, parsePercent } from '../../utils/money'
import '../Guests/Guests.css'
import '../Reservations/Reservations.css'
import { PLATFORM_LABEL } from '../Reservations/options'
import './Settings.css'

const HINT: Record<Platform, string> = {
  AIRBNB: 'Taxa de serviço cobrada pelo Airbnb sobre o valor da reserva.',
  BOOKING: 'Comissão cobrada pelo Booking.com sobre o valor da reserva.',
  VRBO: 'Comissão cobrada pelo VRBO sobre o valor da reserva.',
  DIRETO: 'Contrato direto normalmente não tem comissão — deixe vazio.',
  OUTRA: 'Use para outras plataformas ou intermediários.',
}

/** Texto digitado por plataforma ('' = sem taxa pré-cadastrada). */
type Drafts = Record<Platform, string>

const toDrafts = (fees: PlatformFee[]): Drafts => {
  const d = { AIRBNB: '', BOOKING: '', VRBO: '', DIRETO: '', OUTRA: '' } as Drafts
  for (const f of fees) d[f.platform] = f.commissionRate === null ? '' : formatPercent(f.commissionRate)
  return d
}

export function Fees() {
  const [saved, setSaved] = useState<Drafts | null>(null)
  const [drafts, setDrafts] = useState<Drafts | null>(null)
  const [order, setOrder] = useState<Platform[]>([])
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [toast, setToast] = useState('')
  const toastTimer = useRef<number>(undefined)

  useEffect(() => {
    const controller = new AbortController()
    settingsApi
      .fees(controller.signal)
      .then(({ data }) => {
        setOrder(data.map((f) => f.platform))
        setSaved(toDrafts(data))
        setDrafts(toDrafts(data))
        setLoadError('')
      })
      .catch((err) => {
        if (!controller.signal.aborted) setLoadError(err.message ?? 'Erro ao carregar as taxas')
      })
    return () => controller.abort()
  }, [reloadKey])

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  const dirty = !!saved && !!drafts && order.some((p) => saved[p] !== drafts[p])

  function change(platform: Platform, text: string) {
    setDrafts((d) => (d ? { ...d, [platform]: parsePercent(text).text } : d))
    setFormError('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!drafts || saving) return
    setSaving(true)
    setFormError('')
    try {
      const fees: PlatformFee[] = order.map((platform) => ({
        platform,
        commissionRate: drafts[platform].trim() === '' ? null : parsePercent(drafts[platform]).value,
      }))
      const { data } = await settingsApi.saveFees(fees)
      setSaved(toDrafts(data))
      setDrafts(toDrafts(data))
      setToast('Taxas salvas')
      window.clearTimeout(toastTimer.current)
      toastTimer.current = window.setTimeout(() => setToast(''), 3200)
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar as taxas')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="guests">
      <header className="page-header">
        <div>
          <p className="page-header__crumb">Ajustes</p>
          <h1 className="page-header__title">Taxas</h1>
          <p className="page-header__subtitle">
            Comissão cobrada por cada plataforma. Ela já vem preenchida ao cadastrar uma reserva, e você ainda pode
            alterar o percentual ou trocar para um valor em R$ na própria reserva.
          </p>
        </div>
      </header>

      <section className="panel">
        {loadError ? (
          <div className="panel__state">
            <p>{loadError}</p>
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setReloadKey((k) => k + 1)}>
              Tentar novamente
            </button>
          </div>
        ) : !drafts ? (
          <div className="panel__state">
            <p>Carregando…</p>
          </div>
        ) : (
          <form className="fees" onSubmit={handleSubmit} noValidate>
            <ul className="fees__list">
              {order.map((platform) => (
                <li key={platform} className="fees__row">
                  <div className="fees__info">
                    <label htmlFor={`fee-${platform}`} className="fees__name">
                      {PLATFORM_LABEL[platform]}
                    </label>
                    <small>{HINT[platform]}</small>
                  </div>
                  <div className="suffix-input fees__input">
                    <input
                      id={`fee-${platform}`}
                      className="ui-input guest-form__mono"
                      inputMode="decimal"
                      placeholder="Sem taxa"
                      value={drafts[platform]}
                      onChange={(e) => change(platform, e.target.value)}
                      onFocus={(e) => e.target.select()}
                      disabled={saving}
                    />
                    <span aria-hidden>%</span>
                  </div>
                </li>
              ))}
            </ul>

            <div className="fees__footer">
              <p className="fees__note">
                <Percent size={14} strokeWidth={1.8} aria-hidden />
                Mudar a taxa aqui vale só para as próximas reservas; as já cadastradas não são alteradas.
              </p>
              {formError && <p className="ui-field__error">{formError}</p>}
              <button type="submit" className="ui-btn ui-btn--primary" disabled={!dirty || saving}>
                {saving ? 'Salvando…' : 'Salvar taxas'}
              </button>
            </div>
          </form>
        )}
      </section>

      <div className={`toast ${toast ? 'is-visible' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  )
}
