import type { ReservationStatus } from '../../services/api'

export const STATUS_LABEL: Record<ReservationStatus, string> = {
  VAZIO: 'Vazio',
  HOSPEDADO: 'Hospedado',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
}

export const STATUS_OPTIONS: { value: ReservationStatus; label: string }[] = [
  { value: 'VAZIO', label: STATUS_LABEL.VAZIO },
  { value: 'HOSPEDADO', label: STATUS_LABEL.HOSPEDADO },
  { value: 'CONCLUIDO', label: STATUS_LABEL.CONCLUIDO },
  { value: 'CANCELADO', label: STATUS_LABEL.CANCELADO },
]
