const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const formatBRL = (cents: number): string => brl.format(cents / 100)

/** "R$ 1.250,50" -> 125050 */
export const parseBRL = (text: string): number =>
  Math.round(parseFloat(text.replace(/[^\d,]/g, '').replace(',', '.')) * 100) || 0
