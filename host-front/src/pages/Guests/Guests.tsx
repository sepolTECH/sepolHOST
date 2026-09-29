import { ChevronLeft, ChevronRight, Eye, Pencil, Plus, Search, UserRound } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Segmented } from '../../components/ui/Segmented'
import { BlockedBadge } from '../../components/ui/BlockedBadge'
import { StarDisplay } from '../../components/ui/StarRating'
import { guestsApi, type Guest, type Paginated, type PersonType } from '../../services/api'
import { DOCUMENT_LABEL, formatDocument, formatPhone, initials } from '../../utils/documents'
import { GuestFormModal } from './GuestFormModal'
import { GuestViewModal } from './GuestViewModal'
import './Guests.css'

const PAGE_SIZE = 15
type Filter = 'ALL' | PersonType

export function Guests() {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [filter, setFilter] = useState<Filter>('ALL')
  const [page, setPage] = useState(1)

  const [result, setResult] = useState<Paginated<Guest> | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  // Chave da consulta atual; "loading" = a última resposta ainda não é desta chave
  const queryKey = `${debounced}|${filter}|${page}|${reloadKey}`
  const [loaded, setLoaded] = useState({ key: '', error: '' })
  const loading = loaded.key !== queryKey
  const error = loading ? '' : loaded.error

  const [formOpen, setFormOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [editing, setEditing] = useState<Guest | null>(null)
  const [viewing, setViewing] = useState<Guest | null>(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<number>(undefined)

  // Busca com atraso para não chamar a API a cada tecla
  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebounced(search.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(t)
  }, [search])

  useEffect(() => {
    const controller = new AbortController()
    guestsApi
      .list(
        { search: debounced, personType: filter === 'ALL' ? undefined : filter, page, pageSize: PAGE_SIZE },
        controller.signal,
      )
      .then((data) => {
        setResult(data)
        setLoaded({ key: queryKey, error: '' })
      })
      .catch((err) => {
        if (!controller.signal.aborted) setLoaded({ key: queryKey, error: err.message ?? 'Erro ao carregar hóspedes' })
      })
    return () => controller.abort()
  }, [debounced, filter, page, queryKey])

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 3200)
  }, [])

  function openNew() {
    setEditing(null)
    setFormKey((k) => k + 1)
    setFormOpen(true)
  }

  function openEdit(guest: Guest) {
    setViewing(null)
    setEditing(guest)
    setFormKey((k) => k + 1)
    setFormOpen(true)
  }

  function handleSaved(saved: Guest, isNew: boolean, warning?: string) {
    setFormOpen(false)
    showToast(warning ?? (isNew ? 'Hóspede cadastrado com sucesso' : 'Alterações salvas'))
    if (isNew) {
      // volta para a 1ª página sem filtros para o novo registro aparecer no topo
      setSearch('')
      setDebounced('')
      setFilter('ALL')
      setPage(1)
      setReloadKey((k) => k + 1)
    } else {
      setResult((r) => r && { ...r, data: r.data.map((g) => (g.id === saved.id ? saved : g)) })
    }
  }

  const total = result?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0
  const to = Math.min(page * PAGE_SIZE, total)
  const hasFilters = !!debounced || filter !== 'ALL'

  return (
    <div className="guests">
      <header className="page-header">
        <div>
          <p className="page-header__crumb">Cadastro</p>
          <h1 className="page-header__title">Hóspedes</h1>
          <p className="page-header__subtitle">Cadastre, consulte e atualize os hóspedes.</p>
        </div>
        <button type="button" className="ui-btn ui-btn--primary" onClick={openNew}>
          <Plus strokeWidth={2.2} />
          Novo hóspede
        </button>
      </header>

      <section className="panel">
        <div className="panel__toolbar">
          <div className="ui-input-icon panel__search">
            <Search aria-hidden />
            <input
              className="ui-input"
              type="search"
              placeholder="Buscar por nome, documento, RG, e-mail ou telefone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar hóspedes"
            />
          </div>
          <div className="panel__filter">
            <Segmented<Filter>
              ariaLabel="Filtrar por tipo de pessoa"
              value={filter}
              onChange={(v) => {
                setFilter(v)
                setPage(1)
              }}
              options={[
                { value: 'ALL', label: 'Todos' },
                { value: 'PF', label: 'PF' },
                { value: 'PJ', label: 'PJ' },
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
              <UserRound strokeWidth={1.6} />
            </span>
            {hasFilters ? (
              <p>Nenhum hóspede encontrado com esses filtros.</p>
            ) : (
              <>
                <p>Nenhum hóspede cadastrado ainda.</p>
                <button type="button" className="ui-btn ui-btn--primary" onClick={openNew}>
                  <Plus strokeWidth={2.2} />
                  Cadastrar o primeiro
                </button>
              </>
            )}
          </div>
        ) : (
          <div className={`table-wrap ${loading && result ? 'is-refreshing' : ''}`}>
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Nacionalidade</th>
                  <th>Identificação</th>
                  <th>Telefone</th>
                  <th>E-mail</th>
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
                  : result?.data.map((g, i) => (
                      <tr
                        key={g.id}
                        className="table__row"
                        style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}
                        onClick={() => setViewing(g)}
                      >
                        <td data-label="Nome">
                          <div className="guest-cell">
                            <span className="guest-avatar" aria-hidden>
                              {initials(g.fullName)}
                            </span>
                            <span className="guest-cell__text">
                              <span className="guest-cell__name">
                                {g.fullName}
                                {g.blocked && <BlockedBadge reason={g.blocked.reason} />}
                              </span>
                              {g.averageRating !== null && g.reviewsCount > 0 ? (
                                <span
                                  className="guest-cell__rating"
                                  title={`Média de ${g.reviewsCount} ${g.reviewsCount === 1 ? 'avaliação' : 'avaliações'}`}
                                >
                                  <StarDisplay value={g.averageRating} />
                                  <small>({g.reviewsCount})</small>
                                </span>
                              ) : (
                                <small className="guest-cell__norating">Sem avaliações</small>
                              )}
                            </span>
                          </div>
                        </td>
                        <td data-label="Tipo">
                          <span className={`ui-badge ${g.personType === 'PJ' ? 'ui-badge--dark' : ''}`}>
                            {g.personType}
                          </span>
                        </td>
                        <td data-label="Nacionalidade">{g.nationality}</td>
                        <td data-label="Identificação">
                          <span className="doc-cell">
                            <small>{DOCUMENT_LABEL[g.documentType]}</small>
                            <span className="guest-form__mono">{formatDocument(g.documentType, g.documentNumber)}</span>
                          </span>
                        </td>
                        <td data-label="Telefone" className="nowrap">
                          {formatPhone(g.phone)}
                        </td>
                        <td data-label="E-mail" className="guest-cell__email">
                          {g.email ?? <span className="muted">—</span>}
                        </td>
                        <td className="table__actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => setViewing(g)}
                            aria-label={`Visualizar ${g.fullName}`}
                            title="Visualizar"
                          >
                            <Eye strokeWidth={1.8} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => openEdit(g)}
                            aria-label={`Editar ${g.fullName}`}
                            title="Editar"
                          >
                            <Pencil strokeWidth={1.8} />
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
              {from}–{to} de {total} {total === 1 ? 'hóspede' : 'hóspedes'}
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

      <GuestFormModal
        key={formKey}
        open={formOpen}
        guest={editing}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
        onEditExisting={openEdit}
      />
      <GuestViewModal guest={viewing} onClose={() => setViewing(null)} onEdit={openEdit} onOpenGuest={setViewing} />

      <div className={`toast ${toast ? 'is-visible' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  )
}
