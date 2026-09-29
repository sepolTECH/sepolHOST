import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MONTHS, type useMonthParam } from './month'

/** Seletor de mês: anterior / mês / ano / próximo / voltar ao mês atual. */
export function MonthPicker({ year, month, isCurrent, today, goTo }: ReturnType<typeof useMonthParam>) {
  const years = Array.from({ length: 9 }, (_, i) => today.year - 6 + i)
  if (!years.includes(year)) years.push(year)
  years.sort((a, b) => a - b)

  return (
    <div className="month-picker" role="group" aria-label="Escolher mês">
      <button type="button" className="icon-btn" onClick={() => goTo(year, month - 1)} aria-label="Mês anterior" title="Mês anterior">
        <ChevronLeft strokeWidth={1.8} />
      </button>
      <select
        className="ui-input ui-select month-picker__month"
        value={month}
        onChange={(e) => goTo(year, Number(e.target.value))}
        aria-label="Mês"
      >
        {MONTHS.map((label, i) => (
          <option key={label} value={i + 1}>
            {label}
          </option>
        ))}
      </select>
      <select
        className="ui-input ui-select month-picker__year"
        value={year}
        onChange={(e) => goTo(Number(e.target.value), month)}
        aria-label="Ano"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <button type="button" className="icon-btn" onClick={() => goTo(year, month + 1)} aria-label="Próximo mês" title="Próximo mês">
        <ChevronRight strokeWidth={1.8} />
      </button>
      {!isCurrent && (
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => goTo(today.year, today.month)}>
          Mês atual
        </button>
      )}
    </div>
  )
}
