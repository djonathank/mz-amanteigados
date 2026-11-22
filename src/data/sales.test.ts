import { describe, expect, it, vi } from 'vitest'
import type { Db } from './db'
import { registrarVenda } from './repos'

function fakeDb(taxas: Record<string, string> = {}) {
  const calls: { sql: string; params: unknown[] }[] = []
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('SELECT valor FROM config')) {
        const valor = taxas[String(params[0])]
        return valor === undefined ? [] : [{ valor }]
      }
      if (sql.includes('SELECT estoque_atual FROM produto_variante')) return [{ estoque_atual: 10 }]
      if (sql.includes('SELECT COALESCE(MAX(sequencia)')) return [{ sequencia: 1 }]
      return []
    }),
    run: vi.fn(async (sql: string, params: unknown[] = []) => { calls.push({ sql, params }) }),
    transaction: vi.fn(async (fn: () => Promise<void>) => fn()),
  } as unknown as Db
  return { db, calls }
}

const itens = [{ varianteId: 'variant-1', quantidade: 1, precoCents: 10000, custoCents: 5000 }]

describe('registro de vendas e pagamento', () => {
  it.each(['pix', 'dinheiro', 'cartao_debito', 'cartao_credito'])('requires a customer for %s sales', async (forma) => {
    const f = fakeDb()
    await expect(registrarVenda(f.db, { forma, itens })).rejects.toThrow(/cliente/i)
    expect(f.db.transaction).not.toHaveBeenCalled()
  })

  it.each(['fiado', 'cartao'])('rejects obsolete payment method %s without writing to the database', async (forma) => {
    const f = fakeDb()
    await expect(registrarVenda(f.db, { forma, clienteId: 'customer-1', itens }))
      .rejects.toThrow(/forma de pagamento válida/i)
    expect(f.db.transaction).not.toHaveBeenCalled()
  })

  it('records a paid sale with a customer', async () => {
    const f = fakeDb()
    await registrarVenda(f.db, { forma: 'pix', clienteId: 'customer-1', itens })
    const sale = f.calls.find(({ sql }) => sql.includes('INSERT INTO venda'))
    const income = f.calls.find(({ sql, params }) => sql.includes('INSERT INTO lancamento') && params[1] === 'receita')
    expect(sale?.params[1]).toBe('customer-1')
    expect(sale?.params[7]).toBe('pago')
    expect(income?.params[6]).toBe(1)
  })

  it.each([
    ['cartao_debito', 'taxa_cartao_debito', '2.75', 275],
    ['cartao_credito', 'taxa_cartao_credito', '4.5', 450],
  ])('applies the configured %s fee separately', async (forma, chave, percentual, cents) => {
    const f = fakeDb({ [chave]: percentual })
    await registrarVenda(f.db, { forma, clienteId: 'customer-1', itens })
    const rateQuery = f.db.query.mock.calls.find(([sql, params]) =>
      String(sql).includes('SELECT valor FROM config') && params?.[0] === chave)
    const fee = f.calls.find(({ sql, params }) => sql.includes('INSERT INTO lancamento') && params[2] === 'Taxa de pagamento')
    expect(rateQuery?.[1]).toEqual([chave])
    expect(fee?.params[3]).toBe(cents)
    expect(fee?.params[6]).toBe(1)
  })

  it('does not use the generic legacy card fee when a method-specific fee is absent', async () => {
    const f = fakeDb({ taxa_cartao: '3.5' })
    await registrarVenda(f.db, { forma: 'cartao_credito', clienteId: 'customer-1', itens })
    const fee = f.calls.find(({ sql, params }) => sql.includes('INSERT INTO lancamento') && params[2] === 'Taxa de pagamento')
    expect(fee).toBeUndefined()
    expect(f.db.query.mock.calls.filter(([sql, params]) =>
      String(sql).includes('SELECT valor FROM config') && params?.[0] === 'taxa_cartao')).toHaveLength(0)
  })
})
