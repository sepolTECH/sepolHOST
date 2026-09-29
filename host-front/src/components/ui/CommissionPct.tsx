import { commissionPercent } from '../../utils/money'

interface CommissionPctProps {
  commission: number // centavos
  base: number // valor sobre o qual a comissão foi cobrada (centavos)
}

/** Selo com a % que a comissão representa do valor — usado ao lado de todo valor de comissão. */
export function CommissionPct({ commission, base }: CommissionPctProps) {
  const pct = commissionPercent(commission, base)
  if (!pct) return null
  return (
    <small className="commission-pct" title="Porcentagem da comissão sobre o valor">
      {pct}
    </small>
  )
}
