import { BedDouble, FileText, Pencil, UserRound, Users } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { Modal } from '../../components/ui/Modal'
import type { Guest } from '../../services/api'
import {
  DOCUMENT_LABEL,
  formatAddress,
  formatDocument,
  formatPhone,
  initials,
  PERSON_LABEL,
} from '../../utils/documents'
import { BlockedAlert } from '../../components/ui/BlockedAlert'
import { DependentNotice } from '../../components/ui/DependentNotice'
import { StarDisplay } from '../../components/ui/StarRating'
import { GuestDependents } from './GuestDependents'
import { GuestStaysHistory } from './GuestStaysHistory'
import { useDocumentPhoto } from './useDocumentPhoto'

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

interface GuestViewModalProps {
  guest: Guest | null
  onClose: () => void
  onEdit: (guest: Guest) => void
  /** Abre outro hóspede (ex.: um dependente que também tem cadastro). */
  onOpenGuest?: (guest: Guest) => void
}

const TABS = ['dados', 'historico', 'dependentes'] as const
type Tab = (typeof TABS)[number]

export function GuestViewModal({ guest, onClose, onEdit, onOpenGuest }: GuestViewModalProps) {
  const photo = useDocumentPhoto(guest)
  const tabsId = useId()
  // A aba volta para "Dados" sempre que outro hóspede é aberto
  const [tabState, setTabState] = useState<{ guestId: string; tab: Tab } | null>(null)
  const tab: Tab = guest && tabState?.guestId === guest.id ? tabState.tab : 'dados'
  const selectTab = (t: Tab) => guest && setTabState({ guestId: guest.id, tab: t })
  const address = guest ? formatAddress(guest) : ''

  return (
    <Modal
      open={!!guest}
      onClose={onClose}
      title="Dados do hóspede"
      subtitle={guest ? `${DOCUMENT_LABEL[guest.documentType]} ${formatDocument(guest.documentType, guest.documentNumber)}` : undefined}
      footer={
        guest && (
          <>
            <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose}>
              Fechar
            </button>
            <button type="button" className="ui-btn ui-btn--primary" onClick={() => onEdit(guest)} data-autofocus>
              <Pencil strokeWidth={2} />
              Editar
            </button>
          </>
        )
      }
    >
      {guest && (
        <div className="guest-view">
          <div className="guest-view__head">
            <span className="guest-avatar guest-avatar--lg" aria-hidden>
              {initials(guest.fullName)}
            </span>
            <div>
              <strong className="guest-view__name">{guest.fullName}</strong>
              <span className="guest-view__badges">
                <span className="ui-badge">{PERSON_LABEL[guest.personType]}</span>
                {guest.isForeign && <span className="ui-badge ui-badge--dark">Estrangeiro</span>}
              </span>
              {guest.averageRating !== null && guest.reviewsCount > 0 && (
                <span className="guest-cell__rating">
                  <StarDisplay value={guest.averageRating} />
                  <small>
                    média de {guest.reviewsCount} {guest.reviewsCount === 1 ? 'avaliação' : 'avaliações'}
                  </small>
                </span>
              )}
            </div>
          </div>

          {guest.blocked && <BlockedAlert block={guest.blocked} guestId={guest.id} />}
          {/* Se ele já foi dependente de alguém (principalmente de um hóspede bloqueado) */}
          <DependentNotice key={guest.id} document={guest.documentNumber} excludeMainGuestId={guest.id} />

          <div className="view-tabs" role="tablist" aria-label="Seções do hóspede">
            <TabButton id={tabsId} tab="dados" active={tab} onSelect={selectTab}>
              <UserRound strokeWidth={1.8} />
              Dados
            </TabButton>
            <TabButton id={tabsId} tab="historico" active={tab} onSelect={selectTab}>
              <BedDouble strokeWidth={1.8} />
              Histórico de hospedagens
            </TabButton>
            <TabButton id={tabsId} tab="dependentes" active={tab} onSelect={selectTab}>
              <Users strokeWidth={1.8} />
              Dependentes
            </TabButton>
          </div>

          {tab === 'dependentes' ? (
            <div
              className="view-tabs__panel"
              role="tabpanel"
              id={`${tabsId}-dependentes-panel`}
              aria-labelledby={`${tabsId}-dependentes-tab`}
            >
              <GuestDependents guest={guest} onOpenGuest={onOpenGuest} />
            </div>
          ) : tab === 'historico' ? (
            <div
              className="view-tabs__panel"
              role="tabpanel"
              id={`${tabsId}-historico-panel`}
              aria-labelledby={`${tabsId}-historico-tab`}
            >
              <GuestStaysHistory guestId={guest.id} />
            </div>
          ) : (
            <div
              className="view-tabs__panel guest-view"
              role="tabpanel"
              id={`${tabsId}-dados-panel`}
              aria-labelledby={`${tabsId}-dados-tab`}
            >
              <dl className="guest-view__list">
                <Item label="Nacionalidade" value={guest.nationality} />
                <Item
                  label={DOCUMENT_LABEL[guest.documentType]}
                  value={formatDocument(guest.documentType, guest.documentNumber)}
                  mono
                />
                {guest.rg && <Item label="RG" value={guest.rg} mono />}
                <Item label="Telefone" value={formatPhone(guest.phone)} />
                {guest.email && <Item label="E-mail" value={guest.email} />}
                {address && <Item label="Endereço" value={address} full />}
              </dl>

              {guest.notes && (
                <div className="guest-view__block">
                  <h4>Observações internas</h4>
                  <p className="guest-view__notes">{guest.notes}</p>
                </div>
              )}

              {guest.hasDocumentPhoto && (
                <div className="guest-view__block">
                  <h4>Foto do documento</h4>
                  <div className="doc-photo__preview doc-photo__preview--view">
                    {photo.loading ? (
                      <span className="spinner spinner--lg" aria-label="Carregando foto" />
                    ) : photo.error ? (
                      <p className="ui-field__error">{photo.error}</p>
                    ) : guest.documentPhotoMime === 'application/pdf' ? (
                      <a className="doc-photo__pdf" href={photo.url ?? undefined} target="_blank" rel="noreferrer">
                        <FileText strokeWidth={1.5} />
                        <span>Documento em PDF</span>
                        <small>Clique para abrir</small>
                      </a>
                    ) : (
                      photo.url && (
                        <a href={photo.url} target="_blank" rel="noreferrer" title="Abrir em tamanho real">
                          <img src={photo.url} alt={`Documento de ${guest.fullName}`} />
                        </a>
                      )
                    )}
                  </div>
                </div>
              )}

              <p className="guest-view__meta">
                Cadastrado em {dateTime(guest.createdAt)}
                {guest.createdByName && ` por ${guest.createdByName}`}
                {guest.updatedAt !== guest.createdAt && (
                  <>
                    <br />
                    Última alteração em {dateTime(guest.updatedAt)}
                    {guest.updatedByName && ` por ${guest.updatedByName}`}
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function Item({ label, value, mono, full }: { label: string; value: string; mono?: boolean; full?: boolean }) {
  return (
    <div className={`guest-view__item ${full ? 'guest-view__item--full' : ''}`}>
      <dt>{label}</dt>
      <dd className={mono ? 'guest-form__mono' : undefined}>{value}</dd>
    </div>
  )
}

function TabButton({
  id,
  tab,
  active,
  onSelect,
  children,
}: {
  id: string
  tab: Tab
  active: Tab
  onSelect: (tab: Tab) => void
  children: ReactNode
}) {
  const selected = tab === active
  return (
    <button
      type="button"
      role="tab"
      id={`${id}-${tab}-tab`}
      aria-selected={selected}
      aria-controls={`${id}-${tab}-panel`}
      tabIndex={selected ? 0 : -1}
      className={`view-tabs__tab ${selected ? 'is-active' : ''}`}
      onClick={() => onSelect(tab)}
      onKeyDown={(e) => {
        // Setas alternam entre as abas (padrão WAI-ARIA)
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault()
          const step = e.key === 'ArrowRight' ? 1 : -1
          const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length]
          onSelect(next)
          document.getElementById(`${id}-${next}-tab`)?.focus()
        }
      }}
    >
      {children}
    </button>
  )
}
