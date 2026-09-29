import { CheckCheck, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import {
  ApiError,
  associatesApi,
  reservationsApi,
  type Associate,
  type Reservation,
} from '../../services/api'
import { formatDateShort } from '../../utils/money'

interface ReleaseModalProps {
  /** Associado aberto (null = fechado). */
  associate: Associate | null
  onClose: () => void
  onNotify: (message: string) => void
}

/**
 * Escolhe quais reservas o associado enxerga. Cada clique salva na hora
 * (marcar = libera, desmarcar = retira). "Liberar todas as listadas" faz em massa.
 */
export function ReleaseModal({ associate, onClose, onNotify }: ReleaseModalProps) {
  const id = associate?.id ?? null
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [released, setReleased] = useState<Set<string>>(new Set())
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 300)
    return () => window.clearTimeout(t)
  }, [search])

  // Reservas já liberadas (uma vez por associado aberto)
  useEffect(() => {
    if (!id) return
    let cancelled = false
    associatesApi
      .releasedReservations(id)
      .then(({ reservationIds }) => {
        if (!cancelled) setReleased(new Set(reservationIds))
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Não foi possível carregar')
      })
    return () => {
      cancelled = true
    }
  }, [id])

  // Lista de reservas (mais recentes primeiro), com busca
  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    reservationsApi
      .list({ search: debounced, page: 1, pageSize: 50 }, controller.signal)
      .then((res) => {
        setReservations(res.data)
        setError('')
        setLoadedFor(`${id}|${debounced}`)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as reservas')
        setLoadedFor(`${id}|${debounced}`)
      })
    return () => controller.abort()
  }, [id, debounced])

  const allListedReleased = useMemo(
    () => reservations.length > 0 && reservations.every((r) => released.has(r.id)),
    [reservations, released],
  )

  if (!associate || !id) return null
  const loading = loadedFor !== `${id}|${debounced}`

  async function apply(reservationIds: string[], granted: boolean) {
    if (!reservationIds.length) return
    setWorking(true)
    setError('')
    try {
      await associatesApi.bulkAccess({ associateId: id!, reservationIds, granted })
      setReleased((prev) => {
        const next = new Set(prev)
        reservationIds.forEach((rid) => (granted ? next.add(rid) : next.delete(rid)))
        return next
      })
      if (reservationIds.length > 1) {
        onNotify(granted ? `${reservationIds.length} reservas liberadas` : `${reservationIds.length} reservas retiradas`)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar')
    } finally {
      setWorking(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Reservas liberadas"
      subtitle={`${associate.name} só enxerga as reservas marcadas abaixo`}
      footer={
        <button type="button" className="ui-btn ui-btn--primary" onClick={onClose}>
          Concluir
        </button>
      }
    >
      <div className="assoc__release">
        <div className="assoc__release-tools">
          <label className="ui-input-icon">
            <Search aria-hidden />
            <input
              className="ui-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por reserva, imóvel ou hóspede"
              aria-label="Buscar reservas"
            />
          </label>
          <button
            type="button"
            className="ui-btn ui-btn--ghost"
            disabled={working || loading || reservations.length === 0}
            onClick={() => apply(reservations.map((r) => r.id), !allListedReleased)}
          >
            <CheckCheck aria-hidden />
            {allListedReleased ? 'Retirar todas as listadas' : 'Liberar todas as listadas'}
          </button>
        </div>

        {error && <p className="ui-field__error">{error}</p>}

        {loading ? (
          <p className="assoc__state">Carregando…</p>
        ) : reservations.length === 0 ? (
          <p className="assoc__state">Nenhuma reserva encontrada.</p>
        ) : (
          <ul className="assoc__res-list">
            {reservations.map((r) => {
              const on = released.has(r.id)
              return (
                <li key={r.id}>
                  <label className={`assoc__res ${on ? 'is-on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={working}
                      onChange={() => apply([r.id], !on)}
                    />
                    <span className="assoc__res-main">
                      <strong>{r.propertyName}</strong>
                      <span>
                        Reserva {r.reservationNumber} · {r.mainGuest.fullName}
                      </span>
                    </span>
                    <span className="assoc__res-dates">
                      {formatDateShort(r.checkIn)} → {formatDateShort(r.finalCheckOut)}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Modal>
  )
}
