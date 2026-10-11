import type { Receita } from './types'

/** Custo médio ponderado na entrada de uma compra (centavos por unidade base). */
export const weightedAverageCost = (
  estoque: number, custoMedio: number, qtdCompra: number, totalCompraCents: number,
): number => {
  const total = estoque + qtdCompra
  return total <= 0 ? 0 : (estoque * custoMedio + totalCompraCents) / total
}

function assertRecipe(r: Receita) {
  if (!(Number.isFinite(r.rendimentoQtd) && r.rendimentoQtd > 0)) throw new Error(`Rendimento inválido na receita: ${r.nome}`)
  if (!(Number.isFinite(r.perdaPct) && r.perdaPct >= 0 && r.perdaPct < 1)) throw new Error(`Perda inválida na receita: ${r.nome}`)
}

export const usableUnits = (r: Receita): number => {
  assertRecipe(r)
  return r.rendimentoQtd * (1 - r.perdaPct)
}

/** Custo dos ingredientes do lote, em centavos. Sub-receitas entram de forma recursiva. */
export const ingredientsCost = (r: Receita, custoPorInsumo: Record<string, number>): number => {
  const visit = (recipe: Receita, stack: Set<string>): number => {
    assertRecipe(recipe)
    if (stack.has(recipe.id)) throw new Error(`Ciclo de sub-receitas detectado: ${[...stack, recipe.id].join(' -> ')}`)
    const next = new Set(stack).add(recipe.id)
    return recipe.itens.reduce((sum, it) => {
      if (!(Number.isFinite(it.quantidadeBase) && it.quantidadeBase > 0)) throw new Error(`Quantidade inválida na receita: ${recipe.nome}`)
      if (it.subReceita) {
        const yieldUseful = usableUnits(it.subReceita)
        return sum + (visit(it.subReceita, next) / yieldUseful) * it.quantidadeBase
      }
      const custo = custoPorInsumo[it.insumoId ?? '']
      if (custo === undefined) throw new Error(`Insumo sem custo: ${it.insumoId}`)
      return sum + it.quantidadeBase * custo
    }, 0)
  }
  return visit(r, new Set())
}

/** Custo integral do lote: insumos, gás/energia e mão de obra direta. */
export const recipeBatchCost = (
  r: Receita,
  custoPorInsumo: Record<string, number>,
  valorHoraCents = 0,
): number => {
  const visit = (recipe: Receita, stack: Set<string>): number => {
    assertRecipe(recipe)
    if (stack.has(recipe.id)) throw new Error(`Ciclo de sub-receitas detectado: ${[...stack, recipe.id].join(' -> ')}`)
    if (!(Number.isFinite(recipe.tempoMin ?? 0) && (recipe.tempoMin ?? 0) >= 0)) throw new Error(`Tempo de preparo inválido na receita: ${recipe.nome}`)
    if (!(Number.isFinite(recipe.gasCents ?? 0) && (recipe.gasCents ?? 0) >= 0)) throw new Error(`Custo de gás inválido na receita: ${recipe.nome}`)
    const next = new Set(stack).add(recipe.id)
    const ingredientes = recipe.itens.reduce((sum, it) => {
      if (!(Number.isFinite(it.quantidadeBase) && it.quantidadeBase > 0)) throw new Error(`Quantidade inválida na receita: ${recipe.nome}`)
      if (it.subReceita) return sum + visit(it.subReceita, next) / usableUnits(it.subReceita) * it.quantidadeBase
      const custo = custoPorInsumo[it.insumoId ?? '']
      if (custo === undefined) throw new Error(`Insumo sem custo: ${it.insumoId}`)
      return sum + it.quantidadeBase * custo
    }, 0)
    return ingredientes + (recipe.gasCents ?? 0) + laborCost(recipe.tempoMin ?? 0, valorHoraCents)
  }
  if (!(Number.isFinite(valorHoraCents) && valorHoraCents >= 0)) throw new Error('Valor por hora inválido')
  return visit(r, new Set())
}

export const usableRecipeUnits = usableUnits

export const laborCost = (minutos: number, valorHoraCents: number): number =>
  (minutos / 60) * valorHoraCents

export interface LotCostParts {
  ingredientes: number
  embalagem: number
  maoDeObra: number
  indiretos: number
  rateioFixos?: number
}

export const lotCost = (p: LotCostParts): number =>
  Math.round(p.ingredientes + p.embalagem + p.maoDeObra + p.indiretos + (p.rateioFixos ?? 0))
