import type { CalendarEvent, Platform } from '../../services/api'
import { addDaysIso } from '../../utils/money'

export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const WEEKDAYS_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const pad = (n: number) => String(n).padStart(2, '0')
export const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

/** Dia da semana (0 = domingo) de uma data "AAAA-MM-DD". */
export const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay()
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

/** "qui, 1 out" */
export function formatDayLong(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const current = new Date().getFullYear()
  return `${WEEKDAYS_LONG[weekdayOf(iso)]}, ${d} ${MONTHS_SHORT[m - 1]}${y !== current ? ` ${y}` : ''}`
}

/** Semanas (domingo a sábado) que cobrem o mês. */
export function monthWeeks(year: number, month: number) {
  const first = isoOf(year, month, 1)
  const start = addDaysIso(first, -weekdayOf(first))
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const last = isoOf(year, month, daysInMonth)
  const end = addDaysIso(last, 6 - weekdayOf(last)) // último sábado
  const weeks: string[][] = []
  for (let d = start; d <= end; d = addDaysIso(d, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDaysIso(d, i)))
  }
  return { weeks, first, last, gridStart: start, gridEnd: addDaysIso(end, 1), daysInMonth }
}

export interface Segment {
  event: CalendarEvent
  /** posição e largura em fração da semana (0–1) */
  left: number
  right: number
  lane: number
  isStart: boolean
  isEnd: boolean
}

/**
 * Barras da semana no estilo das plataformas: começam no meio do dia do check-in
 * e terminam no meio do dia do check-out (assim a saída e a entrada do mesmo dia
 * cabem lado a lado na mesma linha).
 */
export function weekSegments(week: string[], events: CalendarEvent[]) {
  const weekStart = week[0]
  const weekEnd = addDaysIso(weekStart, 7)
  const segments: Segment[] = events
    .filter((e) => e.start < weekEnd && e.end >= weekStart)
    .map((event) => {
      const startIdx = daysBetween(weekStart, event.start)
      const endIdx = daysBetween(weekStart, event.end)
      return {
        event,
        left: Math.max(0, (startIdx + 0.5) / 7),
        right: Math.min(1, (endIdx + 0.5) / 7),
        lane: 0,
        isStart: startIdx >= 0,
        isEnd: endIdx <= 6,
      }
    })
    .filter((s) => s.right - s.left > 0.001)
    // reservas primeiro (ficam na linha de cima), depois por data
    .sort((a, b) => a.left - b.left || kindOrder(a.event) - kindOrder(b.event) || b.right - a.right)

  const laneEnds: number[] = []
  for (const s of segments) {
    let lane = laneEnds.findIndex((end) => end <= s.left + 0.0001)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(0)
    }
    laneEnds[lane] = s.right
    s.lane = lane
  }
  return { segments, lanes: laneEnds.length }
}

const kindOrder = (e: CalendarEvent) => (e.kind === 'RESERVA' ? 0 : 1)

/** Cores padrão sugeridas para cada plataforma. */
export const PLATFORM_COLOR: Record<Platform, string> = {
  AIRBNB: '#FF5A5F',
  BOOKING: '#003B95',
  VRBO: '#245ABC',
  DIRETO: '#0F9D58',
  OUTRA: '#7C3AED',
}

export const COLOR_SWATCHES = ['#FF5A5F', '#003B95', '#245ABC', '#0F9D58', '#F59E0B', '#7C3AED', '#DB2777', '#0891B2', '#525252']

/** Cor do texto (preto ou branco) com melhor contraste sobre a cor de fundo. */
export function textOn(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.4 ? '#111111' : '#ffffff'
}

/** Nome exibido na marcação. */
export function eventTitle(e: CalendarEvent) {
  if (e.guestName) return e.guestName
  return e.kind === 'BLOQUEIO' ? 'Bloqueado' : 'Reservado'
}

/** Situação da estadia em relação a hoje. */
export function stayPhase(e: CalendarEvent, today: string) {
  if (e.end < today) return 'Concluída'
  if (e.end === today) return 'Check-out hoje'
  if (e.start === today) return 'Check-in hoje'
  if (e.start < today) return 'Em andamento'
  const days = daysBetween(today, e.start)
  return days === 1 ? 'Começa amanhã' : `Começa em ${days} dias`
}

/** Link para cadastrar uma reserva já preenchida com os dados da marcação (e vinculá-la ao salvar). */
export function newReservationUrl(e: CalendarEvent) {
  const qs = new URLSearchParams({
    nova: '1',
    checkIn: e.start,
    checkOut: e.end,
    plataforma: e.platform,
    vincularLink: e.feedId,
    vincularMarcacao: e.eventKey,
  })
  if (e.reservationCode) qs.set('numero', e.reservationCode)
  if (e.propertyName) qs.set('imovel', e.propertyName)
  return `/cadastro/reservas?${qs}`
}
