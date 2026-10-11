import { canTransition, type OrderStatus } from '../domain/orders'
import type { Db } from './db'
import { novoId, registrarVenda } from './repos'

const agora = () => new Date().toISOString()

export interface ClienteRow {
  id: string; nome: string; whatsapp: string | null; endereco: string | null
  aniversario: string | null; observacoes: string | null
}

export interface FornecedorRow {
  id: string; nome: string; contato: string | null; observacoes: string | null
}

export interface EncomendaRow {
  id: string; cliente_id: string | null; cliente_nome: string | null; data_entrega: string
  status: OrderStatus; sinal_cents: number; total_cents: number; observacoes: string | null
}

export interface EncomendaItemRow {
  id: string; encomenda_id: string; variante_id: string; quantidade: number
  preco_unit_cents: number; produto_nome: string; variante_nome: string
}

export interface LancamentoRow {
  id: string; tipo: 'receita' | 'despesa'; categoria: string | null; valor_cents: number
  data: string; vencimento: string | null; pago: number; negocio: number
  origem_tipo: string | null; origem_id: string | null
}

export const listarClientes = (db: Db) =>
  db.query<ClienteRow>('SELECT id, nome, whatsapp, endereco, aniversario, observacoes FROM cliente WHERE deleted_at IS NULL ORDER BY nome')

export async function salvarCliente(db: Db, input: Omit<ClienteRow, 'id'> & { id?: string }) {
  if (!input.nome.trim()) throw new Error('Informe o nome do cliente.')
  const id = input.id ?? novoId()
  const t = agora()
  if (input.id) {
    await db.run(
      'UPDATE cliente SET nome=?, whatsapp=?, endereco=?, aniversario=?, observacoes=?, updated_at=? WHERE id=? AND deleted_at IS NULL',
      [input.nome.trim(), input.whatsapp || null, input.endereco || null, input.aniversario || null, input.observacoes || null, t, id],
    )
  } else {
    await db.run(
      'INSERT INTO cliente (id, nome, whatsapp, endereco, aniversario, observacoes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
      [id, input.nome.trim(), input.whatsapp || null, input.endereco || null, input.aniversario || null, input.observacoes || null, t, t],
    )
  }
  return id
}

export async function excluirCliente(db: Db, id: string) {
  const t = agora()
  await db.transaction(async () => {
    await db.run('UPDATE cliente SET nome=?, whatsapp=NULL, endereco=NULL, aniversario=NULL, observacoes=NULL, deleted_at=?, updated_at=? WHERE id=?',
      ['Cliente removido', t, t, id])
    await db.run('UPDATE venda SET cliente_id=NULL, updated_at=? WHERE cliente_id=? AND deleted_at IS NULL', [t, id])
    await db.run('UPDATE encomenda SET cliente_id=NULL, updated_at=? WHERE cliente_id=? AND deleted_at IS NULL', [t, id])
  })
}

export const listarFornecedores = (db: Db) =>
  db.query<FornecedorRow>('SELECT id, nome, contato, observacoes FROM fornecedor WHERE deleted_at IS NULL ORDER BY nome')

export async function salvarFornecedor(db: Db, input: Omit<FornecedorRow, 'id'> & { id?: string }) {
  if (!input.nome.trim()) throw new Error('Informe o nome do fornecedor.')
  const id = input.id ?? novoId()
  const t = agora()
  if (input.id) {
    await db.run('UPDATE fornecedor SET nome=?, contato=?, observacoes=?, updated_at=? WHERE id=? AND deleted_at IS NULL',
      [input.nome.trim(), input.contato || null, input.observacoes || null, t, id])
  } else {
    await db.run('INSERT INTO fornecedor (id, nome, contato, observacoes, created_at, updated_at) VALUES (?,?,?,?,?,?)',
      [id, input.nome.trim(), input.contato || null, input.observacoes || null, t, t])
  }
  return id
}

export async function excluirFornecedor(db: Db, id: string) {
  const t = agora()
  await db.run('UPDATE fornecedor SET deleted_at=?, updated_at=? WHERE id=?', [t, t, id])
  await db.run('UPDATE compra SET fornecedor_id=NULL, updated_at=? WHERE fornecedor_id=?', [t, id])
}

export const listarEncomendas = (db: Db) =>
  db.query<EncomendaRow>(
    `SELECT e.id, e.cliente_id, c.nome AS cliente_nome, e.data_entrega, e.status, e.sinal_cents, e.total_cents, e.observacoes
     FROM encomenda e LEFT JOIN cliente c ON c.id=e.cliente_id
     WHERE e.deleted_at IS NULL ORDER BY e.data_entrega, e.created_at`,
  )

export const listarItensEncomenda = (db: Db, encomendaId: string) =>
  db.query<EncomendaItemRow>(
    `SELECT ei.id, ei.encomenda_id, ei.variante_id, ei.quantidade, ei.preco_unit_cents,
            p.nome AS produto_nome, v.nome AS variante_nome
     FROM encomenda_item ei JOIN produto_variante v ON v.id=ei.variante_id
     JOIN produto p ON p.id=v.produto_id
     WHERE ei.encomenda_id=? AND ei.deleted_at IS NULL ORDER BY p.nome, v.nome`,
    [encomendaId],
  )

export async function salvarEncomenda(db: Db, input: {
  id?: string; clienteId?: string; dataEntrega: string; sinalCents: number; observacoes?: string
  itens: { varianteId: string; quantidade: number; precoUnitCents: number }[]
}) {
  if (!input.dataEntrega || !input.itens.length
    || input.itens.some((item) => !Number.isInteger(item.quantidade) || !(item.quantidade > 0)
      || !Number.isInteger(item.precoUnitCents) || item.precoUnitCents < 0)
    || !Number.isInteger(input.sinalCents) || input.sinalCents < 0) {
    throw new Error('Confira a data, o sinal e os itens da encomenda.')
  }
  const total = input.itens.reduce((sum, item) => sum + item.quantidade * item.precoUnitCents, 0)
  if (input.sinalCents > total) throw new Error('O sinal não pode ser maior que o total da encomenda.')
  const id = input.id ?? novoId()
  const t = agora()
  await db.transaction(async () => {
    if (input.id) {
      const [current] = await db.query<{ status: OrderStatus }>('SELECT status FROM encomenda WHERE id=? AND deleted_at IS NULL', [id])
      if (!current) throw new Error('A encomenda não foi encontrada.')
      if (current.status === 'pago' || current.status === 'entregue' || current.status === 'cancelado') throw new Error('Pedidos pagos ou cancelados não podem ser editados.')
      await db.run(
        'UPDATE encomenda SET cliente_id=?, data_entrega=?, sinal_cents=?, total_cents=?, observacoes=?, updated_at=? WHERE id=?',
        [input.clienteId || null, input.dataEntrega, input.sinalCents, total, input.observacoes || null, t, id],
      )
      await db.run('UPDATE encomenda_item SET deleted_at=?, updated_at=? WHERE encomenda_id=? AND deleted_at IS NULL', [t, t, id])
    } else {
      await db.run(
        `INSERT INTO encomenda (id, cliente_id, data_entrega, status, sinal_cents, total_cents, observacoes, created_at, updated_at)
         VALUES (?,?,?,'pedido',?,?,?,?,?)`,
        [id, input.clienteId || null, input.dataEntrega, input.sinalCents, total, input.observacoes || null, t, t],
      )
    }
    for (const item of input.itens) {
      await db.run(
        'INSERT INTO encomenda_item (id, encomenda_id, variante_id, quantidade, preco_unit_cents, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
        [novoId(), id, item.varianteId, item.quantidade, item.precoUnitCents, t, t],
      )
    }
    await db.run('UPDATE lancamento SET deleted_at=?, updated_at=? WHERE origem_tipo=? AND origem_id=? AND deleted_at IS NULL',
      [t, t, 'encomenda', id])
    if (input.sinalCents > 0) {
      await criarLancamento(db, {
        tipo: 'receita', categoria: 'Sinal de encomenda', valorCents: input.sinalCents,
        data: t, vencimento: t, pago: true, origemTipo: 'encomenda', origemId: id,
      })
    }
    const restante = total - input.sinalCents
    if (restante > 0) {
      await criarLancamento(db, {
        tipo: 'receita', categoria: 'Encomenda a receber', valorCents: restante,
        data: t, vencimento: input.dataEntrega, pago: false, origemTipo: 'encomenda', origemId: id,
      })
    }
  })
  return id
}

async function criarLancamento(db: Db, input: {
  tipo: 'receita' | 'despesa'; categoria: string; valorCents: number; data: string
  vencimento?: string; pago: boolean; origemTipo?: string; origemId?: string
}) {
  const t = agora()
  await db.run(
    `INSERT INTO lancamento
     (id, tipo, categoria, valor_cents, data, vencimento, pago, negocio, origem_tipo, origem_id, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [novoId(), input.tipo, input.categoria, input.valorCents, input.data, input.vencimento ?? input.data,
      input.pago ? 1 : 0, 1, input.origemTipo ?? null, input.origemId ?? null, t, t],
  )
}

export async function alterarStatusEncomenda(db: Db, id: string, status: OrderStatus) {
  const t = agora()
  await db.transaction(async () => {
    const [current] = await db.query<{ status: OrderStatus }>('SELECT status FROM encomenda WHERE id=? AND deleted_at IS NULL', [id])
    if (!current) throw new Error('A encomenda não foi encontrada.')
    if (!canTransition(current.status, status)) throw new Error(`Não é permitido alterar encomenda de "${current.status}" para "${status}".`)
    await db.run('UPDATE encomenda SET status=?, updated_at=? WHERE id=?', [status, t, id])
    if (status === 'cancelado') {
      await db.run('UPDATE lancamento SET deleted_at=?, updated_at=? WHERE origem_tipo=? AND origem_id=? AND pago=0 AND deleted_at IS NULL',
        [t, t, 'encomenda', id])
    }
  })
}

export async function entregarEncomenda(db: Db, input: {
  encomendaId: string; forma: string; motivoEstoqueNegativo?: string
}) {
  const [order] = await db.query<{ status: OrderStatus; sinal_cents: number; total_cents: number; cliente_id: string | null }>(
    'SELECT status, sinal_cents, total_cents, cliente_id FROM encomenda WHERE id=? AND deleted_at IS NULL', [input.encomendaId],
  )
  if (!order || order.status !== 'pronto') throw new Error('A encomenda precisa estar pronta antes da entrega.')
  const items = await db.query<{ variante_id: string; quantidade: number; preco_unit_cents: number }>(
    'SELECT variante_id, quantidade, preco_unit_cents FROM encomenda_item WHERE encomenda_id=? AND deleted_at IS NULL',
    [input.encomendaId],
  )
  return registrarVenda(db, {
    forma: input.forma,
    clienteId: order.cliente_id,
    encomendaId: input.encomendaId,
    descontoCents: order.sinal_cents,
    motivoEstoqueNegativo: input.motivoEstoqueNegativo,
    itens: await Promise.all(items.map(async (item) => {
      const [cost] = await db.query<{ custo_unit: number }>(
        `SELECT custo_unit FROM movimento_estoque WHERE item_tipo='variante' AND item_id=? AND tipo='producao'
         ORDER BY data DESC LIMIT 1`, [item.variante_id],
      )
      return {
        varianteId: item.variante_id, quantidade: item.quantidade, precoCents: item.preco_unit_cents,
        custoCents: Number(cost?.custo_unit ?? 0),
      }
    })),
  }, async (_saleId, t) => {
    const [current] = await db.query<{ status: OrderStatus }>(
      'SELECT status FROM encomenda WHERE id=? AND deleted_at IS NULL', [input.encomendaId],
    )
    if (!current || current.status !== 'pronto') throw new Error('A encomenda deixou de estar pronta e não pode ser entregue.')
    await db.run('UPDATE encomenda SET status=?, updated_at=? WHERE id=?', ['entregue', t, input.encomendaId])
    await db.run('UPDATE lancamento SET deleted_at=?, updated_at=? WHERE origem_tipo=? AND origem_id=? AND pago=0 AND deleted_at IS NULL',
      [t, t, 'encomenda', input.encomendaId])
  })
}

export const listarLancamentos = (db: Db) =>
  db.query<LancamentoRow>(
    `SELECT id, tipo, categoria, valor_cents, data, vencimento, pago, negocio, origem_tipo, origem_id
     FROM lancamento WHERE deleted_at IS NULL ORDER BY COALESCE(vencimento, data) DESC, created_at DESC`,
  )

export async function salvarLancamento(db: Db, input: {
  id?: string; tipo: 'receita' | 'despesa'; categoria: string; valorCents: number
  data: string; vencimento?: string; pago: boolean; negocio: boolean
}) {
  if (!input.categoria.trim() || !Number.isInteger(input.valorCents) || input.valorCents <= 0 || !input.data) {
    throw new Error('Informe categoria, valor maior que zero e data do lançamento.')
  }
  const t = agora()
  if (input.id) {
    await db.run(
      `UPDATE lancamento SET tipo=?, categoria=?, valor_cents=?, data=?, vencimento=?, pago=?, negocio=?, updated_at=?
       WHERE id=? AND deleted_at IS NULL AND origem_tipo IS NULL`,
      [input.tipo, input.categoria.trim(), input.valorCents, input.data, input.vencimento || null, input.pago ? 1 : 0,
        input.negocio ? 1 : 0, t, input.id],
    )
    return input.id
  }
  const id = novoId()
  await db.run(
    `INSERT INTO lancamento
     (id, tipo, categoria, valor_cents, data, vencimento, pago, negocio, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, input.tipo, input.categoria.trim(), input.valorCents, input.data, input.vencimento || null,
      input.pago ? 1 : 0, input.negocio ? 1 : 0, t, t],
  )
  return id
}

export async function marcarLancamentoPago(db: Db, id: string) {
  const t = agora()
  const [entry] = await db.query<{ origem_tipo: string | null; origem_id: string | null }>(
    'SELECT origem_tipo, origem_id FROM lancamento WHERE id=? AND deleted_at IS NULL', [id],
  )
  await db.transaction(async () => {
    await db.run('UPDATE lancamento SET pago=1, data=?, updated_at=? WHERE id=? AND deleted_at IS NULL', [t, t, id])
    if (entry?.origem_tipo === 'venda' && entry.origem_id) {
      await db.run('UPDATE venda SET status_pagamento=?, updated_at=? WHERE id=?', ['pago', t, entry.origem_id])
    }
    if (entry?.origem_tipo === 'compra' && entry.origem_id) {
      await db.run('UPDATE compra SET pago=1, updated_at=? WHERE id=?', [t, entry.origem_id])
    }
  })
}

export async function excluirLancamento(db: Db, id: string) {
  const t = agora()
  await db.run('UPDATE lancamento SET deleted_at=?, updated_at=? WHERE id=? AND origem_tipo IS NULL', [t, t, id])
}
