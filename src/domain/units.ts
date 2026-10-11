export type BaseUnit = 'g' | 'ml' | 'un'
export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'un'

const FACTORS: Record<Unit, [BaseUnit, number]> = {
  g: ['g', 1], kg: ['g', 1000], ml: ['ml', 1], l: ['ml', 1000], un: ['un', 1],
}

export const baseOf = (u: Unit): BaseUnit => FACTORS[u][0]
export const toBase = (qty: number, u: Unit): number => qty * FACTORS[u][1]

/** Custo (em centavos) por unidade base, a partir do total pago numa compra. */
export const costPerBase = (totalCents: number, qty: number, u: Unit): number => {
  const base = toBase(qty, u)
  if (base <= 0) throw new Error('A quantidade deve ser maior que zero')
  return totalCents / base
}
