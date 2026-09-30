import { AlertTriangle, ExternalLink, Link2, Link2Off, Plus, Search, UserRound } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '../../components/ui/Modal'
import { ApiError, calendarApi, type CalendarEvent, type CalendarLinkCandidate } from '../../services/api'
import { formatDate, todayIso } from '../../utils/money'
import { PLATFORM_LABEL } from '../Reservations/options'
import { STATUS_LABEL } from '../Reservations/status'
import { eventTitle, formatDayLong, newReservationUrl, stayPhase } from './calendar'

interface Props {
  event: CalendarEvent | null
  onClose: () => void
  /** Vínculo criado/desfeito — a página recarrega o calendário. */
  onLinkChanged: (message: string) => void
}

const EXTRA_LABEL: Record<string, string> = {
  'X-GUEST-NAME': 'Hóspede',
  'X-GUESTS': 'Hóspedes',
  CATEGORIES: 'Categoria',
  CLASS: 'Visibilidade',
  TRANSP: 'Disponibilidade',
  ORGANIZER: 'Organizador',
  ATTENDEE: 'Participante',
}

/** Detalhes de uma marcação: reserva/hóspede do cadastro + tudo o que o link da plataforma informa. */
export function EventModal({ event: e, onClose, onLinkChanged }: Props) {
  const navigate = useNavigate()
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // volta ao estado inicial quando troca de marcação
  const [shownId, setShownId] = useState(e?.id)
  if (e?.id !== shownId) {
    setShownId(e?.id)
    setPicking(false)
    setError('')
  }

  if (!e) return null

  const r = e.reservation
  const extras = Object.entries(e.extra).filter(([k]) => !k.startsWith('X-WR') && k !== 'X-MICROSOFT-CDO-BUSYSTATUS')

  async function link(candidate: CalendarLinkCandidate) {
    if (!e) return
    setBusy(true)
    setError('')
    try {
      await calendarApi.link(e.feedId, e.eventKey, candidate.id)
      setPicking(false)
      onLinkChanged(`Vinculado a ${candidate.guest?.fullName ?? `reserva ${candidate.reservationNumber}`}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível vincular')
    } finally {
      setBusy(false)
    }
  }

  async function unlink() {
    if (!e) return
    setBusy(true)
    setError('')
    try {
      await calendarApi.unlink(e.feedId, e.eventKey)
      onLinkChanged('Vínculo removido')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível desvincular')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={eventTitle(e)}
      subtitle={e.feedName === PLATFORM_LABEL[e.platform] ? e.feedName : `${e.feedName} · ${PLATFORM_LABEL[e.platform]}`}
      footer={
        <button type="button" className="ui-btn ui-btn--primary" onClick={onClose} data-autofocus>
          Fechar
        </button>
      }
    >
      <div className="cal-event">
        <div className="cal-event__badges">
          <span className={`ui-badge ${e.kind === 'RESERVA' ? 'ui-badge--dark' : ''}`}>
            {e.kind === 'RESERVA' ? 'Reserva' : 'Bloqueio'}
          </span>
          <span className="ui-badge">{stayPhase(e, todayIso())}</span>
          <span className="ui-badge cal-event__platform" style={{ '--bar-color': e.color } as CSSProperties}>
            {PLATFORM_LABEL[e.platform]}
          </span>
        </div>

        <div className="cal-event__dates">
          <div>
            <span>Check-in</span>
            <strong>{formatDayLong(e.start)}</strong>
            <small>{formatDate(e.start)}</small>
          </div>
          <div className="cal-event__nights">
            {e.nights} {e.nights === 1 ? 'noite' : 'noites'}
          </div>
          <div>
            <span>Check-out</span>
            <strong>{formatDayLong(e.end)}</strong>
            <small>{formatDate(e.end)}</small>
          </div>
        </div>

        {/* ---------- Hóspede / reserva do cadastro ---------- */}
        <section className="cal-event__section">
          <h3>Hóspede e reserva no sistema</h3>
          {error && <p className="guest-form__alert">{error}</p>}

          {r && !picking ? (
            <div className="cal-link">
              <div className="cal-link__head">
                <span className="guest-avatar" aria-hidden>
                  <UserRound strokeWidth={1.7} />
                </span>
                <div>
                  <strong>{r.guest?.fullName ?? 'Reserva sem hóspede vinculado'}</strong>
                  <small>
                    {e.linkSource === 'MANUAL'
                      ? 'Vinculado por você'
                      : e.reservationCode && e.reservationCode.toLowerCase() === r.reservationNumber.toLowerCase()
                        ? 'Vinculado automaticamente (mesmo código da reserva)'
                        : 'Vinculado automaticamente (mesma plataforma e datas)'}
                  </small>
                </div>
              </div>
              {e.datesMismatch && (
                <p className="cal-link__warn">
                  <AlertTriangle strokeWidth={2} aria-hidden />
                  As datas da reserva no cadastro ({formatDate(r.checkIn)} → {formatDate(r.checkOut)}) são diferentes das
                  da plataforma. Confira se a estadia foi alterada.
                </p>
              )}
              <dl className="guest-view__list">
                <Item label="Nº da reserva" value={r.reservationNumber} mono />
                <Item label="Status" value={STATUS_LABEL[r.status]} />
                <Item label="Hóspedes" value={String(r.guestsCount)} />
                {r.guest?.phone && <Item label="Telefone" value={r.guest.phone} />}
                <Item label="Imóvel" value={r.propertyName} full />
              </dl>
              <div className="cal-link__actions">
                <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => navigate(`/cadastro/reservas?reserva=${r.id}`)}>
                  <ExternalLink strokeWidth={1.8} />
                  Abrir reserva
                </button>
                <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setPicking(true)} disabled={busy}>
                  <Link2 strokeWidth={1.8} />
                  Trocar
                </button>
                <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={unlink} disabled={busy}>
                  <Link2Off strokeWidth={1.8} />
                  Desvincular
                </button>
              </div>
            </div>
          ) : (
            <LinkPicker
              event={e}
              busy={busy}
              onPick={link}
              onCancel={r ? () => setPicking(false) : undefined}
              onCreate={() => navigate(newReservationUrl(e))}
            />
          )}
        </section>

        {/* ---------- O que veio no link ---------- */}
        <section className="cal-event__section">
          <h3>Informações do link da plataforma</h3>
          <dl className="guest-view__list">
            <Item label="Calendário" value={e.feedName} />
            <Item label="Plataforma" value={PLATFORM_LABEL[e.platform]} />
            {!r && e.guestName && <Item label="Nome no calendário" value={e.guestName} />}
            {e.propertyName && <Item label="Imóvel" value={e.propertyName} />}
            {e.summary && <Item label="Título no calendário" value={e.summary} />}
            {e.reservationCode && <Item label="Código da reserva" value={e.reservationCode} mono />}
            {e.details
              .filter((d) => d.label !== 'Código da reserva')
              .map((d, i) => (
                <Item key={`${d.label}-${i}`} label={d.label} value={d.value} href={d.href} full={!!d.href} />
              ))}
            {e.location && <Item label="Local" value={e.location} full />}
            {e.url && <Item label="Link" value={e.url} href={e.url} full />}
            {e.status && <Item label="Status" value={e.status} />}
            {extras.map(([k, v]) => (
              <Item key={k} label={EXTRA_LABEL[k] ?? k} value={v} />
            ))}
            {e.notes && <Item label="Descrição" value={e.notes} full pre />}
          </dl>
          {e.alsoIn.length > 0 && (
            <p className="cal-event__also">
              Também aparece em: {e.alsoIn.map((a) => `${a.feedName} (${a.summary ?? PLATFORM_LABEL[a.platform]})`).join(', ')}
              <small>— as plataformas importam o calendário umas das outras, então o período é mostrado uma vez só.</small>
            </p>
          )}
        </section>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------

function LinkPicker({
  event: e,
  busy,
  onPick,
  onCancel,
  onCreate,
}: {
  event: CalendarEvent
  busy: boolean
  onPick: (c: CalendarLinkCandidate) => void
  onCancel?: () => void
  onCreate: () => void
}) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [list, setList] = useState<CalendarLinkCandidate[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 300)
    return () => window.clearTimeout(t)
  }, [search])

  useEffect(() => {
    const controller = new AbortController()
    calendarApi
      .linkCandidates(e.start, e.end, debounced, controller.signal)
      .then(({ data }) => {
        setList(data)
        setError('')
      })
      .catch((err) => !controller.signal.aborted && setError(err.message ?? 'Erro ao buscar reservas'))
    return () => controller.abort()
  }, [e.start, e.end, debounced])

  const current = e.reservation?.id

  return (
    <div className="cal-link cal-link--pick">
      <p className="cal-link__intro">
        As plataformas não enviam os dados do hóspede no link do calendário. Vincule esta marcação a uma reserva do
        cadastro para ver aqui o hóspede e os dados da reserva.
      </p>

      <div className="ui-input-icon">
        <Search aria-hidden />
        <input
          className="ui-input"
          type="search"
          placeholder="Buscar por hóspede, nº da reserva ou imóvel"
          value={search}
          onChange={(ev) => setSearch(ev.target.value)}
          aria-label="Buscar reserva para vincular"
        />
      </div>

      {error ? (
        <p className="guest-form__alert">{error}</p>
      ) : !list ? (
        <div className="cal-link__loading">
          <span className="spinner spinner--lg" />
        </div>
      ) : list.length === 0 ? (
        <p className="cal-link__empty">
          {debounced ? 'Nenhuma reserva encontrada.' : 'Nenhuma reserva do cadastro perto dessas datas.'}
        </p>
      ) : (
        <ul className="cal-link__list">
          {list.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="cal-link__option"
                onClick={() => onPick(c)}
                disabled={busy || c.id === current}
              >
                <span className="cal-link__option-main">
                  <strong>{c.guest?.fullName ?? 'Sem hóspede vinculado'}</strong>
                  <small>
                    <span className="guest-form__mono">{c.reservationNumber}</span>
                    {c.platform ? ` · ${PLATFORM_LABEL[c.platform]}` : ''} · {c.propertyName}
                  </small>
                </span>
                <span className="cal-link__option-side">
                  {formatDate(c.checkIn)} → {formatDate(c.checkOut)}
                  <small>
                    {c.id === current
                      ? 'Vinculada a esta marcação'
                      : c.exact
                        ? 'Mesmas datas'
                        : c.overlaps
                          ? 'Cruza o período'
                          : 'Outras datas'}
                    {c.linkedTo && c.id !== current ? ` · já vinculada (${c.linkedTo})` : ''}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="cal-link__actions">
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={onCreate}>
          <Plus strokeWidth={2} />
          Cadastrar reserva com estas datas
        </button>
        {onCancel && (
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </div>
  )
}

function Item({
  label,
  value,
  href,
  full,
  mono,
  pre,
}: {
  label: string
  value: string
  href?: string
  full?: boolean
  mono?: boolean
  pre?: boolean
}) {
  return (
    <div className={`guest-view__item ${full ? 'guest-view__item--full' : ''}`}>
      <dt>{label}</dt>
      <dd className={[mono && 'guest-form__mono', pre && 'cal-event__pre'].filter(Boolean).join(' ') || undefined}>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer noopener" className="cal-event__link">
            {value}
            <ExternalLink strokeWidth={1.8} aria-hidden />
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  )
}
