import { Search, Star, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { guestsApi, type Guest, type MainGuest } from '../../services/api'
import { DOCUMENT_LABEL, formatDocument, initials } from '../../utils/documents'
import { formatRating } from '../../utils/rating'
import { BlockedAlert } from './BlockedAlert'
import { BlockedBadge } from './BlockedBadge'
import { DependentNotice } from './DependentNotice'
import { StarDisplay } from './StarRating'

interface GuestPickerProps {
  id?: string
  value: MainGuest | null
  onChange: (guest: Guest | null) => void
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
}

/**
 * Campo de busca que seleciona um hóspede já cadastrado.
 * Teclado: ↑/↓ navega, Enter escolhe, Esc fecha.
 */
export function GuestPicker({ id, value, onChange, disabled, invalid, describedBy }: GuestPickerProps) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<{ term: string; data: Guest[] } | null>(null)
  const [active, setActive] = useState(0)

  const trimmed = term.trim()
  const loading = open && results?.term !== trimmed
  const options = results?.term === trimmed ? results.data : (results?.data ?? [])

  // Busca com atraso de 250 ms enquanto a lista está aberta
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const t = window.setTimeout(() => {
      guestsApi
        .list({ search: trimmed, pageSize: 8 }, controller.signal)
        .then((r) => {
          setResults({ term: trimmed, data: r.data })
          setActive(0)
        })
        .catch(() => {
          if (!controller.signal.aborted) setResults({ term: trimmed, data: [] })
        })
    }, 250)
    return () => {
      window.clearTimeout(t)
      controller.abort()
    }
  }, [trimmed, open])

  function choose(guest: Guest) {
    onChange(guest)
    setOpen(false)
    setTerm('')
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(i + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && options[active]) {
        e.preventDefault()
        choose(options[active])
      }
    } else if (e.key === 'Escape' && open) {
      // fecha só a lista, não o modal
      e.stopPropagation()
      e.nativeEvent.stopImmediatePropagation()
      setOpen(false)
    }
  }

  // Hóspede já escolhido: mostra um "cartão" com opção de trocar
  if (value) {
    return (
      <div className="picker-selected-wrap">
        <div className={`picker-selected ${disabled ? 'is-disabled' : ''}`} id={id} tabIndex={-1}>
          <span className="guest-avatar" aria-hidden>
            {initials(value.fullName)}
          </span>
          <span className="picker-selected__info">
            <strong>{value.fullName}</strong>
            <small>
              {DOCUMENT_LABEL[value.documentType]} {formatDocument(value.documentType, value.documentNumber)}
            </small>
          </span>
          {!disabled && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                onChange(null)
                requestAnimationFrame(() => inputRef.current?.focus())
              }}
              aria-label="Trocar hóspede responsável"
              title="Trocar"
            >
              <X strokeWidth={1.8} />
            </button>
          )}
        </div>
        <GuestInsight key={value.id} guestId={value.id} />
      </div>
    )
  }

  return (
    <div className="picker">
      <div className="ui-input-icon">
        <Search aria-hidden />
        <input
          ref={inputRef}
          id={id}
          className="ui-input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          placeholder="Busque pelo nome ou documento do hóspede"
          value={term}
          disabled={disabled}
          onChange={(e) => {
            setTerm(e.target.value)
            setOpen(true)
          }}
          // abre ao clicar/digitar (não ao receber foco, para não abrir sozinho com o modal)
          onClick={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
        />
      </div>

      {open && (
        <ul className="picker__list" id={listId} role="listbox">
          {loading && options.length === 0 ? (
            <li className="picker__empty">Buscando…</li>
          ) : options.length === 0 ? (
            <li className="picker__empty">
              Nenhum hóspede encontrado. Cadastre-o antes em <strong>Cadastro › Hóspedes</strong>.
            </li>
          ) : (
            options.map((g, i) => (
              <li
                key={g.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`picker__option ${i === active ? 'is-active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(g)}
              >
                <span className="guest-avatar" aria-hidden>
                  {initials(g.fullName)}
                </span>
                <span className="picker-selected__info">
                  <strong>{g.fullName}</strong>
                  <small>
                    {DOCUMENT_LABEL[g.documentType]} {formatDocument(g.documentType, g.documentNumber)} · {g.nationality}
                  </small>
                </span>
                <span className="picker__option-side">
                  {g.blocked && <BlockedBadge reason={g.blocked.reason} />}
                  {g.averageRating !== null && g.reviewsCount > 0 && (
                    <span className="picker__option-rating" title={`Média de ${g.reviewsCount} avaliação(ões)`}>
                      <Star strokeWidth={1.8} aria-hidden />
                      {formatRating(g.averageRating)}
                    </span>
                  )}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

/**
 * Abaixo do hóspede escolhido: média das avaliações internas, alerta se ele estiver bloqueado
 * e aviso se ele já foi cadastrado como dependente de outro hóspede (bloqueado ou não).
 * Busca o cadastro atualizado (na edição de reservas só temos nome e documento).
 */
function GuestInsight({ guestId }: { guestId: string }) {
  const [guest, setGuest] = useState<Guest | null>(null)

  useEffect(() => {
    let cancelled = false
    guestsApi
      .get(guestId)
      .then(({ guest }) => !cancelled && setGuest(guest))
      .catch(() => {}) // informativo: se falhar, simplesmente não mostra
    return () => {
      cancelled = true
    }
  }, [guestId])

  if (!guest) return null

  return (
    <>
      <div className="picker-insight">
        {guest.averageRating !== null && guest.reviewsCount > 0 ? (
          <>
            <StarDisplay value={guest.averageRating} />
            <small>
              média de {guest.reviewsCount} {guest.reviewsCount === 1 ? 'hospedagem avaliada' : 'hospedagens avaliadas'}
            </small>
          </>
        ) : (
          <small>Sem avaliações anteriores</small>
        )}
      </div>
      {guest.blocked && (
        <BlockedAlert
          block={guest.blocked}
          guestId={guest.id}
          title={`Atenção: ${guest.fullName} está bloqueado`}
          newTab
        />
      )}
      {/* Já foi dependente de alguém? Avisa (e alerta se o responsável estiver bloqueado) */}
      <DependentNotice document={guest.documentNumber} excludeMainGuestId={guest.id} newTab />
    </>
  )
}
