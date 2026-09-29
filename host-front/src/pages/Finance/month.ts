import { useSearchParams } from 'react-router-dom'

export const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const pad = (n: number) => String(n).padStart(2, '0')

/** Mês atual no fuso do navegador. */
export function currentMonth() {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

/** Lê "?mes=2026-09" da URL (mantém o mês ao recarregar ou compartilhar o link). */
function parseMonth(value: string | null) {
  const m = value?.match(/^(\d{4})-(\d{2})$/)
  if (!m) return currentMonth()
  const year = Number(m[1])
  const month = Number(m[2])
  return month >= 1 && month <= 12 && year >= 2000 && year <= 2100 ? { year, month } : currentMonth()
}

/** Mês escolhido na URL (?mes=AAAA-MM) + navegação. Compartilhado pelas páginas de Finanças. */
export function useMonthParam() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { year, month } = parseMonth(searchParams.get('mes'))
  const today = currentMonth()

  function goTo(y: number, m: number) {
    const target = m < 1 ? { y: y - 1, m: 12 } : m > 12 ? { y: y + 1, m: 1 } : { y, m }
    setSearchParams(target.y === today.year && target.m === today.month ? {} : { mes: `${target.y}-${pad(target.m)}` })
  }

  return { year, month, today, isCurrent: year === today.year && month === today.month, goTo }
}

/** "?mes=2026-09" para manter o mês ao trocar de página (vazio = mês atual). */
export function monthQuery(year: number, month: number) {
  const today = currentMonth()
  return year === today.year && month === today.month ? '' : `?mes=${year}-${pad(month)}`
}
