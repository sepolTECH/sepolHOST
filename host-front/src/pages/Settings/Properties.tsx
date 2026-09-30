import { Building2, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Modal } from '../../components/ui/Modal'
import { ApiError, propertiesApi, type Property, type PropertyInput } from '../../services/api'
import '../Guests/Guests.css'
import '../Reservations/Reservations.css'
import './Properties.css'
import './Settings.css'

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

const EMPTY: PropertyInput = { name: '', address: '', city: '', state: '', notes: '', isActive: true }

const toInput = (p: Property): PropertyInput => ({
  name: p.name,
  address: p.address ?? '',
  city: p.city ?? '',
  state: p.state ?? '',
  notes: p.notes ?? '',
  isActive: p.isActive,
})

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Ajustes > Imóveis: cadastro dos imóveis usados nas reservas e no inventário. */
export function Properties() {
  const [list, setList] = useState<Property[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const [formOpen, setFormOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [editing, setEditing] = useState<Property | null>(null)

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
    propertiesApi
      .list(controller.signal)
      .then(({ data }) => {
        setList(data)
        setLoadError('')
      })
      .catch((err) => {
        if (!controller.signal.aborted) setLoadError(err.message ?? 'Erro ao carregar os imóveis')
      })
    return () => controller.abort()
  }, [reloadKey])

  function openForm(property: Property | null) {
    setEditing(property)
    setFormKey((k) => k + 1) // estado do formulário sempre começa limpo
    setFormOpen(true)
  }

  function handleSaved(property: Property, isEdit: boolean) {
    setFormOpen(false)
    setReloadKey((k) => k + 1)
    showToast(isEdit ? `“${property.name}” atualizado` : `“${property.name}” cadastrado`)
  }

  async function handleRemove(p: Property) {
    const used = p.reservationsCount > 0 || p.itemsCount > 0
    const message = used
      ? `“${p.name}” já tem ${plural(p.reservationsCount, 'reserva', 'reservas')} e ${plural(p.itemsCount, 'item', 'itens')} de inventário, então não pode ser excluído. Quer desativá-lo? Ele some das listas, mas o histórico continua.`
      : `Excluir o imóvel “${p.name}”?`
    if (!window.confirm(message)) return
    try {
      if (used) {
        await propertiesApi.update(p.id, { ...toInput(p), isActive: false })
        showToast(`“${p.name}” desativado`)
      } else {
        await propertiesApi.remove(p.id)
        showToast(`“${p.name}” excluído`)
      }
      setReloadKey((k) => k + 1)
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível concluir a ação')
    }
  }

  return (
    <div className="guests">
      <header className="page-header">
        <div>
          <p className="page-header__crumb">Ajustes</p>
          <h1 className="page-header__title">Imóveis</h1>
          <p className="page-header__subtitle">
            Cadastre os imóveis que você aluga. Eles aparecem como opção ao cadastrar uma reserva e no inventário.
          </p>
        </div>
        <button type="button" className="ui-btn ui-btn--primary" onClick={() => openForm(null)}>
          <Plus strokeWidth={2.2} />
          Novo imóvel
        </button>
      </header>

      <section className="panel">
        {loadError ? (
          <div className="panel__state">
            <p>{loadError}</p>
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setReloadKey((k) => k + 1)}>
              Tentar novamente
            </button>
          </div>
        ) : !list ? (
          <div className="panel__state">
            <p>Carregando…</p>
          </div>
        ) : list.length === 0 ? (
          <div className="panel__state">
            <span className="panel__state-icon">
              <Building2 strokeWidth={1.6} />
            </span>
            <p>Nenhum imóvel cadastrado ainda.</p>
            <button type="button" className="ui-btn ui-btn--primary" onClick={() => openForm(null)}>
              <Plus strokeWidth={2.2} />
              Cadastrar primeiro imóvel
            </button>
          </div>
        ) : (
          <ul className="props__list">
            {list.map((p) => {
              const place = [p.address, [p.city, p.state].filter(Boolean).join('/')].filter(Boolean).join(' · ')
              return (
                <li key={p.id} className={`props__row ${p.isActive ? '' : 'is-inactive'}`}>
                  <span className="props__icon" aria-hidden>
                    <Building2 size={20} strokeWidth={1.6} />
                  </span>
                  <div className="props__info">
                    <p className="props__name">
                      {p.name}
                      {!p.isActive && <span className="props__badge">Desativado</span>}
                    </p>
                    {place && (
                      <p className="props__place">
                        <MapPin size={13} strokeWidth={1.8} aria-hidden />
                        {place}
                      </p>
                    )}
                    <p className="props__meta">
                      {plural(p.reservationsCount, 'reserva', 'reservas')} · {plural(p.itemsCount, 'item', 'itens')} no
                      inventário
                    </p>
                  </div>
                  <div className="props__actions">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => openForm(p)}
                      aria-label={`Editar ${p.name}`}
                      title="Editar"
                    >
                      <Pencil strokeWidth={1.8} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => handleRemove(p)}
                      aria-label={`${p.reservationsCount || p.itemsCount ? 'Desativar' : 'Excluir'} ${p.name}`}
                      title={p.reservationsCount || p.itemsCount ? 'Desativar' : 'Excluir'}
                      disabled={!p.isActive && (p.reservationsCount > 0 || p.itemsCount > 0)}
                    >
                      <Trash2 strokeWidth={1.8} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <PropertyFormModal
        key={formKey}
        open={formOpen}
        property={editing}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
      />

      <div className={`toast ${toast ? 'is-visible' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  )
}

interface PropertyFormModalProps {
  open: boolean
  property: Property | null
  onClose: () => void
  onSaved: (property: Property, isEdit: boolean) => void
}

function PropertyFormModal({ open, property, onClose, onSaved }: PropertyFormModalProps) {
  const isEdit = !!property
  const [values, setValues] = useState<PropertyInput>(() => (property ? toInput(property) : EMPTY))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  function set<K extends keyof PropertyInput>(key: K, value: PropertyInput[K]) {
    setValues((v) => ({ ...v, [key]: value }))
    setErrors((e) => ({ ...e, [key]: '' }))
    setFormError('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    if (values.name.trim().length < 2) {
      setErrors({ name: 'Informe o nome do imóvel' })
      document.getElementById('prop-name')?.focus()
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const { property: saved } = isEdit
        ? await propertiesApi.update(property.id, values)
        : await propertiesApi.create(values)
      onSaved(saved, isEdit)
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = Object.fromEntries(err.errors.map((f) => [f.field, f.message]))
        setErrors(fields)
        if (!err.errors.length) setFormError(err.message)
      } else {
        setFormError('Não foi possível salvar o imóvel')
      }
    } finally {
      setSaving(false)
    }
  }

  const field = (key: keyof PropertyInput) => (errors[key] ? 'ui-field has-error' : 'ui-field')
  const fieldError = (key: keyof PropertyInput) =>
    errors[key] ? <p className="ui-field__error">{errors[key]}</p> : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={isEdit ? 'Editar imóvel' : 'Novo imóvel'}
      subtitle={
        isEdit
          ? 'Mudar o nome atualiza as reservas, o inventário e as despesas deste imóvel.'
          : 'Esse nome aparece na lista ao cadastrar uma reserva.'
      }
      footer={
        <>
          <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" form="property-form" className="ui-btn ui-btn--primary" disabled={saving}>
            {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Cadastrar imóvel'}
          </button>
        </>
      }
    >
      <form id="property-form" className="guest-form" onSubmit={handleSubmit} noValidate>
        {formError && (
          <div className="guest-form__alert" role="alert">
            {formError}
          </div>
        )}

        <div className="guest-form__grid">
          <div className={`${field('name')} ui-field--full`}>
            <label htmlFor="prop-name">
              Nome do imóvel<span className="req">*</span>
            </label>
            <input
              id="prop-name"
              className="ui-input"
              placeholder="Ex.: Apto 302 — Ed. Solar"
              maxLength={120}
              autoComplete="off"
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              disabled={saving}
              data-autofocus
            />
            {fieldError('name')}
          </div>

          <div className={`${field('address')} ui-field--full`}>
            <label htmlFor="prop-address">Endereço</label>
            <input
              id="prop-address"
              className="ui-input"
              placeholder="Rua, número e complemento"
              maxLength={200}
              autoComplete="off"
              value={values.address}
              onChange={(e) => set('address', e.target.value)}
              disabled={saving}
            />
            {fieldError('address')}
          </div>

          <div className={field('city')}>
            <label htmlFor="prop-city">Cidade</label>
            <input
              id="prop-city"
              className="ui-input"
              maxLength={80}
              autoComplete="off"
              value={values.city}
              onChange={(e) => set('city', e.target.value)}
              disabled={saving}
            />
            {fieldError('city')}
          </div>

          <div className={field('state')}>
            <label htmlFor="prop-state">Estado</label>
            <select
              id="prop-state"
              className="ui-input ui-select"
              value={values.state}
              onChange={(e) => set('state', e.target.value)}
              disabled={saving}
            >
              <option value="">—</option>
              {UFS.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
            {fieldError('state')}
          </div>

          <div className={`${field('notes')} ui-field--full`}>
            <label htmlFor="prop-notes">Observações</label>
            <textarea
              id="prop-notes"
              className="ui-input props__notes"
              rows={3}
              maxLength={500}
              placeholder="Ex.: código da fechadura, vaga de garagem, contato do condomínio"
              value={values.notes}
              onChange={(e) => set('notes', e.target.value)}
              disabled={saving}
            />
            {fieldError('notes')}
          </div>

          {isEdit && (
            <label className="props__check ui-field--full">
              <input
                type="checkbox"
                checked={values.isActive}
                onChange={(e) => set('isActive', e.target.checked)}
                disabled={saving}
              />
              <span>
                Imóvel ativo
                <small>Desativado, ele não aparece ao cadastrar reservas nem no inventário, mas o histórico fica.</small>
              </span>
            </label>
          )}
        </div>
      </form>
    </Modal>
  )
}
