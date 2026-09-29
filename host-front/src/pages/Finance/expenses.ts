import {
  Building2,
  Droplet,
  Flame,
  HandCoins,
  Home,
  Landmark,
  Receipt,
  ShieldCheck,
  Tv,
  Wifi,
  Wrench,
  CircleEllipsis,
  Zap,
  Briefcase,
  type LucideIcon,
} from 'lucide-react'
import type { ExpenseCategory } from '../../services/api'

/** Rótulo e ícone de cada categoria de despesa do imóvel. */
export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string; icon: LucideIcon }[] = [
  { value: 'CONDOMINIO', label: 'Condomínio', icon: Building2 },
  { value: 'IPTU', label: 'IPTU', icon: Landmark },
  { value: 'ENERGIA', label: 'Energia', icon: Zap },
  { value: 'AGUA', label: 'Água', icon: Droplet },
  { value: 'GAS', label: 'Gás', icon: Flame },
  { value: 'INTERNET', label: 'Internet', icon: Wifi },
  { value: 'TV_STREAMING', label: 'TV / streaming', icon: Tv },
  { value: 'SEGURO', label: 'Seguro', icon: ShieldCheck },
  { value: 'ALUGUEL', label: 'Aluguel', icon: Home },
  { value: 'FINANCIAMENTO', label: 'Financiamento', icon: HandCoins },
  { value: 'ADMINISTRACAO', label: 'Administração / gestão', icon: Briefcase },
  { value: 'MANUTENCAO', label: 'Manutenção', icon: Wrench },
  { value: 'IMPOSTOS', label: 'Impostos', icon: Receipt },
  { value: 'OUTRO', label: 'Outro', icon: CircleEllipsis },
]

export const EXPENSE_CATEGORY = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, c])) as Record<
  ExpenseCategory,
  (typeof EXPENSE_CATEGORIES)[number]
>
