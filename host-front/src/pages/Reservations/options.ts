import type { AttachmentCategory, ExtensionChannel, PaymentMethod, Platform } from '../../services/api'

export const PLATFORM_LABEL: Record<Platform, string> = {
  AIRBNB: 'Airbnb',
  BOOKING: 'Booking',
  VRBO: 'VRBO',
  DIRETO: 'Contrato direto',
  OUTRA: 'Outra',
}

/** Rótulos curtos para o seletor (cabem lado a lado). */
export const PLATFORM_OPTIONS: { value: Platform; label: string }[] = [
  { value: 'AIRBNB', label: 'Airbnb' },
  { value: 'BOOKING', label: 'Booking' },
  { value: 'VRBO', label: 'VRBO' },
  { value: 'DIRETO', label: 'Direto' },
  { value: 'OUTRA', label: 'Outra' },
]

/** Plataformas que normalmente recebem o pagamento do hóspede. */
export const PAID_VIA_PLATFORM: Platform[] = ['AIRBNB', 'BOOKING', 'VRBO']

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  PLATAFORMA: 'Via plataforma',
  PIX: 'Pix',
  CARTAO_CREDITO: 'Cartão de crédito',
  CARTAO_DEBITO: 'Cartão de débito',
  DINHEIRO: 'Dinheiro',
  TRANSFERENCIA: 'Transferência bancária',
  BOLETO: 'Boleto',
  OUTRO: 'Outro',
}

export const ATTACHMENT_LABEL: Record<AttachmentCategory, string> = {
  CONTRATO: 'Contrato',
  CHECKIN: 'Check-in',
  CHECKOUT: 'Check-out',
  OUTRO: 'Outro',
}

export const ATTACHMENT_OPTIONS = (Object.keys(ATTACHMENT_LABEL) as AttachmentCategory[]).map((value) => ({
  value,
  label: ATTACHMENT_LABEL[value],
}))

/**
 * Sugestões para o tipo de custo da reserva (o campo aceita qualquer texto).
 * Só custos DESTA hospedagem. Despesas fixas do imóvel (condomínio, IPTU, contas...)
 * são lançadas por mês na página de Finanças.
 */
export const COST_SUGGESTIONS = [
  'Limpeza / faxina',
  'Lavanderia / enxoval',
  'Reposição de itens',
  'Reposição de amenities (papel, sabonete, café…)',
  'Kit de boas-vindas',
  'Conserto / dano causado',
  'Check-in / recepção',
  'Taxa de limpeza da plataforma',
  'Taxa de serviço da plataforma',
  'Transfer / deslocamento',
]

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}

export const EXTENSION_CHANNEL_LABEL: Record<ExtensionChannel, string> = {
  PLATAFORMA: 'Pela plataforma',
  DIRETO: 'Direto (por fora)',
}
