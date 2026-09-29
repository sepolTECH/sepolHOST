import { ArrowDownRight, ArrowUpRight, CalendarRange, Info } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { financeApi, type FinanceMonth } from '../../services/api'
import { CommissionPct } from '../../components/ui/CommissionPct'
import { formatDateShort, formatMoney } from '../../utils/money'
import { PLATFORM_LABEL } from '../Reservations/options'
import { STATUS_LABEL } from '../Reservations/status'
import '../Guests/Guests.css'
import '../Reservations/Reservations.css'
import './Finance.css'
import { MONTHS, monthQuery, useMonthParam } from './month'
import { MonthPicker } from './MonthPicker'

const percent = (n: number) => `${Math.round(n * 100)}%`

/** Variação em relação ao mês anterior (null quando não há base de comparação). */
function variation(current: number, previous: number) {
  if (!previous) return null
  return (current - previous) / Math.abs(previous)
}

/**
 * Finanças → Relatório financeiro.
 * Só as hospedagens do mês (proporcionais às noites): bruto − comissões − custos.
 * Despesas do imóvel, taxa de administração e carnê-leão ficam no Fechamento do mês.
 */
export function Finance() {
  const navigate = useNavigate()
  const picker = useMonthParam()
  const { year, month } = picker

  const [reloadKey, setReloadKey] = useState(0)
  const queryKey = `${year}-${month}|${reloadKey}`
  const [loaded, setLoaded] = useState<{ key: string; data: FinanceMonth | null; error: string }>({
    key: '',
    data: null,
    error: '',
  })
  const loading = loaded.key !== queryKey
  // mantém os dados anteriores na tela (esmaecidos) enquanto carrega o novo mês
  const data = loaded.data
  const error = loading ? '' : loaded.error

  useEffect(() => {
    const controller = new AbortController()
    financeApi
      .month(year, month, controller.signal)
      .then((result) => setLoaded({ key: queryKey, data: result, error: '' }))
      .catch((err) => {
        if (!controller.signal.aborted)
          setLoaded((l) => ({ key: queryKey, data: l.data, error: err.message ?? 'Erro ao carregar as finanças' }))
      })
    return () => controller.abort()
  }, [year, month, queryKey])

  const t = data?.totals
  const monthLabel = `${MONTHS[month - 1]} de ${year}`
  const prevLabel = data ? `${MONTHS[data.previous.month - 1].toLowerCase()}` : ''

  return (
    <div className="guests finance">
      <header className="page-header">
        <div>
          <p className="page-header__crumb">Finanças</p>
          <h1 className="page-header__title">Relatório financeiro</h1>
          <p className="page-header__subtitle">
            Hospedagens do mês, proporcionais aos dias. Sem despesas do imóvel, taxas ou impostos.
          </p>
        </div>

        <MonthPicker {...picker} />
      </header>

      {error && !data ? (
        <section className="panel">
          <div className="panel__state">
            <p>{error}</p>
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setReloadKey((k) => k + 1)}>
              Tentar novamente
            </button>
          </div>
        </section>
      ) : !data ? (
        <div className="finance__loading">
          <span className="spinner spinner--lg" aria-label="Carregando finanças" />
        </div>
      ) : (
        <div className={`finance__body ${loading ? 'is-refreshing' : ''}`}>
          {error && (
            <p className="ui-field__error finance__error">
              {error}{' '}
              <button type="button" className="finance__link" onClick={() => setReloadKey((k) => k + 1)}>
                Tentar novamente
              </button>
            </p>
          )}

          {/* ---------- Totais do mês ---------- */}
          <div className="kpis finance__kpis finance__kpis--5" key={`${data.period.year}-${data.period.month}`}>
            <div className="kpi">
              <span>Hospedagens</span>
              <strong>{t!.reservations}</strong>
              <small className="kpi__hint">
                {t!.days} {t!.days === 1 ? 'dia' : 'dias'} no mês · {t!.nights} {t!.nights === 1 ? 'noite' : 'noites'}
              </small>
            </div>
            <div className="kpi">
              <span>Valor bruto</span>
              <strong>{formatMoney(t!.grossCents)}</strong>
              <Trend value={variation(t!.grossCents, data.previous.grossCents)} label={`vs. ${prevLabel}`} />
            </div>
            <div className="kpi">
              <span>Comissões</span>
              <strong>{formatMoney(t!.commissionCents)}</strong>
              <small className="kpi__hint">
                {t!.commissionCents ? (
                  <>
                    <CommissionPct commission={t!.commissionCents} base={t!.grossCents} /> do bruto
                  </>
                ) : (
                  '—'
                )}
              </small>
            </div>
            <div className="kpi">
              <span>Custos das hospedagens</span>
              <strong>{formatMoney(t!.costsCents)}</strong>
              <small className="kpi__hint">limpeza, reposição…</small>
            </div>
            <div className={`kpi kpi--dark ${t!.netCents < 0 ? 'is-negative' : ''}`}>
              <span>Resultado do mês</span>
              <strong>{formatMoney(t!.netCents)}</strong>
              <Trend value={variation(t!.netCents, data.previous.netCents)} label={`vs. ${prevLabel}`} dark />
            </div>
          </div>

          {/* Como o resultado é calculado */}
          <div className="finance__formula" aria-label="Cálculo do resultado">
            <span>
              <small>Bruto</small>
              {formatMoney(t!.grossCents)}
            </span>
            <b aria-hidden>−</b>
            <span>
              <small>Comissões</small>
              <span>
                {formatMoney(t!.commissionCents)}
                <CommissionPct commission={t!.commissionCents} base={t!.grossCents} />
              </span>
            </span>
            <b aria-hidden>−</b>
            <span>
              <small>Custos das hospedagens</small>
              {formatMoney(t!.costsCents)}
            </span>
            <b aria-hidden>=</b>
            <span className={`finance__formula-result ${t!.netCents < 0 ? 'is-negative' : ''}`}>
              <small>Resultado</small>
              {formatMoney(t!.netCents)}
            </span>
          </div>

          <div className="finance__minis">
            <div>
              <span>Diária média</span>
              <strong>{formatMoney(t!.averageDailyCents)}</strong>
            </div>
            <div>
              <span>Extensões no mês</span>
              <strong>{formatMoney(t!.extensionsCents)}</strong>
            </div>
            <div>
              <span>Margem (resultado ÷ bruto)</span>
              <strong>{t!.grossCents ? percent(t!.netCents / t!.grossCents) : '—'}</strong>
            </div>
            <div>
              <span>Resultado de {prevLabel}</span>
              <strong>{formatMoney(data.previous.netCents)}</strong>
            </div>
          </div>

          {/* ---------- Resultado por imóvel ---------- */}
          {data.byProperty.length > 0 && (
            <section className="panel">
              <h2 className="finance__panel-title">Resultado por imóvel</h2>
              <div className="table-wrap">
                <table className="table table--finance-props">
                  <thead>
                    <tr>
                      <th>Imóvel</th>
                      <th>Ocupação</th>
                      <th className="num">Bruto</th>
                      <th className="num">Comissões</th>
                      <th className="num">Custos</th>
                      <th className="num">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byProperty.map((p) => (
                      <tr key={p.propertyName}>
                        <td>
                          <span className="doc-cell">
                            <strong className="finance__name">{p.propertyName}</strong>
                            <small>
                              {p.reservations} {p.reservations === 1 ? 'reserva' : 'reservas'} · {p.nights}/{data.period.days}{' '}
                              noites
                            </small>
                          </span>
                        </td>
                        <td data-label="Ocupação">
                          <span className="occupancy" title={`${p.nights} de ${data.period.days} noites`}>
                            <span className="occupancy__bar">
                              <span style={{ width: percent(p.occupancy) }} />
                            </span>
                            <span className="occupancy__value">{percent(p.occupancy)}</span>
                          </span>
                        </td>
                        <td data-label="Bruto" className="num guest-form__mono">
                          {formatMoney(p.grossCents)}
                        </td>
                        <td data-label="Comissões" className="num guest-form__mono finance__minus">
                          {p.commissionCents ? `− ${formatMoney(p.commissionCents)}` : '—'}
                          <CommissionPct commission={p.commissionCents} base={p.grossCents} />
                        </td>
                        <td data-label="Custos" className="num guest-form__mono finance__minus">
                          {p.costsCents ? `− ${formatMoney(p.costsCents)}` : '—'}
                        </td>
                        <td
                          data-label="Resultado"
                          className={`num guest-form__mono res-net ${p.netCents < 0 ? 'finance__negative' : ''}`}
                        >
                          {formatMoney(p.netCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {data.data.length === 0 ? (
            <section className="panel">
              <div className="panel__state">
                <span className="panel__state-icon">
                  <CalendarRange strokeWidth={1.6} />
                </span>
                <p>Nenhuma hospedagem em {monthLabel.toLowerCase()}.</p>
              </div>
            </section>
          ) : (
            <>
              {/* ---------- Hospedagens do mês ---------- */}
              <section className="panel">
                <h2 className="finance__panel-title">
                  Hospedagens de {monthLabel.toLowerCase()}
                  <small>{data.data.length}</small>
                </h2>
                <div className="table-wrap">
                  <table className="table table--finance">
                    <thead>
                      <tr>
                        <th>Reserva</th>
                        <th>Hóspede / imóvel</th>
                        <th>Período</th>
                        <th>Status</th>
                        <th className="num">Bruto</th>
                        <th className="num">Comissão</th>
                        <th className="num">Custos</th>
                        <th className="num">Líquido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.data.map((r, i) => (
                        <tr
                          key={r.id}
                          className="table__row"
                          style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}
                          onClick={() => navigate(`/cadastro/reservas?reserva=${r.id}`)}
                          title="Abrir reserva"
                        >
                          <td data-label="Reserva" className="res-number">
                            <span className="doc-cell">
                              <span className="guest-form__mono">{r.reservationNumber}</span>
                              {r.platform && <small>{PLATFORM_LABEL[r.platform]}</small>}
                            </span>
                          </td>
                          <td data-label="Hóspede">
                            <span className="doc-cell">
                              <span className="finance__name">{r.mainGuest.fullName}</span>
                              <small>{r.propertyName}</small>
                            </span>
                          </td>
                          <td data-label="Período" className="nowrap">
                            <span className="doc-cell">
                              <span>
                                {formatDateShort(r.checkIn)} → {formatDateShort(r.finalCheckOut)}
                              </span>
                              <small>
                                {r.partial ? (
                                  <span
                                    className="finance__partial"
                                    title={`A hospedagem atravessa o mês: entram ${r.daysInMonth} de ${r.totalDays} dias (check-in e check-out contam). Total da hospedagem: ${formatMoney(r.fullGrossCents)} bruto / ${formatMoney(r.fullNetCents)} líquido.`}
                                  >
                                    {r.daysInMonth} de {r.totalDays} dias no mês
                                  </span>
                                ) : (
                                  <>
                                    {r.totalNights} {r.totalNights === 1 ? 'noite' : 'noites'}
                                  </>
                                )}
                              </small>
                            </span>
                          </td>
                          <td data-label="Status">
                            <span className={`status status--${r.status.toLowerCase()}`}>{STATUS_LABEL[r.status]}</span>
                          </td>
                          <td data-label="Bruto" className="num guest-form__mono">
                            {formatMoney(r.grossCents)}
                          </td>
                          <td data-label="Comissão" className="num guest-form__mono finance__minus">
                            {r.commissionCents ? `− ${formatMoney(r.commissionCents)}` : '—'}
                            <CommissionPct commission={r.commissionCents} base={r.grossCents} />
                          </td>
                          <td data-label="Custos" className="num guest-form__mono finance__minus">
                            {r.costsCents ? `− ${formatMoney(r.costsCents)}` : '—'}
                          </td>
                          <td data-label="Líquido" className="num guest-form__mono res-net">
                            {formatMoney(r.netCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4}>
                          Total do mês · {t!.days} {t!.days === 1 ? 'dia' : 'dias'}
                        </td>
                        <td data-label="Bruto" className="num guest-form__mono">
                          {formatMoney(t!.grossCents)}
                        </td>
                        <td data-label="Comissão" className="num guest-form__mono">
                          − {formatMoney(t!.commissionCents)}
                          <CommissionPct commission={t!.commissionCents} base={t!.grossCents} />
                        </td>
                        <td data-label="Custos" className="num guest-form__mono">
                          − {formatMoney(t!.costsCents)}
                        </td>
                        <td data-label="Líquido" className="num guest-form__mono">
                          {formatMoney(t!.netCents)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>

              <section className="panel">
                <h2 className="finance__panel-title">Por plataforma</h2>
                <div className="table-wrap">
                  <table className="table table--finance-mini">
                    <thead>
                      <tr>
                        <th>Plataforma</th>
                        <th className="num">Bruto</th>
                        <th className="num">Comissão</th>
                        <th className="num">Líquido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byPlatform.map((p) => (
                        <tr key={p.platform ?? 'sem'}>
                          <td>
                            <span className="doc-cell">
                              <strong className="finance__name">
                                {p.platform ? PLATFORM_LABEL[p.platform] : 'Não informada'}
                              </strong>
                              <small>
                                {p.reservations} {p.reservations === 1 ? 'reserva' : 'reservas'} · {p.days}{' '}
                                {p.days === 1 ? 'dia' : 'dias'}
                              </small>
                            </span>
                          </td>
                          <td data-label="Bruto" className="num guest-form__mono">
                            {formatMoney(p.grossCents)}
                          </td>
                          <td data-label="Comissão" className="num guest-form__mono finance__minus">
                            {p.commissionCents ? `− ${formatMoney(p.commissionCents)}` : '—'}
                            <CommissionPct commission={p.commissionCents} base={p.grossCents} />
                          </td>
                          <td data-label="Líquido" className="num guest-form__mono res-net">
                            {formatMoney(p.netCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          <p className="finance__note">
            <Info strokeWidth={1.8} aria-hidden />
            <span>
              Hospedagens entram proporcionais aos dias de cada mês, com check-in e check-out contando: 28/09 a 01/10
              (4 dias) entra 3/4 em setembro e 1/4 em outubro. Extensões usam o próprio valor e comissão; custos das
              hospedagens são divididos pelos dias da hospedagem inteira. Ocupação e diária média usam as noites. Despesas do imóvel, taxa de administração e carnê-leão
              ficam no{' '}
              <Link to={`/financas/fechamento${monthQuery(year, month)}`} className="finance__link">
                Fechamento do mês
              </Link>
              , que mostra o valor que realmente cai em mãos.
            </span>
          </p>
        </div>
      )}

    </div>
  )
}

function Trend({ value, label, dark }: { value: number | null; label: string; dark?: boolean }) {
  if (value === null) return <small className="kpi__hint">sem base em {label.replace('vs. ', '')}</small>
  const up = value >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <small className={`kpi__trend ${up ? 'is-up' : 'is-down'} ${dark ? 'is-dark' : ''}`}>
      <Icon strokeWidth={2} aria-hidden />
      {up ? '+' : ''}
      {Math.round(value * 100)}% {label}
    </small>
  )
}
