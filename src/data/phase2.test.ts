import { describe, expect, it, vi } from 'vitest'
import type { Db } from './db'
import { ajustarEstoque, definirEstoqueMinimoInsumo, listarAlertasEstoque, listarMovimentos } from './phase2'

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
  it('records quantity changes with an optional reason', async () => {
    const f = fakeDb((sql) => sql.includes('SELECT estoque_atual FROM insumo')
      ? [{ estoque_atual: 2 }]
      : [])
    await ajustarEstoque(f.db, { tipo: 'insumo', id: 'flour', quantidade: -1 })
    expect(f.calls.some((call) => call.sql.includes('UPDATE insumo SET estoque_atual'))).toBe(true)
    expect(f.calls.find((call) => call.sql.includes('INSERT INTO movimento_estoque'))?.params[7]).toBeNull()
    f.calls.length = 0
    await ajustarEstoque(f.db, { tipo: 'insumo', id: 'flour', quantidade: -1, motivo: ' Uso de produção ' })
    expect(f.calls.find((call) => call.sql.includes('INSERT INTO movimento_estoque'))?.params[7]).toBe('Uso de produção')
    const insert = f.calls.find((call) => call.sql.includes('INSERT INTO movimento_estoque'))
    expect(insert?.sql).toContain('sequencia')
    expect(insert?.params[insert.params.length - 1]).toBe(1)
  })

  it('stores losses as a separate movement with an optional explanation', async () => {
    const f = fakeDb((sql) => sql.includes('SELECT estoque_atual FROM insumo')
      ? [{ estoque_atual: 5 }]
      : [])
    await ajustarEstoque(f.db, {
      tipo: 'insumo', id: 'flour', quantidade: -1, motivo: 'Produto contaminado', operacao: 'perda',
    })
    expect(f.calls.some((call) => call.params[3] === 'perda' && call.params[7] === 'Produto contaminado')).toBe(true)
    f.calls.length = 0
    await ajustarEstoque(f.db, {
      tipo: 'insumo', id: 'flour', quantidade: -1, operacao: 'perda',
    })
    expect(f.calls.find((call) => call.sql.includes('INSERT INTO movimento_estoque'))?.params[7]).toBeNull()
  })

  it('accepts a valid stock adjustment and keeps the minimum update independent', async () => {
    const f = fakeDb((sql) => sql.includes('SELECT estoque_atual FROM insumo')
      ? [{ estoque_atual: 10 }]
      : [])
    await ajustarEstoque(f.db, {
      tipo: 'insumo', id: 'flour', quantidade: 3, motivo: 'Novo lote',
    })
    expect(f.calls.some((call) => call.sql.includes('UPDATE insumo SET estoque_atual') && call.params[0] === 13)).toBe(true)

    const min = fakeDb(() => [])
    await definirEstoqueMinimoInsumo(min.db, 'flour', 8)
    expect(min.calls.some((call) => call.sql.includes('UPDATE insumo SET estoque_minimo') && call.params[0] === 8)).toBe(true)
  })

  it('rejects invalid zero or negative thresholds for stock minimums', async () => {
    const f = fakeDb(() => [])
    await expect(definirEstoqueMinimoInsumo(f.db, 'flour', -1)).rejects.toThrow(/zero ou maior/)
    await expect(definirEstoqueMinimoInsumo(f.db, 'flour', Number.NaN)).rejects.toThrow(/zero ou maior/)
    await expect(definirEstoqueMinimoInsumo(f.db, 'flour', Number.POSITIVE_INFINITY)).rejects.toThrow(/zero ou maior/)
    expect(f.calls).toHaveLength(0)
  })

  it('accepts a zero stock minimum and saves stock movements independently', async () => {
    const f = fakeDb((sql) => sql.includes('SELECT estoque_atual FROM insumo')
      ? [{ estoque_atual: 5 }]
      : [])
    await definirEstoqueMinimoInsumo(f.db, 'flour', 0)
    expect(f.calls[0].sql).toContain('UPDATE insumo SET estoque_minimo')
    expect(f.calls[0].params[0]).toBe(0)

    f.calls.length = 0
    await ajustarEstoque(f.db, { tipo: 'insumo', id: 'flour', quantidade: 2, motivo: 'Contagem' })
    expect(f.calls.find((call) => call.sql.includes('UPDATE insumo SET estoque_atual'))?.params[0]).toBe(7)
    expect(f.calls.some((call) => call.sql.includes('UPDATE insumo SET estoque_minimo'))).toBe(false)
  })

  it('blocks stock adjustments that would make the balance negative', async () => {
    const f = fakeDb((sql) => sql.includes('SELECT estoque_atual FROM insumo')
      ? [{ estoque_atual: 2 }]
      : [])
    await expect(ajustarEstoque(f.db, {
      tipo: 'insumo', id: 'flour', quantidade: -3, motivo: 'Consumo',
    })).rejects.toThrow(/deixaria o estoque negativo/)
    expect(f.calls).toHaveLength(0)
  })

  it.each([0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects invalid stock adjustment quantity %s without writing',
    async (quantidade) => {
      const f = fakeDb(() => [{ estoque_atual: 10 }])
      await expect(ajustarEstoque(f.db, {
        tipo: 'insumo', id: 'flour', quantidade, motivo: 'Teste',
      })).rejects.toThrow(/quantidade/)
      expect(f.calls).toHaveLength(0)
    },
  )

  it('rejects an invalid stored balance before writing a movement', async () => {
    const badBalance = fakeDb(() => [{ estoque_atual: Number.NaN }])
    await expect(ajustarEstoque(badBalance.db, {
      tipo: 'insumo', id: 'flour', quantidade: 1, motivo: 'Verificação',
    })).rejects.toThrow(/saldo atual/)
    expect(badBalance.calls).toHaveLength(0)

    const overflow = fakeDb(() => [{ estoque_atual: Number.MAX_VALUE }])
    await expect(ajustarEstoque(overflow.db, {
      tipo: 'insumo', id: 'flour', quantidade: Number.MAX_VALUE, motivo: 'Verificação',
    })).rejects.toThrow(/saldo inválido/)
    expect(overflow.calls).toHaveLength(0)
  })

  it('requires a reason for losses to have negative quantities and records a valid loss', async () => {
    const f = fakeDb((sql) => sql.includes('SELECT estoque_atual FROM insumo')
      ? [{ estoque_atual: 4 }]
      : [])
    await expect(ajustarEstoque(f.db, {
      tipo: 'insumo', id: 'flour', quantidade: 1, motivo: 'Erro', operacao: 'perda',
    })).rejects.toThrow(/quantidade negativa/)
    expect(f.calls).toHaveLength(0)

    await expect(ajustarEstoque(f.db, {
      tipo: 'insumo', id: 'flour', quantidade: -1, motivo: '  Quebra  ', operacao: 'perda',
    })).resolves.toBeUndefined()
    expect(f.calls.find((call) => call.sql.includes('INSERT INTO movimento_estoque'))?.params[3]).toBe('perda')
    expect(f.calls.find((call) => call.sql.includes('INSERT INTO movimento_estoque'))?.params[7]).toBe('Quebra')
  })

  it('rejects a movement for a missing item and uses the variant table for finished products', async () => {
    const missing = fakeDb(() => [])
    await expect(ajustarEstoque(missing.db, {
      tipo: 'insumo', id: 'missing', quantidade: 1, motivo: 'Ajuste',
    })).rejects.toThrow(/não foi encontrado/)
    expect(missing.calls).toHaveLength(0)

    const variant = fakeDb((sql) => sql.includes('SELECT estoque_atual FROM produto_variante')
      ? [{ estoque_atual: 3 }]
      : [])
    await ajustarEstoque(variant.db, {
      tipo: 'variante', id: 'pack', quantidade: -1, motivo: 'Ajuste de contagem',
    })
    expect(variant.calls.some((call) => call.sql.includes('UPDATE produto_variante SET estoque_atual') && call.params[0] === 2)).toBe(true)
    expect(variant.calls.some((call) => call.sql.includes('INSERT INTO movimento_estoque') && call.params[1] === 'variante')).toBe(true)
  })

  it('lists stock movements with optional item filters and combines ingredient and product alerts', async () => {
    const movements = fakeDb(() => [])
    await listarMovimentos(movements.db, 'insumo', 'flour')
    const movementQuery = movements.db.query.mock.calls[0]
    expect(movementQuery[0]).toContain('m.item_tipo=?')
    expect(movementQuery[0]).toContain('m.item_id=?')
    expect(movementQuery[0]).toContain('ORDER BY m.data, m.sequencia')
    expect(movementQuery[0]).toContain('ORDER BY m.data DESC, m.sequencia DESC')
    expect(movementQuery[0]).toContain('LIMIT ? OFFSET ?')
    expect(movementQuery[1]).toEqual(['insumo', 'flour', 51, 0])

    const alerts = fakeDb((sql) => sql.includes('FROM insumo')
      ? [{ id: 'flour', nome: 'Farinha', saldo: 0, minimo: 2, unidade: 'g' }]
      : [{ id: 'pack', nome: 'Biscoito · 100 g', saldo: 1, minimo: 3, unidade: 'pacotes' }])
    await expect(listarAlertasEstoque(alerts.db)).resolves.toEqual([
      { id: 'flour', nome: 'Farinha', saldo: 0, minimo: 2, unidade: 'g', tipo: 'insumo' },
      { id: 'pack', nome: 'Biscoito · 100 g', saldo: 1, minimo: 3, unidade: 'pacotes', tipo: 'variante' },
    ])
  })

  it('filters movements by date after calculating cumulative balances from the full ledger', async () => {
    const f = fakeDb(() => [])
    await listarMovimentos(f.db, undefined, undefined, '2026-10-01', '2026-10-31')
    const [query, params] = f.db.query.mock.calls[0]
    expect(query).toContain('SUM(m.quantidade) OVER')
    expect(query).toContain('m.data>=?')
    expect(query).toContain('m.data<=?')
    expect(params).toEqual(['2026-10-01', '2026-10-31T23:59:59.999Z', 51, 0])
  })

  it('paginates movements and applies name/type filters before loading the next page', async () => {
    const rows = Array.from({ length: 51 }, (_, index) => ({
      id: `movement-${index}`, item_tipo: 'insumo', item_id: 'flour', item_nome: 'Farinha',
      unidade: 'g', tipo: 'compra', quantidade: 1, saldo_resultante: index + 1, custo_unit: 1,
      data: '2026-10-24T12:00:00.000Z', motivo: null,
    }))
    const firstPageDb = fakeDb(() => rows)
    const firstPage = await listarMovimentos(firstPageDb.db, undefined, undefined, undefined, undefined, 'Farinha', 'compra')
    expect(firstPage.items).toHaveLength(50)
    expect(firstPage.hasMore).toBe(true)
    const firstCall = firstPageDb.db.query.mock.calls[0]
    expect(firstCall[0]).toContain('COALESCE(i.nome, p.nome')
    expect(firstCall[0]).toContain('m.tipo=?')
    expect(firstCall[1]).toEqual(['%Farinha%', 'compra', 51, 0])

    const nextPageDb = fakeDb(() => rows.slice(0, 1))
    const nextPage = await listarMovimentos(nextPageDb.db, undefined, undefined, undefined, undefined, 'Farinha', 'compra', 50)
    expect(nextPage.items).toHaveLength(1)
    expect(nextPage.hasMore).toBe(false)
    expect(nextPageDb.db.query.mock.calls[0][1]).toEqual(['%Farinha%', 'compra', 51, 50])
  })
})
