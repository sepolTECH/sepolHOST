import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '../../components/ui/Modal'
import { ApiError, associatesApi, type Associate, type Reservation } from '../../services/api'
import '../Associates/Associates.css'

interface ReservationAccessModalProps {
  /** Reserva aberta (null = fechado). */
  reservation: Reservation | null
  onClose: () => void
  onNotify: (message: string) => void
}

/** Escolhe quais associados enxergam esta reserva (vistoria e avaliação). Remonte com key ao trocar de reserva. */
export function ReservationAccessModal({ reservation, onClose, onNotify }: ReservationAccessModalProps) {
  const id = reservation?.id ?? null
  const [associates, setAssociates] = useState<Associate[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    Promise.all([associatesApi.list(), associatesApi.reservationAssociates(id)])
      .then(([list, access]) => {
        if (cancelled) return
        setAssociates(list.data)
        setSelected(new Set(access.associateIds))
        setError('')
        setLoadedFor(id)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar')
        setLoadedFor(id)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (!reservation || !id) return null
  const loading = loadedFor !== id

  function toggle(associateId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(associateId)) next.delete(associateId)
      else next.add(associateId)
      return next
    })
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      await associatesApi.setReservationAssociates(id!, [...selected])
      onNotify(selected.size ? 'Reserva liberada para os associados' : 'Liberação removida')
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Liberar para associados"
      subtitle={`Reserva ${reservation.reservationNumber} · ${reservation.propertyName}`}
      footer={
        <>
          <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="ui-btn ui-btn--primary" disabled={saving || loading} onClick={save}>
            <Check aria-hidden />
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      {loading ? (
        <p className="assoc__state">Carregando…</p>
      ) : associates.length === 0 ? (
        <p className="assoc__state">
          Você ainda não cadastrou associados. <Link to="/associados">Cadastrar agora</Link>
        </p>
      ) : (
        <div className="assoc__release">
          <p className="ui-field__hint">
            Quem estiver marcado verá esta reserva na vistoria (inventário) e na avaliação.
          </p>
          <ul className="assoc__res-list">
            {associates.map((a) => {
              const on = selected.has(a.id)
              return (
                <li key={a.id}>
                  <label className={`assoc__res ${on ? 'is-on' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(a.id)} />
                    <span className="assoc__res-main">
                      <strong>{a.name}</strong>
                      <span>{a.isActive ? a.email : `${a.email} · desativado`}</span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {error && <p className="ui-field__error">{error}</p>}
    </Modal>
  )
}
