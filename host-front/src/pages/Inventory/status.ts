import type { InventoryStatus } from '../../services/api'

export const INVENTORY_STATUS_LABEL: Record<InventoryStatus, string> = {
  PENDENTE: 'Pendente vistoria',
  VISTORIADO: 'Vistoriado',
}
