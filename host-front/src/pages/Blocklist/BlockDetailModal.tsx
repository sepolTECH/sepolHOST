import { LockOpen, Pencil, ShieldBan, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { StarDisplay } from '../../components/ui/StarRating'
import { ApiError, blocklistApi, type BlockDetail } from '../../services/api'
import { DOCUMENT_LABEL, formatDocument, formatPhone, initials } from '../../utils/documents'
import { formatDate } from '../../utils/money'
import { formatRating } from '../../utils/rating'

const REASON_MAX = 2000
const dateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

const CATEGORIES = [
  { key: 'cleanlinessRating', label: 'Limpeza' },
  { key: 'communicationRating', label: 'Comunicação' },
  { key: 'rulesRating', label: 'Regras' },
] as const

interface BlockDetailModalProps {
  guestId: string | null
  onClose: () => void
  onChanged: (message: string) => void // motivo alterado ou hóspede desbloqueado
}

/** Motivo do bloqueio + avaliações de todas as hospedagens do hóspede. Remonte com key a cada abertura. */
export function BlockDetailModal({ guestId, onClose, onChanged }: BlockDetailModalProps) {
  const [loaded, setLoaded] = useState<{ id: string; detail: BlockDetail | null; error: string } | null>(null)
  const [editing, setEditing] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmUnblock, setConfirmUnblock] = useState(false)
  const [unblocking, setUnblocking] = useState(false)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    if (!guestId) return
    const controller = new AbortController()
    blocklistApi
      .get(guestId, controller.signal)
      .then((detail) => setLoaded({ id: guestId, detail, error: '' }))
      .catch((err) => {
        if (!controller.signal.aborted)
          setLoaded({ id: guestId, detail: null, error: err.message ?? 'Erro ao carregar o hóspede' })
      })
    return () => controller.abort()
  }, [guestId])

  const loading = !!guestId && loaded?.id !== guestId
  const detail = loading ? null : loaded?.detail
  const b = detail?.block

  async function saveReason() {
    if (!b) return
    if (reason.trim().length < 3) return setReasonError('Informe o motivo do bloqueio')
    setSaving(true)
    setActionError('')
    try {
      const updated = await blocklistApi.block(b.guest.id, reason.trim())
      setLoaded({ id: b.guest.id, detail: updated, error: '' })
      setEditing(false)
      onChanged('Motivo do bloqueio atualizado')
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível salvar o motivo')
    } finally {
      setSaving(false)
    }
  }

  async function unblock() {
    if (!b) return
    if (!confirmUnblock) return setConfirmUnblock(true)
    setUnblocking(true)
    setActionError('')
    try {
      await blocklistApi.unblock(b.guest.id)
      onChanged(`${b.guest.fullName} foi desbloqueado`)
      onClose()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível desbloquear')
      setConfirmUnblock(false)
    } finally {
      setUnblocking(false)
    }
  }

  const busy = saving || unblocking

  return (
    <Modal
      open={!!guestId}
      onClose={onClose}
      title={b ? b.guest.fullName : 'Hóspede bloqueado'}
      subtitle={
        b ? `${DOCUMENT_LABEL[b.guest.documentType]} ${formatDocument(b.guest.documentType, b.guest.documentNumber)}` : undefined
      }
      footer={
        b && (
          <>
            <button
              type="button"
              className={`ui-btn ui-btn--ghost block-detail__unblock ${confirmUnblock ? 'is-confirming' : ''}`}
              onClick={unblock}
              onBlur={() => setConfirmUnblock(false)}
              disabled={busy}
            >
              {unblocking ? <span className="spinner" /> : <LockOpen strokeWidth={1.8} />}
              {confirmUnblock ? 'Confirmar desbloqueio' : 'Desbloquear'}
            </button>
            <button type="button" className="ui-btn ui-btn--primary" onClick={onClose} disabled={busy} data-autofocus>
              Fechar
            </button>
          </>
        )
      }
    >
      {loading ? (
        <div className="block-detail__state">
          <span className="spinner spinner--lg" aria-label="Carregando" />
        </div>
      ) : !b ? (
        <div className="block-detail__state">
          <p className="ui-field__error">{loaded?.error || 'Hóspede não encontrado'}</p>
        </div>
      ) : (
        <div className="block-detail">
          <div className="guest-view__head">
            <span className="guest-avatar guest-avatar--lg" aria-hidden>
              {initials(b.guest.fullName)}
            </span>
            <div>
              <strong className="guest-view__name">{b.guest.fullName}</strong>
              <span className="block-detail__contact">
                {formatPhone(b.guest.phone)}
                {b.guest.email && ` · ${b.guest.email}`}
              </span>
            </div>
          </div>

          {/* Motivo do bloqueio */}
          <section className="block-detail__reason">
            <header>
              <h4>
                <ShieldBan strokeWidth={1.8} aria-hidden />
                Motivo do bloqueio
              </h4>
              {!editing && (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => {
                    setReason(b.reason)
                    setReasonError('')
                    setEditing(true)
                  }}
                  aria-label="Editar motivo"
                  title="Editar motivo"
                >
                  <Pencil strokeWidth={1.8} />
                </button>
              )}
            </header>
            {editing ? (
              <div className={`ui-field ${reasonError ? 'has-error' : ''}`}>
                <textarea
                  className="ui-input ui-textarea"
                  rows={4}
                  maxLength={REASON_MAX}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value)
                    setReasonError('')
                  }}
                  aria-label="Motivo do bloqueio"
                  disabled={saving}
                  autoFocus
                />
                {reasonError && <p className="ui-field__error">{reasonError}</p>}
                <div className="block-detail__edit-actions">
                  <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setEditing(false)} disabled={saving}>
                    Cancelar
                  </button>
                  <button type="button" className="ui-btn ui-btn--primary" onClick={saveReason} disabled={saving}>
                    {saving && <span className="spinner" />}
                    Salvar motivo
                  </button>
                </div>
              </div>
            ) : (
              <p className="block-detail__reason-text">{b.reason}</p>
            )}
            <small>
              Bloqueado em {dateTime(b.blockedAt)}
              {b.blockedByName && ` por ${b.blockedByName}`}
              {b.reservationNumber && ` · a partir da reserva ${b.reservationNumber}`}
              {b.updatedAt !== b.blockedAt && (
                <>
                  <br />
                  Motivo alterado em {dateTime(b.updatedAt)}
                  {b.updatedByName && ` por ${b.updatedByName}`}
                </>
              )}
            </small>
          </section>

          {actionError && <p className="ui-field__error review-form__error">{actionError}</p>}

          {/* Avaliações das hospedagens */}
          <section className="block-detail__reviews">
            <header>
              <h4>Avaliações das hospedagens</h4>
              {b.guest.averageRating !== null && b.guest.reviewsCount > 0 && (
                <span className="block-detail__avg">
                  <StarDisplay value={b.guest.averageRating} />
                  <small>
                    média de {b.guest.reviewsCount} {b.guest.reviewsCount === 1 ? 'avaliação' : 'avaliações'}
                  </small>
                </span>
              )}
            </header>

            {detail.reviews.length === 0 ? (
              <div className="stays__state stays__state--empty">
                <Star strokeWidth={1.5} aria-hidden />
                <p>Nenhuma hospedagem avaliada ainda.</p>
              </div>
            ) : (
              <ul className="block-reviews">
                {detail.reviews.map((r) => (
                  <li key={r.reservationId} className={`block-review ${r.isBlockOrigin ? 'is-origin' : ''}`}>
                    <div className="block-review__head">
                      <div>
                        <strong>{r.propertyName}</strong>
                        <small>
                          Reserva {r.reservationNumber} · {formatDate(r.checkIn)} → {formatDate(r.finalCheckOut)}
                        </small>
                      </div>
                      <div className="block-review__badges">
                        {r.isBlockOrigin && <span className="blocked-badge">Motivou o bloqueio</span>}
                        <span className="block-review__avg">{formatRating(r.average)}</span>
                      </div>
                    </div>
                    <dl className="block-review__ratings">
                      {CATEGORIES.map((c) => (
                        <div key={c.key}>
                          <dt>{c.label}</dt>
                          <dd>
                            <StarDisplay value={r[c.key]} showValue={false} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                    {r.notes ? (
                      <p className="block-review__notes">{r.notes}</p>
                    ) : (
                      <p className="block-review__notes block-review__notes--empty">Sem observações.</p>
                    )}
                    <small className="block-review__meta">
                      Avaliada em {dateTime(r.updatedAt)}
                      {r.reviewedByName && ` por ${r.reviewedByName}`}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  )
}
