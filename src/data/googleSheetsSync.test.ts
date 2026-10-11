import { describe, expect, it } from 'vitest'
import type { Db } from './db'
import {
  colunasCompativeis, mesclarLinhas, parseSheetRow, reconstruirSaldosSincronizados,
  substituirTabelas, SYNC_TABLES, type SyncRow, type SyncTable,
} from './googleSheetsSync'

function emptyTables<T>(): Record<SyncTable, T[]> {
  const result = {} as Record<SyncTable, T[]>
  for (const table of SYNC_TABLES) result[table] = []
  return result
}

describe('Google Sheets sync merge', () => {
  it('keeps the newest local or remote record by updated_at', () => {
    const rows = mesclarLinhas('insumo', [
      { id: 'same', updated_at: '2026-10-06T10:00:00.000Z', nome: 'Local antigo' },
      { id: 'local-only', updated_at: '2026-10-06T10:00:00.000Z' },
    ], [
      { id: 'same', updated_at: '2026-10-06T11:00:00.000Z', nome: 'Nuvem recente' },
      { id: 'remote-only', updated_at: '2026-10-06T10:00:00.000Z' },
    ])

    expect(rows).toHaveLength(3)
    expect(rows.find((row) => row.id === 'same')?.nome).toBe('Nuvem recente')
    expect(rows.some((row) => row.id === 'local-only')).toBe(true)
    expect(rows.some((row) => row.id === 'remote-only')).toBe(true)
  })

  it('uses device_id to break timestamp ties consistently', () => {
    const rows = mesclarLinhas('insumo', [
      { id: 'same', updated_at: '2026-10-06T10:00:00.000Z', device_id: 'device-a', nome: 'Aparelho A' },
    ], [
      { id: 'same', updated_at: '2026-10-06T10:00:00.000Z', device_id: 'device-b', nome: 'Aparelho B' },
    ])

    expect(rows[0].nome).toBe('Aparelho B')
  })

  it('merges configuration records by their key and latest timestamp', () => {
    const rows = mesclarLinhas('config', [
      { chave: 'margem_padrao', valor: '35', updated_at: '2026-10-06T10:00:00.000Z' },
    ], [
      { chave: 'margem_padrao', valor: '40', updated_at: '2026-10-06T11:00:00.000Z' },
      { chave: 'taxa_pix', valor: '0', updated_at: '2026-10-06T11:00:00.000Z' },
    ])

    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.chave === 'margem_padrao')?.valor).toBe('40')
  })

  it('accepts an older header as a prefix during schema upgrades', () => {
    expect(colunasCompativeis(['id', 'quantidade'], ['id', 'quantidade', 'motivo'])).toBe(true)
    expect(colunasCompativeis(['quantidade', 'id'], ['id', 'quantidade', 'motivo'])).toBe(false)
    const row = parseSheetRow(['x', 3], [
      { name: 'id', type: 'TEXT', notnull: 1, pk: 1, dflt_value: null },
      { name: 'quantidade', type: 'REAL', notnull: 1, pk: 0, dflt_value: null },
      { name: 'estoque_minimo', type: 'REAL', notnull: 1, pk: 0, dflt_value: '0' },
      { name: 'motivo', type: 'TEXT', notnull: 0, pk: 0, dflt_value: null },
    ],
    ['id', 'quantidade'])
    expect(row).toEqual({ id: 'x', quantidade: 3, estoque_minimo: 0, motivo: null })
  })

  it('rebuilds inventory totals from merged movements instead of last-write-wins balances', () => {
    const data = {
      insumo: [{ id: 'flour', estoque_atual: 8 }],
      produto_variante: [{ id: 'pack', estoque_atual: 2 }],
      movimento_estoque: [
      { item_tipo: 'insumo', item_id: 'flour', quantidade: 12, deleted_at: null },
      { item_tipo: 'insumo', item_id: 'flour', quantidade: -5, deleted_at: null },
      { item_tipo: 'variante', item_id: 'pack', quantidade: 4, deleted_at: null },
      { item_tipo: 'variante', item_id: 'pack', quantidade: -1, deleted_at: null },
      { item_tipo: 'variante', item_id: 'pack', quantidade: 9, deleted_at: '2026-10-06T12:00:00Z' },
      ],
    }
    reconstruirSaldosSincronizados(data)
    expect(data.insumo[0].estoque_atual).toBe(7)
    expect(data.produto_variante[0].estoque_atual).toBe(3)
  })

  it('defers foreign keys while replacing sync tables in a single transaction', async () => {
    const calls: string[] = []
    const db: Db = {
      query: async () => [],
      run: async (sql) => { calls.push(sql) },
      transaction: async (operation) => operation(),
    }
    const schema = emptyTables<{ name: string; type: string; notnull: number; pk: number; dflt_value: unknown }>()
    const data = emptyTables<SyncRow>()

    await substituirTabelas(db, schema, data)

    expect(calls[0]).toBe('PRAGMA defer_foreign_keys = ON')
    expect(calls.filter((sql) => sql.startsWith('DELETE FROM '))).toHaveLength(SYNC_TABLES.length)
  })

  it('reports the precise table when synced rows contain an invalid foreign key', async () => {
    const db: Db = {
      query: async <T,>() => [{
        table: 'venda_item', rowid: 17, parent: 'produto_variante', fkid: 0,
      }] as T[],
      run: async () => {},
      transaction: async (operation) => operation(),
    }
    const schema = emptyTables<{ name: string; type: string; notnull: number; pk: number; dflt_value: unknown }>()
    const data = emptyTables<SyncRow>()

    await expect(substituirTabelas(db, schema, data))
      .rejects.toThrow(/tabela "venda_item".*tabela relacionada "produto_variante"/)
  })
})
