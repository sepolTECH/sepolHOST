import { ChevronLeft, ChevronRight, ClipboardCheck, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Segmented } from '../../components/ui/Segmented'
import { inventoryApi, type InspectionList, type InventoryStatus } from '../../services/api'
import { formatDate, formatDateShort, formatMoney } from '../../utils/money'
import { INVENTORY_STATUS_LABEL } from './status'
import { InspectionModal } from './InspectionModal'

const PAGE_SIZE = 15
type Filter = 'ALL' | InventoryStatus

interface InspectionsTabProps {
  onNotify: (message: string) => void
}

/** Aba "Vistorias": todas as reservas com a situação do inventário (pendente / vistoriado). */
export function InspectionsTab({ onNotify }: InspectionsTabProps) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [filter, setFilter] = useState<Filter>('PENDENTE')
  const [page, setPage] = useState(1)

  const [result, setResult] = useState<InspectionList | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const queryKey = `${debounced}|${filter}|${page}|${reloadKey}`
  const [loaded, setLoaded] = useState({ key: '', error: '' })
  const loading = loaded.key !== queryKey
  const error = loading ? '' : loaded.error

  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebounced(search.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(t)
  }, [search])

  useEffect(() => {
    const controller = new AbortController()
    inventoryApi
      .reservations(
        { search: debounced, status: filter === 'ALL' ? undefined : filter, page, pageSize: PAGE_SIZE },
        controller.signal,
      )
      .then((data) => {
        setResult(data)
        setLoaded({ key: queryKey, error: '' })
      })
      .catch((err) => {
        if (!controller.signal.aborted) setLoaded({ key: queryKey, error: err.message ?? 'Erro ao carregar reservas' })
      })
    return () => controller.abort()
  }, [debounced, filter, page, queryKey])

  const total = result?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0
  const to = Math.min(page * PAGE_SIZE, total)
  const counts = result?.counts
  const hasFilters = !!debounced || filter !== 'ALL'

  return (
    <>
      {counts && counts.all > 0 && (
        <div className="kpis inv-kpis">
          <div className="kpi">
            <span>Reservas{debounced ? ' (busca)' : ''}</span>
            <strong>{counts.all}</strong>
          </div>
          <div className="kpi">
            <span>Pendentes de vistoria</span>
            <strong>{counts.pending}</strong>
          </div>
          <div className="kpi kpi--dark">
            <span>Vistoriadas</span>
            <strong>{counts.inspected}</strong>
          </div>
        </div>
      )}

      <section className="panel">
        <div className="panel__toolbar">
          <div className="ui-input-icon panel__search">
            <Search aria-hidden />
            <input
              className="ui-input"
              type="search"
              placeholder="Buscar por nº da reserva, hóspede ou imóvel"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar reservas"
            />
          </div>
          <div className="panel__filter panel__filter--wide panel__filter--inventory">
            <Segmented<Filter>
              ariaLabel="Filtrar por situação da vistoria"
              value={filter}
              onChange={(v) => {
                setFilter(v)
                setPage(1)
              }}
              options={[
                { value: 'PENDENTE', label: counts ? `Pendentes (${counts.pending})` : 'Pendentes' },
                { value: 'VISTORIADO', label: counts ? `Vistoriadas (${counts.inspected})` : 'Vistoriadas' },
                { value: 'ALL', label: 'Todas' },
              ]}
            />
          </div>
        </div>

        {error ? (
          <div className="panel__state">
            <p>{error}</p>
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setReloadKey((k) => k + 1)}>
              Tentar novamente
            </button>
          </div>
        ) : !loading && result && result.data.length === 0 ? (
          <div className="panel__state">
            <span className="panel__state-icon">
              <ClipboardCheck strokeWidth={1.6} />
            </span>
            <p>
              {filter === 'PENDENTE' && !debounced
                ? 'Nenhuma vistoria pendente. Tudo em dia!'
                : hasFilters
                  ? 'Nenhuma reserva encontrada com esses filtros.'
                  : 'Nenhuma reserva cadastrada ainda.'}
            </p>
          </div>
        ) : (
          <div className={`table-wrap ${loading && result ? 'is-refreshing' : ''}`}>
            <table className="table table--inspections">
              <thead>
                <tr>
                  <th>Reserva</th>
                  <th>Hóspede</th>
                  <th>Imóvel</th>
                  <th>Check-out</th>
                  <th>Conferência</th>
                  <th className="num">Inventário</th>
                  <th>Situação</th>
                  <th className="table__actions-col">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {!result && loading
                  ? Array.from({ length: 6 }, (_, i) => (
                      <tr key={i} className="table__skeleton">
                        {Array.from({ length: 8 }, (_, j) => (
                          <td key={j}>
                            <span />
                          </td>
                        ))}
                      </tr>
                    ))
                  : result?.data.map((r, i) => {
                      const pct = r.itemsCount ? Math.round((r.checkedCount / r.itemsCount) * 100) : 0
                      return (
                        <tr
                          key={r.id}
                          className="table__row"
                          style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}
                          onClick={() => setOpenId(r.id)}
                        >
                          <td data-label="Reserva">
                            <span className="guest-form__mono">{r.reservationNumber}</span>
                          </td>
                          <td data-label="Hóspede">{r.guestName}</td>
                          <td data-label="Imóvel">{r.propertyName}</td>
                          <td data-label="Check-out" className="nowrap">
                            <span className="doc-cell">
                              <span>{formatDateShort(r.finalCheckOut)}</span>
                              <small>{r.finalCheckOut.slice(0, 4)}</small>
                            </span>
                          </td>
                          <td data-label="Conferência">
                            {r.itemsCount ? (
                              <span className="inv-mini">
                                <span className="inv-mini__bar" aria-hidden>
                                  <span style={{ width: `${pct}%` }} />
                                </span>
                                <small>
                                  {r.checkedCount}/{r.itemsCount}
                                </small>
                              </span>
                            ) : (
                              <small className="inv-none">sem itens</small>
                            )}
                          </td>
                          <td data-label="Inventário" className="num">
                            {formatMoney(r.totalCents)}
                          </td>
                          <td data-label="Situação">
                            <span
                              className={`inv-status inv-status--${r.inventoryStatus.toLowerCase()}`}
                              title={
                                r.inspectedAt
                                  ? `Vistoriada em ${formatDate(new Date(r.inspectedAt).toISOString().slice(0, 10))}`
                                  : undefined
                              }
                            >
                              {INVENTORY_STATUS_LABEL[r.inventoryStatus]}
                            </span>
                          </td>
                          <td className="table__actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={() => setOpenId(r.id)}
                              aria-label={`Abrir vistoria da reserva ${r.reservationNumber}`}
                              title="Abrir vistoria"
                            >
                              <ClipboardCheck strokeWidth={1.8} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
              </tbody>
            </table>
          </div>
        )}

        {result && total > 0 && !error && (
          <footer className="panel__footer">
            <span>
              {from}–{to} de {total} {total === 1 ? 'reserva' : 'reservas'}
            </span>
            <div className="pager">
              <button
                type="button"
                className="icon-btn"
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1 || loading}
                aria-label="Página anterior"
              >
                <ChevronLeft strokeWidth={1.8} />
              </button>
              <span className="pager__label">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages || loading}
                aria-label="Próxima página"
              >
                <ChevronRight strokeWidth={1.8} />
              </button>
            </div>
          </footer>
        )}
      </section>

      <InspectionModal
        key={openId ?? 'closed'}
        reservationId={openId}
        onClose={() => setOpenId(null)}
        onChanged={() => setReloadKey((k) => k + 1)}
        onNotify={onNotify}
      />
    </>
  )
}
