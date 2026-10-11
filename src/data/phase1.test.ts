import { describe, expect, it, vi } from 'vitest'
import type { Db } from './db'
import { importarBackup, validarBackup } from './backup'
import { excluirInsumo, registrarCompra, salvarInsumo, salvarProduto, salvarReceita } from './repos'

function fakeDb(queryRows: (sql: string) => unknown[] = () => []) {
  const calls: { sql: string; params: unknown[] }[] = []
  let transactionCalls = 0
  const db = {
    query: vi.fn(async (sql: string) => queryRows(sql)),
    run: vi.fn(async (sql: string, params: unknown[] = []) => { calls.push({ sql, params }) }),
    transaction: vi.fn(async (fn: () => Promise<void>) => { transactionCalls++; await fn() }),
  } as unknown as Db
  return { db, calls, get transactionCalls() { return transactionCalls } }
}

describe('Phase 1 data operations', () => {
  it('saves prep metadata and both ingredient and subrecipe rows', async () => {
    const f = fakeDb()
    await salvarReceita(f.db, {
      nome: 'Massa', rendimento: 2, perdaPct: 0.1, tempoMin: 25,
      modoPreparo: 'Misturar', passosPreparo: ['Pesar', 'Misturar'],
      itens: [{ insumoId: 'farinha', quantidadeBase: 500 }, { subreceitaId: 'creme', quantidadeBase: 100 }],
    })
    expect(f.transactionCalls).toBe(1)
    expect(f.calls[0].sql).toContain('passos_preparo')
    expect(f.calls[0].params[5]).toBe(25)
    expect(f.calls[0].params[7]).toBe(JSON.stringify(['Pesar', 'Misturar']))
    expect(f.calls.filter((call) => call.sql.includes('INSERT INTO receita_item'))).toHaveLength(2)
    expect(f.calls[2].params[3]).toBe('creme')
  })

  it('edits a recipe and replaces its ingredient rows transactionally', async () => {
    const f = fakeDb()
    await salvarReceita(f.db, {
      id: 'recipe', nome: 'Massa atualizada', rendimento: 5, perdaPct: 0,
      itens: [{ insumoId: 'farinha', quantidadeBase: 250 }],
    })
    expect(f.transactionCalls).toBe(1)
    expect(f.calls.some((call) => call.sql.includes('UPDATE receita SET'))).toBe(true)
    expect(f.calls.some((call) => call.sql.includes('DELETE FROM receita_item'))).toBe(true)
    expect(f.calls.some((call) => call.sql.includes('INSERT INTO receita_item'))).toBe(true)
  })

  it('updates stock, weighted average cost, and price history when recording a purchase', async () => {
    const f = fakeDb((sql) => sql.includes('SELECT unidade_base, estoque_atual, custo_medio FROM insumo')
      ? [{ unidade_base: 'g', estoque_atual: 5000, custo_medio: 2 }]
      : [])
    await registrarCompra(f.db, {
      insumoId: 'farinha', unidade: 'kg', quantidade: 5, totalCents: 22000,
    })
    const update = f.calls.find((call) => call.sql.includes('UPDATE insumo SET custo_medio'))
    expect(update?.params[0]).toBeCloseTo(3.2, 6)
    expect(update?.params[1]).toBe(10000)
    expect(f.calls.some((call) => call.sql.includes("VALUES (?,?,?,?,?,?,?,?,?,?)") && call.params[3] === 'compra')).toBe(true)
  })

  it('does not create an inventory balance when registering an ingredient in Phase 1', async () => {
    const f = fakeDb()
    await salvarInsumo(f.db, {
      nome: 'Farinha', unidade: 'kg', quantidade: 2, totalCents: 5000,
    })
    const insert = f.calls.find((call) => call.sql.includes('INSERT INTO insumo'))
    expect(insert?.params[7]).toBe(0)
  })

  it('prevents deleting an ingredient still used by a recipe', async () => {
    const f = fakeDb((sql) => sql.includes('FROM receita_item') ? [{ total: 1 }] : [{ total: 0 }])
    await expect(excluirInsumo(f.db, 'farinha')).rejects.toThrow(/está em uso/)
    expect(f.calls).toHaveLength(0)
  })

  it('prevents changing an ingredient base unit while recipes use it', async () => {
    const f = fakeDb((sql) => {
      if (sql.includes('SELECT unidade_base')) return [{ unidade_base: 'g' }]
      if (sql.includes('FROM receita_item')) return [{ total: 1 }]
      return []
    })
    await expect(salvarInsumo(f.db, {
      id: 'flour', nome: 'Farinha', unidade: 'l', quantidade: 1, totalCents: 1000,
    })).rejects.toThrow(/unidade base/)
    expect(f.calls).toHaveLength(0)
  })

  it('stores liquid package amounts separately as millilitres', async () => {
    const f = fakeDb((sql) => sql.includes('SELECT rendimento_unidade FROM receita')
      ? [{ rendimento_unidade: 'ml' }]
      : [])
    await salvarProduto(f.db, {
      nome: 'Xarope', receitaId: 'recipe',
      variantes: [{
        nome: '250 ml', unidades: 1, pesoG: null, volumeMl: 250,
        precoCents: 500, embalagemInsumoId: null, rotuloInsumoId: null,
      }],
    })
    const insert = f.calls.find((call) => call.sql.includes('INSERT INTO produto_variante'))
    expect(insert?.sql).toContain('volume_ml')
    expect(insert?.params[4]).toBe(250)
  })

  it('requires volume for variants linked to liquid recipes', async () => {
    const f = fakeDb((sql) => sql.includes('SELECT rendimento_unidade FROM receita')
      ? [{ rendimento_unidade: 'ml' }]
      : [])
    await expect(salvarProduto(f.db, {
      nome: 'Xarope', receitaId: 'recipe',
      variantes: [{ nome: 'Pacote', unidades: 1, precoCents: 500 }],
    })).rejects.toThrow(/volume em mililitros/)
    expect(f.transactionCalls).toBe(0)
  })
})

describe('backup preview validation', () => {
  it('rejects malformed JSON rows without importing or mutating data', async () => {
    const f = fakeDb((sql) => sql.includes('PRAGMA table_info(insumo)')
      ? [{ name: 'id', notnull: 1, dflt_value: null, pk: 1 }, { name: 'nome', notnull: 1, dflt_value: null, pk: 0 }]
      : [])
    const text = JSON.stringify({ schema_version: 1, dados: { insumo: [{ id: 'x', nome: 'X', extra: { nested: true } }] } })
    const preview = await validarBackup(f.db, text)
    expect(preview.valido).toBe(false)
    expect(preview.totalRegistros).toBe(1)
    expect(preview.erros.join(' ')).toMatch(/Coluna desconhecida|Valor inválido/)
    await expect(importarBackup(f.db, text)).rejects.toThrow()
    expect(f.transactionCalls).toBe(0)
    expect(f.calls).toHaveLength(0)
  })

  it('accepts legacy V1 backups with omitted empty tables', async () => {
    const f = fakeDb()
    const preview = await validarBackup(f.db, JSON.stringify({ schema_version: 1, dados: {} }))
    expect(preview).toMatchObject({ valido: true, totalRegistros: 0, erros: [] })
  })
})
