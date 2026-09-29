import { ClipboardCheck, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ApiError, associateAreaApi, type AssociateReservationRow } from '../../services/api'
import { formatDateShort } from '../../utils/money'

type Tab = 'todo' | 'done'

const isDone = (r: AssociateReservationRow) => r.inventoryStatus === 'VISTORIADO' && r.reviewed

/** Início do associado: reservas liberadas pelo cliente, com as duas tarefas (vistoria e avaliação). */
export function AssociateHome() {
  const [rows, setRows] = useState<AssociateReservationRow[] | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('todo')
  const location = useLocation()
  const [notice, setNotice] = useState((location.state as { notice?: string } | null)?.notice ?? '')

  useEffect(() => {
    let cancelled = false
    associateAreaApi
      .reservations()
      .then(({ data }) => {
        if (!cancelled) setRows(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Não foi possível carregar')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(t)
  }, [notice])

  const todo = rows?.filter((r) => !isDone(r)) ?? []
  const done = rows?.filter(isDone) ?? []
  const shown = tab === 'todo' ? todo : done

  return (
    <>
      <h1 className="ap-title">Minhas reservas</h1>
      <p className="ap-sub">Toque para conferir o inventário ou avaliar a hospedagem.</p>

      <div className="ap-tabs" role="tablist" aria-label="Filtrar reservas">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'todo'}
          className={`ap-tab ${tab === 'todo' ? 'is-active' : ''}`}
          onClick={() => setTab('todo')}
        >
          A fazer{rows ? ` (${todo.length})` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'done'}
          className={`ap-tab ${tab === 'done' ? 'is-active' : ''}`}
          onClick={() => setTab('done')}
        >
          Concluídas{rows ? ` (${done.length})` : ''}
        </button>
      </div>

      {error && <p className="ap-error">{error}</p>}
      {!rows && !error && <p className="ap-state">Carregando…</p>}

      {rows && shown.length === 0 && (
        <p className="ap-state">
          {rows.length === 0
            ? 'Nenhuma reserva liberada para você ainda. Quando o responsável liberar, elas aparecem aqui.'
            : tab === 'todo'
              ? 'Tudo em dia! Nenhuma tarefa pendente.'
              : 'Nenhuma reserva concluída ainda.'}
        </p>
      )}

      <ul className="ap-cards">
        {shown.map((r) => {
          const inspected = r.inventoryStatus === 'VISTORIADO'
          return (
            <li key={r.id} className="ap-card">
              <div>
                <h2 className="ap-card__title">{r.propertyName}</h2>
                <div className="ap-card__meta">
                  <span>Hóspede: {r.guestName}</span>
                  <span>
                    {formatDateShort(r.checkIn)} até {formatDateShort(r.finalCheckOut)}
                  </span>
                </div>
              </div>

              <div className="ap-card__task">
                <span className={`ap-pill ${inspected ? 'ap-pill--done' : ''}`}>
                  {inspected ? 'Inventário conferido' : `Inventário: ${r.checkedCount} de ${r.itemsCount} conferidos`}
                </span>
                <Link to={`/associado/reserva/${r.id}/vistoria`} className="ap-btn ap-btn--primary">
                  <ClipboardCheck aria-hidden />
                  {inspected ? 'Ver inventário' : 'Conferir inventário'}
                </Link>
              </div>

              <div className="ap-card__task">
                <span className={`ap-pill ${r.reviewed ? 'ap-pill--done' : ''}`}>
                  {r.reviewed ? 'Hospedagem avaliada' : 'Avaliação pendente'}
                </span>
                <Link to={`/associado/reserva/${r.id}/avaliacao`} className="ap-btn">
                  <Star aria-hidden />
                  {r.reviewed ? 'Ver / alterar avaliação' : 'Avaliar hospedagem'}
                </Link>
              </div>
            </li>
          )
        })}
      </ul>

      <div className={`ap-toast ${notice ? 'is-visible' : ''}`} role="status" aria-live="polite">
        {notice}
      </div>
    </>
  )
}
