import type { CSSProperties } from 'react'

interface Option<T extends string> {
  value: T
  label: string
}

interface SegmentedProps<T extends string> {
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  ariaLabel?: string
  id?: string
}

/** Seletor com "pílula" deslizante — usado para PF/PJ e tipo de documento. */
export function Segmented<T extends string>({ value, options, onChange, disabled, ariaLabel, id }: SegmentedProps<T>) {
  // -1 = nenhuma opção escolhida ainda (a pílula fica escondida)
  const found = options.findIndex((o) => o.value === value)
  const index = Math.max(0, found)
  const thumb: CSSProperties = {
    width: `calc((100% - 6px) / ${options.length})`,
    transform: `translateX(${index * 100}%)`,
    opacity: found === -1 ? 0 : 1,
  }

  return (
    <div className="ui-segmented" role="radiogroup" aria-label={ariaLabel} id={id}>
      <span className="ui-segmented__thumb" style={thumb} aria-hidden />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
