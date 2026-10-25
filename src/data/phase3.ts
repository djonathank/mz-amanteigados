import { canTransition, type OrderStatus } from '../domain/orders'
import { capitalizarNome, formatarTelefone } from '../domain/text'
import { localDateString } from '../domain/date'
import type { Db } from './db'
import { novoId, registrarVenda } from './repos'
import { carregarBase, custoDaVariante } from './calculos'

const agora = () => new Date().toISOString()
const validarNomeContato = (nome: string, entidade: string) => {
  const limpo = nome.trim()
  if (limpo.length < 2 || limpo.length > 60 || !/^[\p{L}\s]+$/u.test(limpo)) {
    throw new Error(`O nome do ${entidade} deve ter de 2 a 60 letras e espaços, sem caracteres especiais.`)
  }
  return capitalizarNome(limpo)
}
const validarTextoOpcional = (valor: string | null, campo: string) => {
  const texto = valor ?? ''
  if (texto.length > 200 || !/^[\p{L}\p{N}\s]*$/u.test(texto)) {
    throw new Error(`${campo} deve ter até 200 letras, números e espaços, sem caracteres especiais.`)
  }
  return texto.trim()
}
const validarTelefone = (valor: string | null, campo: string) => {
  const digitos = (valor ?? '').replace(/\D/g, '')
  if (digitos.length < 10 || digitos.length > 11) {
    throw new Error(`${campo} deve conter de 10 a 11 números.`)
  }
  return digitos ? formatarTelefone(digitos) : ''
}
const validarDataNascimento = (valor: string | null) => {
  if (!valor) return ''
  const data = new Date(`${valor}T00:00:00`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || Number.isNaN(data.getTime())
    || localDateString(data) !== valor || valor >= localDateString()) {
    throw new Error('A data de nascimento deve ser válida e anterior a hoje.')
  }
  return valor
}

export interface ClienteRow {
  id: string; nome: string; whatsapp: string | null; endereco: string | null
  aniversario: string | null; observacoes: string | null
}

export interface FornecedorRow {
  id: string; nome: string; contato: string | null; endereco: string | null; observacoes: string | null
}

export interface EncomendaRow {
  id: string; cliente_id: string | null; cliente_nome: string | null; data_entrega: string
  status: OrderStatus; recebido_cents: number; total_cents: number; observacoes: string | null
  origem: 'agendada' | 'agora'
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
  const nome = validarNomeContato(input.nome, 'cliente')
  const whatsapp = validarTelefone(input.whatsapp, 'O WhatsApp do cliente')
  const endereco = validarTextoOpcional(input.endereco, 'O endereço')
  const aniversario = validarDataNascimento(input.aniversario)
  const observacoes = validarTextoOpcional(input.observacoes, 'As observações')
  const id = input.id ?? novoId()
  const t = agora()
  if (input.id) {
    const [current] = await db.query<{ id: string }>('SELECT id FROM cliente WHERE id=? AND deleted_at IS NULL', [id])
    if (!current) throw new Error('O cliente que você está editando não foi encontrado.')
    await db.run(
      'UPDATE cliente SET nome=?, whatsapp=?, endereco=?, aniversario=?, observacoes=?, updated_at=? WHERE id=? AND deleted_at IS NULL',
      [nome, whatsapp, endereco || null, aniversario || null, observacoes || null, t, id],
    )
  } else {
    await db.run(
      'INSERT INTO cliente (id, nome, whatsapp, endereco, aniversario, observacoes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
      [id, nome, whatsapp, endereco || null, aniversario || null, observacoes || null, t, t],
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
  db.query<FornecedorRow>('SELECT id, nome, contato, endereco, observacoes FROM fornecedor WHERE deleted_at IS NULL ORDER BY nome')

export async function salvarFornecedor(db: Db, input: Omit<FornecedorRow, 'id'> & { id?: string }) {
  const nome = validarNomeContato(input.nome, 'fornecedor')
  const contato = validarTelefone(input.contato, 'O WhatsApp do fornecedor')
  const endereco = validarTextoOpcional(input.endereco, 'O endereço')
  const observacoes = validarTextoOpcional(input.observacoes, 'As observações')
  const id = input.id ?? novoId()
  const t = agora()
  if (input.id) {
    const [current] = await db.query<{ id: string }>('SELECT id FROM fornecedor WHERE id=? AND deleted_at IS NULL', [id])
    if (!current) throw new Error('O fornecedor que você está editando não foi encontrado.')
    await db.run('UPDATE fornecedor SET nome=?, contato=?, endereco=?, observacoes=?, updated_at=? WHERE id=? AND deleted_at IS NULL',
      [nome, contato || null, endereco || null, observacoes || null, t, id])
  } else {
    await db.run('INSERT INTO fornecedor (id, nome, contato, endereco, observacoes, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
      [id, nome, contato || null, endereco || null, observacoes || null, t, t])
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
    `SELECT e.id, e.cliente_id, c.nome AS cliente_nome, e.data_entrega,
            CASE WHEN e.status='cancelado' THEN 'cancelado'
                 WHEN e.status IN ('entregue','pago') THEN 'finalizado'
                 ELSE 'agendado' END AS status,
            COALESCE((SELECT SUM(l.valor_cents) FROM lancamento l
                      WHERE l.origem_tipo='encomenda' AND l.origem_id=e.id AND l.tipo='receita'
                      AND l.pago=1 AND l.deleted_at IS NULL), 0) AS recebido_cents,
            e.total_cents, e.observacoes, 'agendada' AS origem
     FROM encomenda e LEFT JOIN cliente c ON c.id=e.cliente_id
     WHERE e.deleted_at IS NULL
     UNION ALL
     SELECT v.id, v.cliente_id, c.nome AS cliente_nome, v.data AS data_entrega,
            'finalizado' AS status, v.total_cents AS recebido_cents, v.total_cents, NULL AS observacoes, 'agora' AS origem
     FROM venda v LEFT JOIN cliente c ON c.id=v.cliente_id
     WHERE v.deleted_at IS NULL AND v.encomenda_id IS NULL
     ORDER BY data_entrega`,
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
  id?: string; clienteId?: string; dataEntrega: string; observacoes?: string
  itens: { varianteId: string; quantidade: number; precoUnitCents: number }[]
}) {
  if (!input.dataEntrega || !input.itens.length
    || input.itens.some((item) => !Number.isInteger(item.quantidade) || !(item.quantidade > 0)
      || !Number.isInteger(item.precoUnitCents) || item.precoUnitCents < 0)) {
    throw new Error('Confira a data e os itens da encomenda.')
  }
  const total = input.itens.reduce((sum, item) => sum + item.quantidade * item.precoUnitCents, 0)
  const id = input.id ?? novoId()
  const t = agora()
  await db.transaction(async () => {
    if (input.id) {
      const [current] = await db.query<{ status: string }>('SELECT status FROM encomenda WHERE id=? AND deleted_at IS NULL', [id])
      if (!current) throw new Error('A encomenda não foi encontrada.')
      if (current.status !== 'pedido') throw new Error('Pedidos finalizados ou cancelados não podem ser editados.')
      await db.run(
        'UPDATE encomenda SET cliente_id=?, data_entrega=?, total_cents=?, observacoes=?, updated_at=? WHERE id=?',
        [input.clienteId || null, input.dataEntrega, total, input.observacoes || null, t, id],
      )
      await db.run('UPDATE encomenda_item SET deleted_at=?, updated_at=? WHERE encomenda_id=? AND deleted_at IS NULL', [t, t, id])
    } else {
      await db.run(
        `INSERT INTO encomenda (id, cliente_id, data_entrega, status, total_cents, observacoes, created_at, updated_at)
         VALUES (?,?,?,'pedido',?,?,?,?)`,
        [id, input.clienteId || null, input.dataEntrega, total, input.observacoes || null, t, t],
      )
    }
    for (const item of input.itens) {
      await db.run(
        'INSERT INTO encomenda_item (id, encomenda_id, variante_id, quantidade, preco_unit_cents, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
        [novoId(), id, item.varianteId, item.quantidade, item.precoUnitCents, t, t],
      )
    }
    await db.run('UPDATE lancamento SET deleted_at=?, updated_at=? WHERE origem_tipo=? AND origem_id=? AND pago=0 AND deleted_at IS NULL',
      [t, t, 'encomenda', id])
    const [recebido] = await db.query<{ total: number }>(
      `SELECT COALESCE(SUM(valor_cents), 0) AS total FROM lancamento
       WHERE origem_tipo='encomenda' AND origem_id=? AND tipo='receita' AND pago=1 AND deleted_at IS NULL`,
      [id],
    )
    const restante = Math.max(0, total - Number(recebido?.total ?? 0))
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
    const [current] = await db.query<{ status: string }>('SELECT status FROM encomenda WHERE id=? AND deleted_at IS NULL', [id])
    if (!current) throw new Error('A encomenda não foi encontrada.')
    const currentStatus: OrderStatus = current.status === 'cancelado'
      ? 'cancelado'
      : ['pago', 'entregue'].includes(current.status) ? 'finalizado' : 'agendado'
    if (!canTransition(currentStatus, status)) throw new Error(`Não é permitido alterar pedido de "${currentStatus}" para "${status}".`)
    await db.run('UPDATE encomenda SET status=?, updated_at=? WHERE id=?', [status === 'finalizado' ? 'entregue' : status, t, id])
    if (status === 'cancelado') {
      await db.run('UPDATE lancamento SET deleted_at=?, updated_at=? WHERE origem_tipo=? AND origem_id=? AND pago=0 AND deleted_at IS NULL',
        [t, t, 'encomenda', id])
    }
  })
}

export async function entregarEncomenda(db: Db, input: {
  encomendaId: string; forma: string; motivoEstoqueNegativo?: string
}) {
  const [order] = await db.query<{ status: string; total_cents: number; cliente_id: string | null }>(
    'SELECT status, total_cents, cliente_id FROM encomenda WHERE id=? AND deleted_at IS NULL', [input.encomendaId],
  )
  if (!order || order.status !== 'pedido') throw new Error('Este pedido não está mais agendado.')
  const [received] = await db.query<{ total: number }>(
    `SELECT COALESCE(SUM(valor_cents), 0) AS total FROM lancamento
     WHERE origem_tipo='encomenda' AND origem_id=? AND tipo='receita' AND pago=1 AND deleted_at IS NULL`,
    [input.encomendaId],
  )
  const items = await db.query<{ variante_id: string; quantidade: number; preco_unit_cents: number }>(
    'SELECT variante_id, quantidade, preco_unit_cents FROM encomenda_item WHERE encomenda_id=? AND deleted_at IS NULL',
    [input.encomendaId],
  )
  const base = await carregarBase(db)
  return registrarVenda(db, {
    forma: input.forma,
    clienteId: order.cliente_id,
    encomendaId: input.encomendaId,
    descontoCents: Math.min(order.total_cents, Number(received?.total ?? 0)),
    motivoEstoqueNegativo: input.motivoEstoqueNegativo,
    itens: items.map((item) => {
      const variant = base.variantes.find((row) => row.id === item.variante_id)
      if (!variant) throw new Error('Um produto deste pedido não foi encontrado.')
      return {
        varianteId: item.variante_id, quantidade: item.quantidade, precoCents: item.preco_unit_cents,
        custoCents: custoDaVariante(variant, base),
      }
    }),
  }, async (_saleId, t) => {
    const [current] = await db.query<{ status: string }>(
      'SELECT status FROM encomenda WHERE id=? AND deleted_at IS NULL', [input.encomendaId],
    )
    if (!current || current.status !== 'pedido') throw new Error('Este pedido não está mais agendado e não pode ser finalizado.')
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
    const [current] = await db.query<{ id: string; origem_tipo: string | null }>(
      'SELECT id, origem_tipo FROM lancamento WHERE id=? AND deleted_at IS NULL', [input.id],
    )
    if (!current) throw new Error('O lançamento que você está editando não foi encontrado.')
    if (current.origem_tipo !== null) throw new Error('Este lançamento é vinculado a uma compra, venda ou encomenda e não pode ser editado aqui.')
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
