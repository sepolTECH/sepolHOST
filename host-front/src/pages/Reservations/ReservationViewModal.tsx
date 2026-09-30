import { CalendarPlus, ExternalLink, Pencil } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import type { Reservation } from '../../services/api'
import { describeDocument } from '../../utils/documents'
import { formatDate, formatMoney, formatPercent } from '../../utils/money'
import { CommissionPct } from '../../components/ui/CommissionPct'
import { openAttachment } from './attachments'
import { AttachmentThumb } from './AttachmentsField'
import {
  ATTACHMENT_LABEL,
  ATTACHMENT_OPTIONS,
  EXTENSION_CHANNEL_LABEL,
  formatFileSize,
  PAYMENT_LABEL,
  PLATFORM_LABEL,
} from './options'
import { STATUS_LABEL } from './status'

const dateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

interface ReservationViewModalProps {
  reservation: Reservation | null // já com companions
  onClose: () => void
  onEdit: (reservation: Reservation) => void
  onExtend: (reservation: Reservation) => void
}

export function ReservationViewModal({ reservation: r, onClose, onEdit, onExtend }: ReservationViewModalProps) {
  const children = r?.companions?.filter((c) => c.ageGroup === 'CHILD').length ?? 0
  const adults = r ? (r.companions?.length ?? 0) + 1 - children : 0

  return (
    <Modal
      open={!!r}
      onClose={onClose}
      title={r ? `Reserva ${r.reservationNumber}` : ''}
      subtitle={r?.propertyName}
      footer={
        r && (
          <>
            <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose}>
              Fechar
            </button>
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => onExtend(r)}>
              <CalendarPlus strokeWidth={1.8} />
              Estender
            </button>
            <button type="button" className="ui-btn ui-btn--primary" onClick={() => onEdit(r)} data-autofocus>
              <Pencil strokeWidth={2} />
              Editar
            </button>
          </>
        )
      }
    >
      {r && (
        <div className="guest-view">
          <div className="res-view__top">
            <span className={`status status--${r.status.toLowerCase()}`}>{STATUS_LABEL[r.status]}</span>
            <span className="res-view__period">
              {formatDate(r.checkIn)} → {formatDate(r.finalCheckOut)}
              <small>
                {r.totalNights} {r.totalNights === 1 ? 'noite' : 'noites'}
                {r.extensionsCount > 0 && ` (${r.nights} + ${r.totalNights - r.nights} de extensão)`}
              </small>
            </span>
          </div>

          <dl className="guest-view__list">
            <Item label="Imóvel" value={r.propertyName} />
            <Item label="Data da reserva" value={formatDate(r.bookedAt)} />
            <Item label="Check-in" value={`${formatDate(r.checkIn)}${r.checkInTime ? ` às ${r.checkInTime}` : ''}`} />
            <Item
              label={r.extensionsCount > 0 ? 'Check-out original' : 'Check-out'}
              value={`${formatDate(r.checkOut)}${r.checkOutTime && r.extensionsCount === 0 ? ` às ${r.checkOutTime}` : ''}`}
            />
            <Item label="Plataforma de origem" value={r.platform ? PLATFORM_LABEL[r.platform] : 'Não informada'} />
            <Item label="Forma de pagamento" value={r.paymentMethod ? PAYMENT_LABEL[r.paymentMethod] : 'Não informada'} />
          </dl>

          <div>
            <h3 className="guest-form__heading res-view__subheading">
              Hóspedes · {r.guestsCount} {r.guestsCount === 1 ? 'pessoa' : 'pessoas'}
              {r.guestsCount > adults + children && ` · ${adults + children} informados`} ({adults}{' '}
              {adults === 1 ? 'adulto' : 'adultos'}
              {children > 0 && `, ${children} ${children === 1 ? 'criança' : 'crianças'}`})
            </h3>
            <ol className="res-view__guests">
              <li>
                <span className="companion__index">1</span>
                <span className="picker-selected__info">
                  <strong>{r.mainGuest?.fullName ?? 'Sem hóspede vinculado'}</strong>
                  {r.mainGuest && <small>{describeDocument(r.mainGuest.documentType, r.mainGuest.documentNumber)}</small>}
                </span>
                <span className="ui-badge ui-badge--dark">Responsável</span>
              </li>
              {r.companions?.map((c, i) => (
                <li key={c.id ?? i}>
                  <span className="companion__index">{i + 2}</span>
                  <span className="picker-selected__info">
                    <strong>{c.fullName}</strong>
                    <small>{c.document || 'Sem identificação'}</small>
                  </span>
                  <span className="ui-badge">{c.ageGroup === 'CHILD' ? 'Criança' : 'Adulto'}</span>
                </li>
              ))}
              {r.guestsCount > (r.companions?.length ?? 0) + 1 && (
                <li className="res-view__pending">
                  {r.guestsCount - (r.companions?.length ?? 0) - 1} hóspede(s) ainda sem nome informado
                </li>
              )}
            </ol>
          </div>

          {(r.extensions?.length ?? 0) > 0 && (
            <div>
              <h3 className="guest-form__heading res-view__subheading">
                Extensões · +{r.totalNights - r.nights} {r.totalNights - r.nights === 1 ? 'noite' : 'noites'}
              </h3>
              <ol className="res-view__guests">
                {r.extensions!.map((x, i) => (
                  <li key={x.id}>
                    <span className="companion__index">E{i + 1}</span>
                    <span className="picker-selected__info">
                      <strong>
                        {formatDate(x.startDate)} → {formatDate(x.checkOut)} · +{x.nights}{' '}
                        {x.nights === 1 ? 'noite' : 'noites'}
                      </strong>
                      <small>
                        {EXTENSION_CHANNEL_LABEL[x.channel]}
                        {x.paymentMethod && ` · ${PAYMENT_LABEL[x.paymentMethod]}`}
                        {x.commissionCents > 0 ? (
                          <>
                            {` · comissão ${formatMoney(x.commissionCents)}`}
                            <CommissionPct commission={x.commissionCents} base={x.amountCents} />
                          </>
                        ) : (
                          x.channel === 'DIRETO' && ' · sem comissão'
                        )}
                      </small>
                    </span>
                    <strong className="guest-form__mono">{formatMoney(x.amountCents)}</strong>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="summary">
            <div className="summary__row">
              <span>Valor da reserva</span>
              <span className="guest-form__mono">{formatMoney(r.amountCents)}</span>
            </div>
            {r.extensionsCents > 0 && (
              <div className="summary__row summary__row--plus">
                <span>Extensões</span>
                <span className="guest-form__mono">+ {formatMoney(r.extensionsCents)}</span>
              </div>
            )}
            {(r.additions?.length ?? 0) > 0 && (
              <div className="summary__row summary__row--plus summary__row--group">
                <span>Valores adicionais</span>
                <span className="guest-form__mono">+ {formatMoney(r.additionsCents)}</span>
                <ul className="summary__items">
                  {r.additions!.map((a, i) => (
                    <li key={a.id ?? i}>
                      <span>
                        {a.description}
                        {a.kind === 'HORAS' && a.hours ? ` · ${String(a.hours).replace('.', ',')} h` : ''}
                      </span>
                      <span className="guest-form__mono">{formatMoney(a.amountCents)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(r.extensionsCents > 0 || (r.additions?.length ?? 0) > 0) && (
              <div className="summary__row summary__row--subtotal">
                <span>Valor bruto</span>
                <span className="guest-form__mono">{formatMoney(r.grossCents)}</span>
              </div>
            )}
            <div className="summary__row summary__row--minus">
              <span>
                Comissão
                {r.commissionType === 'PERCENT' && r.commissionRate !== null ? (
                  <small className="commission-pct">{formatPercent(r.commissionRate)}%</small>
                ) : (
                  <CommissionPct commission={r.commissionCents} base={r.amountCents} />
                )}
              </span>
              <span className="guest-form__mono">− {formatMoney(r.commissionCents)}</span>
            </div>
            {r.extensionsCommissionCents > 0 && (
              <div className="summary__row summary__row--minus">
                <span>
                  Comissão das extensões
                  <CommissionPct
                    commission={r.extensionsCommissionCents}
                    base={(r.extensions ?? []).filter((x) => x.commissionCents > 0).reduce((s, x) => s + x.amountCents, 0)}
                  />
                </span>
                <span className="guest-form__mono">− {formatMoney(r.extensionsCommissionCents)}</span>
              </div>
            )}
            {(r.costs?.length ?? 0) > 0 && (
              <div className="summary__row summary__row--minus summary__row--group">
                <span>Custos e taxas</span>
                <span className="guest-form__mono">− {formatMoney(r.costsCents)}</span>
                <ul className="summary__items">
                  {r.costs!.map((c, i) => (
                    <li key={c.id ?? i}>
                      <span>{c.description}</span>
                      <span className="guest-form__mono">{formatMoney(c.amountCents)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="summary__row summary__row--total">
              <span>Total geral</span>
              <strong className="guest-form__mono">{formatMoney(r.netCents)}</strong>
            </div>
          </div>

          {(r.attachments?.length ?? 0) > 0 && (
            <div>
              <h3 className="guest-form__heading res-view__subheading">
                Documentos e fotos · {r.attachments!.length}
              </h3>
              {ATTACHMENT_OPTIONS.map(({ value }) => {
                const items = r.attachments!.filter((a) => a.category === value)
                if (!items.length) return null
                return (
                  <div key={value} className="att__group">
                    <span className="att__group-title">{ATTACHMENT_LABEL[value]}</span>
                    <ul className="att__list">
                      {items.map((a) => (
                        <li key={a.id} className="att__item">
                          <AttachmentThumb reservationId={r.id} attachment={a} />
                          <div className="att__info">
                            <strong title={a.fileName}>{a.fileName}</strong>
                            <small>
                              {formatFileSize(a.sizeBytes)} · {dateTime(a.createdAt)}
                              {a.createdByName && ` · ${a.createdByName}`}
                            </small>
                          </div>
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => openAttachment(r.id, a)}
                            title="Abrir"
                            aria-label={`Abrir ${a.fileName}`}
                          >
                            <ExternalLink strokeWidth={1.8} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}

          <p className="guest-view__meta">
            Cadastrada em {dateTime(r.createdAt)}
            {r.createdByName && ` por ${r.createdByName}`}
            {r.updatedAt !== r.createdAt && (
              <>
                <br />
                Última alteração em {dateTime(r.updatedAt)}
                {r.updatedByName && ` por ${r.updatedByName}`}
              </>
            )}
          </p>
        </div>
      )}
    </Modal>
  )
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="guest-view__item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
