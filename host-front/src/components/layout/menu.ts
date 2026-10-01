import { Boxes, CalendarDays, ClipboardList, Settings, ShieldBan, Star, Users, Wallet, type LucideIcon } from 'lucide-react'

export interface MenuChild {
  label: string
  to: string
}

export interface MenuItem {
  label: string
  icon: LucideIcon
  to?: string
  children?: MenuChild[]
}

/** Itens do menu lateral — adicione novos módulos aqui. */
export const MENU: MenuItem[] = [
  {
    label: 'Cadastro',
    icon: ClipboardList,
    children: [
      { label: 'Hóspedes', to: '/cadastro/hospedes' },
      { label: 'Reservas', to: '/cadastro/reservas' },
    ],
  },
  { label: 'Calendário', icon: CalendarDays, to: '/calendario' },
  {
    label: 'Finanças',
    icon: Wallet,
    children: [
      { label: 'Fechamento do mês', to: '/financas/fechamento' },
      { label: 'Relatório financeiro', to: '/financas/relatorio' },
    ],
  },
  { label: 'Inventário', icon: Boxes, to: '/inventario' },
  { label: 'Associados', icon: Users, to: '/associados' },
  { label: 'Avaliações', icon: Star, to: '/avaliacoes' },
  { label: 'Bloqueados', icon: ShieldBan, to: '/bloqueados' },
  {
    label: 'Ajustes',
    icon: Settings,
    children: [
      { label: 'Imóveis', to: '/ajustes/imoveis' },
      { label: 'Taxas', to: '/ajustes/taxas' },
      { label: 'Valores padrão', to: '/ajustes/valores-padrao' },
    ],
  },
]
