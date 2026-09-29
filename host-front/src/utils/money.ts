/** Valores monetários trafegam em centavos (inteiros) para evitar erro de arredondamento. */

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const formatMoney = (cents: number) => brl.format(cents / 100)

/** Máscara de digitação estilo "caixa eletrônico": cada dígito entra pela direita. */
export function centsFromInput(value: string) {
  const digits = value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 12)
  return digits ? Number(digits) : 0
}

/** "12,5" → 12.5 (aceita vírgula ou ponto, até 2 casas, limitado a 100). */
export function parsePercent(value: string) {
  const clean = value.replace(/[^\d,.]/g, '').replace('.', ',')
  const [int = '', dec] = clean.split(',')
  const text = dec !== undefined ? `${int.slice(0, 3)},${dec.slice(0, 2)}` : int.slice(0, 3)
  const n = Number(text.replace(',', '.'))
  return { text, value: Number.isFinite(n) ? Math.min(n, 100) : 0 }
}

export const formatPercent = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

/** Datas "AAAA-MM-DD" (sem fuso) → "24/09/2026". */
export function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function formatDateShort(iso: string) {
  const [, m, d] = iso.split('-')
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${Number(d)} ${months[Number(m) - 1]}`
}

export function todayIso() {
  const now = new Date()
  const off = now.getTimezoneOffset()
  return new Date(now.getTime() - off * 60_000).toISOString().slice(0, 10)
}

export function nightsBetween(checkIn: string, checkOut: string) {
  if (!checkIn || !checkOut) return 0
  return Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000)
}

/** Soma dias a uma data "AAAA-MM-DD". */
export function addDaysIso(iso: string, days: number) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

/** Quanto a comissão representa do valor (ex.: "15%" ou "13,02%"). null quando não há o que mostrar. */
export function commissionPercent(commissionCents: number, baseCents: number) {
  if (!commissionCents || baseCents <= 0) return null
  return `${formatPercent(Math.round((commissionCents / baseCents) * 10_000) / 100)}%`
}
