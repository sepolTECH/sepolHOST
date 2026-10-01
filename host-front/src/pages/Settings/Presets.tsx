import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Modal } from '../../components/ui/Modal'
import {
  ApiError,
  settingsApi,
  type Preset,
  type PresetInput,
  type PresetKind,
} from '../../services/api'
import { centsFromInput, formatMoney } from '../../utils/money'
import '../Guests/Guests.css'
import '../Reservations/Reservations.css'
import './Settings.css'

const SECTIONS: { kind: PresetKind; title: string; subtitle: string; empty: string; placeholder: string; add: string }[] = [
  {
    kind: 'ADDITION',
    title: 'Valores adicionais (a receber)',
    subtitle: 'Dinheiro a receber além da reserva, como hóspede adicional, pet ou late check-out.',
    empty: 'Nenhum valor adicional cadastrado ainda.',
    placeholder: 'Ex.: Hóspede adicional, Pet…',
    add: 'Novo valor adicional',
  },
  {
    kind: 'COST',
    title: 'Custos e taxas',
    subtitle: 'Gastos de cada hospedagem, como faxina, lavanderia e reposição de itens.',
    empty: 'Nenhum custo cadastrado ainda.',
    placeholder: 'Ex.: Faxina, Lavanderia…',
    add: 'Novo custo ou taxa',
  },
]

/** Ajustes > Valores padrão: itens com valor sugerido para os adicionais e custos da reserva. */
export function Presets() {
  const [list, setList] = useState<Preset[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const [formOpen, setFormOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [formKind, setFormKind] = useState<PresetKind>('ADDITION')
  const [editing, setEditing] = useState<Preset | null>(null)

  const [toast, setToast] = useState('')
  const toastTimer = useRef<number>(undefined)
  const showToast = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 3200)
  }, [])
  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  useEffect(() => {
    const controller = new AbortController()
    settingsApi
      .presets(controller.signal)
      .then(({ data }) => {
        setList(data)
        setLoadError('')
      })
      .catch((err) => {
        if (!controller.signal.aborted) setLoadError(err.message ?? 'Erro ao carregar os valores padrão')
      })
    return () => controller.abort()
  }, [reloadKey])

  function openForm(kind: PresetKind, preset: Preset | null) {
    setFormKind(kind)
    setEditing(preset)
    setFormKey((k) => k + 1) // estado do formulário sempre começa limpo
    setFormOpen(true)
  }

  function handleSaved(preset: Preset, isEdit: boolean) {
    setFormOpen(false)
    setReloadKey((k) => k + 1)
    showToast(isEdit ? `“${preset.name}” atualizado` : `“${preset.name}” cadastrado`)
  }

  async function handleRemove(p: Preset) {
    if (!window.confirm(`Excluir “${p.name}”? As reservas já cadastradas não são alteradas.`)) return
    try {
      await settingsApi.removePreset(p.id)
      showToast(`“${p.name}” excluído`)
      setReloadKey((k) => k + 1)
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível excluir')
    }
  }

  return (
    <div className="guests">
      <header className="page-header">
        <div>
          <p className="page-header__crumb">Ajustes</p>
          <h1 className="page-header__title">Valores padrão</h1>
          <p className="page-header__subtitle">
            Cadastre os valores adicionais a receber e os custos e taxas que você usa nas reservas, já com o valor. Ao
            escolher um deles na reserva, o valor vem preenchido e você ainda pode alterá-lo para aquela reserva.
          </p>
        </div>
      </header>

      {loadError ? (
        <section className="panel">
          <div className="panel__state">
            <p>{loadError}</p>
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setReloadKey((k) => k + 1)}>
              Tentar novamente
            </button>
          </div>
        </section>
      ) : !list ? (
        <section className="panel">
          <div className="panel__state">
            <p>Carregando…</p>
          </div>
        </section>
      ) : (
        <div className="presets">
          {SECTIONS.map((section) => {
            const items = list.filter((p) => p.kind === section.kind)
            return (
              <section className="panel" key={section.kind}>
                <div className="presets__head">
                  <div>
                    <h2>{section.title}</h2>
                    <p>{section.subtitle}</p>
                  </div>
                  <button type="button" className="ui-btn ui-btn--primary" onClick={() => openForm(section.kind, null)}>
                    <Plus strokeWidth={2.2} />
                    {section.add}
                  </button>
                </div>
                {items.length === 0 ? (
                  <p className="presets__empty">{section.empty}</p>
                ) : (
                  <ul className="presets__list">
                    {items.map((p) => (
                      <li key={p.id} className="presets__row">
                        <span className="presets__name">{p.name}</span>
                        <span className="presets__amount guest-form__mono">{formatMoney(p.amountCents)}</span>
                        <div className="presets__actions">
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => openForm(section.kind, p)}
                            aria-label={`Editar ${p.name}`}
                            title="Editar"
                          >
                            <Pencil strokeWidth={1.8} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => handleRemove(p)}
                            aria-label={`Excluir ${p.name}`}
                            title="Excluir"
                          >
                            <Trash2 strokeWidth={1.8} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}

      <PresetFormModal
        key={formKey}
        open={formOpen}
        kind={formKind}
        preset={editing}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
      />

      <div className={`toast ${toast ? 'is-visible' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  )
}

interface PresetFormModalProps {
  open: boolean
  kind: PresetKind
  preset: Preset | null
  onClose: () => void
  onSaved: (preset: Preset, isEdit: boolean) => void
}

function PresetFormModal({ open, kind, preset, onClose, onSaved }: PresetFormModalProps) {
  const isEdit = !!preset
  const section = SECTIONS.find((s) => s.kind === kind) ?? SECTIONS[0]
  const [name, setName] = useState(preset?.name ?? '')
  const [amountCents, setAmountCents] = useState(preset?.amountCents ?? 0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    const next: Record<string, string> = {}
    if (name.trim().length < 2) next.name = 'Informe o nome'
    if (amountCents <= 0) next.amountCents = 'Informe o valor'
    if (Object.keys(next).length) {
      setErrors(next)
      document.getElementById(next.name ? 'preset-name' : 'preset-amount')?.focus()
      return
    }
    setSaving(true)
    setFormError('')
    const input: PresetInput = { kind, name: name.trim(), amountCents }
    try {
      const { preset: saved } = isEdit
        ? await settingsApi.updatePreset(preset.id, input)
        : await settingsApi.createPreset(input)
      onSaved(saved, isEdit)
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(Object.fromEntries(err.errors.map((f) => [f.field, f.message])))
        if (!err.errors.length) setFormError(err.message)
      } else {
        setFormError('Não foi possível salvar')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={isEdit ? 'Editar valor padrão' : section.add}
      subtitle="Esse valor vem preenchido ao escolher o item na reserva, e pode ser alterado lá."
      footer={
        <>
          <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" form="preset-form" className="ui-btn ui-btn--primary" disabled={saving}>
            {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Cadastrar'}
          </button>
        </>
      }
    >
      <form id="preset-form" className="guest-form" onSubmit={handleSubmit} noValidate>
        {formError && (
          <div className="guest-form__alert" role="alert">
            {formError}
          </div>
        )}
        <div className="guest-form__grid">
          <div className={`ui-field ui-field--full ${errors.name ? 'has-error' : ''}`}>
            <label htmlFor="preset-name">
              Nome<span className="req">*</span>
            </label>
            <input
              id="preset-name"
              className="ui-input"
              placeholder={section.placeholder}
              maxLength={120}
              autoComplete="off"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setErrors((x) => ({ ...x, name: '' }))
              }}
              disabled={saving}
              data-autofocus
            />
            {errors.name && <p className="ui-field__error">{errors.name}</p>}
          </div>
          <div className={`ui-field ui-field--full ${errors.amountCents ? 'has-error' : ''}`}>
            <label htmlFor="preset-amount">
              Valor padrão<span className="req">*</span>
            </label>
            <input
              id="preset-amount"
              className="ui-input guest-form__mono money-input"
              inputMode="numeric"
              value={formatMoney(amountCents)}
              onChange={(e) => {
                setAmountCents(centsFromInput(e.target.value))
                setErrors((x) => ({ ...x, amountCents: '' }))
              }}
              onFocus={(e) => e.target.select()}
              disabled={saving}
            />
            {errors.amountCents && <p className="ui-field__error">{errors.amountCents}</p>}
          </div>
        </div>
      </form>
    </Modal>
  )
}
