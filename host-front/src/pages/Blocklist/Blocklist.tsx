import { ChevronLeft, ChevronRight, Eye, Search, ShieldBan } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { StarDisplay } from '../../components/ui/StarRating'
import { blocklistApi, type BlockEntry, type Paginated } from '../../services/api'
import { DOCUMENT_LABEL, formatDocument, initials } from '../../utils/documents'
import '../Guests/Guests.css'
import '../Reservations/Reservations.css'
import '../Reviews/Reviews.css'
import { BlockDetailModal } from './BlockDetailModal'
import './Blocklist.css'

const PAGE_SIZE = 15
const date = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

export function Blocklist() {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)

  const [result, setResult] = useState<Paginated<BlockEntry> | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const queryKey = `${debounced}|${page}|${reloadKey}`
  const [loaded, setLoaded] = useState({ key: '', error: '' })
  const loading = loaded.key !== queryKey
  const error = loading ? '' : loaded.error

  const [viewingId, setViewingId] = useState<string | null>(null)
  const [modalKey, setModalKey] = useState(0)
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
    blocklistApi
      .list({ search: debounced, page, pageSize: PAGE_SIZE }, controller.signal)
      .then((data) => {
        setResult(data)
        setLoaded({ key: queryKey, error: '' })
      })
      .catch((err) => {
        if (!controller.signal.aborted) setLoaded({ key: queryKey, error: err.message ?? 'Erro ao carregar os bloqueados' })
      })
    return () => controller.abort()
  }, [debounced, page, queryKey])

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 3200)
  }, [])

  const openDetail = useCallback((guestId: string) => {
    setViewingId(guestId)
    setModalKey((k) => k + 1)
  }, [])

  // Aberta a partir de um alerta: /bloqueados?hospede=<id>
  // (ajuste de estado durante o render, como recomendado pelo React, em vez de setState no useEffect)
  const [searchParams, setSearchParams] = useSearchParams()
  const linkedId = searchParams.get('hospede')
  const [handledLink, setHandledLink] = useState<string | null>(null)
  if (linkedId && linkedId !== handledLink) {
    setHandledLink(linkedId)
    setViewingId(linkedId)
    setModalKey((k) => k + 1)
  }
  useEffect(() => {
    if (linkedId) setSearchParams({}, { replace: true })
  }, [linkedId, setSearchParams])

  const total = result?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0
  const to = Math.min(page * PAGE_SIZE, total)

  return (
    <div className="guests">
      <header className="page-header">
        <div>
          <p className="page-header__crumb">Controle interno</p>
          <h1 className="page-header__title">Bloqueados</h1>
          <p className="page-header__subtitle">
            Hóspedes bloqueados por problemas em hospedagens. Para bloquear alguém, use a avaliação da reserva.
          </p>
        </div>
      </header>

      <section className="panel">
        <div className="panel__toolbar">
          <div className="ui-input-icon panel__search">
            <Search aria-hidden />
            <input
              className="ui-input"
              type="search"
              placeholder="Buscar por nome, documento ou motivo"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar nos bloqueados"
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
              <ShieldBan strokeWidth={1.6} />
            </span>
            <p>{debounced ? 'Nenhum hóspede bloqueado encontrado.' : 'Nenhum hóspede bloqueado.'}</p>
          </div>
        ) : (
          <div className={`table-wrap ${loading && result ? 'is-refreshing' : ''}`}>
            <table className="table table--blocklist">
              <thead>
                <tr>
                  <th>Hóspede</th>
                  <th>Motivo</th>
                  <th>Bloqueado em</th>
                  <th>Avaliação</th>
                  <th className="table__actions-col">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {!result && loading
                  ? Array.from({ length: 5 }, (_, i) => (
                      <tr key={i} className="table__skeleton">
                        {Array.from({ length: 5 }, (_, j) => (
                          <td key={j}>
                            <span />
                          </td>
                        ))}
                      </tr>
                    ))
                  : result?.data.map((b, i) => (
                      <tr
                        key={b.guest.id}
                        className="table__row"
                        style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}
                        onClick={() => openDetail(b.guest.id)}
                      >
                        <td data-label="Hóspede">
                          <div className="guest-cell">
                            <span className="guest-avatar guest-avatar--blocked" aria-hidden>
                              {initials(b.guest.fullName)}
                            </span>
                            <span className="guest-cell__text">
                              <span className="guest-cell__name">{b.guest.fullName}</span>
                              <small className="guest-cell__norating">
                                {DOCUMENT_LABEL[b.guest.documentType]}{' '}
                                {formatDocument(b.guest.documentType, b.guest.documentNumber)}
                              </small>
                            </span>
                          </div>
                        </td>
                        <td data-label="Motivo">
                          <span className="blocklist-reason" title={b.reason}>
                            {b.reason}
                          </span>
                        </td>
                        <td data-label="Bloqueado em" className="nowrap">
                          <span className="doc-cell">
                            <span>{date(b.blockedAt)}</span>
                            <small>
                              {b.blockedByName ?? '—'}
                              {b.reservationNumber && ` · reserva ${b.reservationNumber}`}
                            </small>
                          </span>
                        </td>
                        <td data-label="Avaliação">
                          {b.guest.averageRating !== null && b.guest.reviewsCount > 0 ? (
                            <span className="guest-cell__rating">
                              <StarDisplay value={b.guest.averageRating} />
                              <small>({b.guest.reviewsCount})</small>
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="table__actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => openDetail(b.guest.id)}
                            aria-label={`Ver motivo e avaliações de ${b.guest.fullName}`}
                            title="Ver motivo e avaliações"
                          >
                            <Eye strokeWidth={1.8} />
                          </button>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}

        {result && total > 0 && !error && (
          <footer className="panel__footer">
            <span>
              {from}–{to} de {total} {total === 1 ? 'hóspede bloqueado' : 'hóspedes bloqueados'}
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

      <BlockDetailModal
        key={modalKey}
        guestId={viewingId}
        onClose={() => setViewingId(null)}
        onChanged={(message) => {
          showToast(message)
          setReloadKey((k) => k + 1)
        }}
      />

      <div className={`toast ${toast ? 'is-visible' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  )
}
