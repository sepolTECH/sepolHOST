import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Modal } from './Modal'
import { formatDate, formatDateShort, nightsBetween, todayIso } from '../../utils/money'
import './DateRangePicker.css'

const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]
const WEEKDAYS = [
  ['D', 'Domingo'],
  ['S', 'Segunda'],
  ['T', 'Terça'],
  ['Q', 'Quarta'],
  ['Q', 'Quinta'],
  ['S', 'Sexta'],
  ['S', 'Sábado'],
]

const pad = (n: number) => String(n).padStart(2, '0')
const monthKey = (y: number, m: number) => `${y}-${pad(m + 1)}`
const plural = (n: number) => `${n} ${n === 1 ? 'noite' : 'noites'}`

/** Mês (0-11) e ano somados de `delta` meses. */
function shiftMonth(y: number, m: number, delta: number) {
  const total = y * 12 + m + delta
  return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 }
}

/** Células de um mês: `null` para os espaços antes do dia 1, senão a data ISO. */
function monthCells(y: number, m: number): (string | null)[] {
  const first = new Date(Date.UTC(y, m, 1))
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const cells: (string | null)[] = Array(first.getUTCDay()).fill(null)
  for (let d = 1; d <= days; d++) cells.push(`${y}-${pad(m + 1)}-${pad(d)}`)
  return cells
}

interface DateRangePickerProps {
  checkIn: string
  checkOut: string
  onChange: (checkIn: string, checkOut: string) => void
  disabled?: boolean
  invalid?: boolean
  /** id do botão, para o foco de erro do formulário */
  id?: string
  describedBy?: string
}

/**
 * Seleção de período em um único calendário grande (estilo passagem aérea):
 * o primeiro clique marca o check-in, o segundo o check-out, e os dias entre
 * os dois ficam destacados. A escolha só vale ao confirmar.
 */
export function DateRangePicker({ checkIn, checkOut, onChange, disabled, invalid, id, describedBy }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const nights = nightsBetween(checkIn, checkOut)

  return (
    <>
      <button
        type="button"
        id={id}
        className={`range-trigger ${invalid ? 'has-error' : ''}`}
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      >
        <CalendarDays size={18} strokeWidth={1.6} className="range-trigger__icon" aria-hidden />
        <span className="range-trigger__part">
          <span className="range-trigger__label">Check-in</span>
          <span className={`range-trigger__value ${checkIn ? '' : 'is-empty'}`}>
            {checkIn ? formatDate(checkIn) : 'Selecionar'}
          </span>
        </span>
        <span className="range-trigger__arrow" aria-hidden>
          →
        </span>
        <span className="range-trigger__part">
          <span className="range-trigger__label">Check-out</span>
          <span className={`range-trigger__value ${checkOut ? '' : 'is-empty'}`}>
            {checkOut ? formatDate(checkOut) : 'Selecionar'}
          </span>
        </span>
        {nights > 0 && <span className="range-trigger__nights">{plural(nights)}</span>}
      </button>

      {open && (
        <RangeDialog
          checkIn={checkIn}
          checkOut={checkOut}
          onClose={() => setOpen(false)}
          onConfirm={(a, b) => {
            onChange(a, b)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

interface RangeDialogProps {
  checkIn: string
  checkOut: string
  onClose: () => void
  onConfirm: (checkIn: string, checkOut: string) => void
}

// Montado só enquanto aberto: o rascunho sempre começa a partir do valor salvo
function RangeDialog({ checkIn, checkOut, onClose, onConfirm }: RangeDialogProps) {
  const today = todayIso()
  const [start, setStart] = useState(checkIn)
  const [end, setEnd] = useState(checkOut)
  const [hover, setHover] = useState('')
  const [view, setView] = useState(() => {
    const [y, m] = (checkIn || today).split('-').map(Number)
    return { y, m: m - 1 }
  })

  const second = shiftMonth(view.y, view.m, 1)
  const months = useMemo(() => [view, second], [view, second.y, second.m]) // eslint-disable-line react-hooks/exhaustive-deps
  const focusDay = start || today

  function pick(iso: string) {
    if (!start || end) {
      // começa uma nova seleção
      setStart(iso)
      setEnd('')
    } else if (iso < start) {
      setStart(iso)
    } else if (iso > start) {
      setEnd(iso)
    }
    setHover('')
  }

  function clear() {
    setStart('')
    setEnd('')
    setHover('')
  }

  // Fim provisório enquanto o mouse passeia depois de escolher só o check-in
  const previewEnd = start && !end && hover > start ? hover : ''
  const rangeEnd = end || previewEnd
  const total = nightsBetween(start, rangeEnd)

  let summary = 'Clique no dia do check-in'
  if (start && !end) summary = `Check-in em ${formatDateShort(start)} — agora escolha o check-out`
  if (start && end) summary = `${formatDateShort(start)} → ${formatDateShort(end)} · ${plural(total)}`

  return (
    <Modal
      open
      onClose={onClose}
      title="Período da reserva"
      subtitle="Escolha a data de check-in e depois a de check-out."
      size="lg"
      footer={
        <>
          <p className="range__summary" aria-live="polite">
            {summary}
          </p>
          <button type="button" className="ui-btn ui-btn--ghost" onClick={clear} disabled={!start}>
            Limpar
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            disabled={!start || !end}
            onClick={() => onConfirm(start, end)}
          >
            Confirmar
          </button>
        </>
      }
    >
      <div className="range">
        <div className="range__nav">
          <button
            type="button"
            className="icon-btn"
            aria-label="Mês anterior"
            onClick={() => setView((v) => shiftMonth(v.y, v.m, -1))}
          >
            <ChevronLeft size={18} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className="range__today"
            onClick={() => {
              const [y, m] = today.split('-').map(Number)
              setView({ y, m: m - 1 })
            }}
          >
            Hoje
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Próximo mês"
            onClick={() => setView((v) => shiftMonth(v.y, v.m, 1))}
          >
            <ChevronRight size={18} strokeWidth={1.8} />
          </button>
        </div>

        <div className="range__months" onMouseLeave={() => setHover('')}>
          {months.map(({ y, m }, idx) => (
            <section key={monthKey(y, m)} className={`range__month ${idx === 1 ? 'range__month--second' : ''}`}>
              <h3 className="range__title">
                {MONTHS[m]} {y}
              </h3>
              <div className="range__weekdays" aria-hidden>
                {WEEKDAYS.map(([short], i) => (
                  <span key={i}>{short}</span>
                ))}
              </div>
              <div className="range__grid">
                {monthCells(y, m).map((iso, i) => {
                  if (!iso) return <span key={`gap-${i}`} />
                  const isStart = iso === start
                  const isEnd = iso === end
                  const inRange = !!start && !!rangeEnd && iso > start && iso < rangeEnd
                  const preview = inRange && !end
                  const cls = [
                    'range__day',
                    iso === today && 'is-today',
                    isStart && 'is-start',
                    isEnd && 'is-end',
                    isStart && rangeEnd && 'has-range',
                    inRange && 'in-range',
                    preview && 'is-preview',
                    iso === previewEnd && 'is-preview-end',
                  ]
                    .filter(Boolean)
                    .join(' ')
                  const label = `${Number(iso.slice(8))} de ${MONTHS[m].toLowerCase()} de ${y}${
                    isStart ? ', check-in' : isEnd ? ', check-out' : ''
                  }`
                  return (
                    <button
                      key={iso}
                      type="button"
                      className={cls}
                      aria-label={label}
                      aria-pressed={isStart || isEnd}
                      data-autofocus={iso === focusDay ? '' : undefined}
                      onClick={() => pick(iso)}
                      onMouseEnter={() => start && !end && setHover(iso)}
                    >
                      <span>{Number(iso.slice(8))}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </Modal>
  )
}

