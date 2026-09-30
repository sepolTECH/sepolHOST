import { AlertTriangle, CalendarDays, CheckCircle2, Link2, RefreshCw, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { calendarApi, type CalendarData, type CalendarEvent, type Platform } from '../../services/api'
import { addDaysIso, todayIso } from '../../utils/money'
import '../Finance/Finance.css'
import '../Guests/Guests.css'
import { MonthPicker } from '../Finance/MonthPicker'
import { useMonthParam } from '../Finance/month'
import { PLATFORM_LABEL } from '../Reservations/options'
import '../Reservations/Reservations.css'
import './Calendar.css'
import { EventModal } from './EventModal'
import { FeedsModal } from './FeedsModal'
import { eventTitle, formatDayLong, monthWeeks, textOn, WEEKDAYS, weekSegments, type Segment } from './calendar'

const LANE_HEIGHT = 26
const NO_PROPERTY = '__sem_imovel__'
type LinkFilter = 'ALL' | 'LINKED' | 'UNLINKED'

/** Para busca sem acento e sem maiúsculas. */
const normalize = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Estilo da barra: cor do calendário de origem. */
function barStyle(e: CalendarEvent): CSSProperties {
  const color = e.color
  return e.kind === 'BLOQUEIO'
    ? ({ '--bar-color': color } as CSSProperties)
    : ({ '--bar-color': color, background: color, color: textOn(color) } as CSSProperties)
}

export function Calendar() {
  const monthParam = useMonthParam()
  const { year, month } = monthParam
  const { weeks, first, last, gridStart, gridEnd, daysInMonth } = useMemo(() => monthWeeks(year, month), [year, month])
  const today = todayIso()

  const [data, setData] = useState<CalendarData | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const refreshRef = useRef(false)
  const queryKey = `${gridStart}|${gridEnd}|${reloadKey}`
  const [loaded, setLoaded] = useState({ key: '', error: '' })
  const loading = loaded.key !== queryKey
  const error = loading ? '' : loaded.error

  // ---------- Filtros ----------
  const [showBlocks, setShowBlocks] = useState(true)
  const [property, setProperty] = useState('') // '' = todos | NO_PROPERTY = sem imóvel definido
  const [hiddenPlatforms, setHiddenPlatforms] = useState<Platform[]>([])
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('ALL')
  const [search, setSearch] = useState('')
  // guarda só o id: depois de vincular/desvincular, a marcação é relida da resposta nova
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = data?.events.find((e) => e.id === selectedId) ?? null
  const setSelected = (e: CalendarEvent | null) => setSelectedId(e?.id ?? null)
  const [feedsOpen, setFeedsOpen] = useState(false)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<number>(undefined)

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 3200)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const refresh = refreshRef.current
    refreshRef.current = false
    calendarApi
      .events(gridStart, gridEnd, refresh, controller.signal)
      .then((d) => {
        setData(d)
        setLoaded({ key: queryKey, error: '' })
        if (refresh) {
          const failed = d.feeds.filter((f) => f.error).length
          showToast(failed ? `Sincronizado — ${failed} link(s) com erro` : 'Calendários sincronizados')
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) setLoaded({ key: queryKey, error: err.message ?? 'Erro ao carregar o calendário' })
      })
    return () => controller.abort()
  }, [gridStart, gridEnd, queryKey, showToast])

  function sync() {
    refreshRef.current = true
    setReloadKey((k) => k + 1)
  }

  const properties = useMemo(() => {
    const set = new Set<string>()
    data?.feeds.forEach((f) => f.propertyName && set.add(f.propertyName))
    data?.events.forEach((e) => e.propertyName && set.add(e.propertyName))
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [data])
  const hasNoProperty = data?.events.some((e) => !e.propertyName) ?? false

  // Plataformas dos links cadastrados (na ordem dos links), com a cor do primeiro link de cada uma
  const platforms = useMemo(() => {
    const map = new Map<Platform, { platform: Platform; color: string; count: number }>()
    data?.feeds.forEach((f) => map.has(f.platform) || map.set(f.platform, { platform: f.platform, color: f.color, count: 0 }))
    data?.events.forEach((e) => {
      if (e.start <= last && e.end > first) {
        const p = map.get(e.platform)
        if (p) p.count++
      }
    })
    return [...map.values()]
  }, [data, first, last])

  const term = normalize(search.trim())
  const visible = useMemo(
    () =>
      (data?.events ?? []).filter(
        (e) =>
          (showBlocks || e.kind !== 'BLOQUEIO') &&
          !hiddenPlatforms.includes(e.platform) &&
          (!property || (property === NO_PROPERTY ? !e.propertyName : e.propertyName === property)) &&
          (linkFilter === 'ALL' || (linkFilter === 'LINKED' ? !!e.reservation : e.kind === 'RESERVA' && !e.reservation)) &&
          (!term ||
            [e.guestName, e.reservationCode, e.reservation?.reservationNumber, e.reservation?.guest?.fullName, e.feedName]
              .some((v) => v && normalize(v).includes(term))),
      ),
    [data, showBlocks, hiddenPlatforms, property, linkFilter, term],
  )

  const activeFilters =
    (showBlocks ? 0 : 1) + hiddenPlatforms.length + (property ? 1 : 0) + (linkFilter !== 'ALL' ? 1 : 0) + (term ? 1 : 0)

  function togglePlatform(p: Platform) {
    setHiddenPlatforms((list) => {
      if (list.includes(p)) return list.filter((x) => x !== p)
      // não deixa esconder todas: clicar na última visível mostra só ela de novo
      const next = [...list, p]
      return next.length >= platforms.length ? [] : next
    })
  }

  /** Clique com Alt/duplo clique: mostra só esta plataforma. */
  function onlyPlatform(p: Platform) {
    setHiddenPlatforms(platforms.map((x) => x.platform).filter((x) => x !== p))
  }

  function clearFilters() {
    setShowBlocks(true)
    setHiddenPlatforms([])
    setProperty('')
    setLinkFilter('ALL')
    setSearch('')
  }

  const layout = useMemo(() => weeks.map((week) => ({ week, ...weekSegments(week, visible) })), [weeks, visible])

  // Noites do mês: ocupada (reserva) / bloqueada / livre
  const stats = useMemo(() => {
    let reserved = 0
    let blocked = 0
    const nights = new Map<string, 'R' | 'B'>()
    for (let d = first; d <= last; d = addDaysIso(d, 1)) {
      const covering = visible.filter((e) => e.start <= d && e.end > d)
      if (covering.some((e) => e.kind === 'RESERVA')) {
        reserved++
        nights.set(d, 'R')
      } else if (covering.length) {
        blocked++
        nights.set(d, 'B')
      }
    }
    const checkIns = visible.filter((e) => e.kind === 'RESERVA' && e.start >= first && e.start <= last).length
    return { reserved, blocked, free: daysInMonth - reserved - blocked, checkIns, nights }
  }, [visible, first, last, daysInMonth])

  const monthEvents = useMemo(
    () => visible.filter((e) => e.start <= last && e.end > first).sort((a, b) => a.start.localeCompare(b.start)),
    [visible, first, last],
  )

  const feeds = data?.feeds ?? []
  const hasBlocks = data?.events.some((e) => e.kind === 'BLOQUEIO') ?? false
  const syncing = loading && !!data
  const lastSync = feeds.length
    ? new Date(Math.min(...feeds.map((f) => Date.parse(f.syncedAt)))).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <div className="guests calendar">
      <header className="page-header">
        <div>
          <p className="page-header__crumb">Consulta</p>
          <h1 className="page-header__title">Calendário</h1>
          <p className="page-header__subtitle">
            Todas as plataformas em um só lugar: veja os dias livres, ocupados e por onde cada reserva veio.
          </p>
        </div>
        <div className="calendar__actions">
          <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setFeedsOpen(true)}>
            <Link2 strokeWidth={1.8} />
            Plataformas{feeds.length ? ` (${feeds.length})` : ''}
          </button>
          <button type="button" className="ui-btn ui-btn--primary" onClick={sync} disabled={loading || !feeds.length}>
            <RefreshCw strokeWidth={2} className={syncing ? 'calendar__spin' : ''} />
            Sincronizar
          </button>
        </div>
      </header>

      {data && feeds.length === 0 ? (
        <section className="panel">
          <div className="panel__state">
            <span className="panel__state-icon">
              <CalendarDays strokeWidth={1.6} />
            </span>
            <p>
              Adicione o link do calendário (iCal) de cada plataforma onde o imóvel está anunciado
              <br />
              para ver todas as reservas juntas aqui.
            </p>
            <button type="button" className="ui-btn ui-btn--primary" onClick={() => setFeedsOpen(true)}>
              <Link2 strokeWidth={1.8} />
              Adicionar plataforma
            </button>
          </div>
        </section>
      ) : (
        <>
          <div className="kpis kpis--4">
            <div className="kpi">
              <span>Noites ocupadas{activeFilters ? ' (filtro)' : ''}</span>
              <strong>{data ? stats.reserved : '—'}</strong>
              {data && stats.blocked > 0 && <small className="kpi__hint">+ {stats.blocked} bloqueada(s)</small>}
            </div>
            <div className="kpi">
              <span>Noites livres</span>
              <strong>{data ? stats.free : '—'}</strong>
            </div>
            <div className="kpi">
              <span>Entradas no mês</span>
              <strong>{data ? stats.checkIns : '—'}</strong>
            </div>
            <div className="kpi kpi--dark">
              <span>Ocupação do mês{activeFilters ? ' (filtro)' : ''}</span>
              <strong>{data ? `${Math.round((stats.reserved / daysInMonth) * 100)}%` : '—'}</strong>
            </div>
          </div>

          <section className="panel">
            <div className="panel__toolbar calendar__toolbar">
              <MonthPicker {...monthParam} />
              {platforms.length > 1 && (
                <div className="calendar__platforms" role="group" aria-label="Plataformas">
                  {platforms.map((p) => {
                    const on = !hiddenPlatforms.includes(p.platform)
                    return (
                      <button
                        key={p.platform}
                        type="button"
                        className={`calendar__chip ${on ? 'is-on' : ''}`}
                        aria-pressed={on}
                        onClick={(ev) => (ev.altKey ? onlyPlatform(p.platform) : togglePlatform(p.platform))}
                        onDoubleClick={() => onlyPlatform(p.platform)}
                        title="Clique para mostrar/ocultar · duplo clique para ver só esta"
                      >
                        <span className="calendar__dot" style={{ background: p.color }} aria-hidden />
                        {PLATFORM_LABEL[p.platform]}
                        <small>{p.count}</small>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="calendar__filterbar">
              <div className="ui-input-icon calendar__search">
                <Search aria-hidden />
                <input
                  className="ui-input"
                  type="search"
                  placeholder="Buscar hóspede ou código da reserva"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Buscar no calendário"
                />
              </div>
              {(properties.length > 1 || (properties.length === 1 && hasNoProperty)) && (
                <select
                  className={`ui-input ui-select calendar__select ${property ? 'is-active' : ''}`}
                  value={property}
                  onChange={(e) => setProperty(e.target.value)}
                  aria-label="Imóvel"
                >
                  <option value="">Todos os imóveis</option>
                  {properties.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                  {hasNoProperty && <option value={NO_PROPERTY}>Sem imóvel definido</option>}
                </select>
              )}
              <select
                className={`ui-input ui-select calendar__select ${linkFilter !== 'ALL' ? 'is-active' : ''}`}
                value={linkFilter}
                onChange={(e) => setLinkFilter(e.target.value as LinkFilter)}
                aria-label="Vínculo com o cadastro"
              >
                <option value="ALL">Todas as marcações</option>
                <option value="LINKED">Com reserva vinculada</option>
                <option value="UNLINKED">Sem reserva vinculada</option>
              </select>
              {hasBlocks && (
                <button
                  type="button"
                  className={`calendar__chip ${showBlocks ? 'is-on' : ''}`}
                  aria-pressed={showBlocks}
                  onClick={() => setShowBlocks((v) => !v)}
                >
                  <span className="calendar__chip-swatch calendar__chip-swatch--hatch" aria-hidden />
                  Bloqueios
                </button>
              )}
              {activeFilters > 0 && (
                <button type="button" className="calendar__clear" onClick={clearFilters}>
                  <X strokeWidth={2} aria-hidden />
                  Limpar filtros ({activeFilters})
                </button>
              )}
            </div>

            {/* Legenda: um item por link + situação da sincronização */}
            {feeds.length > 0 && (
              <div className="calendar__legend">
                {feeds.map((f) => (
                  <span key={f.id} className={`calendar__legend-item ${f.error ? 'has-error' : ''}`} title={f.error ?? undefined}>
                    <span className="calendar__dot" style={{ background: f.color }} aria-hidden />
                    {f.name}
                    {f.name !== PLATFORM_LABEL[f.platform] && <small>{PLATFORM_LABEL[f.platform]}</small>}
                    {f.error ? (
                      <AlertTriangle className="calendar__legend-status" strokeWidth={2} aria-label={`Erro: ${f.error}`} />
                    ) : (
                      <CheckCircle2 className="calendar__legend-status" strokeWidth={2} aria-label="Sincronizado" />
                    )}
                  </span>
                ))}
                {lastSync && <span className="calendar__legend-sync">Atualizado às {lastSync}</span>}
              </div>
            )}

            {error ? (
              <div className="panel__state">
                <p>{error}</p>
                <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setReloadKey((k) => k + 1)}>
                  Tentar novamente
                </button>
              </div>
            ) : (
              <div className={`cal ${loading ? 'is-refreshing' : ''}`} role="grid" aria-label="Calendário do mês">
                <div className="cal__head" role="row">
                  {WEEKDAYS.map((w) => (
                    <span key={w} role="columnheader">
                      {w}
                    </span>
                  ))}
                </div>
                {layout.map(({ week, segments, lanes }) => (
                  <div
                    key={week[0]}
                    className="cal__week"
                    role="row"
                    style={{ '--lanes': Math.max(lanes, 1), '--lane-h': `${LANE_HEIGHT}px` } as CSSProperties}
                  >
                    {week.map((day) => {
                      const night = stats.nights.get(day)
                      const outside = day < first || day > last
                      return (
                        <div
                          key={day}
                          role="gridcell"
                          className={[
                            'cal__day',
                            outside && 'is-outside',
                            day < today && 'is-past',
                            day === today && 'is-today',
                            night === 'R' && 'is-reserved',
                            night === 'B' && 'is-blocked',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          aria-label={`${formatDayLong(day)}${night === 'R' ? ' — ocupado' : night === 'B' ? ' — bloqueado' : outside ? '' : ' — livre'}`}
                        >
                          <span className="cal__num">{Number(day.slice(8))}</span>
                        </div>
                      )
                    })}
                    <div className="cal__bars">
                      {segments.map((s) => (
                        <Bar key={`${s.event.id}-${week[0]}`} segment={s} onOpen={setSelected} />
                      ))}
                    </div>
                  </div>
                ))}
                {!data && loading && (
                  <div className="cal__loading">
                    <span className="spinner spinner--lg" />
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Lista do mês (mais prática no celular) */}
          {data && (
            <section className="panel calendar__agenda">
              <header className="calendar__agenda-head">
                <h2>Neste mês</h2>
                <span>{monthEvents.length
                    ? `${monthEvents.length} marcação(ões)`
                    : activeFilters
                      ? 'Nenhuma marcação com esses filtros'
                      : 'Nenhuma marcação — tudo livre'}</span>
              </header>
              {monthEvents.length > 0 && (
                <ul className="calendar__agenda-list">
                  {monthEvents.map((e) => (
                    <li key={e.id}>
                      <button type="button" className="calendar__agenda-item" onClick={() => setSelected(e)}>
                        <span
                          className={`calendar__agenda-bar ${e.kind === 'BLOQUEIO' ? 'is-block' : ''}`}
                          style={{ '--bar-color': e.color } as CSSProperties}
                          aria-hidden
                        />
                        <span className="calendar__agenda-main">
                          <strong>
                            {eventTitle(e)}
                            {e.kind === 'RESERVA' && !e.reservation && (
                              <span className="calendar__unlinked">Sem reserva vinculada</span>
                            )}
                          </strong>
                          <small>
                            {sourceLabel(e)}
                            {e.propertyName && properties.length > 1 ? ` · ${e.propertyName}` : ''}
                          </small>
                        </span>
                        <span className="calendar__agenda-dates">
                          {formatDayLong(e.start)} → {formatDayLong(e.end)}
                          <small>
                            {e.nights} {e.nights === 1 ? 'noite' : 'noites'}
                          </small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      <EventModal
        event={selected}
        onClose={() => setSelected(null)}
        onLinkChanged={(message) => {
          showToast(message)
          setReloadKey((k) => k + 1)
        }}
      />

      <FeedsModal
        open={feedsOpen}
        onClose={() => setFeedsOpen(false)}
        propertySuggestions={properties}
        onChanged={(message) => {
          showToast(message)
          refreshRef.current = true
          setReloadKey((k) => k + 1)
        }}
      />

      <div className={`toast ${toast ? 'is-visible' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  )
}

/** "Airbnb" ou "Airbnb — Apto 101 · Airbnb" (sem repetir quando o nome é a própria plataforma). */
function sourceLabel(e: CalendarEvent) {
  const platform = PLATFORM_LABEL[e.platform]
  return e.feedName === platform ? platform : `${e.feedName} · ${platform}`
}

function Bar({ segment: s, onOpen }: { segment: Segment; onOpen: (e: CalendarEvent) => void }) {
  const e = s.event
  const title = eventTitle(e)
  const source = PLATFORM_LABEL[e.platform]
  const style: CSSProperties = {
    ...barStyle(e),
    left: `calc(${s.left * 100}% + 2px)`,
    width: `calc(${(s.right - s.left) * 100}% - 4px)`,
    top: `calc(${s.lane} * var(--lane-h))`,
  }
  return (
    <button
      type="button"
      className={[
        'cal__bar',
        e.kind === 'BLOQUEIO' && 'cal__bar--block',
        e.kind === 'RESERVA' && !e.reservation && 'is-unlinked',
        s.isStart && 'is-start',
        s.isEnd && 'is-end',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      onClick={() => onOpen(e)}
      title={`${title} — ${source} · ${formatDayLong(e.start)} → ${formatDayLong(e.end)}`}
    >
      {/* o nome aparece no começo da barra (e repete no início de cada semana) */}
      <span className="cal__bar-text">
        {title}
        <small>{source}</small>
      </span>
    </button>
  )
}
