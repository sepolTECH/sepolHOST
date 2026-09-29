import { Check, Copy, KeyRound, ListChecks, MessageCircle, Plus, Power, Trash2, Users } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Modal } from '../../components/ui/Modal'
import {
  ApiError,
  associatesApi,
  type Associate,
  type AssociateCredentials,
  type FieldError,
} from '../../services/api'
import '../Guests/Guests.css'
import './Associates.css'
import { ReleaseModal } from './ReleaseModal'

const dateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function Associates() {
  const [items, setItems] = useState<Associate[] | null>(null)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [credentials, setCredentials] = useState<(AssociateCredentials & { isNew: boolean }) | null>(null)
  const [releasing, setReleasing] = useState<Associate | null>(null)
  const [deleting, setDeleting] = useState<Associate | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<number>(undefined)

  const notify = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 3200)
  }, [])

  const load = useCallback(() => {
    associatesApi
      .list()
      .then(({ data }) => {
        setItems(data)
        setError('')
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os associados'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function toggleActive(a: Associate) {
    setBusyId(a.id)
    try {
      await associatesApi.update(a.id, { isActive: !a.isActive })
      notify(a.isActive ? 'Acesso desativado' : 'Acesso reativado')
      load()
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Não foi possível alterar')
    } finally {
      setBusyId(null)
    }
  }

  async function resetPassword(a: Associate) {
    setBusyId(a.id)
    try {
      setCredentials({ ...(await associatesApi.resetPassword(a.id)), isNew: false })
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Não foi possível gerar a senha')
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setBusyId(deleting.id)
    try {
      await associatesApi.remove(deleting.id)
      notify('Associado excluído')
      setDeleting(null)
      load()
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Não foi possível excluir')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="guests">
      <header className="page-header">
        <div>
          <p className="page-header__crumb">Equipe</p>
          <h1 className="page-header__title">Associados</h1>
          <p className="page-header__subtitle">
            Funcionários e diaristas com acesso simples só para vistoria (inventário) e avaliação das reservas que você
            liberar.
          </p>
        </div>
        <button type="button" className="ui-btn ui-btn--primary" onClick={() => setFormOpen(true)}>
          <Plus aria-hidden />
          Novo associado
        </button>
      </header>

      {error && <p className="ui-field__error">{error}</p>}

      {!items && !error && <p className="assoc__state">Carregando…</p>}

      {items && items.length === 0 && (
        <div className="assoc__empty">
          <Users size={32} strokeWidth={1.5} aria-hidden />
          <strong>Nenhum associado cadastrado</strong>
          <p>Cadastre quem faz a limpeza e a vistoria. O sistema gera o e-mail de acesso e uma senha simples.</p>
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => setFormOpen(true)}>
            <Plus aria-hidden />
            Novo associado
          </button>
        </div>
      )}

      {items && items.length > 0 && (
        <ul className="assoc__list">
          {items.map((a) => (
            <li key={a.id} className={`assoc__card ${a.isActive ? '' : 'is-inactive'}`}>
              <div className="assoc__info">
                <div className="assoc__name">
                  <strong>{a.name}</strong>
                  <span className={`ui-badge ${a.isActive ? 'ui-badge--dark' : ''}`}>
                    {a.isActive ? 'Ativo' : 'Desativado'}
                  </span>
                </div>
                <span className="assoc__email">{a.email}</span>
                <span className="assoc__meta">
                  {a.releasedCount} {a.releasedCount === 1 ? 'reserva liberada' : 'reservas liberadas'} ·{' '}
                  {a.lastLoginAt ? `último acesso ${dateTime(a.lastLoginAt)}` : 'nunca acessou'}
                </span>
              </div>
              <div className="assoc__actions">
                <button type="button" className="ui-btn ui-btn--primary" onClick={() => setReleasing(a)}>
                  <ListChecks aria-hidden />
                  Reservas liberadas
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  disabled={busyId === a.id}
                  onClick={() => resetPassword(a)}
                  title="Gerar nova senha"
                  aria-label={`Gerar nova senha para ${a.name}`}
                >
                  <KeyRound strokeWidth={1.8} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  disabled={busyId === a.id}
                  onClick={() => toggleActive(a)}
                  title={a.isActive ? 'Desativar acesso' : 'Reativar acesso'}
                  aria-label={`${a.isActive ? 'Desativar' : 'Reativar'} acesso de ${a.name}`}
                >
                  <Power strokeWidth={1.8} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  disabled={busyId === a.id}
                  onClick={() => setDeleting(a)}
                  title="Excluir"
                  aria-label={`Excluir ${a.name}`}
                >
                  <Trash2 strokeWidth={1.8} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AssociateFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={(c) => {
          setFormOpen(false)
          setCredentials({ ...c, isNew: true })
          load()
        }}
      />

      <CredentialsModal data={credentials} onClose={() => setCredentials(null)} onCopied={() => notify('Copiado')} />

      <ReleaseModal
        associate={releasing}
        onClose={() => {
          setReleasing(null)
          load()
        }}
        onNotify={notify}
      />

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        size="md"
        title="Excluir associado?"
        subtitle={deleting?.name}
        footer={
          <>
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setDeleting(null)}>
              Cancelar
            </button>
            <button type="button" className="ui-btn ui-btn--primary" disabled={!!busyId} onClick={confirmDelete}>
              <Trash2 aria-hidden />
              Excluir
            </button>
          </>
        }
      >
        <p>
          O acesso será removido e a pessoa não conseguirá mais entrar. As vistorias e avaliações que ela já fez
          continuam salvas. Se for só uma pausa, prefira <strong>desativar</strong>.
        </p>
      </Modal>

      <div className={`toast ${toast ? 'is-visible' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function AssociateFormModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (c: AssociateCredentials) => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    setFormError('')
    try {
      const created = await associatesApi.create({ name: name.trim(), email: email.trim() })
      setName('')
      setEmail('')
      onCreated(created)
    } catch (err) {
      if (err instanceof ApiError) {
        const fields: Record<string, string> = {}
        err.errors.forEach((fe: FieldError) => {
          fields[fe.field] = fe.message
        })
        setErrors(fields)
        if (!err.errors.length) setFormError(err.message)
      } else {
        setFormError('Não foi possível cadastrar')
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
      title="Novo associado"
      subtitle="O sistema gera uma senha simples para ele entrar"
      footer={
        <>
          <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="associate-form" className="ui-btn ui-btn--primary" disabled={saving}>
            <Check aria-hidden />
            {saving ? 'Cadastrando…' : 'Cadastrar e gerar senha'}
          </button>
        </>
      }
    >
      <form id="associate-form" className="assoc__form" onSubmit={submit} noValidate>
        <label className="ui-field">
          <span className="ui-field__label">Nome</span>
          <input
            className="ui-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Maria da Silva"
            autoComplete="off"
            autoFocus
          />
          {errors.name && <span className="ui-field__error">{errors.name}</span>}
        </label>
        <label className="ui-field">
          <span className="ui-field__label">E-mail de acesso</span>
          <input
            className="ui-input"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="maria@email.com"
            autoComplete="off"
          />
          <span className="ui-field__hint">Ela usará este e-mail para entrar. Precisa ser um e-mail que ainda não esteja no sistema.</span>
          {errors.email && <span className="ui-field__error">{errors.email}</span>}
        </label>
        {formError && <p className="ui-field__error">{formError}</p>}
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------

function CredentialsModal({
  data,
  onClose,
  onCopied,
}: {
  data: (AssociateCredentials & { isNew: boolean }) | null
  onClose: () => void
  onCopied: () => void
}) {
  const loginUrl = `${window.location.origin}/login`
  const message = data
    ? [
        `Olá, ${data.associate.name.split(' ')[0]}! Seu acesso ao sistema:`,
        '',
        `Endereço: ${loginUrl}`,
        `E-mail: ${data.associate.email}`,
        `Senha: ${data.password}`,
      ].join('\n')
    : ''

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      onCopied()
    } catch {
      /* navegador sem permissão de área de transferência: o texto continua visível na tela */
    }
  }

  return (
    <Modal
      open={!!data}
      onClose={onClose}
      size="md"
      title={data?.isNew ? 'Associado cadastrado' : 'Nova senha gerada'}
      subtitle={data?.associate.name}
      footer={
        <button type="button" className="ui-btn ui-btn--primary" onClick={onClose}>
          Concluir
        </button>
      }
    >
      {data && (
        <div className="assoc__creds">
          <p className="assoc__creds-warn">
            Anote ou envie agora: <strong>a senha aparece só desta vez</strong>. Se perder, é só gerar outra.
          </p>
          <dl className="assoc__creds-box">
            <div>
              <dt>Endereço</dt>
              <dd>{loginUrl}</dd>
            </div>
            <div>
              <dt>E-mail</dt>
              <dd>{data.associate.email}</dd>
            </div>
            <div>
              <dt>Senha</dt>
              <dd className="assoc__password">{data.password}</dd>
            </div>
          </dl>
          <div className="assoc__creds-actions">
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => copy(message)}>
              <Copy aria-hidden />
              Copiar tudo
            </button>
            <a
              className="ui-btn ui-btn--ghost"
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle aria-hidden />
              Enviar por WhatsApp
            </a>
          </div>
        </div>
      )}
    </Modal>
  )
}
