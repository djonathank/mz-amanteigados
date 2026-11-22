import { createRequire } from 'node:module'
import initSqlJs from 'sql.js'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from './db'
import baseSchema from './migrations/001_init.sql?raw'
import phase1Fields from './migrations/002_phase1_fields.sql?raw'
import variantVolume from './migrations/003_variant_volume.sql?raw'
import configTimestamp from './migrations/005_config_sync_timestamp.sql?raw'
import phase2to4 from './migrations/007_phase2_4.sql?raw'
import purchaseCancellation from './migrations/010_purchase_cancellation.sql?raw'
import removeLotTables from './migrations/011_remove_lote_tables.sql?raw'
import purchaseHistory from './migrations/012_purchase_edit_history.sql?raw'
import movementSequence from './migrations/013_stock_movement_sequence.sql?raw'
import supplierAddress from './migrations/014_supplier_address.sql?raw'
import financialCategories from './migrations/016_financial_categories.sql?raw'
import categoryColors from './migrations/017_category_additional_colors.sql?raw'
import ledgerDescription from './migrations/018_ledger_description.sql?raw'
import performanceIndexes from './migrations/019_performance_indexes.sql?raw'
import {
  atualizarPagamentoCompra, cancelarCompra, listarCompras, listarInsumos, listarVariantes,
  registrarCompra, registrarVenda, salvarConfig, salvarInsumo, salvarProduto, salvarReceita,
} from './repos'
import { ajustarEstoque } from './phase2'
import {
  alterarStatusEncomenda, entregarEncomenda, listarClientes, listarEncomendas, listarLancamentos,
  salvarCliente, salvarEncomenda, salvarFornecedor, salvarLancamento,
} from './phase3'
import { custoDaVariante, carregarBase } from './calculos'
import { salvarCategoriaFinanceira, listarCategoriasFinanceiras, excluirCategoriaFinanceira } from './categorias'

const require = createRequire(import.meta.url)

type SqlStatement = {
  bind: (values?: unknown[]) => void
  step: () => boolean
  getAsObject: () => Record<string, unknown>
  free: () => void
}

type SqlDatabase = {
  exec: (sql: string) => unknown
  run: (sql: string, values?: unknown[]) => void
  prepare: (sql: string) => SqlStatement
  close: () => void
}

function columnExists(connection: SqlDatabase, table: string, column: string): boolean {
  const statement = connection.prepare(`PRAGMA table_info("${table.replaceAll('"', '""')}")`)
  try {
    while (statement.step()) {
      if (statement.getAsObject().name === column) return true
    }
    return false
  } finally {
    statement.free()
  }
}

function applyMigration(connection: SqlDatabase, sql: string) {
  for (const statement of sql.split(';').map((part) => part.trim()).filter(Boolean)) {
    const alter = statement.match(/^ALTER\s+TABLE\s+([\w"]+)\s+ADD\s+COLUMN\s+([\w"]+)/i)
    const table = alter?.[1]?.replaceAll('"', '')
    const column = alter?.[2]?.replaceAll('"', '')
    if (table && column && columnExists(connection, table, column)) continue
    connection.exec(`${statement};`)
  }
}

async function criarDbReal(): Promise<{ db: Db; close: () => void }> {
  const SQL = await initSqlJs({ locateFile: (file) => require.resolve(`sql.js/dist/${file}`) })
  const connection = new SQL.Database() as SqlDatabase
  for (const migration of [
    baseSchema, phase1Fields, variantVolume, configTimestamp, phase2to4, purchaseCancellation,
    removeLotTables, purchaseHistory, movementSequence, supplierAddress, financialCategories,
    categoryColors, ledgerDescription, performanceIndexes,
  ]) applyMigration(connection, migration)

  const db: Db = {
    async query<T>(sql: string, params: unknown[] = []) {
      const statement = connection.prepare(sql)
      try {
        statement.bind(params)
        const rows: T[] = []
        while (statement.step()) rows.push(statement.getAsObject() as T)
        return rows
      } finally {
        statement.free()
      }
    },
    async run(sql: string, params: unknown[] = []) {
      connection.run(sql, params)
    },
    async runSet(sql: string, rows: unknown[][]) {
      for (const values of rows) connection.run(sql, values)
    },
    async transaction(operation) {
      connection.exec('BEGIN')
      try {
        await operation()
        connection.exec('COMMIT')
      } catch (error) {
        connection.exec('ROLLBACK')
        throw error
      }
    },
    async clearData() {
      for (const { name } of await db.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )) connection.run(`DELETE FROM "${name.replaceAll('"', '""')}"`)
    },
  }
  return { db, close: () => connection.close() }
}

const hoje = new Date().toISOString().slice(0, 10)

describe('application repositories with a real isolated SQLite database', () => {
  let db: Db
  let close: () => void

  beforeEach(async () => {
    const opened = await criarDbReal()
    db = opened.db
    close = opened.close
  })

  it('persists ingredient purchases, weighted average cost, stock movements, payment and cancellation', async () => {
    const supplierId = await salvarFornecedor(db, {
      nome: 'Fornecedor Integracao', contato: '11999999999', endereco: 'Rua Teste 123', observacoes: '',
    })
    const ingredientId = await salvarInsumo(db, {
      nome: 'Farinha Integracao', unidade: 'kg', quantidade: 1, totalCents: 10000, estoqueMinimo: 200,
    })

    await registrarCompra(db, {
      fornecedorId: supplierId, pago: false, formaPagamento: 'pendente', data: hoje,
      vencimento: hoje, insumoId: ingredientId, unidade: 'kg', quantidade: 1, totalCents: 20000,
    })
    const [ingredientAfterPurchase] = await listarInsumos(db)
    const [pendingPurchase] = await listarCompras(db, 'pendentes')
    expect(ingredientAfterPurchase).toMatchObject({ estoque_atual: 2000, custo_medio: 15 })
    expect(pendingPurchase).toMatchObject({ fornecedor_nome: 'Fornecedor integracao', total_cents: 20000, pago: 0 })

    await atualizarPagamentoCompra(db, pendingPurchase.id, true)
    expect((await listarCompras(db, 'pagas'))[0]?.id).toBe(pendingPurchase.id)
    await expect(cancelarCompra(db, pendingPurchase.id, 'Teste automatizado'))
      .rejects.toThrow(/pagas.*canceladas/i)
    await atualizarPagamentoCompra(db, pendingPurchase.id, false)
    await cancelarCompra(db, pendingPurchase.id, 'Teste automatizado')

    const [ingredientAfterCancel] = await listarInsumos(db)
    expect(ingredientAfterCancel).toMatchObject({ estoque_atual: 1000, custo_medio: 10 })
    expect((await listarCompras(db, 'canceladas'))[0]).toMatchObject({
      id: pendingPurchase.id, cancelada_em: expect.any(String), motivo_cancelamento: 'Teste automatizado',
    })
    expect(await db.query('SELECT id FROM compra WHERE id=? AND cancelada_em IS NOT NULL', [pendingPurchase.id]))
      .toHaveLength(1)
    expect(await db.query('SELECT id FROM lancamento WHERE origem_id=? AND deleted_at IS NULL', [pendingPurchase.id]))
      .toHaveLength(0)
    close()
  })

  it('persists recipe, product, order, delivery sale, stock, payment fee, finance and category operations', async () => {
    const ingredientId = await salvarInsumo(db, {
      nome: 'Acucar Integracao', unidade: 'kg', quantidade: 1, totalCents: 10000,
    })
    const recipeId = await salvarReceita(db, {
      nome: 'Biscoito Integracao', rendimento: 1000, rendimentoUnidade: 'g', perdaPct: 0.1,
      tempoMin: 30, modoPreparo: 'Misturar', itens: [{ insumoId: ingredientId, quantidadeBase: 1000 }],
    })
    const productId = await salvarProduto(db, {
      nome: 'Caixa Integracao', receitaId: recipeId,
      variantes: [{ nome: 'Pacote 100g', unidades: 1, pesoG: 100, precoCents: 2500 }],
    })
    const [variant] = await listarVariantes(db)
    const base = await carregarBase(db)
    expect(custoDaVariante(variant, base)).toBe(1111)

    await ajustarEstoque(db, { tipo: 'variante', id: variant.id, quantidade: 5, motivo: 'Produção teste' })
    const customerId = await salvarCliente(db, {
      nome: 'Cliente Integracao', telefone: '11999999999', endereco: '', aniversario: '', observacoes: '',
    })
    await salvarConfig(db, { taxa_pix: '1.5', taxa_cartao_credito: '4', taxa_cartao_debito: '2' })
    const orderId = await salvarEncomenda(db, {
      clienteId: customerId, dataEntrega: hoje,
      itens: [{ varianteId: variant.id, quantidade: 2, precoUnitCents: 2500 }],
    })
    expect((await listarEncomendas(db))[0]).toMatchObject({ id: orderId, total_cents: 5000, status: 'agendado' })
    expect((await listarLancamentos(db)).find((entry) => entry.origem_id === orderId))
      .toMatchObject({ valor_cents: 5000, pago: 0, categoria: 'Encomenda a receber' })

    const saleId = await entregarEncomenda(db, { encomendaId: orderId, forma: 'pix' })
    expect(await db.query('SELECT total_cents, desconto_cents FROM venda WHERE id=?', [saleId]))
      .toEqual([{ total_cents: 5000, desconto_cents: 0 }])
    expect((await listarEncomendas(db)).find((order) => order.id === orderId)?.status).toBe('finalizado')
    expect(await db.query('SELECT estoque_atual FROM produto_variante WHERE id=?', [variant.id]))
      .toEqual([{ estoque_atual: 3 }])
    expect(await db.query("SELECT valor_cents FROM lancamento WHERE origem_id=? AND categoria='Taxa de pagamento'", [saleId]))
      .toEqual([{ valor_cents: 75 }])
    expect(await db.query("SELECT valor_cents FROM lancamento WHERE origem_id=? AND categoria='Venda'", [saleId]))
      .toEqual([{ valor_cents: 5000 }])

    const financialId = await salvarLancamento(db, {
      tipo: 'despesa', categoria: 'Teste', descricao: 'Ajuste manual', valorCents: 1200,
      data: hoje, vencimento: hoje, pago: false, negocio: true,
    })
    await db.run('UPDATE lancamento SET pago=1 WHERE id=?', [financialId])
    expect((await listarLancamentos(db)).find((entry) => entry.id === financialId)?.pago).toBe(1)

    const categoryId = await salvarCategoriaFinanceira(db, { nome: 'Teste', cor: '#584A8A' })
    expect((await listarCategoriasFinanceiras(db)).some((category) => category.id === categoryId)).toBe(true)
    await excluirCategoriaFinanceira(db, categoryId)
    expect((await listarCategoriasFinanceiras(db)).some((category) => category.id === categoryId)).toBe(false)

    // Remove records in dependency order to keep foreign-key checks active during the test.
    await db.run('DELETE FROM venda_item WHERE venda_id=?', [saleId])
    await db.run('DELETE FROM lancamento WHERE origem_id IN (?,?) OR id=?', [saleId, orderId, financialId])
    await db.run('DELETE FROM movimento_estoque WHERE item_id=?', [variant.id])
    await db.run('DELETE FROM encomenda_item WHERE encomenda_id=?', [orderId])
    await db.run('DELETE FROM venda WHERE id=?', [saleId])
    await db.run('DELETE FROM encomenda WHERE id=?', [orderId])
    await db.run('DELETE FROM produto_variante WHERE id=?', [variant.id])
    await db.run('DELETE FROM produto WHERE id=?', [productId])
    await db.run('DELETE FROM receita_item WHERE receita_id=?', [recipeId])
    await db.run('DELETE FROM receita WHERE id=?', [recipeId])
    await db.run('DELETE FROM movimento_estoque WHERE item_id=?', [ingredientId])
    await db.run('DELETE FROM insumo WHERE id=?', [ingredientId])
    await db.run('DELETE FROM cliente WHERE id=?', [customerId])
    close()
  })
})
