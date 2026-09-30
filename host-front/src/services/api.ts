// Em dev, o Vite faz proxy de /api para o back.
// Em produção, defina VITE_API_URL (ex.: https://api.seudominio.com.br) ou sirva o front e o back no mesmo domínio.
const BASE_URL = import.meta.env.VITE_API_URL ?? ''

export interface FieldError {
  field: string
  message: string
}

export class ApiError extends Error {
  status: number
  errors: FieldError[]
  constructor(message: string, status: number, errors: FieldError[] = []) {
    super(message)
    this.status = status
    this.errors = errors
  }
}

/** Disparado quando a sessão expira numa rota protegida — o AuthContext desloga o usuário. */
export const UNAUTHORIZED_EVENT = 'auth:unauthorized'

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}/api${path}`, {
      credentials: 'include', // envia/recebe o cookie httpOnly
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    })
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor', 0)
  }

  if (res.status === 204) return undefined as T

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    throw new ApiError(data.message ?? 'Erro inesperado', res.status, data.errors ?? [])
  }
  return data as T
}

export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'user' | 'associate'
}

export const authApi = {
  login: (email: string, password: string, remember: boolean) =>
    api<{ user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, remember }),
    }),
  register: (name: string, email: string, password: string) =>
    api<{ user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),
  forgotPassword: (email: string) =>
    api<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    api<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),
  me: () => api<{ user: User }>('/auth/me'),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
}

// ---------------------------------------------------------------------------
// Hóspedes
// ---------------------------------------------------------------------------

export type PersonType = 'PF' | 'PJ'
export type DocumentType = 'CPF' | 'PASSAPORTE' | 'DNI' | 'CNPJ'

/** Dados enviados no cadastro/edição. Campos opcionais vão como string vazia. */
export interface GuestInput {
  fullName: string
  /** Hóspede que não informou o documento (LGPD): o documento é ignorado. Só pessoa física. */
  noDocument: boolean
  personType: PersonType
  isForeign: boolean
  nationality: string
  documentType: DocumentType
  documentNumber: string
  rg: string
  email: string
  phone: string
  addressZip: string
  addressStreet: string
  addressNumber: string
  addressComplement: string
  addressDistrict: string
  addressCity: string
  addressState: string
  addressCountry: string
  notes: string
}

export type DuplicateField = 'name' | 'phone' | 'email'

/** Cadastro existente que pode ser a mesma pessoa que está sendo cadastrada. */
export interface DuplicateMatch {
  guest: Guest
  matchedOn: DuplicateField[]
  exactName: boolean
}

/** Campos opcionais que a API devolve como null quando vazios. */
type OptionalGuestField =
  | 'rg'
  | 'email'
  | 'addressZip'
  | 'addressStreet'
  | 'addressNumber'
  | 'addressComplement'
  | 'addressDistrict'
  | 'addressCity'
  | 'addressState'
  | 'addressCountry'
  | 'notes'

export type Guest = Omit<GuestInput, OptionalGuestField | 'noDocument' | 'documentType' | 'documentNumber'> & {
  [K in OptionalGuestField]: string | null
} & {
  /** null = hóspede cadastrado sem documento */
  documentType: DocumentType | null
  documentNumber: string | null
  id: string
  hasDocumentPhoto: boolean
  documentPhotoMime: string | null
  createdAt: string
  updatedAt: string
  createdByName: string | null
  updatedByName: string | null
  averageRating: number | null // média das avaliações internas (null = sem avaliações)
  reviewsCount: number
  reservationsCount: number // reservas em que é o responsável (ficam sem hóspede se ele for excluído)
  blocked: GuestBlock | null // bloqueio (null = não bloqueado)
}

/** Dados do bloqueio de um hóspede. */
export interface GuestBlock {
  reason: string
  blockedAt: string
  blockedByName: string | null
  reservationId: string | null // reserva que motivou o bloqueio
  reservationNumber: string | null
}

export interface Paginated<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

export interface GuestListParams {
  search?: string
  personType?: PersonType
  page?: number
  pageSize?: number
}

/** Baixa um arquivo protegido (com o cookie de sessão) e devolve como Blob. */
export async function fetchBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}/api${path}`, { credentials: 'include', signal })
  } catch (err) {
    if (signal?.aborted) throw err
    throw new ApiError('Não foi possível conectar ao servidor', 0)
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    throw new ApiError(data.message ?? 'Erro ao baixar o arquivo', res.status)
  }
  return res.blob()
}

export const guestsApi = {
  list: (params: GuestListParams = {}, signal?: AbortSignal) => {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') qs.set(k, String(v))
    })
    return api<Paginated<Guest>>(`/guests?${qs}`, { signal })
  },
  get: (id: string) => api<{ guest: Guest }>(`/guests/${id}`),
  checkDocument: (documentType: DocumentType, documentNumber: string, signal?: AbortSignal) =>
    api<{ exists: boolean; guest: Guest | null }>(
      `/guests/check-document?${new URLSearchParams({ documentType, documentNumber })}`,
      { signal },
    ),
  /** Exclui o hóspede. Com reservas vinculadas é preciso confirmar (elas ficam sem hóspede). */
  remove: (id: string, detachReservations = false) =>
    api<void>(`/guests/${id}?detachReservations=${detachReservations}`, { method: 'DELETE' }),
  /** Possíveis cadastros duplicados por nome (inclusive abreviado), telefone e e-mail. */
  checkDuplicates: (
    params: { fullName: string; personType: PersonType; phone: string; email: string; excludeId?: string },
    signal?: AbortSignal,
  ) => {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v) qs.set(k, v)
    })
    return api<{ matches: DuplicateMatch[] }>(`/guests/check-duplicates?${qs}`, { signal })
  },
  create: (input: GuestInput) =>
    api<{ guest: Guest }>('/guests', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: GuestInput) =>
    api<{ guest: Guest }>(`/guests/${id}`, { method: 'PUT', body: JSON.stringify(input) }),

  /** Foto do documento: o corpo da requisição é o próprio arquivo. */
  uploadDocumentPhoto: (id: string, file: File) =>
    api<{ guest: Guest }>(`/guests/${id}/document-photo`, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
    }),
  removeDocumentPhoto: (id: string) => api<{ guest: Guest }>(`/guests/${id}/document-photo`, { method: 'DELETE' }),
  getDocumentPhoto: (id: string, signal?: AbortSignal) => fetchBlob(`/guests/${id}/document-photo`, signal),

  /** Histórico de hospedagens (como responsável ou acompanhante). */
  stays: (id: string, signal?: AbortSignal) => api<GuestStays>(`/guests/${id}/stays`, { signal }),

  /** Dependentes: acompanhantes das reservas em que ele foi o responsável. */
  dependents: (id: string, signal?: AbortSignal) => api<{ data: Dependent[] }>(`/guests/${id}/dependents`, { signal }),

  /** Consulta um documento qualquer: hóspede cadastrado com ele e de quem já foi dependente. */
  documentLookup: (document: string, excludeMainGuestId?: string | null, signal?: AbortSignal) => {
    const qs = new URLSearchParams({ document })
    if (excludeMainGuestId) qs.set('excludeMainGuestId', excludeMainGuestId)
    return api<DocumentLookup>(`/guests/document-lookup?${qs}`, { signal })
  },
}

// ---------------------------------------------------------------------------
// Dependentes (acompanhantes salvos no cadastro do hóspede responsável)
// ---------------------------------------------------------------------------

export interface Dependent {
  id: string
  fullName: string
  document: string | null // como foi digitado na reserva
  ageGroup: AgeGroup
  staysCount: number // hospedagens junto com o responsável
  lastCheckIn: string | null
  createdAt: string
  updatedAt: string
  /** Preenchido quando o dependente também tem cadastro completo de hóspede. */
  registeredGuest: { id: string; documentType: DocumentType; blocked: boolean } | null
}

/** Responsável de quem o documento consultado já foi dependente. */
export interface DependentOf {
  dependentId: string
  dependentName: string
  updatedAt: string
  mainGuest: MainGuest & { blocked: GuestBlock | null }
}

export interface DocumentLookup {
  guest: Guest | null // hóspede cadastrado com este documento
  dependentOf: DependentOf[] // bloqueados primeiro
}

// ---------------------------------------------------------------------------
// Reservas
// ---------------------------------------------------------------------------

export type ReservationStatus = 'VAZIO' | 'HOSPEDADO' | 'CONCLUIDO'
export type CommissionType = 'PERCENT' | 'VALUE'
export type AgeGroup = 'ADULT' | 'CHILD'
export type Platform = 'AIRBNB' | 'BOOKING' | 'VRBO' | 'DIRETO' | 'OUTRA'
export type PaymentMethod =
  | 'PLATAFORMA'
  | 'PIX'
  | 'CARTAO_CREDITO'
  | 'CARTAO_DEBITO'
  | 'DINHEIRO'
  | 'TRANSFERENCIA'
  | 'BOLETO'
  | 'OUTRO'
export type AttachmentCategory = 'CONTRATO' | 'CHECKIN' | 'CHECKOUT' | 'OUTRO'

/** Custo/taxa descontado do valor bruto (faxina, limpeza, reposição...). */
export interface ReservationCost {
  id?: string
  description: string
  amountCents: number
}

export type ExtensionChannel = 'PLATAFORMA' | 'DIRETO'

/** Dados de uma extensão enviados no formulário (o back calcula noites, valor e comissão). */
export interface ReservationExtensionInput {
  checkOut: string // novo check-out
  channel: ExtensionChannel
  amountCents?: number // só para DIRETO
  paymentMethod?: PaymentMethod | null // só para DIRETO
}

export interface ReservationExtension {
  id: string
  startDate: string
  checkOut: string
  nights: number
  channel: ExtensionChannel
  paymentMethod: PaymentMethod | null
  amountCents: number
  commissionCents: number
}

export interface ReservationAttachment {
  id: string
  category: AttachmentCategory
  fileName: string
  mime: string
  sizeBytes: number
  createdAt: string
  createdByName: string | null
}

export interface Companion {
  id?: string
  fullName: string
  document: string | null
  ageGroup: AgeGroup
}

export interface ReservationInput {
  reservationNumber: string
  mainGuestId: string | null // null = reserva sem hóspede vinculado
  propertyName: string
  guestsCount: number
  companions: Companion[]
  bookedAt: string // AAAA-MM-DD
  checkIn: string
  checkOut: string
  status: ReservationStatus
  platform: Platform
  paymentMethod: PaymentMethod | null
  costs: ReservationCost[]
  extensions: ReservationExtensionInput[]
  amountCents: number
  commissionType: CommissionType
  commissionRate?: number | null
  commissionCents?: number
}

export interface MainGuest {
  id: string
  fullName: string
  documentType: DocumentType | null
  documentNumber: string | null
}

export interface Reservation {
  id: string
  reservationNumber: string
  mainGuest: MainGuest | null // null = reserva sem hóspede vinculado
  propertyName: string
  guestsCount: number
  companionsCount: number
  bookedAt: string
  checkIn: string
  checkOut: string // check-out original
  finalCheckOut: string // com as extensões
  nights: number // noites da reserva original
  totalNights: number // com as extensões
  status: ReservationStatus
  platform: Platform | null // null só em reservas antigas
  paymentMethod: PaymentMethod | null
  amountCents: number
  commissionType: CommissionType
  commissionRate: number | null
  commissionCents: number
  costsCents: number
  extensionsCents: number
  extensionsCommissionCents: number
  extensionsCount: number
  /** Valor bruto = reserva + extensões */
  grossCents: number
  /** Total geral = bruto − comissões − custos */
  netCents: number
  attachmentsCount: number
  createdAt: string
  updatedAt: string
  createdByName: string | null
  updatedByName: string | null
  // só no detalhe
  companions?: Companion[]
  costs?: ReservationCost[]
  extensions?: ReservationExtension[]
  attachments?: ReservationAttachment[]
}

export interface ReservationList extends Paginated<Reservation> {
  totals: { amountCents: number; commissionCents: number; costsCents: number; netCents: number }
}

export interface ReservationListParams {
  search?: string
  status?: ReservationStatus
  page?: number
  pageSize?: number
}

export const reservationsApi = {
  list: (params: ReservationListParams = {}, signal?: AbortSignal) => {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') qs.set(k, String(v))
    })
    return api<ReservationList>(`/reservations?${qs}`, { signal })
  },
  get: (id: string) => api<{ reservation: Reservation }>(`/reservations/${id}`),
  create: (input: ReservationInput) =>
    api<{ reservation: Reservation }>('/reservations', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: ReservationInput) =>
    api<{ reservation: Reservation }>(`/reservations/${id}`, { method: 'PUT', body: JSON.stringify(input) }),

  /** Anexos: o corpo da requisição é o próprio arquivo. */
  addAttachment: (id: string, file: File, category: AttachmentCategory) =>
    api<{ attachment: ReservationAttachment }>(
      `/reservations/${id}/attachments?${new URLSearchParams({ category, name: file.name })}`,
      { method: 'POST', body: file, headers: { 'Content-Type': file.type } },
    ),
  /** Exclui a reserva (acompanhantes, custos, anexos, avaliação e inventário saem junto). */
  remove: (id: string) => api<void>(`/reservations/${id}`, { method: 'DELETE' }),
  removeAttachment: (id: string, attachmentId: string) =>
    api<void>(`/reservations/${id}/attachments/${attachmentId}`, { method: 'DELETE' }),
  getAttachment: (id: string, attachmentId: string, signal?: AbortSignal) =>
    fetchBlob(`/reservations/${id}/attachments/${attachmentId}`, signal),
}

// ---------------------------------------------------------------------------
// Histórico de hospedagens do hóspede
// ---------------------------------------------------------------------------

/** Papel do hóspede na reserva: responsável ou acompanhante (encontrado pelo documento). */
export type GuestRole = 'RESPONSAVEL' | 'ACOMPANHANTE'

export type GuestStay = Reservation & {
  guestRole: GuestRole
  reviewAverage: number | null // média da avaliação interna (null = não avaliada)
}

export interface GuestStays {
  data: GuestStay[]
  summary: {
    totalReservations: number // todas, inclusive futuras
    totalStays: number // já iniciadas (check-in até hoje)
    asMainCount: number
    asCompanionCount: number
    totalNights: number // das já iniciadas
    grossCents: number // só como responsável, das já iniciadas
    firstCheckIn: string | null
    lastCheckIn: string | null
    nextCheckIn: string | null
    averageRating: number | null // média das avaliações como responsável
  }
}

// ---------------------------------------------------------------------------
// Avaliações internas das hospedagens (uma por reserva)
// ---------------------------------------------------------------------------

export interface ReviewInput {
  cleanlinessRating: number // 1 a 5
  communicationRating: number
  rulesRating: number
  notes: string
  blockGuest?: boolean // bloqueia o hóspede responsável
  blockReason?: string
}

export interface Review {
  id: string
  cleanlinessRating: number
  communicationRating: number
  rulesRating: number
  average: number
  notes: string | null
  createdAt: string
  updatedAt: string
  createdByName: string | null
  updatedByName: string | null
}

/** Reserva + hóspede + avaliação (null quando ainda não avaliada). */
export interface ReviewItem {
  reservation: {
    id: string
    reservationNumber: string
    propertyName: string
    checkIn: string
    finalCheckOut: string
    totalNights: number
    status: ReservationStatus
    platform: Platform | null
    guestsCount: number
  }
  guest: {
    id: string
    fullName: string
    documentType: DocumentType | null
    documentNumber: string | null
    averageRating: number | null // média do hóspede em todas as reservas avaliadas
    reviewsCount: number
    blocked: GuestBlock | null
  }
  review: Review | null
}

export type ReviewFilter = 'PENDENTE' | 'AVALIADA'

export interface ReviewList extends Paginated<ReviewItem> {
  counts: { all: number; reviewed: number; pending: number; averageRating: number | null }
}

export interface ReviewListParams {
  search?: string
  reviewed?: ReviewFilter
  page?: number
  pageSize?: number
}

export const reviewsApi = {
  list: (params: ReviewListParams = {}, signal?: AbortSignal) => {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') qs.set(k, String(v))
    })
    return api<ReviewList>(`/reviews?${qs}`, { signal })
  },
  get: (reservationId: string) => api<{ item: ReviewItem }>(`/reviews/${reservationId}`),
  save: (reservationId: string, input: ReviewInput) =>
    api<{ item: ReviewItem }>(`/reviews/${reservationId}`, { method: 'PUT', body: JSON.stringify(input) }),
  remove: (reservationId: string) => api<void>(`/reviews/${reservationId}`, { method: 'DELETE' }),
}

// ---------------------------------------------------------------------------
// Hóspedes bloqueados
// ---------------------------------------------------------------------------

export interface BlockEntry {
  guest: {
    id: string
    fullName: string
    documentType: DocumentType | null
    documentNumber: string | null
    phone: string
    email: string | null
    averageRating: number | null
    reviewsCount: number
  }
  reason: string
  reservationId: string | null
  reservationNumber: string | null
  blockedAt: string
  blockedByName: string | null
  updatedAt: string
  updatedByName: string | null
}

/** Avaliação de uma hospedagem do hóspede bloqueado. */
export interface BlockReview {
  reservationId: string
  reservationNumber: string
  propertyName: string
  checkIn: string
  finalCheckOut: string
  cleanlinessRating: number
  communicationRating: number
  rulesRating: number
  average: number
  notes: string | null
  updatedAt: string
  reviewedByName: string | null
  isBlockOrigin: boolean // reserva que motivou o bloqueio
}

export interface BlockDetail {
  block: BlockEntry
  reviews: BlockReview[]
}

export const blocklistApi = {
  list: (params: { search?: string; page?: number; pageSize?: number } = {}, signal?: AbortSignal) => {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') qs.set(k, String(v))
    })
    return api<Paginated<BlockEntry>>(`/blocklist?${qs}`, { signal })
  },
  get: (guestId: string, signal?: AbortSignal) => api<BlockDetail>(`/blocklist/${guestId}`, { signal }),
  block: (guestId: string, reason: string, reservationId?: string | null) =>
    api<BlockDetail>(`/blocklist/${guestId}`, { method: 'PUT', body: JSON.stringify({ reason, reservationId }) }),
  unblock: (guestId: string) => api<void>(`/blocklist/${guestId}`, { method: 'DELETE' }),
}

// ---------------------------------------------------------------------------
// Finanças — Relatório financeiro (proporcional às noites) e Fechamento do mês (caixa)
// ---------------------------------------------------------------------------

interface FinanceAmounts {
  reservations: number
  nights: number
  grossCents: number
  commissionCents: number
  costsCents: number
  netCents: number
}

/** Hospedagem com os valores que caem no mês (proporcionais às noites). */
export interface FinanceStay {
  id: string
  reservationNumber: string
  propertyName: string
  mainGuest: { id: string; fullName: string } | null
  platform: Platform | null
  status: ReservationStatus
  checkIn: string
  finalCheckOut: string
  totalNights: number
  nightsInMonth: number // noites dormidas no mês (ocupação)
  totalDays: number // dias da hospedagem, check-in e check-out inclusive
  daysInMonth: number // dias que caem no mês (base da divisão dos valores)
  partial: boolean // atravessa a virada do mês
  grossCents: number
  extensionsCents: number
  commissionCents: number
  costsCents: number
  netCents: number
  fullGrossCents: number // hospedagem inteira
  fullNetCents: number
}

/** Categorias das despesas do imóvel (condomínio, IPTU, contas...). */
export type ExpenseCategory =
  | 'CONDOMINIO'
  | 'IPTU'
  | 'ENERGIA'
  | 'AGUA'
  | 'GAS'
  | 'INTERNET'
  | 'TV_STREAMING'
  | 'SEGURO'
  | 'ALUGUEL'
  | 'FINANCIAMENTO'
  | 'ADMINISTRACAO'
  | 'MANUTENCAO'
  | 'IMPOSTOS'
  | 'OUTRO'

/** Despesa lançada no mês (avulsa ou gerada por uma recorrente). */
export interface MonthExpense {
  id: string
  period: string // AAAA-MM-01
  propertyName: string | null // null = geral (não é de um imóvel só)
  category: ExpenseCategory
  description: string
  amountCents: number
  recurring: { id: string; amountCents: number; startMonth: string; endMonth: string | null } | null
  edited: boolean // valor/dados alterados só neste mês
  updatedAt: string
  updatedByName: string | null
}

export interface ExpenseInput {
  propertyName: string | null
  category: ExpenseCategory
  description: string
  amountCents: number
}

export interface FinanceMonth {
  period: { year: number; month: number; start: string; end: string; days: number }
  totals: FinanceAmounts & {
    days: number // dias no mês (check-in e check-out contam)
    extensionsCents: number
    averageDailyCents: number
  }
  byProperty: (FinanceAmounts & { propertyName: string; occupancy: number })[]
  byPlatform: (FinanceAmounts & { platform: Platform | null; days: number })[]
  data: FinanceStay[]
  previous: {
    year: number
    month: number
    reservations: number
    nights: number
    grossCents: number
    netCents: number
  }
}

/** Configuração do fechamento (vale a partir do mês salvo até mudar). */
export interface ClosingSettings {
  adminFee: {
    enabled: boolean
    percent: number
    base: 'GROSS' | 'NET' // GROSS = sobre o bruto | NET = sobre o resultado do relatório
  }
  tax: {
    enabled: boolean
    incomeBase: 'GROSS' | 'PAYOUT' // PAYOUT = bruto − comissão (valor repassado)
    deductionMode: 'AUTO' | 'LEGAL' | 'SIMPLIFIED'
    dependents: number
    socialSecurityCents: number
    alimonyCents: number
  }
}

/** Dados comuns das hospedagens do fechamento. */
interface ClosingStayBase {
  id: string
  reservationNumber: string
  propertyName: string
  mainGuest: { id: string; fullName: string } | null
  platform: Platform | null
  status: ReservationStatus
  checkIn: string
  finalCheckOut: string
  nights: number
}

/** Valor da locação recebido no mês (hospedagem inteira, check-out no mês anterior). */
export interface ClosingStay extends ClosingStayBase {
  grossCents: number
  extensionsCents: number
  commissionCents: number
  netCents: number // bruto − comissão (o que cai na conta)
}

/** Custos pagos no mês (hospedagem com check-out final neste mês). */
export interface ClosingCostStay extends ClosingStayBase {
  costsCents: number
}

export interface CarneLeao {
  incomeCents: number
  rentalDeductionsCents: number
  deductibleExpensesCents: number
  adminFeeDeductionCents: number
  deductibleExpenses: { id: string; category: ExpenseCategory; description: string; propertyName: string | null; amountCents: number }[]
  taxableIncomeCents: number
  deductionUsed: 'LEGAL' | 'SIMPLIFIED'
  legalDeductionsCents: number
  simplifiedDiscountCents: number
  personalDeductionsCents: number
  baseCents: number
  bracket: { index: number; rate: number; deductionCents: number }
  tableTaxCents: number
  reductionCents: number
  taxCents: number
  belowMinimum: boolean
  effectiveRate: number
  due: { year: number; month: number }
}

export interface ClosingMonth {
  period: { year: number; month: number; start: string }
  reference: { year: number; month: number; start: string; end: string } // mês dos check-outs recebidos
  settings: ClosingSettings & {
    source: { period: string; inherited: boolean; updatedAt: string | null; updatedByName: string | null } | null
  }
  totals: {
    reservations: number // hospedagens recebidas
    costReservations: number // hospedagens com custos no mês
    grossCents: number
    extensionsCents: number
    commissionCents: number
    costsCents: number
    netCents: number // resultado do relatório
    expensesCents: number
    generalExpensesCents: number
    adminFeeCents: number
    beforeTaxCents: number
    taxCents: number
    finalCents: number // líquido final em mãos
  }
  tax: CarneLeao | null
  byProperty: {
    propertyName: string
    reservations: number
    grossCents: number
    commissionCents: number
    costsCents: number
    netCents: number
    expensesCents: number
    adminFeeCents: number
    resultCents: number
  }[]
  stays: ClosingStay[]
  costStays: ClosingCostStay[]
  expenses: MonthExpense[]
  properties: string[]
  previous: { year: number; month: number; grossCents: number; finalCents: number }
}

export const financeApi = {
  month: (year: number, month: number, signal?: AbortSignal) =>
    api<FinanceMonth>(`/finance?${new URLSearchParams({ year: String(year), month: String(month) })}`, { signal }),

  /** Fechamento do mês (ponta do lápis). */
  closing: (year: number, month: number, signal?: AbortSignal) =>
    api<ClosingMonth>(`/finance/closing?${new URLSearchParams({ year: String(year), month: String(month) })}`, { signal }),
  /** Salva a configuração a partir deste mês e devolve o fechamento recalculado. */
  saveClosingSettings: (year: number, month: number, settings: ClosingSettings) =>
    api<ClosingMonth>('/finance/closing/settings', { method: 'PUT', body: JSON.stringify({ year, month, ...settings }) }),

  /** recurring = repete todo mês a partir deste. */
  createExpense: (year: number, month: number, input: ExpenseInput & { recurring: boolean }) =>
    api<{ expense: MonthExpense }>('/finance/expenses', {
      method: 'POST',
      body: JSON.stringify({ year, month, ...input }),
    }),
  /** applyToFuture (recorrente) = muda também os próximos meses; senão, só este mês. */
  updateExpense: (id: string, input: ExpenseInput & { applyToFuture: boolean }) =>
    api<{ expense: MonthExpense }>(`/finance/expenses/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  /** scope "future" (recorrente) = para de repetir a partir deste mês. */
  removeExpense: (id: string, scope: 'month' | 'future' = 'month') =>
    api<void>(`/finance/expenses/${id}?scope=${scope}`, { method: 'DELETE' }),
}

// ---------------------------------------------------------------------------
// Calendário — links iCal das plataformas (somente consulta)
// ---------------------------------------------------------------------------

export interface CalendarFeedInput {
  name: string
  platform: Platform
  url: string
  color: string
  propertyName: string
  active: boolean
}

export interface CalendarFeed extends Omit<CalendarFeedInput, 'propertyName'> {
  id: string
  propertyName: string | null
  lastSyncAt: string | null
  lastError: string | null
  lastEvents: number | null
  createdAt: string
  updatedAt: string
}

/** Situação de cada link na última sincronização. */
export interface CalendarFeedStatus {
  id: string
  name: string
  platform: Platform
  color: string
  propertyName: string | null
  syncedAt: string
  error: string | null
  eventsCount: number
}

export interface CalendarEventDetail {
  label: string
  value: string
  href?: string
}

/** Reserva do cadastro ligada ao evento (mesma plataforma e datas). */
export interface CalendarLinkedReservation {
  id: string
  reservationNumber: string
  propertyName: string
  guestsCount: number
  checkIn: string
  checkOut: string
  status: ReservationStatus
  platform: Platform | null
  guest: { id: string; fullName: string; phone: string | null } | null
}

export interface CalendarEvent {
  id: string
  /** Identificador da marcação dentro do link (UID do iCal) — usado no vínculo com a reserva */
  eventKey: string
  feedId: string
  feedName: string
  platform: Platform
  color: string
  propertyName: string | null
  kind: 'RESERVA' | 'BLOQUEIO'
  guestName: string | null
  start: string // check-in (AAAA-MM-DD)
  end: string // check-out (AAAA-MM-DD, dia de saída)
  nights: number
  summary: string | null
  description: string | null
  notes: string | null
  location: string | null
  url: string | null
  uid: string | null
  status: string | null
  reservationCode: string | null
  details: CalendarEventDetail[]
  extra: Record<string, string>
  reservation: CalendarLinkedReservation | null
  /** MANUAL = vinculado por você | AUTO = mesmo código ou mesmas datas e plataforma */
  linkSource: 'MANUAL' | 'AUTO' | null
  /** datas da reserva vinculada diferentes das da plataforma */
  datesMismatch: boolean
  alsoIn: { feedName: string; platform: Platform; summary: string | null }[]
}

export interface CalendarData {
  from: string
  to: string
  feeds: CalendarFeedStatus[]
  events: CalendarEvent[]
}

/** Reserva sugerida para vincular a uma marcação. */
export interface CalendarLinkCandidate extends CalendarLinkedReservation {
  overlaps: boolean // cruza o período da marcação
  exact: boolean // mesmas datas
  linkedTo: string | null // nome do link ao qual já está vinculada
}

export const calendarApi = {
  /** refresh = baixa os calendários de novo, ignorando o cache do servidor (10 min). */
  events: (from: string, to: string, refresh = false, signal?: AbortSignal) =>
    api<CalendarData>(`/calendar/events?${new URLSearchParams({ from, to, ...(refresh ? { refresh: '1' } : {}) })}`, {
      signal,
    }),
  feeds: (signal?: AbortSignal) => api<{ data: CalendarFeed[] }>('/calendar/feeds', { signal }),
  createFeed: (input: CalendarFeedInput) =>
    api<{ feed: CalendarFeed }>('/calendar/feeds', { method: 'POST', body: JSON.stringify(input) }),
  updateFeed: (id: string, input: CalendarFeedInput) =>
    api<{ feed: CalendarFeed }>(`/calendar/feeds/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  removeFeed: (id: string) => api<void>(`/calendar/feeds/${id}`, { method: 'DELETE' }),

  /** Vínculo marcação ↔ reserva do cadastro (fica só no sistema). */
  linkCandidates: (start: string, end: string, search = '', signal?: AbortSignal) =>
    api<{ data: CalendarLinkCandidate[] }>(
      `/calendar/link-candidates?${new URLSearchParams({ start, end, ...(search ? { search } : {}) })}`,
      { signal },
    ),
  link: (feedId: string, eventKey: string, reservationId: string) =>
    api<void>('/calendar/links', { method: 'PUT', body: JSON.stringify({ feedId, eventKey, reservationId }) }),
  unlink: (feedId: string, eventKey: string) =>
    api<void>('/calendar/links', { method: 'DELETE', body: JSON.stringify({ feedId, eventKey }) }),
}

// ---------------------------------------------------------------------------
// Inventário e vistoria
// ---------------------------------------------------------------------------

export type InventoryStatus = 'PENDENTE' | 'VISTORIADO'

/** Dados de um item (quantidade e valor unitário em centavos). */
export interface InventoryItemInput {
  name: string
  quantity: number
  valueCents: number
}

export interface InventoryProperty {
  name: string
  itemsCount: number
  totalCents: number
  reservationsCount: number
}

export interface PropertyInventoryItem extends InventoryItemInput {
  id: string
  propertyName: string
  totalCents: number
}

export interface InspectionRow {
  id: string
  reservationNumber: string
  propertyName: string
  guestName: string | null
  checkIn: string
  finalCheckOut: string
  status: ReservationStatus
  platform: string | null
  inventoryStatus: InventoryStatus
  inspectedAt: string | null
  itemsCount: number
  checkedCount: number
  totalCents: number
}

export interface InspectionList {
  data: InspectionRow[]
  total: number
  page: number
  pageSize: number
  counts: { all: number; pending: number; inspected: number }
}

export interface InspectionListParams {
  search?: string
  status?: InventoryStatus
  page?: number
  pageSize?: number
}

export interface ReservationInventoryItem extends InventoryItemInput {
  id: string
  totalCents: number
  checked: boolean
  checkedAt: string | null
}

export interface ReservationInventory {
  reservation: {
    id: string
    reservationNumber: string
    propertyName: string
    guestName: string | null
    checkIn: string
    finalCheckOut: string
    status: ReservationStatus
    inventoryStatus: InventoryStatus
    inspectedAt: string | null
    inspectedByName: string | null
  }
  items: ReservationInventoryItem[]
  summary: { itemsCount: number; checkedCount: number; totalCents: number }
}

const json = (body: unknown) => JSON.stringify(body)

export const inventoryApi = {
  // Inventário do imóvel (modelo copiado para cada nova reserva)
  properties: () => api<{ data: InventoryProperty[] }>('/inventory/properties'),
  items: (property: string, signal?: AbortSignal) =>
    api<{ items: PropertyInventoryItem[]; totalCents: number }>(
      `/inventory/items?${new URLSearchParams({ property })}`,
      { signal },
    ),
  addItem: (property: string, input: InventoryItemInput) =>
    api<{ item: PropertyInventoryItem }>('/inventory/items', {
      method: 'POST',
      body: json({ propertyName: property, ...input }),
    }),
  updateItem: (id: string, input: InventoryItemInput) =>
    api<{ item: PropertyInventoryItem }>(`/inventory/items/${id}`, { method: 'PUT', body: json(input) }),
  removeItem: (id: string) => api<void>(`/inventory/items/${id}`, { method: 'DELETE' }),

  // Vistoria por reserva
  reservations: (params: InspectionListParams = {}, signal?: AbortSignal) => {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') qs.set(k, String(v))
    })
    return api<InspectionList>(`/inventory/reservations?${qs}`, { signal })
  },
  reservation: (id: string) => api<ReservationInventory>(`/inventory/reservations/${id}`),
  addReservationItem: (id: string, input: InventoryItemInput) =>
    api<ReservationInventory>(`/inventory/reservations/${id}/items`, { method: 'POST', body: json(input) }),
  updateReservationItem: (id: string, itemId: string, input: InventoryItemInput) =>
    api<ReservationInventory>(`/inventory/reservations/${id}/items/${itemId}`, {
      method: 'PUT',
      body: json(input),
    }),
  removeReservationItem: (id: string, itemId: string) =>
    api<ReservationInventory>(`/inventory/reservations/${id}/items/${itemId}`, { method: 'DELETE' }),
  checkItem: (id: string, itemId: string, checked: boolean) =>
    api<ReservationInventory>(`/inventory/reservations/${id}/items/${itemId}/check`, {
      method: 'PATCH',
      body: json({ checked }),
    }),
  checkAll: (id: string, checked: boolean) =>
    api<ReservationInventory>(`/inventory/reservations/${id}/check-all`, { method: 'POST', body: json({ checked }) }),
  inspect: (id: string) => api<ReservationInventory>(`/inventory/reservations/${id}/inspect`, { method: 'POST' }),
  reopen: (id: string) => api<ReservationInventory>(`/inventory/reservations/${id}/reopen`, { method: 'POST' }),
}


// ---------------------------------------------------------------------------
// Associados (funcionários / diaristas) — gestão feita pelo cliente
// ---------------------------------------------------------------------------

export interface Associate {
  id: string
  name: string
  email: string
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
  releasedCount: number
}

export interface AssociateCredentials {
  associate: Associate
  /** Senha gerada — só é devolvida na criação e ao gerar uma nova senha. */
  password: string
}

export const associatesApi = {
  list: () => api<{ data: Associate[] }>('/associates'),
  create: (input: { name: string; email: string }) =>
    api<AssociateCredentials>('/associates', { method: 'POST', body: json(input) }),
  update: (id: string, input: { name?: string; isActive?: boolean }) =>
    api<{ associate: Associate }>(`/associates/${id}`, { method: 'PATCH', body: json(input) }),
  resetPassword: (id: string) => api<AssociateCredentials>(`/associates/${id}/reset-password`, { method: 'POST' }),
  remove: (id: string) => api<void>(`/associates/${id}`, { method: 'DELETE' }),

  // Liberação de reservas
  releasedReservations: (id: string) => api<{ reservationIds: string[] }>(`/associates/${id}/reservations`),
  bulkAccess: (input: { associateId: string; reservationIds: string[]; granted: boolean }) =>
    api<{ updated: number }>('/associates/access/bulk', { method: 'POST', body: json(input) }),
  reservationAssociates: (reservationId: string) =>
    api<{ associateIds: string[] }>(`/associates/by-reservation/${reservationId}`),
  setReservationAssociates: (reservationId: string, associateIds: string[]) =>
    api<{ associateIds: string[] }>(`/associates/by-reservation/${reservationId}`, {
      method: 'PUT',
      body: json({ associateIds }),
    }),
}

// ---------------------------------------------------------------------------
// Área do associado (/api/associate): só vistoria e avaliação das reservas liberadas
// ---------------------------------------------------------------------------

export interface AssociateReservationRow {
  id: string
  reservationNumber: string
  propertyName: string
  guestName: string | null
  checkIn: string
  finalCheckOut: string
  status: ReservationStatus
  inventoryStatus: InventoryStatus
  hasGuest: boolean // sem hóspede vinculado não há avaliação a fazer
  reviewed: boolean
  itemsCount: number
  checkedCount: number
}

export interface AssociateInventoryItem {
  id: string
  name: string
  quantity: number
  checked: boolean
}

export interface AssociateInventory {
  reservation: {
    id: string
    reservationNumber: string
    propertyName: string
    guestName: string | null
    checkIn: string
    finalCheckOut: string
    inventoryStatus: InventoryStatus
    inspectedAt: string | null
  }
  items: AssociateInventoryItem[]
  summary: { itemsCount: number; checkedCount: number }
}

export interface AssociateReviewInput {
  cleanlinessRating: number
  communicationRating: number
  rulesRating: number
  notes: string
}

export interface AssociateReviewData {
  reservation: {
    id: string
    reservationNumber: string
    propertyName: string
    guestName: string
    checkIn: string
    finalCheckOut: string
  }
  review: {
    cleanlinessRating: number
    communicationRating: number
    rulesRating: number
    notes: string | null
  } | null
}

export const associateAreaApi = {
  reservations: () => api<{ data: AssociateReservationRow[] }>('/associate/reservations'),
  inventory: (id: string) => api<AssociateInventory>(`/associate/reservations/${id}/inventory`),
  checkItem: (id: string, itemId: string, checked: boolean) =>
    api<AssociateInventory>(`/associate/reservations/${id}/items/${itemId}/check`, {
      method: 'PATCH',
      body: json({ checked }),
    }),
  checkAll: (id: string, checked: boolean) =>
    api<AssociateInventory>(`/associate/reservations/${id}/check-all`, { method: 'POST', body: json({ checked }) }),
  inspect: (id: string) => api<AssociateInventory>(`/associate/reservations/${id}/inspect`, { method: 'POST' }),
  review: (id: string) => api<AssociateReviewData>(`/associate/reservations/${id}/review`),
  saveReview: (id: string, input: AssociateReviewInput) =>
    api<AssociateReviewData>(`/associate/reservations/${id}/review`, { method: 'PUT', body: json(input) }),
}

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------

export interface PlatformFee {
  platform: Platform
  /** Percentual (0–100) ou null quando não há taxa pré-cadastrada. */
  commissionRate: number | null
}

export const settingsApi = {
  fees: (signal?: AbortSignal) => api<{ data: PlatformFee[] }>('/settings/fees', { signal }),
  saveFees: (fees: PlatformFee[]) =>
    api<{ data: PlatformFee[] }>('/settings/fees', { method: 'PUT', body: JSON.stringify({ fees }) }),
}
