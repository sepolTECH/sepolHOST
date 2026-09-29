import { Star } from 'lucide-react'
import { useRef, useState, type KeyboardEvent } from 'react'
import { formatRating, RATING_LABEL } from '../../utils/rating'
import './StarRating.css'

interface StarRatingProps {
  /** 0 = sem nota. */
  value: number
  onChange: (value: number) => void
  size?: 'md' | 'lg'
  ariaLabel?: string
  ariaDescribedBy?: string
  invalid?: boolean
  disabled?: boolean
}

/**
 * Seleção de 1 a 5 estrelas (grupo de rádio acessível):
 * passa o mouse para pré-visualizar, clica para escolher, setas do teclado alteram a nota.
 */
export function StarRating({
  value,
  onChange,
  size = 'md',
  ariaLabel,
  ariaDescribedBy,
  invalid,
  disabled,
}: StarRatingProps) {
  const [hover, setHover] = useState(0)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const shown = hover || value

  function onKeyDown(e: KeyboardEvent) {
    let next: number
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(5, value + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(1, value - 1)
    else if (e.key === 'Home') next = 1
    else if (e.key === 'End') next = 5
    else return
    e.preventDefault()
    onChange(next)
    refs.current[next - 1]?.focus()
  }

  return (
    <div
      className={`stars stars--${size} ${invalid ? 'is-invalid' : ''}`}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-invalid={invalid || undefined}
      onMouseLeave={() => setHover(0)}
      onKeyDown={onKeyDown}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          ref={(el) => {
            refs.current[n - 1] = el
          }}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} ${n === 1 ? 'estrela' : 'estrelas'} — ${RATING_LABEL[n]}`}
          // Só a estrela escolhida (ou a 1ª, se não houver nota) entra no Tab
          tabIndex={(value || 1) === n ? 0 : -1}
          disabled={disabled}
          className={`stars__star ${n <= shown ? 'is-on' : ''} ${hover && n <= hover ? 'is-preview' : ''}`}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(n)}
        >
          <Star strokeWidth={1.6} />
        </button>
      ))}
      <span className="stars__label" aria-hidden>
        {shown ? RATING_LABEL[shown] : 'Sem nota'}
      </span>
    </div>
  )
}

/** Exibição (somente leitura), aceita fração: 3,7 pinta 3 estrelas e 70% da quarta. */
export function StarDisplay({ value, showValue = true, size = 'sm' }: { value: number; showValue?: boolean; size?: 'sm' | 'md' }) {
  const pct = `${Math.max(0, Math.min(5, value)) * 20}%`
  return (
    <span className={`stars-display stars-display--${size}`} role="img" aria-label={`Nota ${formatRating(value)} de 5`}>
      <span className="stars-display__track" aria-hidden>
        <span className="stars-display__row">
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} strokeWidth={1.6} />
          ))}
        </span>
        <span className="stars-display__row stars-display__row--fill" style={{ width: pct }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} strokeWidth={1.6} />
          ))}
        </span>
      </span>
      {showValue && <span className="stars-display__value">{formatRating(value)}</span>}
    </span>
  )
}
