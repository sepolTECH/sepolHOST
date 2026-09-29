import { Pencil, Plus, ReceiptText, Repeat, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { ApiError, financeApi, type MonthExpense } from '../../services/api'
import { formatMoney } from '../../utils/money'
import { ExpenseFormModal } from './ExpenseFormModal'
import { EXPENSE_CATEGORY } from './expenses'

interface ExpensesPanelProps {
  year: number
  month: number
  monthLabel: string // "setembro de 2026"
  expenses: MonthExpense[]
  properties: string[]
  totalCents: number
  onChanged: (message: string) => void
}

const keyOf = (name: string | null) => (name ? name.trim().toLowerCase() : '')

/**
 * Despesas do mês agrupadas por imóvel (condomínio, IPTU, contas...).
 * As recorrentes aparecem sozinhas em todo mês; aqui dá para ajustar o valor do mês,
 * mudar dali em diante ou parar de repetir.
 */
export function ExpensesPanel({ year, month, monthLabel, expenses, properties, totalCents, onChanged }: ExpensesPanelProps) {
  const [form, setForm] = useState<{ key: number; expense: MonthExpense | null; property?: string | null } | null>(null)
  const [deleting, setDeleting] = useState<MonthExpense | null>(null)
  const [removing, setRemoving] = useState<'month' | 'future' | null>(null)
  const [deleteError, setDeleteError] = useState('')

  // Grupos: cada imóvel e, por último, "Geral"
  const groups = new Map<string, { name: string | null; items: MonthExpense[]; total: number }>()
  for (const e of expenses) {
    const k = keyOf(e.propertyName)
    const g = groups.get(k) ?? { name: e.propertyName, items: [], total: 0 }
    g.items.push(e)
    g.total += e.amountCents
    groups.set(k, g)
  }
  const ordered = [...groups.values()].sort((a, b) =>
    a.name === null ? 1 : b.name === null ? -1 : a.name.localeCompare(b.name, 'pt-BR'),
  )

  const openNew = (property?: string | null) => setForm({ key: Date.now(), expense: null, property })

  async function confirmDelete(scope: 'month' | 'future') {
    if (!deleting) return
    setRemoving(scope)
    setDeleteError('')
    try {
      await financeApi.removeExpense(deleting.id, scope)
      setDeleting(null)
      onChanged(
        !deleting.recurring
          ? 'Despesa excluída'
          : scope === 'future'
            ? 'Despesa não se repete mais a partir deste mês'
            : 'Despesa removida deste mês',
      )
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Não foi possível excluir a despesa')
    } finally {
      setRemoving(null)
    }
  }

  return (
    <section className="panel">
      <div className="finance__panel-head">
        <h2 className="finance__panel-title">
          Despesas do mês
          {expenses.length > 0 && <small>{expenses.length}</small>}
        </h2>
        <span className="finance__panel-total">{formatMoney(totalCents)}</span>
        <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={() => openNew()}>
          <Plus strokeWidth={2.2} />
          Adicionar despesa
        </button>
      </div>

      {expenses.length === 0 ? (
        <div className="panel__state finance__expenses-empty">
          <span className="panel__state-icon">
            <ReceiptText strokeWidth={1.6} />
          </span>
          <p>
            Nenhuma despesa em {monthLabel}.
            <br />
            <small>
              Lance aqui condomínio, IPTU, energia, internet… Marque “Repetir todo mês” para as fixas: elas entram
              sozinhas nos próximos meses.
            </small>
          </p>
        </div>
      ) : (
        <div className="expenses">
          {ordered.map((g) => (
            <div key={keyOf(g.name)} className="expenses__group">
              <div className="expenses__group-head">
                <strong>{g.name ?? 'Geral'}</strong>
                {g.name === null && <small>não é de um imóvel específico</small>}
                <span className="expenses__group-total">{formatMoney(g.total)}</span>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => openNew(g.name)}
                  aria-label={`Adicionar despesa em ${g.name ?? 'Geral'}`}
                  title="Adicionar despesa neste imóvel"
                >
                  <Plus strokeWidth={1.8} />
                </button>
              </div>
              <ul className="expenses__list">
                {g.items.map((e) => {
                  const cat = EXPENSE_CATEGORY[e.category]
                  const Icon = cat.icon
                  return (
                    <li key={e.id} className="expense">
                      <span className="expense__icon" aria-hidden>
                        <Icon strokeWidth={1.8} />
                      </span>
                      <span className="expense__main">
                        <span className="expense__title">
                          <strong>{e.description}</strong>
                          {e.recurring && (
                            <span className="ui-badge expense__badge" title="Entra automaticamente todo mês">
                              <Repeat strokeWidth={2} aria-hidden />
                              Todo mês
                            </span>
                          )}
                          {e.edited && e.recurring && (
                            <span
                              className="ui-badge ui-badge--dark"
                              title={`Valor padrão: ${formatMoney(e.recurring.amountCents)}`}
                            >
                              Ajustado neste mês
                            </span>
                          )}
                        </span>
                        <small>
                          {cat.label}
                          {e.recurring?.endMonth && ` · até ${e.recurring.endMonth.slice(5, 7)}/${e.recurring.endMonth.slice(0, 4)}`}
                        </small>
                      </span>
                      <span className="expense__amount guest-form__mono">{formatMoney(e.amountCents)}</span>
                      <span className="expense__actions">
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => setForm({ key: Date.now(), expense: e })}
                          aria-label={`Editar ${e.description}`}
                          title="Editar"
                        >
                          <Pencil strokeWidth={1.8} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn expense__delete"
                          onClick={() => {
                            setDeleteError('')
                            setDeleting(e)
                          }}
                          aria-label={`Excluir ${e.description}`}
                          title="Excluir"
                        >
                          <Trash2 strokeWidth={1.8} />
                        </button>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {form && (
        <ExpenseFormModal
          key={form.key}
          open
          year={year}
          month={month}
          monthLabel={monthLabel}
          properties={properties}
          expense={form.expense}
          defaultProperty={form.property}
          onClose={() => setForm(null)}
          onSaved={(message) => {
            setForm(null)
            onChanged(message)
          }}
        />
      )}

      <Modal
        open={!!deleting}
        onClose={() => !removing && setDeleting(null)}
        title="Excluir despesa"
        subtitle={deleting ? `${deleting.description} · ${formatMoney(deleting.amountCents)}` : undefined}
        size="md"
        footer={
          deleting && (
            <>
              <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setDeleting(null)} disabled={!!removing}>
                Cancelar
              </button>
              {deleting.recurring ? (
                <>
                  <button
                    type="button"
                    className="ui-btn ui-btn--ghost"
                    onClick={() => confirmDelete('future')}
                    disabled={!!removing}
                  >
                    {removing === 'future' && <span className="spinner spinner--dark" />}
                    Parar de repetir
                  </button>
                  <button
                    type="button"
                    className="ui-btn ui-btn--primary"
                    onClick={() => confirmDelete('month')}
                    disabled={!!removing}
                    data-autofocus
                  >
                    {removing === 'month' && <span className="spinner" />}
                    Só deste mês
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="ui-btn ui-btn--primary"
                  onClick={() => confirmDelete('month')}
                  disabled={!!removing}
                  data-autofocus
                >
                  {removing && <span className="spinner" />}
                  Excluir
                </button>
              )}
            </>
          )
        }
      >
        {deleting && (
          <div className="expense-delete">
            {deleting.recurring ? (
              <>
                <p>Esta despesa se repete todo mês. O que você quer fazer?</p>
                <ul>
                  <li>
                    <strong>Só deste mês:</strong> tira de {monthLabel}; os outros meses continuam.
                  </li>
                  <li>
                    <strong>Parar de repetir:</strong> remove de {monthLabel} em diante. Os meses anteriores ficam como
                    estão.
                  </li>
                </ul>
              </>
            ) : (
              <p>A despesa será excluída de {monthLabel}.</p>
            )}
            {deleteError && <p className="ui-field__error">{deleteError}</p>}
          </div>
        )}
      </Modal>
    </section>
  )
}
