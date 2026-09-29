import { Save, ShieldBan, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { BlockedAlert } from '../../components/ui/BlockedAlert'
import { Modal } from '../../components/ui/Modal'
import { StarDisplay, StarRating } from '../../components/ui/StarRating'
import { ApiError, reviewsApi, type ReviewInput, type ReviewItem } from '../../services/api'
import { formatDate } from '../../utils/money'
import { STATUS_LABEL } from '../Reservations/status'

const NOTES_MAX = 2000

type RatingField = 'cleanlinessRating' | 'communicationRating' | 'rulesRating'

const CATEGORIES: { field: RatingField; label: string; hint: string }[] = [
  { field: 'cleanlinessRating', label: 'Limpeza', hint: 'Como o imóvel foi deixado no check-out' },
  { field: 'communicationRating', label: 'Comunicação', hint: 'Respostas, educação e clareza no contato' },
  { field: 'rulesRating', label: 'Cumprimento de regras', hint: 'Horários, nº de hóspedes, barulho, pets, fumo…' },
]

const dateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

interface ReviewFormModalProps {
  item: ReviewItem | null
  onClose: () => void
  onSaved: (item: ReviewItem, isNew: boolean, blocked: boolean) => void
  onDeleted: (reservationId: string) => void
}

/** Abre com a avaliação atual da reserva (ou em branco). Remonte com key para reiniciar o formulário. */
export function ReviewFormModal({ item, onClose, onSaved, onDeleted }: ReviewFormModalProps) {
  const review = item?.review
  const [values, setValues] = useState<ReviewInput>({
    cleanlinessRating: review?.cleanlinessRating ?? 0,
    communicationRating: review?.communicationRating ?? 0,
    rulesRating: review?.rulesRating ?? 0,
    notes: review?.notes ?? '',
    blockGuest: false,
    blockReason: '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof ReviewInput, string>>>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const filled = values.cleanlinessRating && values.communicationRating && values.rulesRating
  const average = filled ? (values.cleanlinessRating + values.communicationRating + values.rulesRating) / 3 : 0
  // Histórico do hóspede sem contar esta reserva
  const guestOthers = item ? item.guest.reviewsCount - (review ? 1 : 0) : 0

  function setRating(field: RatingField, n: number) {
    setValues((v) => ({ ...v, [field]: n }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!item) return
    const next: typeof errors = {}
    for (const c of CATEGORIES) if (!values[c.field]) next[c.field] = `Dê uma nota de ${c.label.toLowerCase()}`
    if (values.blockGuest && (values.blockReason ?? '').trim().length < 3) next.blockReason = 'Informe o motivo do bloqueio'
    setErrors(next)
    setFormError('')
    if (Object.keys(next).length) return

    setSaving(true)
    try {
      const { item: saved } = await reviewsApi.save(item.reservation.id, values)
      onSaved(saved, !review, !!values.blockGuest)
    } catch (err) {
      if (err instanceof ApiError && err.errors.length) {
        setErrors(Object.fromEntries(err.errors.map((fe) => [fe.field, fe.message])))
      }
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar a avaliação')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!item) return
    if (!confirmDelete) return setConfirmDelete(true)
    setDeleting(true)
    try {
      await reviewsApi.remove(item.reservation.id)
      onDeleted(item.reservation.id)
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível excluir a avaliação')
      setConfirmDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  const busy = saving || deleting
  const r = item?.reservation

  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title={review ? 'Avaliação da hospedagem' : 'Avaliar hospedagem'}
      subtitle={r ? `Reserva ${r.reservationNumber} · ${r.propertyName}` : undefined}
      footer={
        item && (
          <>
            {review && (
              <button
                type="button"
                className={`ui-btn ui-btn--ghost review-form__delete ${confirmDelete ? 'is-confirming' : ''}`}
                onClick={handleDelete}
                onBlur={() => setConfirmDelete(false)}
                disabled={busy}
              >
                {deleting ? <span className="spinner" /> : <Trash2 strokeWidth={1.8} />}
                {confirmDelete ? 'Confirmar exclusão' : 'Excluir'}
              </button>
            )}
            <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" form="review-form" className="ui-btn ui-btn--primary" disabled={busy}>
              {saving ? <span className="spinner" /> : <Save strokeWidth={2} />}
              {review ? 'Salvar alterações' : 'Salvar avaliação'}
            </button>
          </>
        )
      }
    >
      {item && r && (
        <form id="review-form" className="review-form" onSubmit={handleSubmit} noValidate>
          {item.guest.blocked && (
            <BlockedAlert
              block={item.guest.blocked}
              guestId={item.guest.id}
              title={`${item.guest.fullName} está bloqueado`}
            />
          )}

          <div className="review-form__context">
            <div>
              <span>Hóspede responsável</span>
              <strong>{item.guest.fullName}</strong>
              {item.reservation.guestsCount > 1 && <small>+{item.reservation.guestsCount - 1} acompanhante(s)</small>}
            </div>
            <div>
              <span>Período</span>
              <strong>
                {formatDate(r.checkIn)} → {formatDate(r.finalCheckOut)}
              </strong>
              <small>
                {r.totalNights} {r.totalNights === 1 ? 'noite' : 'noites'}
              </small>
            </div>
            <div>
              <span>Status</span>
              <span className={`status status--${r.status.toLowerCase()}`}>{STATUS_LABEL[r.status]}</span>
            </div>
            <div>
              <span>Histórico do hóspede</span>
              {guestOthers > 0 && item.guest.averageRating !== null ? (
                <>
                  <StarDisplay value={item.guest.averageRating} />
                  <small>
                    média de {item.guest.reviewsCount} {item.guest.reviewsCount === 1 ? 'avaliação' : 'avaliações'}
                  </small>
                </>
              ) : (
                <small>Nenhuma outra avaliação</small>
              )}
            </div>
          </div>

          <div className="review-form__ratings">
            {CATEGORIES.map((c) => {
              const hintId = `review-${c.field}-hint`
              return (
                <div key={c.field} className={`review-form__rating ${errors[c.field] ? 'has-error' : ''}`}>
                  <div className="review-form__rating-text">
                    <strong id={`review-${c.field}-label`}>
                      Nota de {c.label.toLowerCase()} <span className="req">*</span>
                    </strong>
                    <small id={hintId}>{c.hint}</small>
                    {errors[c.field] && <p className="ui-field__error">{errors[c.field]}</p>}
                  </div>
                  <StarRating
                    size="lg"
                    value={values[c.field]}
                    onChange={(n) => setRating(c.field, n)}
                    ariaLabel={`Nota de ${c.label.toLowerCase()}`}
                    ariaDescribedBy={hintId}
                    invalid={!!errors[c.field]}
                    disabled={busy}
                  />
                </div>
              )
            })}
            <div className="review-form__average" aria-live="polite">
              <span>Média</span>
              {filled ? <StarDisplay value={average} size="md" /> : <small>Preencha as 3 notas</small>}
            </div>
          </div>

          <div className={`ui-field ${errors.notes ? 'has-error' : ''}`}>
            <label htmlFor="review-notes">Observações</label>
            <textarea
              id="review-notes"
              className="ui-input ui-textarea"
              rows={5}
              maxLength={NOTES_MAX}
              placeholder="Como foi a hospedagem? Problemas, danos, reclamações de vizinhos, se alugaria de novo…"
              value={values.notes}
              onChange={(e) => {
                setValues((v) => ({ ...v, notes: e.target.value }))
                setErrors((er) => ({ ...er, notes: undefined }))
              }}
              disabled={busy}
            />
            <div className="review-form__notes-foot">
              {errors.notes ? (
                <p className="ui-field__error">{errors.notes}</p>
              ) : (
                <p className="ui-field__hint">Uso interno — o hóspede não vê esta avaliação.</p>
              )}
              <small>
                {values.notes.length}/{NOTES_MAX}
              </small>
            </div>
          </div>

          {!item.guest.blocked && (
            <div className={`review-block ${values.blockGuest ? 'is-on' : ''}`}>
              <label className="review-block__toggle">
                <input
                  type="checkbox"
                  className="review-switch"
                  checked={!!values.blockGuest}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, blockGuest: e.target.checked }))
                    setErrors((er) => ({ ...er, blockReason: undefined }))
                  }}
                  disabled={busy}
                />
                <span className="review-block__text">
                  <strong>
                    <ShieldBan strokeWidth={1.8} aria-hidden />
                    Bloquear hóspede
                  </strong>
                  <small>
                    {item.guest.fullName} vai para a página de Bloqueados e será alertado ao ser adicionado em novas reservas.
                  </small>
                </span>
              </label>

              {values.blockGuest && (
                <div className={`ui-field ${errors.blockReason ? 'has-error' : ''}`}>
                  <div className="review-block__reason-head">
                    <label htmlFor="review-block-reason">
                      Motivo do bloqueio <span className="req">*</span>
                    </label>
                    {values.notes.trim() && !values.blockReason?.trim() && (
                      <button
                        type="button"
                        className="review-block__copy"
                        onClick={() => setValues((v) => ({ ...v, blockReason: v.notes }))}
                      >
                        Usar as observações
                      </button>
                    )}
                  </div>
                  <textarea
                    id="review-block-reason"
                    className="ui-input ui-textarea"
                    rows={3}
                    maxLength={NOTES_MAX}
                    placeholder="Ex.: festa sem autorização, danos no imóvel, desrespeito às regras do condomínio…"
                    value={values.blockReason}
                    onChange={(e) => {
                      setValues((v) => ({ ...v, blockReason: e.target.value }))
                      setErrors((er) => ({ ...er, blockReason: undefined }))
                    }}
                    disabled={busy}
                    autoFocus
                  />
                  {errors.blockReason && <p className="ui-field__error">{errors.blockReason}</p>}
                </div>
              )}
            </div>
          )}

          {formError && <p className="ui-field__error review-form__error">{formError}</p>}

          {review && (
            <p className="guest-view__meta">
              Avaliada em {dateTime(review.createdAt)}
              {review.createdByName && ` por ${review.createdByName}`}
              {review.updatedAt !== review.createdAt && (
                <>
                  <br />
                  Última alteração em {dateTime(review.updatedAt)}
                  {review.updatedByName && ` por ${review.updatedByName}`}
                </>
              )}
            </p>
          )}
        </form>
      )}
    </Modal>
  )
}
