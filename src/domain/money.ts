const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brlUnitario = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2,
})

export const formatBRL = (cents: number): string => brl.format(cents / 100)

/** Formats very small unit prices without rounding them to R$ 0,00. */
export const formatBRLUnitario = (cents: number): string => brlUnitario.format(Math.ceil(cents) / 100)

/** "R$ 1.250,50" -> 125050 */
export const parseBRL = (text: string): number =>
  Math.round(parseFloat(text.replace(/[^\d,]/g, '').replace(',', '.')) * 100) || 0
