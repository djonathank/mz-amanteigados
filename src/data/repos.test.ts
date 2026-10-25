import { describe, expect, it, vi } from 'vitest'
import type { Db } from './db'
import { salvarConfig, salvarInsumo, salvarProduto, salvarReceita } from './repos'

function fakeDb(queryRows: (sql: string) => unknown[] = () => []) {
  const calls: { sql: string; params: unknown[] }[] = []
  const db = {
    query: vi.fn(async (sql: string) => queryRows(sql)),
    run: vi.fn(async (sql: string, params: unknown[] = []) => { calls.push({ sql, params }) }),
    transaction: vi.fn(async (fn: () => Promise<void>) => { await fn() }),
  } as unknown as Db
  return { db, calls }
}

describe('salvarInsumo', () => {
  it.each(['farinha', 'FARINHA', 'Farinha'])('saves "%s" as "Farinha"', async (nome) => {
    const f = fakeDb()
    await salvarInsumo(f.db, { nome, unidade: 'kg', quantidade: 2, totalCents: 5000 })
    const insert = f.calls.find((call) => call.sql.includes('INSERT INTO insumo'))
    expect(insert?.params[1]).toBe('Farinha')
  })

  describe('salvarProduto', () => {
    it('normalizes package variant names such as "Pacote 150g"', async () => {
      const f = fakeDb((sql) => sql.includes('SELECT rendimento_unidade FROM receita')
        ? [{ rendimento_unidade: 'un' }]
        : [])
      await salvarProduto(f.db, {
        nome: 'Bolacha',
        receitaId: 'recipe',
        variantes: [
          { nome: 'PACOTE 150G', unidades: 1, precoCents: 500 },
          { nome: 'pacote 300g', unidades: 1, precoCents: 900 },
        ],
      })
      const variantes = f.calls.filter((call) => call.sql.includes('INSERT INTO produto_variante'))
      expect(variantes.map((variant) => variant.params[2])).toEqual(['Pacote 150g', 'Pacote 300g'])
    })
  })

  describe('salvarConfig', () => {
    it('accepts the maximum currency and percentage settings', async () => {
      const f = fakeDb()
      await salvarConfig(f.db, {
        gas_lote: '999.99',
        hora_trabalho: '999.99',
        taxa_pix: '100',
        taxa_cartao: '100',
        margem_padrao: '100',
      })
      expect(f.calls.find((call) => call.params[0] === 'gas_lote_cents')?.params[1]).toBe('99999')
      expect(f.calls.find((call) => call.params[0] === 'valor_hora_cents')?.params[1]).toBe('99999')
    })

    it.each([
      { gas_lote: '1000' },
      { hora_trabalho: '1000' },
      { taxa_pix: '100.01' },
      { margem_padrao: '-1' },
    ])('rejects out-of-range settings %#', (values) => {
      const f = fakeDb()
      expect(() => salvarConfig(f.db, values)).toThrow()
    })
  })

  describe('salvarReceita', () => {
    it.each(['A', 'Massa-boa', 'Massa 1'])('rejects invalid recipe name "%s"', async (nome) => {
      const f = fakeDb()
      await expect(salvarReceita(f.db, {
        nome,
        rendimento: 100,
        rendimentoUnidade: 'g',
        perdaPct: 0,
        itens: [{ insumoId: 'flour', quantidadeBase: 100 }],
      })).rejects.toThrow(/nome, rendimento/)
    })
  })

  it('saves an optional minimum stock threshold when registering an ingredient', async () => {
    const f = fakeDb()
    await salvarInsumo(f.db, {
      nome: 'Farinha', unidade: 'kg', quantidade: 2, totalCents: 5000, estoqueMinimo: 750,
    })
    const insert = f.calls.find((call) => call.sql.includes('INSERT INTO insumo'))
    expect(insert?.sql).toContain('estoque_minimo')
    expect(insert?.params[8]).toBe(750)
  })

  it.each(['farinha de trigo', 'FARINHA DE TRIGO', 'Farinha de Trigo'])(
    'saves "%s" as "Farinha de trigo"',
    async (nome) => {
      const f = fakeDb()
      await salvarInsumo(f.db, { nome, unidade: 'kg', quantidade: 2, totalCents: 5000 })
      const insert = f.calls.find((call) => call.sql.includes('INSERT INTO insumo'))
      expect(insert?.params[1]).toBe('Farinha de trigo')
    },
  )

  it('normalizes the name when editing without updating its cost', async () => {
    const f = fakeDb((sql) => sql.includes('SELECT unidade_base, tipo FROM insumo')
      ? [{ unidade_base: 'g', tipo: 'ingrediente' }]
      : [])
    await salvarInsumo(f.db, { id: 'flour', nome: 'FARINHA DE TRIGO', unidade: 'kg' })
    const update = f.calls.find((call) => call.sql.includes('UPDATE insumo SET nome'))
    expect(update?.params[0]).toBe('Farinha de trigo')
  })

  it('updates the optional stock threshold without changing ingredient cost', async () => {
    const f = fakeDb((sql) => sql.includes('SELECT unidade_base, tipo FROM insumo')
      ? [{ unidade_base: 'g', tipo: 'ingrediente' }]
      : [])
    await salvarInsumo(f.db, { id: 'flour', nome: 'Farinha', unidade: 'kg', estoqueMinimo: 500 })
    const update = f.calls.find((call) => call.sql.includes('UPDATE insumo SET nome'))
    expect(update?.sql).toContain('estoque_minimo=COALESCE(?, estoque_minimo)')
    expect(update?.params[2]).toBe(500)
  })
})
