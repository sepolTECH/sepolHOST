import { ShieldBan } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { GuestBlock } from '../../services/api'
import './BlockedAlert.css'

const date = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

interface BlockedAlertProps {
  block: GuestBlock
  guestId: string
  /** Texto do título (padrão: "Hóspede bloqueado"). */
  title?: string
  /** Mostra o link para abrir o hóspede na página de Bloqueados. */
  showLink?: boolean
  /** Abre o link em nova aba (use dentro de formulários, para não perder o que foi digitado). */
  newTab?: boolean
}

/** Alerta de hóspede bloqueado: motivo, quando/quem bloqueou e link para a página de Bloqueados. */
export function BlockedAlert({
  block,
  guestId,
  title = 'Hóspede bloqueado',
  showLink = true,
  newTab = false,
}: BlockedAlertProps) {
  return (
    <div className="blocked-alert" role="alert">
      <ShieldBan className="blocked-alert__icon" strokeWidth={1.8} aria-hidden />
      <div className="blocked-alert__body">
        <strong>{title}</strong>
        <p className="blocked-alert__reason">{block.reason}</p>
        <small>
          Bloqueado em {date(block.blockedAt)}
          {block.blockedByName && ` por ${block.blockedByName}`}
          {block.reservationNumber && ` · reserva ${block.reservationNumber}`}
          {showLink && (
            <>
              {' · '}
              <Link
                to={`/bloqueados?hospede=${guestId}`}
                {...(newTab ? { target: '_blank', rel: 'noreferrer' } : {})}
              >
                Ver avaliações{newTab && ' ↗'}
              </Link>
            </>
          )}
        </small>
      </div>
    </div>
  )
}
