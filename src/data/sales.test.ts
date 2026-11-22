import { describe, expect, it, vi } from 'vitest'
import type { Db } from './db'
import { registrarVenda } from './repos'

function fakeDb(taxa = '3.5') {
  const calls: { sql: string; params: unknown[] }[] = []
  const db = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('SELECT valor FROM config')) return [{ valor: taxa }]
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

  it('rejects obsolete credit payment without writing to the database', async () => {
    const f = fakeDb()
    await expect(registrarVenda(f.db, { forma: 'fiado', clienteId: 'customer-1', itens }))
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

  it('uses the configured card fee for credit-card sales and records it in finance', async () => {
    const f = fakeDb('3.5')
    await registrarVenda(f.db, { forma: 'cartao_credito', clienteId: 'customer-1', itens })
    const rateQuery = f.db.query.mock.calls.find(([sql]) => String(sql).includes('SELECT valor FROM config'))
    const fee = f.calls.find(({ sql, params }) => sql.includes('INSERT INTO lancamento') && params[2] === 'Taxa de pagamento')
    expect(rateQuery?.[1]).toEqual(['taxa_cartao'])
    expect(fee?.params[3]).toBe(350)
    expect(fee?.params[6]).toBe(1)
  })
})
