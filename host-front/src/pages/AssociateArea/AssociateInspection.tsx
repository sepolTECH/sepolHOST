import { Check, CheckCheck, ChevronLeft, ClipboardCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError, associateAreaApi, type AssociateInventory } from '../../services/api'
import { formatDateShort } from '../../utils/money'

/** Vistoria simples: uma lista de itens grandes, toque para marcar. Concluir exige tudo conferido. */
export function AssociateInspection() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<AssociateInventory | null>(null)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)

  useEffect(() => {
    let cancelled = false
    associateAreaApi
      .inventory(id)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Não foi possível abrir o inventário')
      })
    return () => {
      cancelled = true
    }
  }, [id])

  async function act(fn: () => Promise<AssociateInventory>) {
    setWorking(true)
    setError('')
    try {
      setData(await fn())
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar. Tente de novo.')
    } finally {
      setWorking(false)
    }
  }

  async function conclude() {
    setWorking(true)
    setError('')
    try {
      await associateAreaApi.inspect(id)
      navigate('/associado', { replace: true, state: { notice: 'Inventário conferido!' } })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível concluir. Tente de novo.')
      setWorking(false)
    }
  }

  const back = (
    <Link to="/associado" className="ap-back">
      <ChevronLeft aria-hidden />
      Voltar
    </Link>
  )

  if (!data) {
    return (
      <>
        {back}
        {error ? <p className="ap-error">{error}</p> : <p className="ap-state">Carregando…</p>}
      </>
    )
  }

  const { reservation: r, items, summary: s } = data
  const inspected = r.inventoryStatus === 'VISTORIADO'
  const pending = s.itemsCount - s.checkedCount
  const allChecked = s.itemsCount > 0 && pending === 0
  const progress = s.itemsCount ? Math.round((s.checkedCount / s.itemsCount) * 100) : 0

  return (
    <>
      {back}
      <h1 className="ap-title">{r.propertyName}</h1>
      <p className="ap-sub">
        Hóspede: {r.guestName} · saída {formatDateShort(r.finalCheckOut)}
      </p>

      {inspected && (
        <div className="ap-done-banner">
          <ClipboardCheck aria-hidden />
          Inventário já conferido
        </div>
      )}

      <p className="ap-progress-label">
        {s.checkedCount} de {s.itemsCount} conferidos
      </p>
      <div
        className="ap-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-label="Itens conferidos"
      >
        <span style={{ width: `${progress}%` }} />
      </div>

      {error && <p className="ap-error">{error}</p>}

      {items.length === 0 ? (
        <p className="ap-state">
          Este imóvel ainda não tem itens cadastrados. Avise o responsável para cadastrar o inventário.
        </p>
      ) : (
        <ul className="ap-items">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`ap-item ${item.checked ? 'is-checked' : ''}`}
                role="checkbox"
                aria-checked={item.checked}
                disabled={working}
                onClick={() => act(() => associateAreaApi.checkItem(id, item.id, !item.checked))}
              >
                <span className="ap-item__box" aria-hidden>
                  <Check />
                </span>
                <span className="ap-item__text">
                  <span className="ap-item__name">{item.name}</span>
                  {item.quantity > 1 && <span className="ap-item__qty">Quantidade: {item.quantity}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="ap-footer">
        <div className="ap-footer__inner">
          {inspected ? (
            <Link to={`/associado/reserva/${id}/avaliacao`} className="ap-btn ap-btn--primary">
              Avaliar hospedagem
            </Link>
          ) : (
            <>
              {!allChecked && s.itemsCount > 0 && (
                <p className="ap-footer__hint">
                  Falta{pending === 1 ? '' : 'm'} {pending} {pending === 1 ? 'item' : 'itens'} para conferir
                </p>
              )}
              <button
                type="button"
                className="ap-btn ap-btn--primary"
                disabled={working || pending > 0}
                onClick={conclude}
              >
                <ClipboardCheck aria-hidden />
                Concluir conferência
              </button>
              <button
                type="button"
                className="ap-btn ap-btn--small"
                disabled={working || s.itemsCount === 0}
                onClick={() => act(() => associateAreaApi.checkAll(id, !allChecked))}
              >
                <CheckCheck aria-hidden />
                {allChecked ? 'Desmarcar todos' : 'Marcar todos como conferidos'}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
