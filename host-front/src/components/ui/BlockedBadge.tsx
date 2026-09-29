import { ShieldBan } from 'lucide-react'
import './BlockedAlert.css'

/** Etiqueta "Bloqueado" (hóspede bloqueado). */
export function BlockedBadge({ reason }: { reason?: string }) {
  return (
    <span className="blocked-badge" title={reason ? `Bloqueado: ${reason}` : 'Hóspede bloqueado'}>
      <ShieldBan strokeWidth={2.2} aria-hidden />
      Bloqueado
    </span>
  )
}
