import { ChevronRight, ShieldBan, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BlockedBadge } from '../../components/ui/BlockedBadge'
import { guestsApi, type Dependent, type Guest } from '../../services/api'
import { initials } from '../../utils/documents'
import { formatDate } from '../../utils/money'
import './Guests.css'

interface GuestDependentsProps {
  guest: Guest
  /** Abre o cadastro completo, quando o dependente também é hóspede cadastrado. */
  onOpenGuest?: (guest: Guest) => void
}

/**
 * Dependentes do hóspede: acompanhantes das reservas em que ele foi o responsável.
 * São gravados automaticamente ao salvar a reserva (só nome e documento).
 */
export function GuestDependents({ guest, onOpenGuest }: GuestDependentsProps) {
  const [reloadKey, setReloadKey] = useState(0)
  const queryKey = `${guest.id}|${reloadKey}`
  const [loaded, setLoaded] = useState<{ key: string; data: Dependent[] | null; error: string }>({
    key: '',
    data: null,
    error: '',
  })
  const [opening, setOpening] = useState<string | null>(null)
  const loading = loaded.key !== queryKey

  useEffect(() => {
    const controller = new AbortController()
    guestsApi
      .dependents(guest.id, controller.signal)
      .then(({ data }) => setLoaded({ key: queryKey, data, error: '' }))
      .catch((err) => {
        if (!controller.signal.aborted)
          setLoaded({ key: queryKey, data: null, error: err.message ?? 'Erro ao carregar os dependentes' })
      })
    return () => controller.abort()
  }, [guest.id, queryKey])

  async function openGuest(id: string) {
    if (!onOpenGuest) return
    setOpening(id)
    try {
      const { guest: found } = await guestsApi.get(id)
      onOpenGuest(found)
    } catch {
      // se falhar, fica onde está
    } finally {
      setOpening(null)
    }
  }

  const data = loading ? null : loaded.data
  const error = loading ? '' : loaded.error

  return (
    <div className="stays">
      {guest.blocked && data && data.length > 0 && (
        <p className="dependents__blocked-note">
          <ShieldBan strokeWidth={1.8} aria-hidden />
          <span>
            Como {guest.fullName} está bloqueado, estes dependentes recebem um alerta ao serem incluídos em novas
            reservas ou cadastrados como hóspedes.
          </span>
        </p>
      )}

      {loading ? (
        <div className="stays__state">
          <span className="spinner" aria-label="Carregando dependentes" />
        </div>
      ) : error ? (
        <div className="stays__state">
          <p className="ui-field__error">{error}</p>
          <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setReloadKey((k) => k + 1)}>
            Tentar novamente
          </button>
        </div>
      ) : !data || data.length === 0 ? (
        <div className="stays__state stays__state--empty">
          <Users strokeWidth={1.5} aria-hidden />
          <p>
            Nenhum dependente ainda.
            <br />
            <small>Os acompanhantes das reservas em que ele for o responsável aparecem aqui automaticamente.</small>
          </p>
        </div>
      ) : (
        <ul className="stays__list">
          {data.map((d) => {
            const registered = d.registeredGuest
            const clickable = !!registered && !!onOpenGuest
            const content = (
              <>
                <span className="guest-avatar" aria-hidden>
                  {initials(d.fullName)}
                </span>
                <span className="stays__main">
                  <span className="stays__title">
                    <strong>{d.fullName}</strong>
                    {d.ageGroup === 'CHILD' && <span className="ui-badge">Criança</span>}
                    {registered?.blocked && <BlockedBadge />}
                  </span>
                  <span className="stays__meta dependents__doc">{d.document || 'Sem documento'}</span>
                  <span className="stays__meta">
                    {d.staysCount} {d.staysCount === 1 ? 'hospedagem' : 'hospedagens'} juntos
                    {d.lastCheckIn && ` · última em ${formatDate(d.lastCheckIn)}`}
                  </span>
                </span>
                <span className="stays__side">
                  {registered && <span className="ui-badge ui-badge--dark">Hóspede cadastrado</span>}
                </span>
                {clickable &&
                  (opening === registered.id ? (
                    <span className="spinner" aria-label="Abrindo" />
                  ) : (
                    <ChevronRight className="stays__chevron" strokeWidth={1.8} aria-hidden />
                  ))}
              </>
            )
            return (
              <li key={d.id}>
                {clickable ? (
                  <button
                    type="button"
                    className="stays__item dependents__item"
                    onClick={() => openGuest(registered.id)}
                    disabled={opening === registered.id}
                    title="Abrir cadastro de hóspede"
                  >
                    {content}
                  </button>
                ) : (
                  <div className="stays__item dependents__item is-static">{content}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
