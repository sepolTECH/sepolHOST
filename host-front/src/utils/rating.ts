/** Rótulos das notas de 1 a 5 (índice = nota). */
export const RATING_LABEL = ['', 'Péssimo', 'Ruim', 'Regular', 'Bom', 'Excelente']

/** 4.3 → "4,3" */
export const formatRating = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
