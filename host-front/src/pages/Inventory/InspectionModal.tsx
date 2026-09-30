import { CheckCheck, ClipboardCheck, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { ApiError, inventoryApi, type ReservationInventory } from '../../services/api'
import { formatDate, formatMoney } from '../../utils/money'
import { INVENTORY_STATUS_LABEL } from './status'
import { ItemsEditor } from './ItemsEditor'

interface InspectionModalProps {
  /** Reserva aberta (null = fechado). */
  reservationId: string | null
  onClose: () => void
  /** Chamado a cada alteração para a lista atualizar contadores e situação. */
  onChanged: () => void
  onNotify: (message: string) => void
}

/**
 * Vistoria da reserva: lista de itens copiada do imóvel (editável só para esta reserva),
 * com check em cada item. Concluir a vistoria exige todos os itens conferidos.
 */
export function InspectionModal({ reservationId, onClose, onChanged, onNotify }: InspectionModalProps) {
  const [data, setData] = useState<ReservationInventory | null>(null)
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)

  useEffect(() => {
    if (!reservationId) return
    let cancelled = false
    inventoryApi
      .reservation(reservationId)
      .then((d) => {
        if (cancelled) return
        setData(d)
        setError('')
        setLoadedId(reservationId)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Não foi possível abrir a vistoria')
        setLoadedId(reservationId)
      })
    return () => {
      cancelled = true
    }
  }, [reservationId])

  if (!reservationId) return null

  const loading = loadedId !== reservationId
  const current = !loading && data?.reservation.id === reservationId ? data : null

  /** Aplica a resposta do servidor (que sempre devolve a vistoria completa) e avisa a lista. */
  function apply(next: ReservationInventory) {
    setData(next)
    onChanged()
  }

  async function act(fn: () => Promise<ReservationInventory>, done?: string) {
    setWorking(true)
    setError('')
    try {
      apply(await fn())
      if (done) onNotify(done)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível concluir a ação')
    } finally {
      setWorking(false)
    }
  }

  const id = reservationId
  const r = current?.reservation
  const s = current?.summary
  const inspected = r?.inventoryStatus === 'VISTORIADO'
  const allChecked = !!s && s.itemsCount > 0 && s.checkedCount === s.itemsCount
  const pendingCount = s ? s.itemsCount - s.checkedCount : 0
  const progress = s && s.itemsCount ? Math.round((s.checkedCount / s.itemsCount) * 100) : 0

  const footer = current && (
    <>
      {inspected ? (
        <button
          type="button"
          className="ui-btn ui-btn--ghost"
          disabled={working}
          onClick={() => act(() => inventoryApi.reopen(id), 'Vistoria reaberta')}
        >
          <RotateCcw aria-hidden />
          Reabrir vistoria
        </button>
      ) : (
        <>
          <button
            type="button"
            className="ui-btn ui-btn--ghost"
            disabled={working || !s?.itemsCount}
            onClick={() => act(() => inventoryApi.checkAll(id, !allChecked))}
          >
            <CheckCheck aria-hidden />
            {allChecked ? 'Desmarcar todos' : 'Marcar todos'}
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            disabled={working || pendingCount > 0}
            title={pendingCount > 0 ? `Faltam ${pendingCount} ${pendingCount === 1 ? 'item' : 'itens'} para conferir` : undefined}
            onClick={() => act(() => inventoryApi.inspect(id), 'Reserva marcada como vistoriada')}
          >
            <ClipboardCheck aria-hidden />
            Concluir vistoria
          </button>
        </>
      )}
    </>
  )

  return (
    <Modal
      open
      onClose={onClose}
      title={r ? `Vistoria · reserva ${r.reservationNumber}` : 'Vistoria'}
      subtitle={r ? `${r.propertyName} · ${r.guestName ?? 'Sem hóspede'}` : undefined}
      footer={footer}
    >
      {loading ? (
        <p className="inv-modal__state">Carregando…</p>
      ) : !current ? (
        <p className="inv-modal__state">{error || 'Não foi possível abrir a vistoria'}</p>
      ) : (
        <div className="inv-modal">
          <div className="inv-summary">
            <div className="inv-summary__main">
              <span className={`inv-status inv-status--${r!.inventoryStatus.toLowerCase()}`}>
                {INVENTORY_STATUS_LABEL[r!.inventoryStatus]}
              </span>
              <span className="inv-summary__meta">
                Check-out em {formatDate(r!.finalCheckOut)}
                {inspected && r!.inspectedAt && (
                  <>
                    {' '}
                    · vistoriada em {new Date(r!.inspectedAt).toLocaleDateString('pt-BR')}
                    {r!.inspectedByName ? ` por ${r!.inspectedByName}` : ''}
                  </>
                )}
              </span>
            </div>
            <div className="inv-summary__numbers">
              <span>
                <strong>
                  {s!.checkedCount}/{s!.itemsCount}
                </strong>{' '}
                conferidos
              </span>
              <span>
                Valor do inventário <strong>{formatMoney(s!.totalCents)}</strong>
              </span>
            </div>
            <div
              className="inv-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-label="Itens conferidos"
            >
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>

          {error && <p className="ui-field__error">{error}</p>}

          <p className="ui-field__hint">
            Esta lista é uma cópia do inventário do imóvel. Alterações aqui valem só para esta reserva.
          </p>

          <ItemsEditor
            items={current.items}
            emptyText="Nenhum item nesta reserva. O imóvel ainda não tem inventário cadastrado — adicione itens acima ou cadastre em “Itens do imóvel”."
            onAdd={async (draft) => apply(await inventoryApi.addReservationItem(id, draft))}
            onUpdate={async (itemId, draft) => apply(await inventoryApi.updateReservationItem(id, itemId, draft))}
            onRemove={async (itemId) => apply(await inventoryApi.removeReservationItem(id, itemId))}
            onToggle={async (itemId, checked) => apply(await inventoryApi.checkItem(id, itemId, checked))}
            disabled={working}
          />
        </div>
      )}
    </Modal>
  )
}
