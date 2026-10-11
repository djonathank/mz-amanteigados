import { describe, expect, it, vi } from 'vitest'
import type { Db } from './db'
import { ajustarEstoque, calcularNecessidadesInsumos } from './phase2'

function fakeDb(
  queryRows: (sql: string, params: unknown[]) => unknown[],
) {
  const calls: { sql: string; params: unknown[] }[] = []
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => queryRows(sql, params)),
    run: vi.fn(async (sql: string, params: unknown[] = []) => { calls.push({ sql, params }) }),
    transaction: vi.fn(async (fn: () => Promise<void>) => fn()),
  } as unknown as Db
  return { db, calls }
}

describe('Phase 2 inventory', () => {
  it('scales ingredients recursively using useful yield and recipe loss', async () => {
    const f = fakeDb((sql, params) => {
      if (sql.includes('FROM receita WHERE')) {
        if (params[0] === 'main') return [{ id: 'main', nome: 'Principal', rendimento_qtd: 1000, rendimento_unidade: 'g', perda_pct: 0.1 }]
        if (params[0] === 'sub') return [{ id: 'sub', nome: 'Sub-receita', rendimento_qtd: 100, rendimento_unidade: 'g', perda_pct: 0.2 }]
      }
      if (sql.includes('FROM receita_item')) {
        if (params[0] === 'main') return [
          { insumo_id: 'flour', subreceita_id: null, quantidade_base: 500 },
          { insumo_id: null, subreceita_id: 'sub', quantidade_base: 200 },
        ]
        if (params[0] === 'sub') return [{ insumo_id: 'sugar', subreceita_id: null, quantidade_base: 50 }]
      }
      if (sql.includes('FROM insumo WHERE deleted_at')) return [
        { id: 'flour', nome: 'Farinha', unidade_base: 'g', estoque_atual: 1000 },
        { id: 'sugar', nome: 'Açúcar', unidade_base: 'g', estoque_atual: 500 },
      ]
      return []
    })
    const result = await calcularNecessidadesInsumos(f.db, 'main', 900)
    expect(result).toEqual([
      { id: 'flour', nome: 'Farinha', unidade_base: 'g', estoque_atual: 1000, quantidade: 500 },
      { id: 'sugar', nome: 'Açúcar', unidade_base: 'g', estoque_atual: 500, quantidade: 125 },
    ])
  })

  it('requires a reason only when an adjustment would create a negative balance', async () => {
    const f = fakeDb((sql) => sql.includes('SELECT estoque_atual FROM insumo')
      ? [{ estoque_atual: 2 }]
      : [])
    await expect(ajustarEstoque(f.db, {
      tipo: 'insumo', id: 'flour', quantidade: -3, motivo: '',
    })).rejects.toThrow(/motivo/)
    expect(f.calls).toHaveLength(0)
    await ajustarEstoque(f.db, { tipo: 'insumo', id: 'flour', quantidade: -1, motivo: '' })
    expect(f.calls.some((call) => call.sql.includes('UPDATE insumo SET estoque_atual'))).toBe(true)
  })

  it('stores losses as a separate movement and requires an explanation', async () => {
    const f = fakeDb((sql) => sql.includes('SELECT estoque_atual FROM insumo')
      ? [{ estoque_atual: 5 }]
      : [])
    await expect(ajustarEstoque(f.db, {
      tipo: 'insumo', id: 'flour', quantidade: -1, motivo: '', operacao: 'perda',
    })).rejects.toThrow(/motivo da perda/)
    await ajustarEstoque(f.db, {
      tipo: 'insumo', id: 'flour', quantidade: -1, motivo: 'Produto contaminado', operacao: 'perda',
    })
    expect(f.calls.some((call) => call.params[3] === 'perda' && call.params[7] === 'Produto contaminado')).toBe(true)
  })
})
