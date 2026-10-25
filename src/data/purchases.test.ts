import { describe, expect, it, vi } from 'vitest'
import type { Db } from './db'
import { localDateString } from '../domain/date'
import {
  atualizarPagamentoCompra, cancelarCompra, editarCompra, listarCompras, registrarCompra,
} from './repos'

const dataEmDias = (dias: number) => {
  const data = new Date()
  data.setDate(data.getDate() + dias)
  return localDateString(data)
}
const camposObrigatorios = () => ({
  fornecedorId: 'supplier', pago: true, formaPagamento: 'pix', data: dataEmDias(1),
})

function fakeDb(queryRows: (sql: string, params: unknown[]) => unknown[] = () => []) {
  const calls: { sql: string; params: unknown[] }[] = []
  let transactionCount = 0
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => queryRows(sql, params)),
    run: vi.fn(async (sql: string, params: unknown[] = []) => { calls.push({ sql, params }) }),
    transaction: vi.fn(async (fn: () => Promise<void>) => { transactionCount++; await fn() }),
  } as unknown as Db
  return { db, calls, get transactionCount() { return transactionCount } }
}

describe('compras de insumos', () => {
  it('registra compra paga, com fornecedor, convertendo unidades e atualizando saldo e custo médio', async () => {
    const f = fakeDb((sql) => sql.includes('SELECT unidade_base, estoque_atual, custo_medio FROM insumo')
      ? [{ unidade_base: 'g', estoque_atual: 5000, custo_medio: 2 }]
      : [])
    await registrarCompra(f.db, {
      ...camposObrigatorios(),
      insumoId: 'flour', unidade: 'kg', quantidade: 5, totalCents: 22000,
    })

    expect(f.transactionCount).toBe(1)
    expect(f.calls.find((call) => call.sql.includes('INSERT INTO compra ('))?.params.slice(1, 5))
      .toEqual(['supplier', expect.any(String), 22000, 1])
    expect(f.calls.find((call) => call.sql.includes('INSERT INTO compra_item'))?.params.slice(2, 5))
      .toEqual(['flour', 5000, 22000])
    expect(f.calls.find((call) => call.sql.includes('UPDATE insumo SET custo_medio'))?.params.slice(0, 2))
      .toEqual([3.2, 10000])
    expect(f.calls.find((call) => call.sql.includes('INSERT INTO historico_preco_insumo'))?.params[3]).toBe(4.4)
    expect(f.calls.find((call) => call.sql.includes('INSERT INTO movimento_estoque'))?.params.slice(1, 5))
      .toEqual(['insumo', 'flour', 'compra', 5000])
    expect(f.calls.find((call) => call.sql.includes('INSERT INTO lancamento'))?.params.slice(1, 7))
      .toEqual(['despesa', 'Compra de insumo', 22000, expect.any(String), expect.any(String), 1])
  })

  it('registers an unpaid purchase with a supplier and creates a pending financial entry', async () => {
    const f = fakeDb((sql) => sql.includes('SELECT unidade_base, estoque_atual, custo_medio FROM insumo')
      ? [{ unidade_base: 'ml', estoque_atual: 0, custo_medio: 0 }]
      : [])
    await registrarCompra(f.db, {
      ...camposObrigatorios(), pago: false, formaPagamento: 'pendente',
      insumoId: 'milk', unidade: 'l', quantidade: 2, totalCents: 8000,
      vencimento: dataEmDias(7),
    })
    expect(f.calls.find((call) => call.sql.includes('INSERT INTO compra ('))?.params[1]).toBe('supplier')
    expect(f.calls.find((call) => call.sql.includes('INSERT INTO compra ('))?.params[4]).toBe(0)
    expect(f.calls.find((call) => call.sql.includes('INSERT INTO compra ('))?.params[5]).toBe('pendente')
    expect(f.calls.find((call) => call.sql.includes('UPDATE insumo SET custo_medio'))?.params.slice(0, 2))
      .toEqual([4, 2000])
    expect(f.calls.find((call) => call.sql.includes('INSERT INTO lancamento'))?.params.slice(1, 7))
      .toEqual(['despesa', 'Compra de insumo', 8000, expect.any(String), expect.any(String), 0])
  })

  it('requires a due date for unpaid purchases and rejects due dates before purchase date', async () => {
    const withoutDueDate = fakeDb()
    await expect(registrarCompra(withoutDueDate.db, {
      ...camposObrigatorios(), pago: false, formaPagamento: 'pendente',
      insumoId: 'milk', unidade: 'l', quantidade: 1, totalCents: 1000,
    })).rejects.toThrow(/Informe a data de vencimento/)
    expect(withoutDueDate.transactionCount).toBe(0)
    expect(withoutDueDate.calls).toHaveLength(0)

    const dueBeforePurchase = fakeDb()
    await expect(registrarCompra(dueBeforePurchase.db, {
      ...camposObrigatorios(), pago: false, formaPagamento: 'pendente', data: dataEmDias(2),
      insumoId: 'milk', unidade: 'l', quantidade: 1, totalCents: 1000,
      vencimento: dataEmDias(1),
    })).rejects.toThrow(/vencimento não pode ser anterior/)
    expect(dueBeforePurchase.transactionCount).toBe(0)
    expect(dueBeforePurchase.calls).toHaveLength(0)
  })

  it('registers several items with purchase date, due date and payment method in one transaction', async () => {
    const f = fakeDb((sql, params) => {
      if (sql.includes('SELECT unidade_base, estoque_atual, custo_medio FROM insumo')) {
        return params[0] === 'flour'
          ? [{ unidade_base: 'g', estoque_atual: 5000, custo_medio: 2 }]
          : [{ unidade_base: 'ml', estoque_atual: 0, custo_medio: 0 }]
      }
      return []
    })
    await registrarCompra(f.db, {
      ...camposObrigatorios(), formaPagamento: 'cartao_debito',
      itens: [
        { insumoId: 'flour', unidade: 'kg', quantidade: 2, totalCents: 8000 },
        { insumoId: 'milk', unidade: 'l', quantidade: 2, totalCents: 5000 },
      ],
      totalCents: 13000, vencimento: dataEmDias(7),
    })

    expect(f.transactionCount).toBe(1)
    expect(f.calls.filter((call) => call.sql.includes('INSERT INTO compra_item'))).toHaveLength(2)
    expect(f.calls.filter((call) => call.sql.includes('INSERT INTO movimento_estoque'))).toHaveLength(2)
    expect(f.calls.filter((call) => call.sql.includes('INSERT INTO historico_preco_insumo'))).toHaveLength(2)
    expect(f.calls.find((call) => call.sql.includes('INSERT INTO compra ('))?.params.slice(1, 7))
      .toEqual(['supplier', expect.any(String), 13000, 1, 'cartao_debito', expect.any(String)])
    expect(f.calls.find((call) => call.sql.includes('INSERT INTO lancamento'))?.params.slice(3, 7))
      .toEqual([13000, expect.any(String), expect.any(String), 1])
  })

  it('rejects a purchase total that differs from the sum of its lines before writing', async () => {
    const f = fakeDb()
    await expect(registrarCompra(f.db, {
      ...camposObrigatorios(),
      itens: [{ insumoId: 'flour', unidade: 'kg', quantidade: 1, totalCents: 1000 }],
      totalCents: 1200,
    })).rejects.toThrow(/soma dos itens/)
    expect(f.transactionCount).toBe(0)
    expect(f.calls).toHaveLength(0)
  })

  it('rejects purchases dated before today before starting a transaction', async () => {
    const f = fakeDb()
    await expect(registrarCompra(f.db, {
      ...camposObrigatorios(), data: dataEmDias(-1),
      insumoId: 'flour', unidade: 'kg', quantidade: 1, totalCents: 1000,
    })).rejects.toThrow(/não pode ser anterior à data de hoje/)
    expect(f.transactionCount).toBe(0)
    expect(f.calls).toHaveLength(0)
  })

  it('edits an unpaid purchase, reconciles stock and finance, and preserves both snapshots', async () => {
    const dataHistorica = dataEmDias(-1)
    const f = fakeDb((sql, params) => {
      if (sql.includes('SELECT id, fornecedor_id, data, total_cents, pago, cancelada_em, forma_pagamento')) {
        return [{
          id: 'purchase-1', fornecedor_id: 'supplier', data: `${dataHistorica}T12:00:00.000Z`,
          total_cents: 2000, pago: 0, cancelada_em: null, forma_pagamento: 'pendente',
        }]
      }
      if (sql.includes('SELECT ci.id, ci.insumo_id')) {
        return [{
          id: 'item-old', insumo_id: 'flour', insumo_nome: 'Farinha',
          quantidade_base: 1000, unidade_base: 'g', total_cents: 2000,
        }]
      }
      if (sql.includes('SELECT id, item_id, quantidade FROM movimento_estoque')) {
        return [{ id: 'move-old', item_id: 'flour', quantidade: 1000 }]
      }
      if (sql.includes('SELECT id, vencimento, pago FROM lancamento')) {
        return [{ id: 'ledger-1', vencimento: `${dataEmDias(1)}T12:00:00.000Z`, pago: 0 }]
      }
      if (sql.includes('SELECT id, nome, unidade_base FROM insumo')) {
        return [{ id: 'flour', nome: 'Farinha', unidade_base: 'g' }]
      }
      if (sql.includes('SELECT unidade_base FROM insumo')) return [{ unidade_base: 'g' }]
      if (sql.includes('SELECT tipo, quantidade, custo_unit FROM movimento_estoque')) {
        return [{ tipo: 'cadastro', quantidade: 5000, custo_unit: 2 }]
      }
      return []
    })

    await editarCompra(f.db, 'purchase-1', {
      fornecedorId: 'supplier-2', pago: false, formaPagamento: 'boleto',
      data: dataHistorica, vencimento: dataEmDias(7),
      itens: [{ insumoId: 'flour', unidade: 'kg', quantidade: 2, totalCents: 5000 }],
      totalCents: 5000,
    }, '')

    expect(f.transactionCount).toBe(1)
    expect(f.calls.find((call) => call.sql.includes('UPDATE compra SET fornecedor_id'))?.params.slice(0, 4))
      .toEqual(['supplier-2', expect.any(String), 5000, 'boleto'])
    expect(f.calls.filter((call) => call.sql.includes('UPDATE insumo SET estoque_atual=?, custo_medio')).at(-1)?.params.slice(0, 2))
      .toEqual([7000, expect.closeTo(15 / 7)])
    expect(f.calls.find((call) => call.sql.includes('UPDATE lancamento SET valor_cents'))?.params.slice(0, 3))
      .toEqual([5000, expect.any(String), expect.any(String)])
    const history = f.calls.find((call) => call.sql.includes('INSERT INTO historico_edicao_compra'))
    expect(history?.params[2]).toBe('Edição realizada sem motivo informado')
    expect(JSON.parse(String(history?.params[3]))).toMatchObject({
      total_cents: 2000, forma_pagamento: 'pendente', itens: [{ quantidade_base: 1000, unidade_base: 'g' }],
    })
    expect(JSON.parse(String(history?.params[4]))).toMatchObject({
      fornecedor_id: 'supplier-2', total_cents: 5000, forma_pagamento: 'boleto',
      itens: [{ quantidade_base: 2000, unidade_base: 'g' }],
    })
  })

  it.each([
    { pago: 1, cancelada_em: null, erro: /Somente compras não pagas/ },
    { pago: 0, cancelada_em: '2025-01-01', erro: /Compras canceladas/ },
  ])('rejects editing paid or cancelled purchases', async ({ pago, cancelada_em, erro }) => {
    const f = fakeDb((sql) => sql.includes('SELECT id, fornecedor_id, data, total_cents, pago, cancelada_em, forma_pagamento')
      ? [{
        id: 'purchase-1', fornecedor_id: 'supplier', data: dataEmDias(1), total_cents: 2000,
        pago, cancelada_em, forma_pagamento: 'pix',
      }]
      : [])
    await expect(editarCompra(f.db, 'purchase-1', {
      fornecedorId: 'supplier', pago: false, formaPagamento: 'pendente',
      data: dataEmDias(1), vencimento: dataEmDias(2),
      itens: [{ insumoId: 'flour', unidade: 'kg', quantidade: 1, totalCents: 2000 }],
      totalCents: 2000,
    }, 'Correção')).rejects.toThrow(erro)
    expect(f.calls).toHaveLength(0)
  })

  it.each([
    { totalCents: 5000, custoMedioEsperado: 1.5 },
    { totalCents: 10000, custoMedioEsperado: 2 },
    { totalCents: 22000, custoMedioEsperado: 3.2 },
  ])('calculates weighted average cost for purchase total $totalCents', async ({ totalCents, custoMedioEsperado }) => {
    const f = fakeDb((sql) => sql.includes('SELECT unidade_base, estoque_atual, custo_medio FROM insumo')
      ? [{ unidade_base: 'g', estoque_atual: 5000, custo_medio: 2 }]
      : [])
    await registrarCompra(f.db, {
      ...camposObrigatorios(), insumoId: 'flour', unidade: 'kg', quantidade: 5, totalCents,
    })
    expect(f.calls.find((call) => call.sql.includes('UPDATE insumo SET custo_medio'))?.params[0])
      .toBeCloseTo(custoMedioEsperado, 6)
  })

  it.each([
    { quantidade: 0, totalCents: 1000 },
    { quantidade: -1, totalCents: 1000 },
    { quantidade: Number.NaN, totalCents: 1000 },
    { quantidade: Number.POSITIVE_INFINITY, totalCents: 1000 },
    { quantidade: Number.MAX_VALUE, totalCents: 1000 },
    { quantidade: 1, totalCents: 0 },
    { quantidade: 1, totalCents: -1 },
    { quantidade: 1, totalCents: 1.5 },
    { quantidade: 1, totalCents: Number.MAX_SAFE_INTEGER + 1 },
    { quantidade: 1, totalCents: Number.NaN },
    { quantidade: 1, totalCents: Number.POSITIVE_INFINITY },
  ])('rejects invalid quantity or total ($quantidade, $totalCents) before starting a transaction', async ({ quantidade, totalCents }) => {
    const f = fakeDb()
    await expect(registrarCompra(f.db, {
      ...camposObrigatorios(), insumoId: 'flour', unidade: 'kg', quantidade, totalCents,
    })).rejects.toThrow(/quantidade/i)
    expect(f.transactionCount).toBe(0)
    expect(f.calls).toHaveLength(0)
  })

  it('rejects a missing ingredient and a purchase in an incompatible unit without writes', async () => {
    const missing = fakeDb(() => [])
    await expect(registrarCompra(missing.db, {
      ...camposObrigatorios(), insumoId: 'missing', unidade: 'kg', quantidade: 1, totalCents: 1000,
    })).rejects.toThrow(/não foi encontrado/)
    expect(missing.calls).toHaveLength(0)

    const incompatible = fakeDb((sql) => sql.includes('SELECT unidade_base, estoque_atual, custo_medio FROM insumo')
      ? [{ unidade_base: 'ml', estoque_atual: 0, custo_medio: 0 }]
      : [])
    await expect(registrarCompra(incompatible.db, {
      ...camposObrigatorios(), insumoId: 'milk', unidade: 'kg', quantidade: 1, totalCents: 1000,
    })).rejects.toThrow(/não corresponde/)
    expect(incompatible.calls).toHaveLength(0)
  })

  it('rejects a purchase without a supplier before starting a transaction', async () => {
    const f = fakeDb()
    await expect(registrarCompra(f.db, {
      ...camposObrigatorios(), fornecedorId: ' ',
      insumoId: 'milk', unidade: 'l', quantidade: 1, totalCents: 1000,
    })).rejects.toThrow(/Selecione um fornecedor/)
    expect(f.transactionCount).toBe(0)
    expect(f.calls).toHaveLength(0)
  })

  it('rejects a purchase with missing date, payment method or items before starting a transaction', async () => {
    const withoutDate = fakeDb()
    await expect(registrarCompra(withoutDate.db, {
      ...camposObrigatorios(), data: ' ', insumoId: 'milk', unidade: 'l', quantidade: 1, totalCents: 1000,
    })).rejects.toThrow(/Informe a data da compra/)

    const withoutPaymentMethod = fakeDb()
    await expect(registrarCompra(withoutPaymentMethod.db, {
      ...camposObrigatorios(), formaPagamento: ' ', insumoId: 'milk', unidade: 'l', quantidade: 1, totalCents: 1000,
    })).rejects.toThrow(/Informe a forma de pagamento/)

    const withoutItems = fakeDb()
    await expect(registrarCompra(withoutItems.db, {
      ...camposObrigatorios(),
    })).rejects.toThrow(/Quantidade e total da compra/)

    for (const f of [withoutDate, withoutPaymentMethod, withoutItems]) {
      expect(f.transactionCount).toBe(0)
      expect(f.calls).toHaveLength(0)
    }
  })

  it.each([
    ['todas', ''],
    ['pagas', ' AND c.pago=1'],
    ['pendentes', ' AND c.pago=0'],
    ['canceladas', ' AND c.cancelada_em IS NOT NULL'],
  ] as const)('filters the purchase history for status "%s"', async (status, filter) => {
    const f = fakeDb()
    await listarCompras(f.db, status)
    const query = String(f.db.query.mock.calls[0][0])
    expect(query).toContain('GROUP_CONCAT')
    expect(query).toContain('LEFT JOIN fornecedor')
    expect(query).toContain('ORDER BY c.data DESC')
    expect(query).toContain('WHEN c.cancelada_em IS NULL AND c.pago=0 THEN 0')
    expect(query).toContain('WHEN c.cancelada_em IS NOT NULL THEN 1')
    expect(query).toContain('ELSE 2 END')
    expect(query).toContain(filter)
    if (status === 'todas') expect(query).not.toContain('WHERE c.cancelada_em IS NULL')
  })

  it('marks a purchase and its linked financial entry paid or pending', async () => {
    for (const pago of [true, false]) {
      const f = fakeDb((sql) => sql.includes('SELECT id FROM lancamento') ? [{ id: 'ledger-1' }] : [])
      await atualizarPagamentoCompra(f.db, 'purchase-1', pago)
      expect(f.calls.find((call) => call.sql.includes('UPDATE compra SET pago='))?.params[0]).toBe(pago ? 1 : 0)
      expect(f.calls.find((call) => call.sql.includes('UPDATE lancamento SET pago='))?.params[0]).toBe(pago ? 1 : 0)
      expect(f.transactionCount).toBe(1)
    }
  })

  it('updates the purchase even if no linked financial entry exists', async () => {
    const f = fakeDb()
    await atualizarPagamentoCompra(f.db, 'purchase-1', true)
    expect(f.calls).toHaveLength(1)
    expect(f.calls[0].sql).toContain('UPDATE compra SET pago=')
    expect(f.transactionCount).toBe(1)
  })

  it('cancels a purchase with a reason and reconciles stock, cost, history and finance', async () => {
    const f = fakeDb((sql) => {
      if (sql.includes('SELECT id, pago, cancelada_em FROM compra')) return [{ id: 'purchase-1', pago: 0, cancelada_em: null }]
      if (sql.includes('SELECT COUNT(*) AS total FROM compra_item')) return [{ total: 1 }]
      if (sql.includes('SELECT id, item_id, quantidade FROM movimento_estoque')) {
        return [{ id: 'purchase-movement', item_id: 'flour', quantidade: 1000 }]
      }
      if (sql.includes('SELECT tipo, quantidade, custo_unit FROM movimento_estoque')) {
        return [{ tipo: 'cadastro', quantidade: 500, custo_unit: 2 }]
      }
      return []
    })
    await cancelarCompra(f.db, 'purchase-1', 'Compra duplicada')

    expect(f.transactionCount).toBe(1)
    expect(f.calls.find((call) => call.sql.includes('UPDATE insumo SET estoque_atual'))?.params.slice(0, 2))
      .toEqual([500, 2])
    expect(f.calls.some((call) => call.sql.includes('UPDATE compra SET cancelada_em=?')
      && call.params[1] === 'Compra duplicada')).toBe(true)
    expect(f.calls.some((call) => call.sql.includes('UPDATE lancamento SET deleted_at'))).toBe(true)
    expect(f.calls.some((call) => call.sql.includes('UPDATE historico_preco_insumo SET deleted_at'))).toBe(true)
  })

  it('blocks cancellation of paid purchases to protect the cash ledger', async () => {
    const f = fakeDb((sql) => sql.includes('SELECT id, pago, cancelada_em FROM compra')
      ? [{ id: 'purchase-1', pago: 1, cancelada_em: null }]
      : [])
    await expect(cancelarCompra(f.db, 'purchase-1', 'Lançamento incorreto'))
      .rejects.toThrow(/Compras pagas não podem ser canceladas/)
    expect(f.calls).toHaveLength(0)
  })

  it('does not cancel a purchase if removing it would make the reconstructed balance negative', async () => {
    const f = fakeDb((sql) => {
      if (sql.includes('SELECT id, pago, cancelada_em FROM compra')) return [{ id: 'purchase-1', pago: 0, cancelada_em: null }]
      if (sql.includes('SELECT COUNT(*) AS total FROM compra_item')) return [{ total: 1 }]
      if (sql.includes('SELECT id, item_id, quantidade FROM movimento_estoque')) {
        return [{ id: 'purchase-movement', item_id: 'flour', quantidade: 1000 }]
      }
      if (sql.includes('SELECT tipo, quantidade, custo_unit FROM movimento_estoque')) {
        return [{ tipo: 'cadastro', quantidade: -1, custo_unit: 2 }]
      }
      return []
    })
    await expect(cancelarCompra(f.db, 'purchase-1', 'Lançamento incorreto'))
      .rejects.toThrow(/saldo atual não permite cancelar/)
    expect(f.calls.some((call) => call.sql.includes('UPDATE compra SET cancelada_em=?'))).toBe(false)
  })

  it('does not cancel a paid purchase', async () => {
    const f = fakeDb((sql) => sql.includes('SELECT id, pago, cancelada_em FROM compra')
      ? [{ id: 'purchase-1', pago: 1, cancelada_em: null }]
      : [])

    await expect(cancelarCompra(f.db, 'purchase-1', 'Compra duplicada'))
      .rejects.toThrow('Compras pagas não podem ser canceladas.')
    expect(f.calls).toHaveLength(0)
    expect(f.transactionCount).toBe(1)
  })
})
