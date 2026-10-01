import { Ban, CalendarPlus, CalendarRange, ChevronLeft, ChevronRight, Eye, Paperclip, Pencil, Plus, RotateCcw, Search, Star, Trash2, UserCheck } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Segmented } from '../../components/ui/Segmented'
import {
  ApiError,
  calendarApi,
  guestsApi,
  reservationsApi,
  type Platform,
  type Reservation,
  type ReservationList,
  type ReservationStatus,
} from '../../services/api'
import { formatDateShort, formatMoney } from '../../utils/money'
import { CommissionPct } from '../../components/ui/CommissionPct'
import { PLATFORM_LABEL } from './options'
import '../Guests/Guests.css'
import { ReservationFormModal, type ReservationPrefill } from './ReservationFormModal'
import { ReservationAccessModal } from './ReservationAccessModal'
import { ReservationViewModal } from './ReservationViewModal'
import './Reservations.css'
import { STATUS_LABEL, STATUS_OPTIONS } from './status'

const PAGE_SIZE = 15
type Filter = 'ALL' | ReservationStatus

export function Reservations() {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [filter, setFilter] = useState<Filter>('ALL')
  const [page, setPage] = useState(1)

  const [result, setResult] = useState<ReservationList | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const queryKey = `${debounced}|${filter}|${page}|${reloadKey}`
  const [loaded, setLoaded] = useState({ key: '', error: '' })
  const loading = loaded.key !== queryKey
  const error = loading ? '' : loaded.error

  const [formOpen, setFormOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [editing, setEditing] = useState<Reservation | null>(null)
  const [extending, setExtending] = useState(false) // aberto pelo atalho "Estender hospedagem"
  const [viewing, setViewing] = useState<Reservation | null>(null)
  const [releasing, setReleasing] = useState<Reservation | null>(null) // liberar para associados
  const [openingId, setOpeningId] = useState<string | null>(null)
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
    reservationsApi
      .list(
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

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 3200)
  }, [])

  // A listagem não traz os acompanhantes: busca o detalhe antes de abrir
  async function withDetail(r: Reservation, then: (full: Reservation) => void) {
    if (r.companions) return then(r)
    setOpeningId(r.id)
    try {
      const { reservation } = await reservationsApi.get(r.id)
      then(reservation)
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível abrir a reserva')
    } finally {
      setOpeningId(null)
    }
  }

  // Aberta a partir do histórico do hóspede: /cadastro/reservas?reserva=<id>
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const linkedId = searchParams.get('reserva')
  useEffect(() => {
    if (!linkedId) return
    let cancelled = false
    reservationsApi
      .get(linkedId)
      .then(({ reservation }) => !cancelled && setViewing(reservation))
      .catch((err) => !cancelled && showToast(err instanceof ApiError ? err.message : 'Não foi possível abrir a reserva'))
      .finally(() => !cancelled && setSearchParams({}, { replace: true }))
    return () => {
      cancelled = true
    }
  }, [linkedId, setSearchParams, showToast])

  // Vinda do Calendário: /cadastro/reservas?nova=1&checkIn=…&checkOut=…&plataforma=…&vincularLink=…&vincularMarcacao=…
  // Abre uma reserva nova já preenchida e, ao salvar, vincula à marcação do link.
  const [prefill, setPrefill] = useState<ReservationPrefill | undefined>(undefined)
  const [pendingLink, setPendingLink] = useState<{ feedId: string; eventKey: string } | null>(null)
  const newFromCalendar = searchParams.get('nova') === '1' ? searchParams.toString() : ''
  const [handledNew, setHandledNew] = useState('')
  // Ajuste de estado durante o render (como no Sidebar), em vez de setState dentro de useEffect
  if (newFromCalendar && newFromCalendar !== handledNew) {
    setHandledNew(newFromCalendar)
    const p = searchParams
    const iso = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)
    const platform = p.get('plataforma') as Platform | null
    setPrefill({
      checkIn: iso(p.get('checkIn')),
      checkOut: iso(p.get('checkOut')),
      platform: platform && platform in PLATFORM_LABEL ? platform : undefined,
      reservationNumber: p.get('numero')?.slice(0, 40) || undefined,
      propertyName: p.get('imovel')?.slice(0, 120) || undefined,
    })
    const feedId = p.get('vincularLink')
    const eventKey = p.get('vincularMarcacao')
    setPendingLink(feedId && eventKey ? { feedId, eventKey } : null)
    setEditing(null)
    setExtending(false)
    setFormKey((k) => k + 1)
    setFormOpen(true)
  }
  // limpa a URL depois de abrir o formulário
  useEffect(() => {
    if (newFromCalendar) setSearchParams({}, { replace: true })
  }, [newFromCalendar, setSearchParams])

  // Vinda do hóspede: /cadastro/reservas?reservarPara=<id> abre uma reserva nova já com esse hóspede
  const guestForReservation = searchParams.get('reservarPara')
  useEffect(() => {
    if (!guestForReservation) return
    let cancelled = false
    guestsApi
      .get(guestForReservation)
      .then(({ guest }) => {
        if (cancelled) return
        setPrefill({
          mainGuest: {
            id: guest.id,
            fullName: guest.fullName,
            documentType: guest.documentType,
            documentNumber: guest.documentNumber,
          },
        })
        setPendingLink(null)
        setEditing(null)
        setExtending(false)
        setFormKey((k) => k + 1)
        setFormOpen(true)
      })
      .catch((err) => !cancelled && showToast(err instanceof ApiError ? err.message : 'Não foi possível abrir a reserva'))
      .finally(() => !cancelled && setSearchParams({}, { replace: true }))
    return () => {
      cancelled = true
    }
  }, [guestForReservation, setSearchParams, showToast])

  function openNew() {
    setEditing(null)
    setExtending(false)
    setPrefill(undefined)
    setPendingLink(null)
    setFormKey((k) => k + 1)
    setFormOpen(true)
  }

  function openEdit(r: Reservation, extend = false) {
    withDetail(r, (full) => {
      setViewing(null)
      setEditing(full)
      setExtending(extend)
      setFormKey((k) => k + 1)
      setFormOpen(true)
    })
  }

  /** Atalho da lista: abre a edição já na seção de extensões, com uma extensão nova. */
  function openExtend(r: Reservation) {
    openEdit(r, true)
  }

  function openView(r: Reservation) {
    withDetail(r, setViewing)
  }

  async function handleSaved(saved: Reservation, isNew: boolean, warning?: string) {
    setFormOpen(false)
    // Reserva criada a partir do Calendário: vincula à marcação e volta para o calendário
    if (isNew && pendingLink) {
      const link = pendingLink
      setPendingLink(null)
      setPrefill(undefined)
      try {
        await calendarApi.link(link.feedId, link.eventKey, saved.id)
        navigate(`/calendario?mes=${saved.checkIn.slice(0, 7)}`)
        return
      } catch (err) {
        showToast(
          `Reserva cadastrada, mas não foi possível vincular ao calendário${err instanceof ApiError ? `: ${err.message}` : ''}`,
        )
        setReloadKey((k) => k + 1)
        return
      }
    }
    showToast(warning ?? (isNew ? 'Reserva cadastrada com sucesso' : 'Alterações salvas'))
    if (isNew) {
      setSearch('')
      setDebounced('')
      setFilter('ALL')
      setPage(1)
    }
    // recarrega para atualizar ordem e somatórios
    setReloadKey((k) => k + 1)
  }

  async function handleCancel(r: Reservation) {
    const cancelling = r.status !== 'CANCELADO'
    const ok = window.confirm(
      cancelling
        ? `Cancelar a reserva ${r.reservationNumber}?\n\nEla continua na lista com todos os dados, mas deixa de entrar nas finanças, no inventário/vistoria e nas avaliações. Você pode reativá-la depois.`
        : `Reativar a reserva ${r.reservationNumber}?\n\nEla volta como “Vazio” e passa a contar de novo nas finanças. Ajuste o status na edição, se precisar.`,
    )
    if (!ok) return
    try {
      await (cancelling ? reservationsApi.cancel(r.id) : reservationsApi.reactivate(r.id))
      showToast(cancelling ? 'Reserva cancelada' : 'Reserva reativada')
      setViewing(null)
      setReloadKey((k) => k + 1)
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível alterar a reserva')
    }
  }

  async function handleDelete(r: Reservation) {
    const ok = window.confirm(
      [
        `Excluir a reserva ${r.reservationNumber}?`,
        'Serão apagados também os acompanhantes, custos, extensões, anexos, a avaliação e o inventário/vistoria desta reserva, além do vínculo dela com o calendário. O hóspede não é excluído.',
        'Esta ação não pode ser desfeita.',
      ].join('\n\n'),
    )
    if (!ok) return
    try {
      await reservationsApi.remove(r.id)
      showToast('Reserva excluída')
      setViewing(null)
      // era a última da página: volta uma página
      if (result && result.data.length === 1 && page > 1) setPage((p) => p - 1)
      setReloadKey((k) => k + 1)
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível excluir a reserva')
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
          <h1 className="page-header__title">Reservas</h1>
          <p className="page-header__subtitle">Períodos, hóspedes e valores de cada reserva.</p>
        </div>
        <button type="button" className="ui-btn ui-btn--primary" onClick={openNew}>
          <Plus strokeWidth={2.2} />
          Nova reserva
        </button>
      </header>

      {result && total > 0 && (
        <div className="kpis">
          <div className="kpi">
            <span>Reservas{hasFilters ? ' (filtro)' : ''}</span>
            <strong>{total}</strong>
          </div>
          <div className="kpi">
            <span>Valor das reservas</span>
            <strong>{formatMoney(result.totals.amountCents)}</strong>
          </div>
          <div className="kpi">
            <span>Comissões</span>
            <strong>{formatMoney(result.totals.commissionCents)}</strong>
            {result.totals.commissionCents > 0 && (
              <small className="kpi__hint">
                <CommissionPct commission={result.totals.commissionCents} base={result.totals.amountCents} /> do valor
                das reservas
              </small>
            )}
          </div>
          <div className="kpi">
            <span>Custos e taxas</span>
            <strong>{formatMoney(result.totals.costsCents)}</strong>
          </div>
          <div className="kpi kpi--dark">
            <span>Total geral</span>
            <strong>{formatMoney(result.totals.netCents)}</strong>
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
          <div className="panel__filter panel__filter--wide">
            <Segmented<Filter>
              ariaLabel="Filtrar por status"
              value={filter}
              onChange={(v) => {
                setFilter(v)
                setPage(1)
              }}
              options={[{ value: 'ALL', label: 'Todas' }, ...STATUS_OPTIONS]}
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
              <CalendarRange strokeWidth={1.6} />
            </span>
            {hasFilters ? (
              <p>Nenhuma reserva encontrada com esses filtros.</p>
            ) : (
              <>
                <p>Nenhuma reserva cadastrada ainda.</p>
                <button type="button" className="ui-btn ui-btn--primary" onClick={openNew}>
                  <Plus strokeWidth={2.2} />
                  Cadastrar a primeira
                </button>
              </>
            )}
          </div>
        ) : (
          <div className={`table-wrap ${loading && result ? 'is-refreshing' : ''}`}>
            <table className="table table--reservations">
              <thead>
                <tr>
                  <th>Reserva</th>
                  <th>Hóspede</th>
                  <th>Imóvel</th>
                  <th>Período</th>
                  <th>Status</th>
                  <th className="num">Valor</th>
                  <th className="num">Total geral</th>
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
                  : result?.data.map((r, i) => (
                      <tr
                        key={r.id}
                        className={`table__row ${openingId === r.id ? 'is-opening' : ''} ${r.status === 'CANCELADO' ? 'is-cancelled' : ''}`}
                        style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}
                        onClick={() => openView(r)}
                      >
                        <td data-label="Reserva" className="res-number">
                          <span className="doc-cell">
                            <span className="guest-form__mono">
                              {r.reservationNumber}
                              {r.attachmentsCount > 0 && (
                                <Paperclip
                                  className="res-clip"
                                  strokeWidth={2}
                                  aria-label={`${r.attachmentsCount} anexo(s)`}
                                />
                              )}
                            </span>
                            {r.platform && <small>{PLATFORM_LABEL[r.platform]}</small>}
                          </span>
                        </td>
                        <td data-label="Hóspede">
                          <span className="res-guest">
                            <span>{r.mainGuest?.fullName ?? <span style={{ color: 'var(--gray-500)' }}>Sem hóspede</span>}</span>
                            {r.guestsCount > 1 && <small>+{r.guestsCount - 1}</small>}
                          </span>
                        </td>
                        <td data-label="Imóvel">{r.propertyName}</td>
                        <td data-label="Período" className="nowrap">
                          <span className="doc-cell">
                            <span>
                              {formatDateShort(r.checkIn)} → {formatDateShort(r.finalCheckOut)}
                            </span>
                            <small>
                              {r.totalNights} {r.totalNights === 1 ? 'noite' : 'noites'}
                              {r.extensionsCount > 0 && (
                                <span className="res-ext-badge" title={`Check-out original: ${formatDateShort(r.checkOut)}`}>
                                  +{r.totalNights - r.nights} ext.
                                </span>
                              )}{' '}
                              · {r.checkIn.slice(0, 4)}
                            </small>
                          </span>
                        </td>
                        <td data-label="Status">
                          <span className={`status status--${r.status.toLowerCase()}`}>{STATUS_LABEL[r.status]}</span>
                        </td>
                        <td data-label="Valor" className="num guest-form__mono">
                          {formatMoney(r.grossCents)}
                        </td>
                        <td data-label="Total geral" className="num guest-form__mono res-net">
                          {formatMoney(r.netCents)}
                        </td>
                        <td className="table__actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => openView(r)}
                            aria-label={`Visualizar reserva ${r.reservationNumber}`}
                            title="Visualizar"
                          >
                            <Eye strokeWidth={1.8} />
                          </button>
                          {r.status !== 'CANCELADO' && (
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => openExtend(r)}
                            aria-label={`Estender hospedagem da reserva ${r.reservationNumber}`}
                            title="Estender hospedagem"
                          >
                            <CalendarPlus strokeWidth={1.8} />
                          </button>
                          )}
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => openEdit(r)}
                            aria-label={`Editar reserva ${r.reservationNumber}`}
                            title="Editar"
                          >
                            <Pencil strokeWidth={1.8} />
                          </button>
                          {/* A avaliação é do hóspede: sem hóspede vinculado não há o que avaliar */}
                          {r.mainGuest && r.status !== 'CANCELADO' && (
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={() => navigate(`/avaliacoes?reserva=${r.id}`)}
                              aria-label={`Avaliar hospedagem da reserva ${r.reservationNumber}`}
                              title="Avaliar hospedagem"
                            >
                              <Star strokeWidth={1.8} />
                            </button>
                          )}
                          {r.status !== 'CANCELADO' && (
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => setReleasing(r)}
                            aria-label={`Liberar reserva ${r.reservationNumber} para associados`}
                            title="Liberar para associados"
                          >
                            <UserCheck strokeWidth={1.8} />
                          </button>
                          )}
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => handleCancel(r)}
                            aria-label={`${r.status === 'CANCELADO' ? 'Reativar' : 'Cancelar'} reserva ${r.reservationNumber}`}
                            title={r.status === 'CANCELADO' ? 'Reativar reserva' : 'Cancelar reserva'}
                          >
                            {r.status === 'CANCELADO' ? <RotateCcw strokeWidth={1.8} /> : <Ban strokeWidth={1.8} />}
                          </button>
                          <button
                            type="button"
                            className="icon-btn icon-btn--danger"
                            onClick={() => handleDelete(r)}
                            aria-label={`Excluir reserva ${r.reservationNumber}`}
                            title="Excluir"
                          >
                            <Trash2 strokeWidth={1.8} />
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

      <ReservationFormModal
        key={formKey}
        open={formOpen}
        reservation={editing}
        startExtending={extending}
        prefill={editing ? undefined : prefill}
        onClose={() => {
          setFormOpen(false)
          setPendingLink(null)
        }}
        onSaved={handleSaved}
      />
      <ReservationViewModal
        reservation={viewing}
        onClose={() => setViewing(null)}
        onEdit={(r) => openEdit(r)}
        onExtend={openExtend}
      />

      <ReservationAccessModal
        key={releasing?.id ?? 'none'}
        reservation={releasing}
        onClose={() => setReleasing(null)}
        onNotify={showToast}
      />

      <div className={`toast ${toast ? 'is-visible' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  )
}
