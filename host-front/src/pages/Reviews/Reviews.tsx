import { ChevronLeft, ChevronRight, Pencil, Search, Star } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Segmented } from '../../components/ui/Segmented'
import { StarDisplay } from '../../components/ui/StarRating'
import { ApiError, reviewsApi, type ReviewFilter, type ReviewItem, type ReviewList } from '../../services/api'
import { formatDateShort } from '../../utils/money'
import { formatRating } from '../../utils/rating'
import '../Guests/Guests.css'
import '../Reservations/Reservations.css'
import { PLATFORM_LABEL } from '../Reservations/options'
import { STATUS_LABEL } from '../Reservations/status'
import { BlockedBadge } from '../../components/ui/BlockedBadge'
import { ReviewFormModal } from './ReviewFormModal'
import './Reviews.css'

const PAGE_SIZE = 15
type Filter = 'ALL' | ReviewFilter

export function Reviews() {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [filter, setFilter] = useState<Filter>('ALL')
  const [page, setPage] = useState(1)

  const [result, setResult] = useState<ReviewList | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const queryKey = `${debounced}|${filter}|${page}|${reloadKey}`
  const [loaded, setLoaded] = useState({ key: '', error: '' })
  const loading = loaded.key !== queryKey
  const error = loading ? '' : loaded.error

  const [editing, setEditing] = useState<ReviewItem | null>(null)
  const [formKey, setFormKey] = useState(0)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<number>(undefined)

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebounced(search.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(t)
  }, [search])

  useEffect(() => {
    const controller = new AbortController()
    reviewsApi
      .list(
        { search: debounced, reviewed: filter === 'ALL' ? undefined : filter, page, pageSize: PAGE_SIZE },
        controller.signal,
      )
      .then((data) => {
        setResult(data)
        setLoaded({ key: queryKey, error: '' })
      })
      .catch((err) => {
        if (!controller.signal.aborted) setLoaded({ key: queryKey, error: err.message ?? 'Erro ao carregar avaliações' })
      })
    return () => controller.abort()
  }, [debounced, filter, page, queryKey])

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 3200)
  }, [])

  const openForm = useCallback((item: ReviewItem) => {
    setEditing(item)
    setFormKey((k) => k + 1)
  }, [])

  // Aberta pelo atalho da tela de Reservas: /avaliacoes?reserva=<id>
  const [searchParams, setSearchParams] = useSearchParams()
  const linkedId = searchParams.get('reserva')
  useEffect(() => {
    if (!linkedId) return
    let cancelled = false
    reviewsApi
      .get(linkedId)
      .then(({ item }) => !cancelled && openForm(item))
      .catch((err) => !cancelled && showToast(err instanceof ApiError ? err.message : 'Não foi possível abrir a reserva'))
      .finally(() => !cancelled && setSearchParams({}, { replace: true }))
    return () => {
      cancelled = true
    }
  }, [linkedId, openForm, setSearchParams, showToast])

  function handleSaved(_item: ReviewItem, isNew: boolean, blocked: boolean) {
    setEditing(null)
    showToast(
      blocked
        ? 'Avaliação salva e hóspede bloqueado'
        : isNew
          ? 'Avaliação registrada'
          : 'Avaliação atualizada',
    )
    setReloadKey((k) => k + 1) // atualiza contadores e médias
  }

  function handleDeleted() {
    setEditing(null)
    showToast('Avaliação excluída')
    setReloadKey((k) => k + 1)
  }

  const total = result?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0
  const to = Math.min(page * PAGE_SIZE, total)
  const counts = result?.counts
  const hasFilters = !!debounced || filter !== 'ALL'

  return (
    <div className="guests">
      <header className="page-header">
        <div>
          <p className="page-header__crumb">Controle interno</p>
          <h1 className="page-header__title">Avaliações</h1>
          <p className="page-header__subtitle">
            Avalie cada hospedagem e consulte o histórico do hóspede antes de alugar novamente.
          </p>
        </div>
      </header>

      {counts && counts.all > 0 && (
        <div className="kpis kpis--4">
          <div className="kpi">
            <span>Reservas{debounced ? ' (busca)' : ''}</span>
            <strong>{counts.all}</strong>
          </div>
          <div className="kpi">
            <span>Avaliadas</span>
            <strong>{counts.reviewed}</strong>
          </div>
          <div className="kpi">
            <span>Pendentes</span>
            <strong>{counts.pending}</strong>
          </div>
          <div className="kpi kpi--dark">
            <span>Nota média geral</span>
            <strong className="kpi__rating">
              {counts.averageRating !== null ? (
                <>
                  <Star strokeWidth={1.6} aria-hidden />
                  {formatRating(counts.averageRating)}
                </>
              ) : (
                '—'
              )}
            </strong>
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
          <div className="panel__filter panel__filter--wide panel__filter--reviews">
            <Segmented<Filter>
              ariaLabel="Filtrar por avaliação"
              value={filter}
              onChange={(v) => {
                setFilter(v)
                setPage(1)
              }}
              options={[
                { value: 'ALL', label: 'Todas' },
                { value: 'PENDENTE', label: counts ? `Pendentes (${counts.pending})` : 'Pendentes' },
                { value: 'AVALIADA', label: counts ? `Avaliadas (${counts.reviewed})` : 'Avaliadas' },
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
              <Star strokeWidth={1.6} />
            </span>
            <p>
              {filter === 'PENDENTE' && !debounced
                ? 'Nenhuma avaliação pendente. Tudo em dia!'
                : hasFilters
                  ? 'Nenhuma reserva encontrada com esses filtros.'
                  : 'Nenhuma reserva cadastrada ainda.'}
            </p>
          </div>
        ) : (
          <div className={`table-wrap ${loading && result ? 'is-refreshing' : ''}`}>
            <table className="table table--reviews">
              <thead>
                <tr>
                  <th>Reserva</th>
                  <th>Hóspede</th>
                  <th>Imóvel</th>
                  <th>Período</th>
                  <th>Status</th>
                  <th>Avaliação</th>
                  <th className="table__actions-col">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {!result && loading
                  ? Array.from({ length: 6 }, (_, i) => (
                      <tr key={i} className="table__skeleton">
                        {Array.from({ length: 7 }, (_, j) => (
                          <td key={j}>
                            <span />
                          </td>
                        ))}
                      </tr>
                    ))
                  : result?.data.map((item, i) => {
                      const { reservation: r, guest: g, review } = item
                      return (
                        <tr
                          key={r.id}
                          className="table__row"
                          style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}
                          onClick={() => openForm(item)}
                        >
                          <td data-label="Reserva">
                            <span className="doc-cell">
                              <span className="guest-form__mono">{r.reservationNumber}</span>
                              {r.platform && <small>{PLATFORM_LABEL[r.platform]}</small>}
                            </span>
                          </td>
                          <td data-label="Hóspede">
                            <span className="doc-cell">
                              <span className="review-guest-name">
                                {g.fullName}
                                {g.blocked && <BlockedBadge reason={g.blocked.reason} />}
                              </span>
                              {g.averageRating !== null && g.reviewsCount > 0 ? (
                                <small title="Média do hóspede em todas as reservas avaliadas">
                                  média {formatRating(g.averageRating)} · {g.reviewsCount}{' '}
                                  {g.reviewsCount === 1 ? 'avaliação' : 'avaliações'}
                                </small>
                              ) : (
                                <small>sem histórico</small>
                              )}
                            </span>
                          </td>
                          <td data-label="Imóvel">{r.propertyName}</td>
                          <td data-label="Período" className="nowrap">
                            <span className="doc-cell">
                              <span>
                                {formatDateShort(r.checkIn)} → {formatDateShort(r.finalCheckOut)}
                              </span>
                              <small>
                                {r.totalNights} {r.totalNights === 1 ? 'noite' : 'noites'} · {r.checkIn.slice(0, 4)}
                              </small>
                            </span>
                          </td>
                          <td data-label="Status">
                            <span className={`status status--${r.status.toLowerCase()}`}>{STATUS_LABEL[r.status]}</span>
                          </td>
                          <td data-label="Avaliação">
                            {review ? (
                              <StarDisplay value={review.average} />
                            ) : (
                              <span className="review-pending">Pendente</span>
                            )}
                          </td>
                          <td className="table__actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={() => openForm(item)}
                              aria-label={
                                review
                                  ? `Editar avaliação da reserva ${r.reservationNumber}`
                                  : `Avaliar reserva ${r.reservationNumber}`
                              }
                              title={review ? 'Editar avaliação' : 'Avaliar'}
                            >
                              {review ? <Pencil strokeWidth={1.8} /> : <Star strokeWidth={1.8} />}
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

      <ReviewFormModal
        key={formKey}
        item={editing}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />

      <div className={`toast ${toast ? 'is-visible' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  )
}
