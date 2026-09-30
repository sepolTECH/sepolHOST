import { CalendarPlus, Check, Minus, Plus, ReceiptText, Trash2, UserPlus } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { DateRangePicker } from '../../components/ui/DateRangePicker'
import { DependentNotice } from '../../components/ui/DependentNotice'
import { GuestPicker } from '../../components/ui/GuestPicker'
import { GuestFormModal } from '../Guests/GuestFormModal'
import { Modal } from '../../components/ui/Modal'
import { Segmented } from '../../components/ui/Segmented'
import {
  ApiError,
  reservationsApi,
  type AgeGroup,
  type CommissionType,
  type ExtensionChannel,
  type Guest,
  type MainGuest,
  type PaymentMethod,
  type Platform,
  settingsApi,
  type Reservation,
  type ReservationInput,
  type ReservationStatus,
} from '../../services/api'
import { describeDocument } from '../../utils/documents'
import {
  addDaysIso,
  centsFromInput,
  formatDate,
  formatMoney,
  formatPercent,
  nightsBetween,
  parsePercent,
  todayIso,
} from '../../utils/money'
import { CommissionPct } from '../../components/ui/CommissionPct'
import { AttachmentsField, type PendingAttachment } from './AttachmentsField'
import {
  COST_SUGGESTIONS,
  EXTENSION_CHANNEL_LABEL,
  PAID_VIA_PLATFORM,
  PAYMENT_LABEL,
  PLATFORM_LABEL,
  PLATFORM_OPTIONS,
} from './options'
import { STATUS_OPTIONS } from './status'

const MAX_GUESTS = 50
const MAX_COSTS = 50
const MAX_EXTENSIONS = 20

interface CompanionDraft {
  key: number
  fullName: string
  document: string
  ageGroup: AgeGroup
}

interface CostDraft {
  key: number
  description: string
  amountCents: number
}

interface ExtensionDraft {
  key: number
  checkOut: string // novo check-out
  channel: ExtensionChannel
  amountCents: number // só usado quando DIRETO
  paymentMethod: PaymentMethod | ''
}

interface FormValues {
  reservationNumber: string
  mainGuest: MainGuest | null
  propertyName: string
  guestsCount: number
  companions: CompanionDraft[]
  bookedAt: string
  checkIn: string
  checkOut: string
  status: ReservationStatus
  platform: Platform | ''
  paymentMethod: PaymentMethod | ''
  amountCents: number
  commissionType: CommissionType
  commissionRateText: string
  commissionCents: number
  costs: CostDraft[]
  extensions: ExtensionDraft[]
}

type Errors = Record<string, string | undefined>

let nextKey = 1
const draft = (c?: Partial<CompanionDraft>): CompanionDraft => ({
  key: nextKey++,
  fullName: c?.fullName ?? '',
  document: c?.document ?? '',
  ageGroup: c?.ageGroup ?? 'ADULT',
})
const costDraft = (c?: Partial<CostDraft>): CostDraft => ({
  key: nextKey++,
  description: c?.description ?? '',
  amountCents: c?.amountCents ?? 0,
})

/** Nova extensão: começa no último check-out e sugere +1 noite. */
function newExtension(v: Pick<FormValues, 'checkOut' | 'extensions' | 'platform'>): ExtensionDraft {
  const last = v.extensions.length ? v.extensions[v.extensions.length - 1].checkOut : v.checkOut
  return {
    key: nextKey++,
    checkOut: last ? addDaysIso(last, 1) : '',
    channel: v.platform === 'DIRETO' ? 'DIRETO' : 'PLATAFORMA',
    amountCents: 0,
    paymentMethod: '',
  }
}

/** Dados para já preencher uma reserva nova (ex.: vinda de uma marcação do Calendário). */
export interface ReservationPrefill {
  reservationNumber?: string
  propertyName?: string
  checkIn?: string
  checkOut?: string
  platform?: Platform
  /** Hóspede responsável já vinculado (ex.: vindo do cadastro de hóspedes). */
  mainGuest?: MainGuest
}

function initialValues(r: Reservation | null, startExtending = false, prefill?: ReservationPrefill): FormValues {
  if (!r) {
    const platform = prefill?.platform ?? ''
    return {
      reservationNumber: prefill?.reservationNumber ?? '',
      mainGuest: prefill?.mainGuest ?? null,
      propertyName: prefill?.propertyName ?? '',
      guestsCount: 1,
      companions: [],
      bookedAt: todayIso(),
      checkIn: prefill?.checkIn ?? '',
      checkOut: prefill?.checkOut ?? '',
      status: 'VAZIO',
      platform,
      paymentMethod: platform && PAID_VIA_PLATFORM.includes(platform) ? 'PLATAFORMA' : '',
      amountCents: 0,
      commissionType: 'PERCENT',
      commissionRateText: '',
      commissionCents: 0,
      costs: [],
      extensions: [],
    }
  }
  const base: FormValues = {
    reservationNumber: r.reservationNumber,
    mainGuest: r.mainGuest,
    propertyName: r.propertyName,
    guestsCount: r.guestsCount,
    companions: (r.companions ?? []).map((c) => draft({ ...c, document: c.document ?? '' })),
    bookedAt: r.bookedAt,
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    status: r.status,
    platform: r.platform ?? '',
    paymentMethod: r.paymentMethod ?? '',
    amountCents: r.amountCents,
    commissionType: r.commissionType,
    commissionRateText: r.commissionRate !== null ? formatPercent(r.commissionRate) : '',
    commissionCents: r.commissionCents,
    costs: (r.costs ?? []).map((c) => costDraft(c)),
    extensions: [],
  }
  base.extensions = (r.extensions ?? []).map((e) => ({
    key: nextKey++,
    checkOut: e.checkOut,
    channel: e.channel,
    amountCents: e.channel === 'DIRETO' ? e.amountCents : 0,
    paymentMethod: e.paymentMethod ?? '',
  }))
  // Aberto pelo atalho "Estender hospedagem" da lista: já traz uma extensão nova
  if (startExtending && base.extensions.length < MAX_EXTENSIONS) base.extensions.push(newExtension(base))
  return base
}

/**
 * Valores de cada extensão (mesma regra do back):
 * PLATAFORMA = noites × diária média da reserva, com a mesma comissão;
 * DIRETO = valor informado, sem comissão.
 */
/** Taxa pré-cadastrada (Ajustes > Taxas) por plataforma, em %. */
type FeeMap = Partial<Record<Platform, number>>

/** Preenche a comissão (em %) com a taxa padrão da plataforma, quando ela existe. */
function withDefaultFee(v: FormValues, fees: FeeMap): FormValues {
  const rate = v.platform ? fees[v.platform] : undefined
  if (rate === undefined) return v
  return { ...v, commissionType: 'PERCENT', commissionRateText: formatPercent(rate) }
}

function computeExtensions(v: FormValues, commissionCents: number) {
  const baseNights = nightsBetween(v.checkIn, v.checkOut)
  const dailyCents = baseNights > 0 ? v.amountCents / baseNights : 0
  const rate = v.commissionType === 'PERCENT' ? parsePercent(v.commissionRateText).value / 100 : null
  const share = v.amountCents > 0 ? commissionCents / v.amountCents : 0
  let start = v.checkOut
  return v.extensions.map((e) => {
    const nights = start && e.checkOut ? Math.max(0, nightsBetween(start, e.checkOut)) : 0
    const platform = e.channel === 'PLATAFORMA'
    const amountCents = platform ? Math.round(dailyCents * nights) : e.amountCents
    const commission = platform ? Math.round(amountCents * (rate ?? share)) : 0
    const item = { start, nights, amountCents, commissionCents: commission, dailyCents }
    if (e.checkOut) start = e.checkOut
    return item
  })
}

/** Comissão efetiva (em centavos) conforme o tipo escolhido. */
function commissionOf(v: FormValues) {
  if (v.commissionType === 'VALUE') return v.commissionCents
  return Math.round((v.amountCents * parsePercent(v.commissionRateText).value) / 100)
}

function validate(v: FormValues): Errors {
  const e: Errors = {}
  // na mesma ordem em que aparecem na tela (o foco vai para o primeiro erro)
  if (!v.reservationNumber.trim()) e.reservationNumber = 'Informe o número da reserva'
  if (v.propertyName.trim().length < 2) e.propertyName = 'Informe o imóvel'
  if (!v.platform) e.platform = 'Selecione a plataforma de origem'
  if (v.platform === 'DIRETO' && v.paymentMethod === 'PLATAFORMA')
    e.paymentMethod = 'Contrato direto não é pago via plataforma'
  if (!v.bookedAt) e.bookedAt = 'Informe a data da reserva'
  if (!v.checkIn) e.checkIn = 'Informe a data do check-in'
  if (!v.checkOut) e.checkOut = 'Informe a data do check-out'
  else if (v.checkIn && v.checkOut <= v.checkIn) e.checkOut = 'O check-out deve ser depois do check-in'
  if (v.companions.length + 1 > v.guestsCount) e.companions = 'A lista tem mais hóspedes que o total informado'
  v.companions.forEach((c, i) => {
    if (c.fullName.trim().length < 2) e[`companions.${i}.fullName`] = 'Informe o nome'
    if (c.ageGroup === 'ADULT' && !c.document.trim()) e[`companions.${i}.document`] = 'Obrigatório para adulto'
  })
  if (v.amountCents <= 0) e.amountCents = 'Informe o valor da reserva'
  if (v.commissionType === 'PERCENT' && !v.commissionRateText.trim()) e.commissionRate = 'Informe o percentual'
  if (v.commissionType === 'VALUE' && v.commissionCents > v.amountCents)
    e.commissionCents = 'A comissão não pode ser maior que o valor da reserva'
  v.costs.forEach((c, i) => {
    if (c.description.trim().length < 2) e[`costs.${i}.description`] = 'Informe o tipo'
    if (c.amountCents <= 0) e[`costs.${i}.amountCents`] = 'Informe o valor'
  })
  let previous = v.checkOut
  v.extensions.forEach((x, i) => {
    if (!x.checkOut) e[`extensions.${i}.checkOut`] = 'Informe o novo check-out'
    else if (previous && x.checkOut <= previous) e[`extensions.${i}.checkOut`] = 'Deve ser depois do check-out anterior'
    if (x.channel === 'DIRETO' && x.amountCents <= 0) e[`extensions.${i}.amountCents`] = 'Informe o valor da extensão'
    if (x.channel === 'PLATAFORMA' && v.platform === 'DIRETO')
      e[`extensions.${i}.channel`] = 'Reserva de contrato direto só pode ser estendida direto'
    if (x.checkOut) previous = x.checkOut
  })
  return e
}

interface ReservationFormModalProps {
  open: boolean
  reservation: Reservation | null // null = nova reserva (com companions carregados na edição)
  onClose: () => void
  /** warning: reserva salva, mas algum anexo falhou. */
  onSaved: (reservation: Reservation, isNew: boolean, warning?: string) => void
  /** Aberto pelo atalho da lista: rola até "Extensões" com uma extensão nova. */
  startExtending?: boolean
  /** Reserva nova já preenchida (ex.: a partir do Calendário). */
  prefill?: ReservationPrefill
}

export function ReservationFormModal({
  open,
  reservation,
  onClose,
  onSaved,
  startExtending = false,
  prefill,
}: ReservationFormModalProps) {
  const isEdit = !!reservation
  // O pai troca a "key" a cada abertura, então o estado sempre começa limpo
  const [values, setValues] = useState<FormValues>(() => initialValues(reservation, startExtending, prefill))
  // o atalho já cria a extensão, então conta como alteração
  const [extendedOnOpen] = useState(startExtending)
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Taxa padrão por plataforma (Ajustes > Taxas). Só sugere em reserva nova, e só enquanto
  // a comissão não tiver sido mexida à mão — depois disso o que o usuário digitou prevalece.
  const [fees, setFees] = useState<FeeMap>({})
  const commissionTouched = useRef(false)

  // Anexos: novos (enviados após salvar) e removidos (apagados após salvar)
  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([])
  const [removedAttachments, setRemovedAttachments] = useState<string[]>([])

  function touchCommission() {
    commissionTouched.current = true
  }

  function update(patch: Partial<FormValues>, clear: string[] = []) {
    setValues((v) => ({ ...v, ...patch }))
    if (clear.length) setErrors((e) => ({ ...e, ...Object.fromEntries(clear.map((k) => [k, undefined])) }))
    setDirty(true)
  }

  // ---------- Hóspedes da reserva ----------
  const totalListed = values.companions.length + 1
  const adults = 1 + values.companions.filter((c) => c.ageGroup === 'ADULT').length
  const children = values.companions.length + 1 - adults

  function setGuestsCount(n: number) {
    const count = Math.max(totalListed, Math.min(MAX_GUESTS, Number.isFinite(n) ? Math.trunc(n) : 1))
    update({ guestsCount: count }, ['guestsCount', 'companions'])
  }

  function addCompanion() {
    if (totalListed >= MAX_GUESTS) return
    setValues((v) => ({
      ...v,
      companions: [...v.companions, draft()],
      // lista cheia? aumenta o total automaticamente
      guestsCount: Math.max(v.guestsCount, v.companions.length + 2),
    }))
    setErrors((e) => ({ ...e, companions: undefined }))
    setDirty(true)
    // foca o nome do novo hóspede
    requestAnimationFrame(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('.companion__name')
      inputs[inputs.length - 1]?.focus()
    })
  }

  function updateCompanion(index: number, patch: Partial<CompanionDraft>) {
    setValues((v) => ({ ...v, companions: v.companions.map((c, i) => (i === index ? { ...c, ...patch } : c)) }))
    setErrors((e) => ({
      ...e,
      [`companions.${index}.fullName`]: patch.fullName !== undefined ? undefined : e[`companions.${index}.fullName`],
      [`companions.${index}.document`]:
        patch.document !== undefined || patch.ageGroup === 'CHILD' ? undefined : e[`companions.${index}.document`],
    }))
    setDirty(true)
  }

  function removeCompanion(index: number) {
    setValues((v) => ({ ...v, companions: v.companions.filter((_, i) => i !== index) }))
    // os erros por linha usam o índice; mais simples limpar os da lista
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith('companions'))))
    setDirty(true)
  }

  // ---------- Origem e pagamento ----------
  function changePlatform(platform: Platform) {
    setValues((v) => {
      let paymentMethod = v.paymentMethod
      // Airbnb/Booking/VRBO costumam receber do hóspede; contrato direto nunca é "via plataforma"
      if (!paymentMethod && PAID_VIA_PLATFORM.includes(platform)) paymentMethod = 'PLATAFORMA'
      if (platform === 'DIRETO' && paymentMethod === 'PLATAFORMA') paymentMethod = ''
      const next = { ...v, platform, paymentMethod }
      return isEdit || commissionTouched.current ? next : withDefaultFee(next, fees)
    })
    setErrors((e) => ({ ...e, platform: undefined, paymentMethod: undefined }))
    setDirty(true)
  }

  // ---------- Custos e taxas ----------
  function addCost() {
    if (values.costs.length >= MAX_COSTS) return
    update({ costs: [...values.costs, costDraft()] })
    requestAnimationFrame(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('.cost__description')
      inputs[inputs.length - 1]?.focus()
    })
  }

  function updateCost(index: number, patch: Partial<CostDraft>) {
    setValues((v) => ({ ...v, costs: v.costs.map((c, i) => (i === index ? { ...c, ...patch } : c)) }))
    setErrors((e) => {
      const next = { ...e }
      Object.keys(patch).forEach((k) => delete next[`costs.${index}.${k}`])
      return next
    })
    setDirty(true)
  }

  function removeCost(index: number) {
    setValues((v) => ({ ...v, costs: v.costs.filter((_, i) => i !== index) }))
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith('costs.'))))
    setDirty(true)
  }

  // ---------- Extensões de hospedagem ----------
  function addExtension() {
    if (values.extensions.length >= MAX_EXTENSIONS || !values.checkOut) return
    update({ extensions: [...values.extensions, newExtension(values)] })
    requestAnimationFrame(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('.extension__date')
      inputs[inputs.length - 1]?.focus()
    })
  }

  function updateExtension(index: number, patch: Partial<ExtensionDraft>) {
    setValues((v) => ({
      ...v,
      extensions: v.extensions.map((x, i) => (i === index ? { ...x, ...patch } : x)),
    }))
    setErrors((e) => {
      const next = { ...e }
      Object.keys(patch).forEach((k) => delete next[`extensions.${index}.${k}`])
      if (patch.checkOut !== undefined) delete next[`extensions.${index + 1}.checkOut`]
      return next
    })
    setDirty(true)
  }

  function removeExtension(index: number) {
    setValues((v) => ({ ...v, extensions: v.extensions.filter((_, i) => i !== index) }))
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith('extensions.'))))
    setDirty(true)
  }

  // Carrega as taxas pré-cadastradas (falha silenciosa: sem elas o preenchimento é manual)
  useEffect(() => {
    if (isEdit) return
    let cancelled = false
    settingsApi
      .fees()
      .then(({ data }) => {
        if (cancelled) return
        const map: FeeMap = {}
        for (const f of data) if (f.commissionRate !== null) map[f.platform] = f.commissionRate
        setFees(map)
        // plataforma já escolhida na abertura (ex.: vinda do calendário)
        if (!commissionTouched.current) setValues((v) => withDefaultFee(v, map))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isEdit])

  // Atalho da lista: rola até a seção e foca a data da extensão nova
  useEffect(() => {
    if (!startExtending) return
    const t = window.setTimeout(() => {
      document.getElementById('res-extensions')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      const inputs = document.querySelectorAll<HTMLInputElement>('.extension__date')
      inputs[inputs.length - 1]?.focus({ preventScroll: true })
    }, 250)
    return () => window.clearTimeout(t)
  }, [startExtending])

  // ---------- Valores ----------
  const commissionCents = commissionOf(values)
  const defaultFee = !isEdit && values.platform ? fees[values.platform] : undefined
  const defaultApplied =
    defaultFee !== undefined &&
    values.commissionType === 'PERCENT' &&
    parsePercent(values.commissionRateText).value === defaultFee
  const costsCents = values.costs.reduce((sum, c) => sum + c.amountCents, 0)
  const extensions = computeExtensions(values, commissionCents)
  const extensionsCents = extensions.reduce((sum, x) => sum + x.amountCents, 0)
  const extensionsCommission = extensions.reduce((sum, x) => sum + x.commissionCents, 0)
  const extraNights = extensions.reduce((sum, x) => sum + x.nights, 0)
  const grossCents = values.amountCents + extensionsCents
  const netCents = grossCents - commissionCents - extensionsCommission - costsCents
  const finalCheckOut = [...values.extensions].reverse().find((x) => x.checkOut)?.checkOut || values.checkOut
  const commissionPct = values.amountCents > 0 ? (commissionCents / values.amountCents) * 100 : 0
  const nights = nightsBetween(values.checkIn, values.checkOut)
  const totalNights = nights + extraNights

  function changeCommissionType(type: CommissionType) {
    touchCommission()
    // converte o valor atual para o outro formato, para não perder o que foi digitado
    if (type === values.commissionType) return
    if (type === 'VALUE') update({ commissionType: type, commissionCents }, ['commissionRate', 'commissionCents'])
    else
      update(
        {
          commissionType: type,
          commissionRateText: values.amountCents > 0 && commissionCents > 0 ? formatPercent(Math.round(commissionPct * 100) / 100) : '',
        },
        ['commissionRate', 'commissionCents'],
      )
  }

  // ---------- Salvar ----------
  // Cadastro de hóspede aberto por cima da reserva: os dados da reserva continuam aqui, intactos
  const [guestFormOpen, setGuestFormOpen] = useState(false)
  const [guestFormKey, setGuestFormKey] = useState(0)
  function openGuestForm() {
    if (saving) return
    setGuestFormKey((k) => k + 1)
    setGuestFormOpen(true)
  }
  function linkGuest(g: Guest) {
    setGuestFormOpen(false)
    update(
      { mainGuest: { id: g.id, fullName: g.fullName, documentType: g.documentType, documentNumber: g.documentNumber } },
      ['mainGuestId'],
    )
  }

  function requestClose() {
    if (saving) return
    const changed = dirty || extendedOnOpen || pendingFiles.length > 0 || removedAttachments.length > 0
    if (changed && !window.confirm('Descartar as alterações não salvas?')) return
    onClose()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (saving) return

    const found = validate(values)
    setErrors(found)
    const firstKey = Object.keys(found)[0]
    if (firstKey) {
      setFormError('')
      document.getElementById(`res-${firstKey.replaceAll('.', '-')}`)?.focus()
      return
    }

    const payload: ReservationInput = {
      reservationNumber: values.reservationNumber.trim(),
      mainGuestId: values.mainGuest?.id ?? null,
      propertyName: values.propertyName.trim(),
      guestsCount: values.guestsCount,
      companions: values.companions.map((c) => ({
        fullName: c.fullName.trim().replace(/\s+/g, ' '),
        document: c.document.trim() || null,
        ageGroup: c.ageGroup,
      })),
      bookedAt: values.bookedAt,
      checkIn: values.checkIn,
      checkOut: values.checkOut,
      status: values.status,
      platform: values.platform as Platform, // validado acima
      paymentMethod: values.paymentMethod || null,
      extensions: values.extensions.map((x) =>
        x.channel === 'DIRETO'
          ? { checkOut: x.checkOut, channel: x.channel, amountCents: x.amountCents, paymentMethod: x.paymentMethod || null }
          : { checkOut: x.checkOut, channel: x.channel },
      ),
      costs: values.costs.map((c) => ({
        description: c.description.trim().replace(/\s+/g, ' '),
        amountCents: c.amountCents,
      })),
      amountCents: values.amountCents,
      commissionType: values.commissionType,
      ...(values.commissionType === 'PERCENT'
        ? { commissionRate: parsePercent(values.commissionRateText).value }
        : { commissionCents: values.commissionCents }),
    }

    setSaving(true)
    setFormError('')
    let saved: Reservation
    try {
      saved = (isEdit ? await reservationsApi.update(reservation.id, payload) : await reservationsApi.create(payload))
        .reservation
    } catch (err) {
      setSaving(false)
      if (err instanceof ApiError) {
        if (err.status === 409) return setErrors({ reservationNumber: err.message })
        const fieldErrors: Errors = {}
        err.errors.forEach((fe) => {
          fieldErrors[fe.field] ??= fe.message
        })
        if (Object.keys(fieldErrors).length) {
          setErrors(fieldErrors)
          return setFormError(err.message)
        }
        return setFormError(err.message)
      }
      return setFormError('Não foi possível salvar. Tente novamente.')
    }

    // Reserva salva — agora os anexos (se algum falhar, a reserva continua salva)
    if (pendingFiles.length || removedAttachments.length) {
      const failed: string[] = []
      for (const id of removedAttachments) {
        try {
          await reservationsApi.removeAttachment(saved.id, id)
        } catch {
          failed.push('remoção de anexo')
        }
      }
      for (const p of pendingFiles) {
        try {
          await reservationsApi.addAttachment(saved.id, p.file, p.category)
        } catch (err) {
          failed.push(`${p.file.name} (${err instanceof Error ? err.message : 'erro'})`)
        }
      }
      try {
        saved = (await reservationsApi.get(saved.id)).reservation
      } catch {
        /* mantém a versão já salva */
      }
      if (failed.length) {
        return onSaved(saved, !isEdit, `Reserva salva, mas houve falha nos anexos: ${failed.join(', ')}`)
      }
    }
    onSaved(saved, !isEdit)
  }

  // ---------- helpers de marcação ----------
  const cls = (key: string, extra = '') => `ui-field ${extra} ${errors[key] ? 'has-error' : ''}`
  const idOf = (key: string) => `res-${key.replaceAll('.', '-')}`
  const err = (key: string) =>
    errors[key] ? (
      <p className="ui-field__error" id={`${idOf(key)}-error`}>
        {errors[key]}
      </p>
    ) : null
  const aria = (key: string) => ({
    id: idOf(key),
    'aria-invalid': !!errors[key] || undefined,
    'aria-describedby': errors[key] ? `${idOf(key)}-error` : undefined,
  })

  return (
    <>
    <Modal
      open={open}
      onClose={requestClose}
      title={isEdit ? 'Editar reserva' : 'Nova reserva'}
      subtitle={isEdit ? `Reserva ${reservation.reservationNumber}` : 'Preencha os dados da reserva'}
      footer={
        <>
          <button type="button" className="ui-btn ui-btn--ghost" onClick={requestClose} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className="ui-btn ui-btn--ghost" onClick={openGuestForm} disabled={saving}>
            <UserPlus strokeWidth={1.8} />
            Cadastrar hóspede
          </button>
          <button type="submit" form="reservation-form" className="ui-btn ui-btn--primary" disabled={saving}>
            {saving ? <span className="spinner" /> : <Check strokeWidth={2.2} />}
            {isEdit ? 'Salvar alterações' : 'Cadastrar reserva'}
          </button>
        </>
      }
    >
      <form id="reservation-form" className="guest-form" onSubmit={handleSubmit} noValidate>
        {formError && (
          <div className="guest-form__alert" role="alert">
            {formError}
          </div>
        )}

        {/* ---------------- Reserva ---------------- */}
        <section className="guest-form__section">
          <h3 className="guest-form__heading">Reserva</h3>
          <div className="guest-form__grid">
            <div className={cls('mainGuestId', 'ui-field--full')}>
              <label htmlFor={idOf('mainGuestId')}>
                Hóspede responsável <span className="guest-form__optional">opcional</span>
              </label>
              <GuestPicker
                id={idOf('mainGuestId')}
                value={values.mainGuest}
                disabled={saving}
                invalid={!!errors.mainGuestId}
                describedBy={errors.mainGuestId ? `${idOf('mainGuestId')}-error` : undefined}
                onChange={(g) => update({ mainGuest: g }, ['mainGuestId'])}
              />
              {err('mainGuestId') ?? (
                !values.mainGuest && (
                  <p className="ui-field__hint">Pode cadastrar a reserva sem hóspede e vincular depois, editando-a.</p>
                )
              )}
            </div>

            <div className={cls('reservationNumber')}>
              <label htmlFor={idOf('reservationNumber')}>
                Número da reserva<span className="req">*</span>
              </label>
              <input
                className="ui-input guest-form__mono"
                autoComplete="off"
                placeholder="Ex.: 2026-000123"
                maxLength={40}
                value={values.reservationNumber}
                onChange={(e) => update({ reservationNumber: e.target.value }, ['reservationNumber'])}
                disabled={saving}
                {...aria('reservationNumber')}
              />
              {err('reservationNumber')}
            </div>

            <div className={cls('bookedAt')}>
              <label htmlFor={idOf('bookedAt')}>
                Data da reserva<span className="req">*</span>
              </label>
              <input
                type="date"
                className="ui-input"
                value={values.bookedAt}
                onChange={(e) => update({ bookedAt: e.target.value }, ['bookedAt'])}
                disabled={saving}
                {...aria('bookedAt')}
              />
              {err('bookedAt')}
            </div>

            <div className={cls('propertyName')}>
              <label htmlFor={idOf('propertyName')}>
                Imóvel<span className="req">*</span>
              </label>
              <input
                className="ui-input"
                autoComplete="off"
                placeholder="Ex.: Apto 302 — Ed. Solar"
                maxLength={120}
                value={values.propertyName}
                onChange={(e) => update({ propertyName: e.target.value }, ['propertyName'])}
                disabled={saving}
                {...aria('propertyName')}
              />
              {err('propertyName')}
            </div>

            <div className="ui-field">
              <span className="ui-field__label">
                Status<span className="req">*</span>
              </span>
              <Segmented
                ariaLabel="Status da reserva"
                value={values.status}
                onChange={(s) => update({ status: s })}
                disabled={saving}
                options={STATUS_OPTIONS}
              />
            </div>

            <div className={cls('platform')}>
              <span className="ui-field__label" id={`${idOf('platform')}-label`}>
                Plataforma de origem<span className="req">*</span>
              </span>
              <div id={idOf('platform')} tabIndex={-1} className="res-platform">
                <Segmented
                  ariaLabel="Plataforma de origem"
                  value={values.platform || ('' as Platform)}
                  onChange={changePlatform}
                  disabled={saving}
                  options={PLATFORM_OPTIONS}
                />
              </div>
              {err('platform')}
            </div>

            <div className={cls('paymentMethod')}>
              <label htmlFor={idOf('paymentMethod')}>Forma de pagamento</label>
              <select
                className="ui-input ui-select"
                value={values.paymentMethod}
                onChange={(e) => update({ paymentMethod: e.target.value as PaymentMethod | '' }, ['paymentMethod'])}
                disabled={saving}
                {...aria('paymentMethod')}
              >
                <option value="">Não informada</option>
                {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
                  <option key={m} value={m} disabled={m === 'PLATAFORMA' && values.platform === 'DIRETO'}>
                    {PAYMENT_LABEL[m]}
                  </option>
                ))}
              </select>
              {err('paymentMethod')}
            </div>
          </div>
        </section>

        {/* ---------------- Período ---------------- */}
        <section className="guest-form__section">
          <h3 className="guest-form__heading">Período</h3>
          <div className="guest-form__grid">
            <div className={cls('checkIn', 'ui-field--full')}>
              <label htmlFor={idOf('checkIn')}>
                Check-in e check-out<span className="req">*</span>
              </label>
              <DateRangePicker
                id={idOf('checkIn')}
                checkIn={values.checkIn}
                checkOut={values.checkOut}
                onChange={(checkIn, checkOut) => update({ checkIn, checkOut }, ['checkIn', 'checkOut'])}
                disabled={saving}
                invalid={!!errors.checkIn || !!errors.checkOut}
                describedBy={
                  [errors.checkIn && `${idOf('checkIn')}-error`, errors.checkOut && `${idOf('checkOut')}-error`]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
              />
              {err('checkIn')}
              {err('checkOut') ??
                (nights > 0 && extraNights > 0 && (
                  <p className="ui-field__hint">
                    Com extensões: {totalNights} noites, saída em {formatDate(finalCheckOut)}
                  </p>
                ))}
            </div>
          </div>
        </section>

        {/* ---------------- Extensões de hospedagem ---------------- */}
        <section className="guest-form__section" id="res-extensions">
          <div className="guest-form__heading-row">
            <h3 className="guest-form__heading">
              Extensões de hospedagem <span className="guest-form__optional">opcional</span>
            </h3>
            {extraNights > 0 && (
              <span className="guest-form__counter">
                +{extraNights} {extraNights === 1 ? 'noite' : 'noites'} · saída em {formatDate(finalCheckOut)}
              </span>
            )}
          </div>

          {values.extensions.length > 0 && (
            <ol className="extensions">
              {values.extensions.map((x, i) => {
                const calc = extensions[i]
                const platformChannel = x.channel === 'PLATAFORMA'
                return (
                  <li key={x.key} className="extension">
                    <div className="extension__head">
                      <span className="extension__index">E{i + 1}</span>
                      <div className={cls(`extensions.${i}.checkOut`, 'extension__dates')}>
                        <label htmlFor={idOf(`extensions.${i}.checkOut`)}>
                          De {calc.start ? formatDate(calc.start) : '—'} até
                        </label>
                        <input
                          type="date"
                          className="ui-input extension__date"
                          min={calc.start ? addDaysIso(calc.start, 1) : undefined}
                          value={x.checkOut}
                          onChange={(e) => updateExtension(i, { checkOut: e.target.value })}
                          disabled={saving}
                          {...aria(`extensions.${i}.checkOut`)}
                        />
                        {err(`extensions.${i}.checkOut`)}
                      </div>
                      <span className="extension__nights">
                        {calc.nights > 0 ? `+${calc.nights} ${calc.nights === 1 ? 'noite' : 'noites'}` : '—'}
                      </span>
                      <button
                        type="button"
                        className="icon-btn companion__remove"
                        onClick={() => removeExtension(i)}
                        disabled={saving}
                        aria-label={`Remover extensão ${i + 1}`}
                        title="Remover extensão"
                      >
                        <Trash2 strokeWidth={1.8} />
                      </button>
                    </div>

                    <div className={cls(`extensions.${i}.channel`, 'extension__channel')}>
                      <span className="ui-field__label">Como foi estendida?</span>
                      {values.platform === 'DIRETO' ? (
                        <p className="ui-field__hint">Contrato direto: a extensão é sempre direta (sem comissão).</p>
                      ) : (
                        <Segmented
                          ariaLabel={`Canal da extensão ${i + 1}`}
                          value={x.channel}
                          onChange={(channel) => updateExtension(i, { channel })}
                          disabled={saving}
                          options={[
                            { value: 'PLATAFORMA', label: EXTENSION_CHANNEL_LABEL.PLATAFORMA },
                            { value: 'DIRETO', label: EXTENSION_CHANNEL_LABEL.DIRETO },
                          ]}
                        />
                      )}
                      {err(`extensions.${i}.channel`)}
                    </div>

                    {platformChannel ? (
                      <div className="extension__calc">
                        {calc.dailyCents > 0 ? (
                          <>
                            <span>
                              {calc.nights} × {formatMoney(Math.round(calc.dailyCents))} (diária média da reserva)
                              {calc.commissionCents > 0 && (
                                <small>
                                  {' '}
                                  · comissão − {formatMoney(calc.commissionCents)}
                                  <CommissionPct commission={calc.commissionCents} base={calc.amountCents} />
                                </small>
                              )}
                            </span>
                            <strong className="guest-form__mono">{formatMoney(calc.amountCents)}</strong>
                          </>
                        ) : (
                          <span>Informe as datas e o valor da reserva para calcular a diária.</span>
                        )}
                      </div>
                    ) : (
                      <div className="guest-form__grid extension__direct">
                        <div className={cls(`extensions.${i}.amountCents`)}>
                          <label htmlFor={idOf(`extensions.${i}.amountCents`)}>
                            Valor da extensão<span className="req">*</span>
                          </label>
                          <input
                            className="ui-input guest-form__mono money-input"
                            inputMode="numeric"
                            value={formatMoney(x.amountCents)}
                            onChange={(e) => updateExtension(i, { amountCents: centsFromInput(e.target.value) })}
                            onFocus={(e) => e.target.select()}
                            disabled={saving}
                            {...aria(`extensions.${i}.amountCents`)}
                          />
                          {err(`extensions.${i}.amountCents`) ?? (
                            <p className="ui-field__hint">Sem comissão — entra integral no total</p>
                          )}
                        </div>
                        <div className="ui-field">
                          <label htmlFor={idOf(`extensions.${i}.paymentMethod`)}>Forma de pagamento</label>
                          <select
                            className="ui-input ui-select"
                            value={x.paymentMethod}
                            onChange={(e) => updateExtension(i, { paymentMethod: e.target.value as PaymentMethod | '' })}
                            disabled={saving}
                            {...aria(`extensions.${i}.paymentMethod`)}
                          >
                            <option value="">Não informada</option>
                            {(Object.keys(PAYMENT_LABEL) as PaymentMethod[])
                              .filter((m) => m !== 'PLATAFORMA')
                              .map((m) => (
                                <option key={m} value={m}>
                                  {PAYMENT_LABEL[m]}
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          )}

          <button
            type="button"
            className="companions__add"
            onClick={addExtension}
            disabled={saving || !values.checkOut || values.extensions.length >= MAX_EXTENSIONS}
            title={!values.checkOut ? 'Informe o check-out primeiro' : undefined}
          >
            <CalendarPlus strokeWidth={1.8} />
            Estender hospedagem
          </button>
        </section>

        {/* ---------------- Hóspedes ---------------- */}
        <section className="guest-form__section">
          <div className="guest-form__heading-row">
            <h3 className="guest-form__heading">Hóspedes</h3>
            <span className="guest-form__counter">
              {totalListed} de {values.guestsCount} informados · {adults} {adults === 1 ? 'adulto' : 'adultos'}
              {children > 0 && ` · ${children} ${children === 1 ? 'criança' : 'crianças'}`}
            </span>
          </div>

          <div className={cls('guestsCount')}>
            <label htmlFor={idOf('guestsCount')}>
              Número de hóspedes<span className="req">*</span>
            </label>
            <div className="stepper">
              <button
                type="button"
                className="icon-btn"
                onClick={() => setGuestsCount(values.guestsCount - 1)}
                disabled={saving || values.guestsCount <= totalListed}
                aria-label="Diminuir"
              >
                <Minus strokeWidth={2} />
              </button>
              <input
                className="ui-input stepper__input"
                inputMode="numeric"
                value={values.guestsCount}
                onChange={(e) => setGuestsCount(Number(e.target.value.replace(/\D/g, '')) || 1)}
                disabled={saving}
                {...aria('guestsCount')}
              />
              <button
                type="button"
                className="icon-btn"
                onClick={() => setGuestsCount(values.guestsCount + 1)}
                disabled={saving || values.guestsCount >= MAX_GUESTS}
                aria-label="Aumentar"
              >
                <Plus strokeWidth={2} />
              </button>
            </div>
            {err('guestsCount')}
          </div>

          <ol className="companions">
            {/* Responsável: sempre o 1º da lista, vindo do cadastro */}
            <li className="companion companion--main">
              <span className="companion__index">1</span>
              <div className="companion__main-info">
                {values.mainGuest ? (
                  <>
                    <strong>{values.mainGuest.fullName}</strong>
                    <small>{describeDocument(values.mainGuest.documentType, values.mainGuest.documentNumber)}</small>
                  </>
                ) : (
                  <span className="companion__placeholder">Sem hóspede vinculado (opcional)</span>
                )}
              </div>
              {values.mainGuest && <span className="ui-badge ui-badge--dark">Responsável</span>}
            </li>

            {values.companions.map((c, i) => (
              <li key={c.key} className="companion">
                <span className="companion__index">{i + 2}</span>
                <div className={cls(`companions.${i}.fullName`, 'companion__field')}>
                  <label className="companion__label" htmlFor={idOf(`companions.${i}.fullName`)}>
                    Nome
                  </label>
                  <input
                    className="ui-input companion__name"
                    autoComplete="off"
                    placeholder="Nome completo"
                    maxLength={160}
                    value={c.fullName}
                    onChange={(e) => updateCompanion(i, { fullName: e.target.value })}
                    disabled={saving}
                    {...aria(`companions.${i}.fullName`)}
                  />
                  {err(`companions.${i}.fullName`)}
                </div>
                <div className={cls(`companions.${i}.document`, 'companion__field')}>
                  <label className="companion__label" htmlFor={idOf(`companions.${i}.document`)}>
                    Identificação
                  </label>
                  <input
                    className="ui-input guest-form__mono"
                    autoComplete="off"
                    placeholder={c.ageGroup === 'CHILD' ? 'Opcional' : 'CPF, RG ou passaporte'}
                    maxLength={30}
                    value={c.document}
                    onChange={(e) => updateCompanion(i, { document: e.target.value })}
                    disabled={saving}
                    {...aria(`companions.${i}.document`)}
                  />
                  {err(`companions.${i}.document`)}
                </div>
                <div className="companion__age">
                  <Segmented
                    ariaLabel={`Faixa etária do hóspede ${i + 2}`}
                    value={c.ageGroup}
                    onChange={(ageGroup) => updateCompanion(i, { ageGroup })}
                    disabled={saving}
                    options={[
                      { value: 'ADULT', label: 'Adulto' },
                      { value: 'CHILD', label: 'Criança' },
                    ]}
                  />
                </div>
                <button
                  type="button"
                  className="icon-btn companion__remove"
                  onClick={() => removeCompanion(i)}
                  disabled={saving}
                  aria-label={`Remover hóspede ${i + 2}`}
                  title="Remover"
                >
                  <Trash2 strokeWidth={1.8} />
                </button>
                {/* Avisa se o documento é de hóspede bloqueado ou de dependente de outro hóspede (bloqueado ou não) */}
                <div className="companion__notice">
                  <DependentNotice
                    document={c.document}
                    excludeMainGuestId={values.mainGuest?.id}
                    checkBlockedGuest
                    compact
                    newTab
                  />
                </div>
              </li>
            ))}
          </ol>

          {err('companions')}

          <button
            type="button"
            className="companions__add"
            onClick={addCompanion}
            disabled={saving || totalListed >= MAX_GUESTS}
          >
            <UserPlus strokeWidth={1.8} />
            Adicionar hóspede
          </button>
        </section>

        {/* ---------------- Valores ---------------- */}
        <section className="guest-form__section">
          <h3 className="guest-form__heading">Valores</h3>
          <div className="guest-form__grid">
            <div className={cls('amountCents')}>
              <label htmlFor={idOf('amountCents')}>
                Valor da reserva<span className="req">*</span>
              </label>
              <input
                className="ui-input guest-form__mono money-input"
                inputMode="numeric"
                value={formatMoney(values.amountCents)}
                onChange={(e) =>
                  update({ amountCents: centsFromInput(e.target.value) }, ['amountCents', 'commissionCents'])
                }
                onFocus={(e) => e.target.select()}
                disabled={saving}
                {...aria('amountCents')}
              />
              {err('amountCents')}
            </div>

            <div className={cls(values.commissionType === 'PERCENT' ? 'commissionRate' : 'commissionCents')}>
              <label htmlFor={idOf(values.commissionType === 'PERCENT' ? 'commissionRate' : 'commissionCents')}>
                Comissão<span className="req">*</span>
              </label>
              <div className="commission">
                <div className="commission__type">
                  <Segmented
                    ariaLabel="Tipo de comissão"
                    value={values.commissionType}
                    onChange={changeCommissionType}
                    disabled={saving}
                    options={[
                      { value: 'PERCENT', label: '%' },
                      { value: 'VALUE', label: 'R$' },
                    ]}
                  />
                </div>
                {values.commissionType === 'PERCENT' ? (
                  <div className="suffix-input">
                    <input
                      className="ui-input guest-form__mono"
                      inputMode="decimal"
                      placeholder="0"
                      value={values.commissionRateText}
                      onChange={(e) => {
                        touchCommission()
                        update({ commissionRateText: parsePercent(e.target.value).text }, ['commissionRate'])
                      }}
                      disabled={saving}
                      {...aria('commissionRate')}
                    />
                    <span aria-hidden>%</span>
                  </div>
                ) : (
                  <input
                    className="ui-input guest-form__mono money-input"
                    inputMode="numeric"
                    value={formatMoney(values.commissionCents)}
                    onChange={(e) => {
                      touchCommission()
                      update({ commissionCents: centsFromInput(e.target.value) }, ['commissionCents'])
                    }}
                    onFocus={(e) => e.target.select()}
                    disabled={saving}
                    {...aria('commissionCents')}
                  />
                )}
              </div>
              {err(values.commissionType === 'PERCENT' ? 'commissionRate' : 'commissionCents')}
              {defaultFee !== undefined && (
                <p className="ui-field__hint">
                  {defaultApplied
                    ? `Taxa pré-cadastrada de ${PLATFORM_LABEL[values.platform as Platform]}: ${formatPercent(defaultFee)}%. Você pode alterar.`
                    : `Taxa pré-cadastrada de ${PLATFORM_LABEL[values.platform as Platform]}: ${formatPercent(defaultFee)}%.`}
                  {!defaultApplied && (
                    <>
                      {' '}
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => {
                          touchCommission()
                          update(
                            { commissionType: 'PERCENT', commissionRateText: formatPercent(defaultFee) },
                            ['commissionRate', 'commissionCents'],
                          )
                        }}
                        disabled={saving}
                      >
                        Usar esta taxa
                      </button>
                    </>
                  )}
                </p>
              )}
            </div>

            {/* Custos e taxas descontados do valor bruto */}
            <div className="ui-field ui-field--full">
              <div className="guest-form__heading-row">
                <span className="ui-field__label">Custos e taxas</span>
                {values.costs.length > 0 && (
                  <span className="guest-form__counter">
                    {values.costs.length} {values.costs.length === 1 ? 'item' : 'itens'} · {formatMoney(costsCents)}
                  </span>
                )}
              </div>
              <p className="ui-field__hint cost__hint">
                Só os gastos desta hospedagem (limpeza, reposição, lavanderia…). Contas fixas do imóvel, como
                condomínio, IPTU e energia, são lançadas por mês em <strong>Finanças</strong>.
              </p>
              {values.costs.length > 0 && (
                <ul className="costs">
                  {values.costs.map((c, i) => (
                    <li key={c.key} className="cost">
                      <div className={cls(`costs.${i}.description`, 'cost__field')}>
                        <input
                          className="ui-input cost__description"
                          list="res-cost-suggestions"
                          autoComplete="off"
                          placeholder="Tipo (ex.: Limpeza, Reposição de itens…)"
                          maxLength={120}
                          value={c.description}
                          onChange={(e) => updateCost(i, { description: e.target.value })}
                          disabled={saving}
                          aria-label={`Tipo do custo ${i + 1}`}
                          {...aria(`costs.${i}.description`)}
                        />
                        {err(`costs.${i}.description`)}
                      </div>
                      <div className={cls(`costs.${i}.amountCents`, 'cost__field cost__amount')}>
                        <input
                          className="ui-input guest-form__mono money-input"
                          inputMode="numeric"
                          value={formatMoney(c.amountCents)}
                          onChange={(e) => updateCost(i, { amountCents: centsFromInput(e.target.value) })}
                          onFocus={(e) => e.target.select()}
                          disabled={saving}
                          aria-label={`Valor do custo ${i + 1}`}
                          {...aria(`costs.${i}.amountCents`)}
                        />
                        {err(`costs.${i}.amountCents`)}
                      </div>
                      <button
                        type="button"
                        className="icon-btn companion__remove"
                        onClick={() => removeCost(i)}
                        disabled={saving}
                        aria-label={`Remover custo ${i + 1}`}
                        title="Remover"
                      >
                        <Trash2 strokeWidth={1.8} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <datalist id="res-cost-suggestions">
                {COST_SUGGESTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <button
                type="button"
                className="companions__add"
                onClick={addCost}
                disabled={saving || values.costs.length >= MAX_COSTS}
              >
                <ReceiptText strokeWidth={1.8} />
                Adicionar custo ou taxa
              </button>
            </div>

            {/* Resumo: valor bruto − comissão − custos */}
            <div className="summary ui-field--full" aria-live="polite">
              <div className="summary__row">
                <span>
                  Valor da reserva
                  {nights > 0 && extensions.length > 0 && (
                    <small>
                      {' '}
                      ({nights} {nights === 1 ? 'noite' : 'noites'})
                    </small>
                  )}
                </span>
                <span className="guest-form__mono">{formatMoney(values.amountCents)}</span>
              </div>
              {extensions.length > 0 && (
                <>
                  <div className="summary__row summary__row--plus summary__row--group">
                    <span>Extensões (+{extraNights} {extraNights === 1 ? 'noite' : 'noites'})</span>
                    <span className="guest-form__mono">+ {formatMoney(extensionsCents)}</span>
                    <ul className="summary__items">
                      {extensions.map((x, i) => (
                        <li key={values.extensions[i].key}>
                          <span>
                            E{i + 1} · +{x.nights} · {values.extensions[i].channel === 'PLATAFORMA' ? 'plataforma' : 'direto'}
                          </span>
                          <span className="guest-form__mono">{formatMoney(x.amountCents)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="summary__row summary__row--subtotal">
                    <span>Valor bruto</span>
                    <span className="guest-form__mono">{formatMoney(grossCents)}</span>
                  </div>
                </>
              )}
              <div className="summary__row summary__row--minus">
                <span>
                  Comissão
                  <CommissionPct commission={commissionCents} base={values.amountCents} />
                </span>
                <span className="guest-form__mono">− {formatMoney(commissionCents)}</span>
              </div>
              {extensionsCommission > 0 && (
                <div className="summary__row summary__row--minus">
                  <span>
                    Comissão das extensões <small>(só as pela plataforma)</small>
                    <CommissionPct
                      commission={extensionsCommission}
                      base={extensions.filter((x) => x.commissionCents > 0).reduce((s, x) => s + x.amountCents, 0)}
                    />
                  </span>
                  <span className="guest-form__mono">− {formatMoney(extensionsCommission)}</span>
                </div>
              )}
              {values.costs.length > 0 && (
                <div className="summary__row summary__row--minus summary__row--group">
                  <span>Custos e taxas</span>
                  <span className="guest-form__mono">− {formatMoney(costsCents)}</span>
                  <ul className="summary__items">
                    {values.costs.map((c, i) => (
                      <li key={c.key}>
                        <span>{c.description.trim() || `Custo ${i + 1}`}</span>
                        <span className="guest-form__mono">{formatMoney(c.amountCents)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="summary__row summary__row--total">
                <span>Total geral</span>
                <strong className={`guest-form__mono ${netCents < 0 ? 'is-negative' : ''}`}>
                  {formatMoney(netCents)}
                </strong>
              </div>
              {totalNights > 0 && grossCents > 0 && (
                <p className="summary__note">
                  {formatMoney(Math.round(grossCents / totalNights))} por noite · líquido{' '}
                  {formatMoney(Math.round(netCents / totalNights))} por noite
                  {extraNights > 0 && ` (${totalNights} noites com extensões)`}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ---------------- Documentos e fotos ---------------- */}
        <section className="guest-form__section">
          <h3 className="guest-form__heading">
            Documentos e fotos <span className="guest-form__optional">opcional</span>
          </h3>
          <AttachmentsField
            reservationId={reservation?.id ?? null}
            existing={reservation?.attachments ?? []}
            removedIds={removedAttachments}
            pending={pendingFiles}
            disabled={saving}
            onAdd={(items) => setPendingFiles((list) => [...list, ...items])}
            onChangePending={(key, category) =>
              setPendingFiles((list) => list.map((p) => (p.key === key ? { ...p, category } : p)))
            }
            onRemovePending={(key) => setPendingFiles((list) => list.filter((p) => p.key !== key))}
            onToggleRemoved={(id) =>
              setRemovedAttachments((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
            }
          />
        </section>
      </form>
    </Modal>
    <GuestFormModal
      key={guestFormKey}
      open={open && guestFormOpen}
      guest={null}
      hideReserveAction
      onClose={() => setGuestFormOpen(false)}
      onSaved={(g) => linkGuest(g)}
      onEditExisting={linkGuest}
    />
    </>
  )
}
