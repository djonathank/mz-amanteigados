import { describe, expect, it, vi } from 'vitest'
import type { Db } from './db'
import { ajustarEstoque } from './phase2'

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
