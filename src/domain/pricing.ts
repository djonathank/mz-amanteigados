export interface PriceInput {
  custoUnitario: number // centavos por pacote
  margem: number        // 0 a 1, sobre o preço de venda
  taxa?: number         // 0 a 1, taxa de pagamento sobre o preço
  passo?: number        // arredondamento em centavos (padrão R$ 0,50)
}

export const unitCost = (custoLote: number, pacotes: number): number =>
  Math.round(custoLote / pacotes)

export const suggestedPrice = ({ custoUnitario, margem, taxa = 0, passo = 50 }: PriceInput): number => {
  if (!(Number.isFinite(custoUnitario) && custoUnitario >= 0)) throw new Error('Custo unitário inválido')
  if (!(Number.isFinite(margem) && margem >= 0 && margem < 1)) throw new Error('Margem inválida')
  if (!(Number.isFinite(taxa) && taxa >= 0 && taxa < 1)) throw new Error('Taxa de pagamento inválida')
  if (!(Number.isFinite(passo) && passo > 0)) throw new Error('Passo de arredondamento inválido')
  const divisor = 1 - margem - taxa
  if (divisor <= 0) throw new Error('Margem + taxas devem somar menos de 100%')
  return Math.round(custoUnitario / divisor / passo) * passo
}

export const profit = (preco: number, custoUnitario: number, taxa = 0): number =>
  Math.round(preco * (1 - taxa) - custoUnitario)

export const realMargin = (preco: number, custoUnitario: number, taxa = 0): number =>
  preco > 0 ? profit(preco, custoUnitario, taxa) / preco : 0

/** Simulador: novo custo do lote se um insumo encarecer em aumentoPct (0.1 = 10%). */
export const lotCostAfterIncrease = (custoLote: number, custoDoInsumoNoLote: number, aumentoPct: number): number =>
  simulateIngredientPriceIncrease(custoLote, custoDoInsumoNoLote, aumentoPct).novoCustoCents

export interface IngredientPriceImpact {
  custoOriginalCents: number
  custoDoInsumoCents: number
  novoCustoCents: number
  impactoCents: number
  aumentoPct: number
}

/** Estimates the new lot cost from the target ingredient's current contribution to that lot. */
export function simulateIngredientPriceIncrease(
  custoLoteCents: number, custoDoInsumoCents: number, aumentoPct: number,
): IngredientPriceImpact {
  if (!(Number.isFinite(custoLoteCents) && custoLoteCents >= 0)) throw new Error('Custo do lote inválido')
  if (!(Number.isFinite(custoDoInsumoCents) && custoDoInsumoCents >= 0 && custoDoInsumoCents <= custoLoteCents)) {
    throw new Error('Custo do insumo no lote inválido')
  }
  if (!(Number.isFinite(aumentoPct) && aumentoPct >= -1)) throw new Error('Aumento de preço inválido')
  const novoCustoCents = Math.round(custoLoteCents + custoDoInsumoCents * aumentoPct)
  return {
    custoOriginalCents: Math.round(custoLoteCents),
    custoDoInsumoCents: Math.round(custoDoInsumoCents),
    novoCustoCents,
    impactoCents: novoCustoCents - Math.round(custoLoteCents),
    aumentoPct,
  }
}
