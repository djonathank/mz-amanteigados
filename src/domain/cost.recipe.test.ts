import { describe, expect, it } from 'vitest'
import { recipeBatchCost, usableUnits } from './cost'
import type { Receita } from './types'

describe('recipe operating costs', () => {
  it('calculates labor and hourly gas proportionally by minutes and includes losses in unit cost', () => {
    const recipe: Receita = {
      id: 'recipe',
      nome: 'Receita',
      rendimentoQtd: 100,
      perdaPct: 0.1,
      tempoMin: 30,
      gasCents: 600,
      itens: [],
    }

    const batchCost = recipeBatchCost(recipe, {}, 2000)
    expect(batchCost).toBe(1300)
    expect(batchCost / usableUnits(recipe)).toBeCloseTo(14.444444, 5)
  })
})
