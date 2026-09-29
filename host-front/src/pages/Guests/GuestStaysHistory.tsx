import { BedDouble, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { StarDisplay } from '../../components/ui/StarRating'
import { guestsApi, type GuestStays } from '../../services/api'
import { formatDate, formatMoney } from '../../utils/money'
import { PLATFORM_LABEL } from '../Reservations/options'
// Guests.css antes de Reservations.css: mantém a ordem da cascata (Reservations.css sobrescreve alguns estilos de Guests.css)
import './Guests.css'
import '../Reservations/Reservations.css' // badges de status (.status--*)
import { STATUS_LABEL } from '../Reservations/status'

/** Quantas hospedagens aparecem antes do "Ver todas". */
const PREVIEW = 5

interface GuestStaysHistoryProps {
  guestId: string
}

/**
 * Histórico de hospedagens do hóspede: resumo + lista das reservas em que ele é o
 * responsável ou aparece como acompanhante. Clicar numa hospedagem abre a reserva.
 */
export function GuestStaysHistory({ guestId }: GuestStaysHistoryProps) {
  const navigate = useNavigate()
  const [reloadKey, setReloadKey] = useState(0)
  const queryKey = `${guestId}|${reloadKey}`
  // "loading" = a última resposta ainda não é desta consulta
  const [loaded, setLoaded] = useState<{ key: string; result: GuestStays | null; error: string }>({
    key: '',
    result: null,
    error: '',
  })
  const [showAll, setShowAll] = useState<string | null>(null) // id do hóspede com a lista expandida
  const loading = loaded.key !== queryKey

  useEffect(() => {
    const controller = new AbortController()
    guestsApi
      .stays(guestId, controller.signal)
      .then((result) => setLoaded({ key: queryKey, result, error: '' }))
      .catch((err) => {
        if (!controller.signal.aborted)
          setLoaded({ key: queryKey, result: null, error: err.message ?? 'Erro ao carregar o histórico' })
      })
    return () => controller.abort()
  }, [guestId, queryKey])

  const result = loading ? null : loaded.result
  const error = loading ? '' : loaded.error
  const expanded = showAll === guestId
  const stays = result ? (expanded ? result.data : result.data.slice(0, PREVIEW)) : []
  const s = result?.summary

  return (
    <div className="stays">

      {loading ? (
        <div className="stays__state">
          <span className="spinner" aria-label="Carregando histórico" />
        </div>
      ) : error ? (
        <div className="stays__state">
          <p className="ui-field__error">{error}</p>
          <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setReloadKey((k) => k + 1)}>
            Tentar novamente
          </button>
        </div>
      ) : !result || result.data.length === 0 ? (
        <div className="stays__state stays__state--empty">
          <BedDouble strokeWidth={1.5} aria-hidden />
          <p>Nenhuma hospedagem vinculada a este hóspede ainda.</p>
        </div>
      ) : (
        <>
          {s && (
            <dl className="stays__summary">
              <div>
                <dt>Hospedagens</dt>
                <dd>{s.totalStays}</dd>
                {s.asCompanionCount > 0 && (
                  <small>
                    {s.asMainCount} resp. · {s.asCompanionCount} acomp.
                  </small>
                )}
              </div>
              <div>
                <dt>Noites</dt>
                <dd>{s.totalNights}</dd>
              </div>
              <div>
                <dt>Valor bruto</dt>
                <dd>{formatMoney(s.grossCents)}</dd>
                <small>como responsável</small>
              </div>
              <div>
                <dt>{s.nextCheckIn ? 'Próxima' : 'Última'}</dt>
                <dd>
                  {s.nextCheckIn
                    ? formatDate(s.nextCheckIn)
                    : s.lastCheckIn
                      ? formatDate(s.lastCheckIn)
                      : '—'}
                </dd>
                {s.nextCheckIn && s.lastCheckIn && <small>última {formatDate(s.lastCheckIn)}</small>}
              </div>
              <div>
                <dt>Avaliação interna</dt>
                <dd>{s.averageRating !== null ? <StarDisplay value={s.averageRating} size="md" /> : '—'}</dd>
                <small>{s.averageRating !== null ? 'média como responsável' : 'sem avaliações'}</small>
              </div>
            </dl>
          )}

          <ul className="stays__list">
            {stays.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="stays__item"
                  onClick={() => navigate(`/cadastro/reservas?reserva=${r.id}`)}
                  title="Abrir reserva"
                >
                  <span className="stays__main">
                    <span className="stays__title">
                      <strong>{r.propertyName}</strong>
                      {r.guestRole === 'ACOMPANHANTE' && <span className="ui-badge">Acompanhante</span>}
                    </span>
                    <span className="stays__period">
                      {formatDate(r.checkIn)} → {formatDate(r.finalCheckOut)} · {r.totalNights}{' '}
                      {r.totalNights === 1 ? 'noite' : 'noites'}
                    </span>
                    <span className="stays__meta">
                      Nº {r.reservationNumber}
                      {r.platform && ` · ${PLATFORM_LABEL[r.platform]}`}
                      {r.guestRole === 'ACOMPANHANTE' && ` · Resp.: ${r.mainGuest.fullName}`}
                    </span>
                  </span>
                  <span className="stays__side">
                    <span className={`status status--${r.status.toLowerCase()}`}>{STATUS_LABEL[r.status]}</span>
                    {r.guestRole === 'RESPONSAVEL' && <span className="stays__amount">{formatMoney(r.grossCents)}</span>}
                    {r.reviewAverage !== null && <StarDisplay value={r.reviewAverage} />}
                  </span>
                  <ChevronRight className="stays__chevron" strokeWidth={1.8} aria-hidden />
                </button>
              </li>
            ))}
          </ul>

          {result.data.length > PREVIEW && (
            <button
              type="button"
              className="ui-btn ui-btn--ghost stays__more"
              onClick={() => setShowAll(expanded ? null : guestId)}
            >
              {expanded ? 'Mostrar menos' : `Ver todas (${result.data.length})`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
