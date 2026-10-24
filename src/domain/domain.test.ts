import { describe, expect, it } from 'vitest'
import { ingredientsCost, lotCost, recipeBatchCost, usableUnits, weightedAverageCost } from './cost'
import { formatBRL } from './money'
import { canTransition } from './orders'
import { lotCostAfterIncrease, profit, realMargin, simulateIngredientPriceIncrease, suggestedPrice, unitCost } from './pricing'
import { costPerBase, toBase } from './units'
import type { Receita } from './types'

describe('unidades', () => {
  it('converte para a unidade base', () => {
    expect(toBase(2, 'kg')).toBe(2000)
    expect(costPerBase(3800, 1, 'kg')).toBe(3.8)
  })
})

describe('custo', () => {
  it('calcula o custo médio ponderado', () => {
    // 2 kg a 3,8 c/g + 5 kg comprados por R$ 190 => R$ 266,00 / 7 kg
    expect(weightedAverageCost(2000, 3.8, 5000, 19000)).toBeCloseTo(26600 / 7000, 6)
  })

  it('handles waste and recursive sub-recipe yields safely', () => {
    const sub = { id: 'sub', nome: 'Sub', rendimentoQtd: 10, perdaPct: 0.2, itens: [{ insumoId: 'farinha', quantidadeBase: 10 }] }
    const main = { id: 'main', nome: 'Principal', rendimentoQtd: 4, perdaPct: 0.25, tempoMin: 6, itens: [{ subReceita: sub, quantidadeBase: 4 }] }
    expect(ingredientsCost(main, { farinha: 2 })).toBe(10)
    expect(usableUnits(main)).toBe(3)
    expect(recipeBatchCost(main, { farinha: 2 }, 6000)).toBe(610)
    const cycle: Receita = { id: 'loop', nome: 'Ciclo', rendimentoQtd: 1, perdaPct: 0, itens: [] }
    cycle.itens.push({ subReceita: cycle, quantidadeBase: 1 })
    expect(() => ingredientsCost(cycle, {})).toThrow(/Ciclo de sub-receitas/)
  })
})

describe('precificação (teste de ouro da documentação)', () => {
  const custoLote = lotCost({ ingredientes: 3840, embalagem: 420, maoDeObra: 1200, indiretos: 560 })

  it('soma o custo do lote', () => expect(custoLote).toBe(6020))

  it('pacote de 150 g: 8 pacotes, margem 40%', () => {
    const custo = unitCost(custoLote, 8)
    const preco = suggestedPrice({ custoUnitario: custo, margem: 0.4 })
    expect(preco).toBe(1250)
    expect(profit(preco, custo)).toBe(497)
    expect(realMargin(preco, custo)).toBeCloseTo(0.3976, 4)
    expect(formatBRL(preco).replace(/\s/g, ' ')).toBe('R$ 12,50')
  })

  it('pacote de 300 g: 4 pacotes, margem 40%', () => {
    const custo = unitCost(custoLote, 4)
    const preco = suggestedPrice({ custoUnitario: custo, margem: 0.4 })
    expect(preco).toBe(2500)
    expect(profit(preco, custo)).toBe(995)
  })

  it('simulador: manteiga 10% mais cara derruba a margem para cerca de 38%', () => {
    const novoLote = lotCostAfterIncrease(custoLote, 1900, 0.1)
    expect(novoLote).toBe(6210)
    expect(realMargin(1250, unitCost(novoLote, 8))).toBeCloseTo(0.379, 3)
  })

  it('reports direct ingredient price impact', () => {
    expect(simulateIngredientPriceIncrease(1000, 400, 0.25)).toEqual({
      custoOriginalCents: 1000, custoDoInsumoCents: 400, novoCustoCents: 1100, impactoCents: 100, aumentoPct: 0.25,
    })
  })

  it('recusa margem + taxa de 100% ou mais', () => {
    expect(() => suggestedPrice({ custoUnitario: 100, margem: 0.9, taxa: 0.1 })).toThrow()
  })
})

describe('encomendas', () => {
  it('respeita a máquina de estados', () => {
    expect(canTransition('agendado', 'finalizado')).toBe(true)
    expect(canTransition('agendado', 'cancelado')).toBe(true)
    expect(canTransition('agendado', 'agendado')).toBe(false)
    expect(canTransition('finalizado', 'cancelado')).toBe(false)
  })
})
