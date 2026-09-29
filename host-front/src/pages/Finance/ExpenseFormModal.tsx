import { Check, Repeat } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Segmented } from '../../components/ui/Segmented'
import { ApiError, financeApi, type ExpenseCategory, type MonthExpense } from '../../services/api'
import { centsFromInput, formatMoney } from '../../utils/money'
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY } from './expenses'

const GENERAL = '__geral__'
const NEW_PROPERTY = '__novo__'

type Field = 'propertyName' | 'category' | 'description' | 'amountCents'
type Errors = Partial<Record<Field, string>>

interface ExpenseFormModalProps {
  open: boolean
  year: number
  month: number
  monthLabel: string // "setembro de 2026"
  properties: string[]
  expense: MonthExpense | null // null = nova
  /** Imóvel já escolhido ao abrir (botão "adicionar" de um imóvel). */
  defaultProperty?: string | null
  onClose: () => void
  onSaved: (message: string) => void
}

/** Cadastro/edição de uma despesa do mês (condomínio, IPTU, contas...). */
export function ExpenseFormModal({
  open,
  year,
  month,
  monthLabel,
  properties,
  expense,
  defaultProperty,
  onClose,
  onSaved,
}: ExpenseFormModalProps) {
  const isEdit = !!expense
  const isRecurring = !!expense?.recurring
  const initialProperty = expense ? expense.propertyName : (defaultProperty ?? properties[0] ?? null)

  const [propertyChoice, setPropertyChoice] = useState<string>(
    initialProperty === null ? GENERAL : properties.includes(initialProperty) ? initialProperty : NEW_PROPERTY,
  )
  const [newProperty, setNewProperty] = useState(
    initialProperty && !properties.includes(initialProperty) ? initialProperty : '',
  )
  const [category, setCategory] = useState<ExpenseCategory | ''>(expense?.category ?? '')
  const [description, setDescription] = useState(expense?.description ?? '')
  const [amountCents, setAmountCents] = useState(expense?.amountCents ?? 0)
  const [recurring, setRecurring] = useState(true) // só no cadastro
  const [scope, setScope] = useState<'month' | 'future'>('month') // só na edição de recorrente
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const propertyName = propertyChoice === GENERAL ? null : propertyChoice === NEW_PROPERTY ? newProperty.trim() : propertyChoice

  function changeCategory(value: ExpenseCategory | '') {
    // Descrição acompanha a categoria enquanto o usuário não escreveu outra coisa
    const previousLabel = category ? EXPENSE_CATEGORY[category].label : ''
    if (value && (!description.trim() || description === previousLabel)) setDescription(EXPENSE_CATEGORY[value].label)
    setCategory(value)
    setErrors((e) => ({ ...e, category: undefined, description: undefined }))
  }

  function validate(): Errors {
    const e: Errors = {}
    if (propertyChoice === NEW_PROPERTY && newProperty.trim().length < 2) e.propertyName = 'Informe o imóvel'
    if (!category) e.category = 'Selecione a categoria'
    if (description.trim().length < 2) e.description = 'Informe a descrição'
    if (amountCents <= 0) e.amountCents = 'Informe o valor'
    return e
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    const found = validate()
    setErrors(found)
    setFormError('')
    if (Object.keys(found).length) return
    const input = { propertyName, category: category as ExpenseCategory, description: description.trim(), amountCents }
    setSaving(true)
    try {
      if (expense) {
        await financeApi.updateExpense(expense.id, { ...input, applyToFuture: isRecurring && scope === 'future' })
        onSaved(isRecurring && scope === 'future' ? 'Despesa alterada neste e nos próximos meses' : 'Despesa alterada')
      } else {
        await financeApi.createExpense(year, month, { ...input, recurring })
        onSaved(recurring ? 'Despesa recorrente cadastrada' : 'Despesa cadastrada')
      }
    } catch (err) {
      if (err instanceof ApiError && err.errors.length) {
        setErrors(Object.fromEntries(err.errors.map((f) => [f.field, f.message])))
      }
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar a despesa')
    } finally {
      setSaving(false)
    }
  }

  const cls = (key: Field, extra = '') => `ui-field ${extra} ${errors[key] ? 'has-error' : ''}`
  const err = (key: Field) =>
    errors[key] ? (
      <p className="ui-field__error" id={`expense-${key}-error`}>
        {errors[key]}
      </p>
    ) : null
  const aria = (key: Field) => ({
    id: `expense-${key}`,
    'aria-invalid': !!errors[key] || undefined,
    'aria-describedby': errors[key] ? `expense-${key}-error` : undefined,
  })

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title={isEdit ? 'Editar despesa' : 'Nova despesa do mês'}
      subtitle={`Referente a ${monthLabel}`}
      size="md"
      footer={
        <>
          <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" form="expense-form" className="ui-btn ui-btn--primary" disabled={saving}>
            {saving ? <span className="spinner" /> : <Check strokeWidth={2.2} />}
            {isEdit ? 'Salvar alterações' : 'Adicionar despesa'}
          </button>
        </>
      }
    >
      <form id="expense-form" className="guest-form expense-form" onSubmit={handleSubmit} noValidate>
        {formError && (
          <div className="guest-form__alert" role="alert">
            {formError}
          </div>
        )}

        <div className="guest-form__grid">
          <div className={cls('propertyName', 'ui-field--full')}>
            <label htmlFor="expense-propertyName">
              Imóvel<span className="req">*</span>
            </label>
            <select
              className="ui-input ui-select"
              value={propertyChoice}
              onChange={(e) => {
                setPropertyChoice(e.target.value)
                setErrors((x) => ({ ...x, propertyName: undefined }))
              }}
              disabled={saving}
              {...(propertyChoice === NEW_PROPERTY ? {} : aria('propertyName'))}
            >
              {properties.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
              <option value={GENERAL}>Geral (não é de um imóvel específico)</option>
              <option value={NEW_PROPERTY}>Outro imóvel…</option>
            </select>
            {propertyChoice === NEW_PROPERTY && (
              <input
                className="ui-input"
                placeholder="Nome do imóvel (igual ao usado nas reservas)"
                maxLength={120}
                value={newProperty}
                onChange={(e) => {
                  setNewProperty(e.target.value)
                  setErrors((x) => ({ ...x, propertyName: undefined }))
                }}
                disabled={saving}
                autoFocus
                {...aria('propertyName')}
              />
            )}
            {err('propertyName') ??
              (propertyChoice === GENERAL && (
                <p className="ui-field__hint">Entra no resultado total do mês, mas não no de um imóvel.</p>
              ))}
          </div>

          <div className={cls('category')}>
            <label htmlFor="expense-category">
              Categoria<span className="req">*</span>
            </label>
            <select
              className="ui-input ui-select"
              value={category}
              onChange={(e) => changeCategory(e.target.value as ExpenseCategory | '')}
              disabled={saving}
              {...aria('category')}
            >
              <option value="" disabled>
                Selecione…
              </option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            {err('category')}
          </div>

          <div className={cls('amountCents')}>
            <label htmlFor="expense-amountCents">
              Valor<span className="req">*</span>
            </label>
            <input
              className="ui-input guest-form__mono money-input"
              inputMode="numeric"
              value={formatMoney(amountCents)}
              onChange={(e) => {
                setAmountCents(centsFromInput(e.target.value))
                setErrors((x) => ({ ...x, amountCents: undefined }))
              }}
              onFocus={(e) => e.target.select()}
              disabled={saving}
              {...aria('amountCents')}
            />
            {err('amountCents')}
          </div>

          <div className={cls('description', 'ui-field--full')}>
            <label htmlFor="expense-description">
              Descrição<span className="req">*</span>
            </label>
            <input
              className="ui-input"
              placeholder="Ex.: Condomínio, Conta de luz, IPTU 3/10…"
              maxLength={120}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value)
                setErrors((x) => ({ ...x, description: undefined }))
              }}
              disabled={saving}
              {...aria('description')}
            />
            {err('description')}
          </div>

          {!isEdit && (
            <div className="ui-field ui-field--full">
              <label className={`ui-switch ${recurring ? 'is-on' : ''}`}>
                <input
                  type="checkbox"
                  role="switch"
                  checked={recurring}
                  onChange={(e) => setRecurring(e.target.checked)}
                  disabled={saving}
                />
                <span className="ui-switch__track" aria-hidden>
                  <span className="ui-switch__thumb" />
                </span>
                <span className="ui-switch__text">
                  Repetir todo mês
                  <small>
                    {recurring
                      ? `Entra automaticamente a partir de ${monthLabel}. Dá para ajustar o valor em cada mês.`
                      : `Lançamento só em ${monthLabel}.`}
                  </small>
                </span>
              </label>
            </div>
          )}

          {isRecurring && (
            <div className="ui-field ui-field--full">
              <span className="ui-field__label">
                <Repeat strokeWidth={1.8} className="expense-form__label-icon" aria-hidden /> Despesa recorrente — aplicar
                alteração em
              </span>
              <Segmented<'month' | 'future'>
                ariaLabel="Aplicar alteração em"
                value={scope}
                onChange={setScope}
                disabled={saving}
                options={[
                  { value: 'month', label: 'Só neste mês' },
                  { value: 'future', label: 'Neste e nos próximos' },
                ]}
              />
              <p className="ui-field__hint">
                {scope === 'month'
                  ? 'Use para contas que variam (ex.: luz deste mês). Os outros meses continuam com o valor padrão.'
                  : `Muda o valor padrão a partir de ${monthLabel} (ex.: reajuste do condomínio). Meses anteriores não mudam.`}
              </p>
            </div>
          )}
        </div>
      </form>
    </Modal>
  )
}
