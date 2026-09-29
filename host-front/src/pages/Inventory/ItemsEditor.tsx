import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../../services/api'
import { centsFromInput, formatMoney } from '../../utils/money'

export interface ItemDraft {
  name: string
  quantity: number
  valueCents: number
}

export interface EditorItem extends ItemDraft {
  id: string
  totalCents: number
  /** Só na vistoria da reserva. */
  checked?: boolean
}

interface ItemsEditorProps {
  items: EditorItem[]
  onAdd: (draft: ItemDraft) => Promise<void>
  onUpdate: (id: string, draft: ItemDraft) => Promise<void>
  onRemove: (id: string) => Promise<void>
  /** Quando informado, mostra a coluna de conferência (check) — usado na vistoria da reserva. */
  onToggle?: (id: string, checked: boolean) => Promise<void>
  emptyText: string
  disabled?: boolean
}

const errorText = (err: unknown) => (err instanceof ApiError ? err.message : 'Não foi possível salvar')

/** Campo de valor em reais com máscara "caixa eletrônico" (guarda centavos). */
function MoneyInput({
  value,
  onChange,
  label,
  disabled,
}: {
  value: number
  onChange: (cents: number) => void
  label: string
  disabled?: boolean
}) {
  return (
    <input
      className="ui-input inv-input--money"
      inputMode="numeric"
      value={formatMoney(value)}
      onChange={(e) => onChange(centsFromInput(e.target.value))}
      aria-label={label}
      disabled={disabled}
    />
  )
}

/** Quantidade: só dígitos, entre 1 e 9999 (vazio enquanto digita). */
const parseQty = (text: string) => text.replace(/\D/g, '').slice(0, 4)

/**
 * Lista editável de itens (nome, quantidade, valor unitário) com linha de cadastro no topo.
 * Usada tanto no inventário do imóvel quanto na vistoria da reserva.
 */
export function ItemsEditor({ items, onAdd, onUpdate, onRemove, onToggle, emptyText, disabled }: ItemsEditorProps) {
  // ----- novo item -----
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [qty, setQty] = useState('1')
  const [value, setValue] = useState(0)
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (adding) return
    if (!name.trim()) {
      setAddError('Informe o nome do item')
      nameRef.current?.focus()
      return
    }
    setAdding(true)
    setAddError('')
    try {
      await onAdd({ name: name.trim(), quantity: Math.max(1, Number(qty) || 1), valueCents: value })
      setName('')
      setQty('1')
      setValue(0)
      nameRef.current?.focus()
    } catch (err) {
      setAddError(errorText(err))
    } finally {
      setAdding(false)
    }
  }

  // ----- edição de uma linha -----
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ name: string; qty: string; value: number }>({ name: '', qty: '1', value: 0 })
  const [rowError, setRowError] = useState('')
  const [saving, setSaving] = useState(false)

  function startEdit(item: EditorItem) {
    setEditingId(item.id)
    setDraft({ name: item.name, qty: String(item.quantity), value: item.valueCents })
    setRowError('')
    setConfirmId(null)
  }

  async function saveEdit(id: string) {
    if (saving) return
    if (!draft.name.trim()) {
      setRowError('Informe o nome do item')
      return
    }
    setSaving(true)
    setRowError('')
    try {
      await onUpdate(id, {
        name: draft.name.trim(),
        quantity: Math.max(1, Number(draft.qty) || 1),
        valueCents: draft.value,
      })
      setEditingId(null)
    } catch (err) {
      setRowError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  // ----- remoção com confirmação na própria linha -----
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  async function run(id: string, action: () => Promise<void>) {
    setBusyId(id)
    setActionError('')
    try {
      await action()
    } catch (err) {
      setActionError(errorText(err))
    } finally {
      setBusyId(null)
    }
  }

  const cols = onToggle ? 6 : 5

  return (
    <div className="inv-editor">
      <form className="inv-add" onSubmit={handleAdd} noValidate>
        <div className="ui-field inv-add__name">
          <label htmlFor="inv-add-name">Item</label>
          <input
            id="inv-add-name"
            ref={nameRef}
            className="ui-input"
            placeholder="Ex.: Toalha de banho, Micro-ondas, Cadeira"
            maxLength={120}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setAddError('')
            }}
            disabled={disabled}
          />
        </div>
        <div className="ui-field inv-add__qty">
          <label htmlFor="inv-add-qty">Qtd.</label>
          <input
            id="inv-add-qty"
            className="ui-input"
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(parseQty(e.target.value))}
            onBlur={() => setQty((q) => String(Math.max(1, Number(q) || 1)))}
            disabled={disabled}
          />
        </div>
        <div className="ui-field inv-add__value">
          <label htmlFor="inv-add-value">Valor unitário</label>
          <input
            id="inv-add-value"
            className="ui-input"
            inputMode="numeric"
            value={formatMoney(value)}
            onChange={(e) => setValue(centsFromInput(e.target.value))}
            disabled={disabled}
          />
        </div>
        <button type="submit" className="ui-btn ui-btn--primary inv-add__btn" disabled={disabled || adding}>
          <Plus aria-hidden />
          Adicionar
        </button>
        {addError && <p className="ui-field__error inv-add__error">{addError}</p>}
      </form>

      {actionError && <p className="ui-field__error inv-editor__error">{actionError}</p>}

      <div className="table-wrap">
        <table className="table table--inventory">
          <thead>
            <tr>
              {onToggle && (
                <th className="inv-col-check">
                  <span className="sr-only">Conferido</span>
                </th>
              )}
              <th>Item</th>
              <th className="num">Qtd.</th>
              <th className="num">Valor unit.</th>
              <th className="num">Total</th>
              <th className="table__actions-col">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={cols} className="inv-empty">
                  {emptyText}
                </td>
              </tr>
            )}
            {items.map((item) => {
              const editing = editingId === item.id
              const busy = busyId === item.id
              return (
                <tr key={item.id} className={item.checked ? 'is-checked' : undefined}>
                  {onToggle && (
                    <td className="inv-col-check">
                      <button
                        type="button"
                        className={`inv-check ${item.checked ? 'is-on' : ''}`}
                        role="checkbox"
                        aria-checked={!!item.checked}
                        aria-label={`${item.checked ? 'Desmarcar' : 'Conferir'} ${item.name}`}
                        onClick={() => run(item.id, () => onToggle(item.id, !item.checked))}
                        disabled={disabled || busy}
                      >
                        <Check strokeWidth={2.4} aria-hidden />
                      </button>
                    </td>
                  )}

                  {editing ? (
                    <>
                      <td>
                        <input
                          className="ui-input"
                          value={draft.name}
                          maxLength={120}
                          aria-label="Nome do item"
                          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void saveEdit(item.id)
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          data-autofocus
                        />
                        {rowError && <p className="ui-field__error">{rowError}</p>}
                      </td>
                      <td className="num">
                        <input
                          className="ui-input inv-input--qty"
                          inputMode="numeric"
                          value={draft.qty}
                          aria-label="Quantidade"
                          onChange={(e) => setDraft((d) => ({ ...d, qty: parseQty(e.target.value) }))}
                        />
                      </td>
                      <td className="num">
                        <MoneyInput
                          value={draft.value}
                          onChange={(v) => setDraft((d) => ({ ...d, value: v }))}
                          label="Valor unitário"
                        />
                      </td>
                      <td className="num inv-total">
                        {formatMoney(Math.max(1, Number(draft.qty) || 1) * draft.value)}
                      </td>
                      <td className="table__actions inv-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => saveEdit(item.id)}
                          disabled={saving}
                          aria-label="Salvar item"
                          title="Salvar"
                        >
                          <Check strokeWidth={1.8} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => setEditingId(null)}
                          aria-label="Cancelar edição"
                          title="Cancelar"
                        >
                          <X strokeWidth={1.8} />
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="inv-name">{item.name}</td>
                      <td className="num">{item.quantity}</td>
                      <td className="num">{formatMoney(item.valueCents)}</td>
                      <td className="num inv-total">{formatMoney(item.totalCents)}</td>
                      <td className="table__actions inv-actions">
                        {confirmId === item.id ? (
                          <span className="inv-confirm">
                            <button
                              type="button"
                              className="inv-confirm__yes"
                              onClick={() => run(item.id, () => onRemove(item.id)).then(() => setConfirmId(null))}
                              disabled={busy}
                            >
                              Remover
                            </button>
                            <button type="button" className="inv-confirm__no" onClick={() => setConfirmId(null)}>
                              Não
                            </button>
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={() => startEdit(item)}
                              disabled={disabled}
                              aria-label={`Editar ${item.name}`}
                              title="Editar"
                            >
                              <Pencil strokeWidth={1.8} />
                            </button>
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={() => setConfirmId(item.id)}
                              disabled={disabled}
                              aria-label={`Remover ${item.name}`}
                              title="Remover"
                            >
                              <Trash2 strokeWidth={1.8} />
                            </button>
                          </>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
