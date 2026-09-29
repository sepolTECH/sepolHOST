import { ArrowDownRight, ArrowUpRight, CalendarRange, Calculator, Info, Landmark, Percent, Save, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CommissionPct } from '../../components/ui/CommissionPct'
import { Segmented } from '../../components/ui/Segmented'
import {
  ApiError,
  financeApi,
  type ClosingCostStay,
  type ClosingMonth,
  type ClosingSettings,
  type ClosingStay,
} from '../../services/api'
import {
  centsFromInput,
  commissionPercent,
  formatDateShort,
  formatMoney,
  formatPercent,
  parsePercent,
} from '../../utils/money'
import { PLATFORM_LABEL } from '../Reservations/options'
import '../Guests/Guests.css'
import '../Reservations/Reservations.css'
import './Closing.css'
import { EXPENSE_CATEGORY } from './expenses'
import { ExpensesPanel } from './ExpensesPanel'
import './Finance.css'
import { MONTHS, monthQuery, useMonthParam } from './month'
import { MonthPicker } from './MonthPicker'

const lower = (m: number) => MONTHS[m - 1].toLowerCase()
const percent = (n: number) => `${formatPercent(Math.round(n * 1000) / 10)}%`

function variation(current: number, previous: number) {
  if (!previous) return null
  return (current - previous) / Math.abs(previous)
}

const ADMIN_BASE_LABEL = { GROSS: 'valor bruto', NET: 'resultado do relatório' } as const

/**
 * Finanças → Fechamento do mês ("ponta do lápis").
 * Regime de caixa: a hospedagem inteira entra no mês em que o dinheiro cai (mês seguinte ao
 * check-out final), sem quebrar datas. Aqui saem as despesas do mês, a taxa de administração
 * (opcional) e o carnê-leão, chegando ao líquido final em mãos.
 */
export function Closing() {
  const navigate = useNavigate()
  const picker = useMonthParam()
  const { year, month } = picker

  const [reloadKey, setReloadKey] = useState(0)
  const queryKey = `${year}-${month}|${reloadKey}`
  const [loaded, setLoaded] = useState<{ key: string; data: ClosingMonth | null; error: string }>({
    key: '',
    data: null,
    error: '',
  })
  const loading = loaded.key !== queryKey
  const data = loaded.data
  const error = loading ? '' : loaded.error

  useEffect(() => {
    const controller = new AbortController()
    financeApi
      .closing(year, month, controller.signal)
      .then((result) => setLoaded({ key: queryKey, data: result, error: '' }))
      .catch((err) => {
        if (!controller.signal.aborted)
          setLoaded((l) => ({ key: queryKey, data: l.data, error: err.message ?? 'Erro ao carregar o fechamento' }))
      })
    return () => controller.abort()
  }, [year, month, queryKey])

  const [toast, setToast] = useState('')
  const toastTimer = useRef<number>(undefined)
  const showToast = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 3200)
  }, [])

  const t = data?.totals
  const monthLabel = `${MONTHS[month - 1]} de ${year}`

  return (
    <div className="guests finance closing">
      <header className="page-header">
        <div>
          <p className="page-header__crumb">Finanças</p>
          <h1 className="page-header__title">Fechamento do mês</h1>
          <p className="page-header__subtitle">
            Na ponta do lápis: o que realmente cai em mãos, já sem despesas, taxa de administração e carnê-leão.
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
      ) : !data || !t ? (
        <div className="finance__loading">
          <span className="spinner spinner--lg" aria-label="Carregando fechamento" />
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

          <p className="closing__cash-note">
            <CalendarRange strokeWidth={1.8} aria-hidden />
            <span>
              Em <strong>{lower(data.period.month)}</strong> entra o valor da locação das hospedagens com check-out final
              em{' '}
              <strong>
                {lower(data.reference.month)} de {data.reference.year}
              </strong>{' '}
              (o repasse cai no mês seguinte) e saem os custos das hospedagens com check-out em{' '}
              <strong>{lower(data.period.month)}</strong>.
            </span>
          </p>

          {/* ---------- Totais ---------- */}
          <div className="kpis finance__kpis finance__kpis--7" key={`${data.period.year}-${data.period.month}`}>
            <div className="kpi">
              <span>Recebido (bruto)</span>
              <strong>{formatMoney(t.grossCents)}</strong>
              <small className="kpi__hint">
                {t.reservations} {t.reservations === 1 ? 'hospedagem' : 'hospedagens'}
              </small>
            </div>
            <div className="kpi">
              <span>Comissões</span>
              <strong>{formatMoney(t.commissionCents)}</strong>
              <small className="kpi__hint">
                {t.commissionCents > 0 && (
                  <>
                    <CommissionPct commission={t.commissionCents} base={t.grossCents} /> do bruto ·{' '}
                  </>
                )}
                das {t.reservations} {t.reservations === 1 ? 'hospedagem recebida' : 'hospedagens recebidas'}
              </small>
            </div>
            <div className="kpi">
              <span>Custos</span>
              <strong>{formatMoney(t.costsCents)}</strong>
              <small className="kpi__hint">
                {t.costReservations} {t.costReservations === 1 ? 'check-out' : 'check-outs'} em {lower(data.period.month)}
              </small>
            </div>
            <div className="kpi">
              <span>Despesas do mês</span>
              <strong>{formatMoney(t.expensesCents)}</strong>
              <small className="kpi__hint">
                {data.expenses.length} {data.expenses.length === 1 ? 'lançamento' : 'lançamentos'}
              </small>
            </div>
            <div className="kpi">
              <span>Taxa de administração</span>
              <strong>{formatMoney(t.adminFeeCents)}</strong>
              <small className="kpi__hint">
                {data.settings.adminFee.enabled
                  ? `${formatPercent(data.settings.adminFee.percent)}% sobre o ${ADMIN_BASE_LABEL[data.settings.adminFee.base]}`
                  : 'não cobrada'}
              </small>
            </div>
            <div className="kpi">
              <span>Carnê-leão</span>
              <strong>{formatMoney(t.taxCents)}</strong>
              <small className="kpi__hint">
                {data.tax
                  ? data.tax.taxCents
                    ? `DARF até o fim de ${lower(data.tax.due.month)}`
                    : 'isento neste mês'
                  : 'não calculado'}
              </small>
            </div>
            <div className={`kpi kpi--dark ${t.finalCents < 0 ? 'is-negative' : ''}`}>
              <span>Líquido final</span>
              <strong>{formatMoney(t.finalCents)}</strong>
              <Trend value={variation(t.finalCents, data.previous.finalCents)} label={`vs. ${lower(data.previous.month)}`} />
            </div>
          </div>

          <div className="closing__grid">
            <Statement data={data} />
            <SettingsPanel
              key={`${queryKey}|${data.settings.source?.updatedAt ?? ''}`}
              data={data}
              onSaved={(result) => {
                setLoaded({ key: queryKey, data: result, error: '' })
                showToast('Configuração salva — vale a partir deste mês')
              }}
            />
          </div>

          {data.tax && <TaxPanel data={data} />}

          {/* ---------- Despesas do mês ---------- */}
          <ExpensesPanel
            year={data.period.year}
            month={data.period.month}
            monthLabel={`${lower(data.period.month)} de ${data.period.year}`}
            expenses={data.expenses}
            properties={data.properties}
            totalCents={t.expensesCents}
            onChanged={(message) => {
              showToast(message)
              setReloadKey((k) => k + 1)
            }}
          />

          {/* ---------- Por imóvel ---------- */}
          {data.byProperty.length > 0 && (
            <section className="panel">
              <h2 className="finance__panel-title">Por imóvel</h2>
              <div className="table-wrap">
                <table className="table table--finance-props table--closing-props">
                  <thead>
                    <tr>
                      <th>Imóvel</th>
                      <th className="num">Bruto</th>
                      <th className="num">Comissões</th>
                      <th className="num">Custos</th>
                      <th className="num">Despesas</th>
                      <th className="num">Taxa adm.</th>
                      <th className="num">Antes do IR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byProperty.map((p) => (
                      <tr key={p.propertyName}>
                        <td>
                          <span className="doc-cell">
                            <strong className="finance__name">{p.propertyName}</strong>
                            <small>
                              {p.reservations
                                ? `${p.reservations} ${p.reservations === 1 ? 'hospedagem recebida' : 'hospedagens recebidas'}`
                                : 'nenhum recebimento no mês'}
                            </small>
                          </span>
                        </td>
                        <td data-label="Bruto" className="num guest-form__mono">
                          {formatMoney(p.grossCents)}
                        </td>
                        <Minus label="Comissões" cents={p.commissionCents} base={p.grossCents} />
                        <Minus label="Custos" cents={p.costsCents} />
                        <Minus label="Despesas" cents={p.expensesCents} />
                        <Minus label="Taxa adm." cents={p.adminFeeCents} />
                        <td
                          data-label="Antes do IR"
                          className={`num guest-form__mono res-net ${p.resultCents < 0 ? 'finance__negative' : ''}`}
                        >
                          {formatMoney(p.resultCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {t.generalExpensesCents > 0 && (
                      <tr>
                        <td colSpan={4}>Despesas gerais (sem imóvel)</td>
                        <Minus label="Despesas gerais" cents={t.generalExpensesCents} />
                        <td />
                        <td data-label="Antes do IR" className="num guest-form__mono">
                          − {formatMoney(t.generalExpensesCents)}
                        </td>
                      </tr>
                    )}
                    {t.taxCents > 0 && (
                      <tr>
                        <td colSpan={6}>Carnê-leão (sobre todos os imóveis)</td>
                        <td data-label="Carnê-leão" className="num guest-form__mono">
                          − {formatMoney(t.taxCents)}
                        </td>
                      </tr>
                    )}
                    <tr className="closing__props-total">
                      <td colSpan={6}>Líquido final</td>
                      <td data-label="Líquido final" className="num guest-form__mono">
                        {formatMoney(t.finalCents)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}

          {/* ---------- Hospedagens recebidas (valor da locação) ---------- */}
          {data.stays.length === 0 ? (
            <section className="panel">
              <div className="panel__state">
                <span className="panel__state-icon">
                  <CalendarRange strokeWidth={1.6} />
                </span>
                <p>
                  Nenhuma hospedagem com check-out em {lower(data.reference.month)} de {data.reference.year}, então nenhum
                  valor de locação a receber em {monthLabel.toLowerCase()}.
                </p>
              </div>
            </section>
          ) : (
            <section className="panel">
              <h2 className="finance__panel-title">
                Locações recebidas em {lower(data.period.month)}
                <small>{data.stays.length}</small>
                <span className="closing__panel-sub">check-out em {lower(data.reference.month)}</span>
              </h2>
              <div className="table-wrap">
                <table className="table table--closing">
                  <thead>
                    <tr>
                      <th>Reserva</th>
                      <th>Hóspede / imóvel</th>
                      <th>Período</th>
                      <th className="num">Bruto</th>
                      <th className="num">Comissão</th>
                      <th className="num">Recebido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stays.map((r, i) => (
                      <tr
                        key={r.id}
                        className="table__row"
                        style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}
                        onClick={() => navigate(`/cadastro/reservas?reserva=${r.id}`)}
                        title="Abrir reserva"
                      >
                        <StayCells stay={r} />
                        <td data-label="Bruto" className="num guest-form__mono">
                          {formatMoney(r.grossCents)}
                          {r.extensionsCents > 0 && <small className="closing__cell-hint">com extensão</small>}
                        </td>
                        <Minus label="Comissão" cents={r.commissionCents} base={r.grossCents} />
                        <td data-label="Recebido" className="num guest-form__mono res-net">
                          {formatMoney(r.netCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>Total recebido</td>
                      <td data-label="Bruto" className="num guest-form__mono">
                        {formatMoney(t.grossCents)}
                      </td>
                      <td data-label="Comissão" className="num guest-form__mono">
                        − {formatMoney(t.commissionCents)}
                        <CommissionPct commission={t.commissionCents} base={t.grossCents} />
                      </td>
                      <td data-label="Recebido" className="num guest-form__mono">
                        {formatMoney(t.grossCents - t.commissionCents)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}

          {/* ---------- Custos das hospedagens (pagos no mês do check-out) ---------- */}
          {data.costStays.length > 0 && (
            <section className="panel">
              <h2 className="finance__panel-title">
                Custos das hospedagens
                <small>{data.costStays.length}</small>
                <span className="closing__panel-sub">check-out em {lower(data.period.month)}</span>
              </h2>
              <div className="table-wrap">
                <table className="table table--closing">
                  <thead>
                    <tr>
                      <th>Reserva</th>
                      <th>Hóspede / imóvel</th>
                      <th>Período</th>
                      <th className="num">Custos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.costStays.map((r, i) => (
                      <tr
                        key={r.id}
                        className="table__row"
                        style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}
                        onClick={() => navigate(`/cadastro/reservas?reserva=${r.id}`)}
                        title="Abrir reserva"
                      >
                        <StayCells stay={r} />
                        <Minus label="Custos" cents={r.costsCents} />
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>Total de custos</td>
                      <td data-label="Custos" className="num guest-form__mono">
                        − {formatMoney(t.costsCents)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}

          <p className="finance__note">
            <Info strokeWidth={1.8} aria-hidden />
            <span>
              Aqui as datas não são quebradas: o valor da locação (com extensões) entra inteiro no mês seguinte ao
              check-out final — check-out em 01/10 é recebido em novembro — e os custos da hospedagem (limpeza,
              reposição…) saem no mês do próprio check-out, em outubro nesse exemplo. Para ver o faturamento proporcional
              aos dias de cada mês, use o{' '}
              <Link to={`/financas/relatorio${monthQuery(year, month)}`} className="finance__link">
                Relatório financeiro
              </Link>
              . O carnê-leão é uma estimativa com a tabela mensal vigente; confira no Carnê-Leão Web ou com o seu
              contador antes de pagar o DARF.
            </span>
          </p>
        </div>
      )}

      <div className={`toast ${toast ? 'is-visible' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  )
}

/** Reserva, hóspede/imóvel e período (colunas comuns das tabelas do fechamento). */
function StayCells({ stay: r }: { stay: ClosingStay | ClosingCostStay }) {
  return (
    <>
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
            {r.nights} {r.nights === 1 ? 'noite' : 'noites'}
          </small>
        </span>
      </td>
    </>
  )
}

/** Célula de valor descontado; com `base`, mostra também a % da comissão sobre esse valor. */
function Minus({ label, cents, base }: { label: string; cents: number; base?: number }) {
  return (
    <td data-label={label} className="num guest-form__mono finance__minus">
      {cents ? `− ${formatMoney(cents)}` : '—'}
      {base !== undefined && <CommissionPct commission={cents} base={base} />}
    </td>
  )
}

function Trend({ value, label }: { value: number | null; label: string }) {
  if (value === null) return <small className="kpi__hint">sem base em {label.replace('vs. ', '')}</small>
  const up = value >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <small className={`kpi__trend ${up ? 'is-up' : 'is-down'} is-dark`}>
      <Icon strokeWidth={2} aria-hidden />
      {up ? '+' : ''}
      {Math.round(value * 100)}% {label}
    </small>
  )
}

/* =========================================================
   Demonstrativo (do bruto ao líquido final)
   ========================================================= */

function Statement({ data }: { data: ClosingMonth }) {
  const t = data.totals
  const { adminFee } = data.settings
  const rows: { label: string; hint?: string; cents: number; kind: 'in' | 'out' | 'subtotal' | 'final' }[] = [
    { label: 'Bruto das hospedagens', hint: `${t.reservations} com check-out em ${lower(data.reference.month)}`, cents: t.grossCents, kind: 'in' },
    {
      label: 'Comissões das plataformas',
      hint: `${commissionPercent(t.commissionCents, t.grossCents) ?? '0%'} do bruto · das ${t.reservations} recebidas`,
      cents: t.commissionCents,
      kind: 'out',
    },
    {
      label: 'Custos das hospedagens',
      hint: `limpeza, reposição… de ${t.costReservations} com check-out em ${lower(data.period.month)}`,
      cents: t.costsCents,
      kind: 'out',
    },
    { label: 'Resultado das hospedagens', hint: 'recebido − custos do mês, sem quebrar datas', cents: t.netCents, kind: 'subtotal' },
    { label: 'Despesas do mês', hint: 'condomínio, IPTU, contas…', cents: t.expensesCents, kind: 'out' },
    {
      label: 'Taxa de administração',
      hint: adminFee.enabled
        ? `${formatPercent(adminFee.percent)}% sobre o ${ADMIN_BASE_LABEL[adminFee.base]}`
        : 'desativada',
      cents: t.adminFeeCents,
      kind: 'out',
    },
    { label: 'Resultado antes do IR', cents: t.beforeTaxCents, kind: 'subtotal' },
    {
      label: 'Carnê-leão',
      hint: data.tax ? `alíquota efetiva ${percent(data.tax.effectiveRate)} do rendimento` : 'desativado',
      cents: t.taxCents,
      kind: 'out',
    },
    { label: 'Líquido final em mãos', cents: t.finalCents, kind: 'final' },
  ]

  return (
    <section className="panel statement">
      <h2 className="finance__panel-title">
        <Calculator strokeWidth={1.8} className="closing__title-icon" aria-hidden />
        Demonstrativo de {lower(data.period.month)}
      </h2>
      <ol className="statement__list">
        {rows.map((r) => (
          <li key={r.label} className={`statement__row statement__row--${r.kind} ${r.cents < 0 && r.kind !== 'out' ? 'is-negative' : ''}`}>
            <span className="statement__sign" aria-hidden>
              {r.kind === 'out' ? '−' : r.kind === 'in' ? '' : '='}
            </span>
            <span className="statement__label">
              {r.label}
              {r.hint && <small>{r.hint}</small>}
            </span>
            <span className="statement__value guest-form__mono">
              {r.kind === 'out' ? (r.cents ? `− ${formatMoney(r.cents)}` : '—') : formatMoney(r.cents)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

/* =========================================================
   Configuração: taxa de administração e carnê-leão
   ========================================================= */

function SettingsPanel({ data, onSaved }: { data: ClosingMonth; onSaved: (result: ClosingMonth) => void }) {
  const initial: ClosingSettings = { adminFee: data.settings.adminFee, tax: data.settings.tax }
  const [draft, setDraft] = useState<ClosingSettings>(initial)
  const [percentText, setPercentText] = useState(initial.adminFee.percent ? formatPercent(initial.adminFee.percent) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const source = data.settings.source

  const setAdmin = (patch: Partial<ClosingSettings['adminFee']>) =>
    setDraft((d) => ({ ...d, adminFee: { ...d.adminFee, ...patch } }))
  const setTax = (patch: Partial<ClosingSettings['tax']>) => setDraft((d) => ({ ...d, tax: { ...d.tax, ...patch } }))

  // Prévia da taxa com a configuração ainda não salva
  const t = data.totals
  const adminPreview = draft.adminFee.enabled
    ? Math.max(0, Math.round(((draft.adminFee.base === 'GROSS' ? t.grossCents : t.netCents) * draft.adminFee.percent) / 100))
    : 0

  async function save() {
    if (draft.adminFee.enabled && draft.adminFee.percent <= 0) {
      setError('Informe a porcentagem da taxa de administração')
      return
    }
    setSaving(true)
    setError('')
    try {
      onSaved(await financeApi.saveClosingSettings(data.period.year, data.period.month, draft))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar a configuração')
      setSaving(false)
    }
  }

  return (
    <section className="panel closing-settings">
      <h2 className="finance__panel-title">Descontos do mês</h2>

      <div className="closing-settings__body">
        {/* ----- Taxa de administração ----- */}
        <div className="closing-settings__block">
          <label className={`ui-switch ${draft.adminFee.enabled ? 'is-on' : ''}`}>
            <input
              type="checkbox"
              role="switch"
              checked={draft.adminFee.enabled}
              onChange={(e) => setAdmin({ enabled: e.target.checked })}
              disabled={saving}
            />
            <span className="ui-switch__track" aria-hidden>
              <span className="ui-switch__thumb" />
            </span>
            <span className="ui-switch__text">
              Taxa de administração
              <small>Opcional — gestão/administração do imóvel cobrada em % do mês.</small>
            </span>
          </label>

          {draft.adminFee.enabled && (
            <div className="closing-settings__fields">
              <div className="ui-field">
                <label htmlFor="admin-fee-percent">Porcentagem</label>
                <div className="ui-input-icon">
                  <Percent strokeWidth={1.8} aria-hidden />
                  <input
                    id="admin-fee-percent"
                    className="ui-input guest-form__mono"
                    inputMode="decimal"
                    placeholder="Ex.: 15"
                    value={percentText}
                    onChange={(e) => {
                      const p = parsePercent(e.target.value)
                      setPercentText(p.text)
                      setAdmin({ percent: p.value })
                      setError('')
                    }}
                    disabled={saving}
                  />
                </div>
              </div>
              <div className="ui-field ui-field--full">
                <span className="ui-field__label">Calcular sobre</span>
                <Segmented<'GROSS' | 'NET'>
                  ariaLabel="Base da taxa de administração"
                  value={draft.adminFee.base}
                  onChange={(base) => setAdmin({ base })}
                  disabled={saving}
                  options={[
                    { value: 'GROSS', label: 'Valor bruto' },
                    { value: 'NET', label: 'Resultado do relatório' },
                  ]}
                />
                <p className="ui-field__hint">
                  {draft.adminFee.base === 'GROSS'
                    ? `Bruto das hospedagens: ${formatMoney(t.grossCents)}.`
                    : `Bruto − comissões − custos das hospedagens: ${formatMoney(t.netCents)}.`}{' '}
                  Taxa: <strong>{formatMoney(adminPreview)}</strong>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ----- Carnê-leão ----- */}
        <div className="closing-settings__block">
          <label className={`ui-switch ${draft.tax.enabled ? 'is-on' : ''}`}>
            <input
              type="checkbox"
              role="switch"
              checked={draft.tax.enabled}
              onChange={(e) => setTax({ enabled: e.target.checked })}
              disabled={saving}
            />
            <span className="ui-switch__track" aria-hidden>
              <span className="ui-switch__thumb" />
            </span>
            <span className="ui-switch__text">
              Carnê-leão
              <small>IR mensal sobre aluguel recebido de pessoa física ou do exterior (Airbnb, Booking…).</small>
            </span>
          </label>

          {draft.tax.enabled && (
            <div className="closing-settings__fields">
              <div className="ui-field ui-field--full">
                <span className="ui-field__label">Rendimento declarado</span>
                <Segmented<'GROSS' | 'PAYOUT'>
                  ariaLabel="Base do rendimento"
                  value={draft.tax.incomeBase}
                  onChange={(incomeBase) => setTax({ incomeBase })}
                  disabled={saving}
                  options={[
                    { value: 'PAYOUT', label: 'Bruto − comissão' },
                    { value: 'GROSS', label: 'Bruto' },
                  ]}
                />
                <p className="ui-field__hint">
                  {draft.tax.incomeBase === 'PAYOUT'
                    ? `Valor repassado pela plataforma: ${formatMoney(t.grossCents - t.commissionCents)}.`
                    : `Valor total pago pelo hóspede: ${formatMoney(t.grossCents)}.`}
                </p>
              </div>
              <div className="ui-field ui-field--full">
                <span className="ui-field__label">Deduções pessoais</span>
                <Segmented<ClosingSettings['tax']['deductionMode']>
                  ariaLabel="Tipo de dedução"
                  value={draft.tax.deductionMode}
                  onChange={(deductionMode) => setTax({ deductionMode })}
                  disabled={saving}
                  options={[
                    { value: 'AUTO', label: 'A melhor' },
                    { value: 'LEGAL', label: 'Legais' },
                    { value: 'SIMPLIFIED', label: 'Simplificado' },
                  ]}
                />
                <p className="ui-field__hint">
                  {draft.tax.deductionMode === 'SIMPLIFIED'
                    ? 'Desconto simplificado mensal fixo (R$ 607,20).'
                    : draft.tax.deductionMode === 'LEGAL'
                      ? 'Dependentes, INSS e pensão alimentícia informados abaixo.'
                      : 'Usa o maior entre as deduções legais abaixo e o desconto simplificado.'}
                </p>
              </div>
              {draft.tax.deductionMode !== 'SIMPLIFIED' && (
                <>
                  <div className="ui-field">
                    <label htmlFor="tax-dependents">Dependentes</label>
                    <input
                      id="tax-dependents"
                      className="ui-input guest-form__mono"
                      inputMode="numeric"
                      value={String(draft.tax.dependents)}
                      onChange={(e) => setTax({ dependents: Math.min(20, Number(e.target.value.replace(/\D/g, '') || 0)) })}
                      onFocus={(e) => e.target.select()}
                      disabled={saving}
                    />
                  </div>
                  <div className="ui-field">
                    <label htmlFor="tax-inss">INSS pago no mês</label>
                    <input
                      id="tax-inss"
                      className="ui-input guest-form__mono money-input"
                      inputMode="numeric"
                      value={formatMoney(draft.tax.socialSecurityCents)}
                      onChange={(e) => setTax({ socialSecurityCents: centsFromInput(e.target.value) })}
                      onFocus={(e) => e.target.select()}
                      disabled={saving}
                    />
                  </div>
                  <div className="ui-field">
                    <label htmlFor="tax-alimony">Pensão alimentícia</label>
                    <input
                      id="tax-alimony"
                      className="ui-input guest-form__mono money-input"
                      inputMode="numeric"
                      value={formatMoney(draft.tax.alimonyCents)}
                      onChange={(e) => setTax({ alimonyCents: centsFromInput(e.target.value) })}
                      onFocus={(e) => e.target.select()}
                      disabled={saving}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="closing-settings__footer">
        <small className="closing-settings__source">
          {source
            ? source.inherited
              ? `Usando a configuração salva em ${lower(Number(source.period.slice(5, 7)))} de ${source.period.slice(0, 4)}.`
              : `Configuração deste mês${source.updatedByName ? ` · ${source.updatedByName}` : ''}.`
            : 'Configuração padrão (nada salvo ainda).'}{' '}
          Ao salvar, vale para este mês e os próximos.
        </small>
        {error && <p className="ui-field__error">{error}</p>}
        <div className="closing-settings__actions">
          {dirty && (
            <button
              type="button"
              className="ui-btn ui-btn--ghost ui-btn--sm"
              onClick={() => {
                setDraft(initial)
                setPercentText(initial.adminFee.percent ? formatPercent(initial.adminFee.percent) : '')
                setError('')
              }}
              disabled={saving}
            >
              <Undo2 strokeWidth={1.8} />
              Desfazer
            </button>
          )}
          <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={save} disabled={!dirty || saving}>
            {saving ? <span className="spinner" /> : <Save strokeWidth={1.9} />}
            Salvar e recalcular
          </button>
        </div>
      </div>
    </section>
  )
}

/* =========================================================
   Memória de cálculo do carnê-leão
   ========================================================= */

function TaxPanel({ data }: { data: ClosingMonth }) {
  const tax = data.tax!
  const bracketLabel = tax.bracket.rate ? `${formatPercent(tax.bracket.rate * 100)}% − ${formatMoney(tax.bracket.deductionCents)}` : 'faixa isenta'

  const rows: { label: string; hint?: string; value: string; kind?: 'sub' | 'total' | 'final' }[] = [
    {
      label: 'Rendimento de aluguel',
      hint: data.settings.tax.incomeBase === 'PAYOUT' ? 'bruto − comissões' : 'bruto',
      value: formatMoney(tax.incomeCents),
    },
    ...tax.deductibleExpenses.map((e) => ({
      label: `− ${e.description}`,
      hint: `${EXPENSE_CATEGORY[e.category].label}${e.propertyName ? ` · ${e.propertyName}` : ''} · dedutível`,
      value: formatMoney(e.amountCents),
      kind: 'sub' as const,
    })),
    ...(tax.adminFeeDeductionCents
      ? [{ label: '− Taxa de administração', hint: 'dedutível', value: formatMoney(tax.adminFeeDeductionCents), kind: 'sub' as const }]
      : []),
    { label: '= Rendimento tributável', value: formatMoney(tax.taxableIncomeCents), kind: 'total' },
    {
      label: tax.deductionUsed === 'SIMPLIFIED' ? '− Desconto simplificado' : '− Deduções legais',
      hint:
        tax.deductionUsed === 'SIMPLIFIED'
          ? `legais seriam ${formatMoney(tax.legalDeductionsCents)}`
          : `dependentes, INSS e pensão · simplificado seria ${formatMoney(tax.simplifiedDiscountCents)}`,
      value: formatMoney(tax.personalDeductionsCents),
      kind: 'sub',
    },
    { label: '= Base de cálculo', value: formatMoney(tax.baseCents), kind: 'total' },
    { label: 'Imposto pela tabela mensal', hint: bracketLabel, value: formatMoney(tax.tableTaxCents) },
    {
      label: '− Redução da Lei 15.270/2025',
      hint: 'rendimento tributável até R$ 5.000 fica isento; redução decrescente até R$ 7.350',
      value: formatMoney(tax.reductionCents),
      kind: 'sub',
    },
    { label: '= Carnê-leão a pagar', value: formatMoney(tax.taxCents), kind: 'final' },
  ]

  return (
    <section className="panel closing-tax">
      <div className="finance__panel-head">
        <h2 className="finance__panel-title">
          <Landmark strokeWidth={1.8} className="closing__title-icon" aria-hidden />
          Carnê-leão de {lower(data.period.month)}
        </h2>
        <span className="finance__panel-total">{formatMoney(tax.taxCents)}</span>
      </div>
      <dl className="closing-tax__list">
        {rows.map((r, i) => (
          <div key={`${r.label}-${i}`} className={`closing-tax__row ${r.kind ? `closing-tax__row--${r.kind}` : ''}`}>
            <dt>
              {r.label}
              {r.hint && <small>{r.hint}</small>}
            </dt>
            <dd className="guest-form__mono">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="closing-tax__foot">
        {tax.taxCents === 0
          ? 'Sem imposto a pagar neste mês.'
          : tax.belowMinimum
            ? 'Abaixo de R$ 10,00 não se emite DARF: o valor acumula para o próximo mês.'
            : `Pagar o DARF (código 0190) até o último dia útil de ${lower(tax.due.month)} de ${tax.due.year}.`}{' '}
        Alíquota efetiva: {percent(tax.effectiveRate)} do rendimento.
      </p>
    </section>
  )
}
