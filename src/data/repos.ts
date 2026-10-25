import { baseOf, costPerBase, toBase, type BaseUnit, type Unit } from '../domain/units'
import { weightedAverageCost } from '../domain/cost'
import { capitalizarNome } from '../domain/text'
import { localDateString } from '../domain/date'
import type { Db } from './db'

const agora = () => new Date().toISOString()
export const novoId = () => crypto.randomUUID()

export async function proximaSequenciaMovimento(db: Db): Promise<number> {
  const [row] = await db.query<{ sequencia: number }>(
    'SELECT COALESCE(MAX(sequencia), 0) + 1 AS sequencia FROM movimento_estoque',
  )
  return Number(row?.sequencia ?? 1)
}

export interface InsumoRow {
  id: string
  nome: string
  tipo: string
  unidade_base: BaseUnit
  unidade_compra: string
  fator_compra: number
  custo_medio: number
  estoque_atual?: number
  estoque_minimo?: number
  quantidade_cadastro?: number
}

export interface CompraRow {
  id: string
  fornecedor_id: string | null
  fornecedor_nome: string | null
  data: string
  total_cents: number
  pago: number
  itens: string
  quantidade_itens: number
  forma_pagamento: string | null
  vencimento: string | null
  cancelada_em: string | null
  motivo_cancelamento: string | null
}

export type StatusCompra = 'todas' | 'pagas' | 'pendentes' | 'canceladas'

export const listarCompras = (db: Db, status: StatusCompra = 'todas') => {
  const filtro = status === 'canceladas'
    ? ' AND c.cancelada_em IS NOT NULL'
    : status === 'pagas'
      ? ' AND c.cancelada_em IS NULL AND c.pago=1'
      : status === 'pendentes'
        ? ' AND c.cancelada_em IS NULL AND c.pago=0'
        : ''
  return db.query<CompraRow>(
    `SELECT c.id, c.fornecedor_id, f.nome AS fornecedor_nome, c.data, c.total_cents, c.pago,
            c.forma_pagamento, MAX(l.vencimento) AS vencimento, c.cancelada_em, c.motivo_cancelamento,
            COALESCE(GROUP_CONCAT(i.nome, ', '), 'Compra sem itens') AS itens,
            COUNT(ci.id) AS quantidade_itens
     FROM compra c
     LEFT JOIN fornecedor f ON f.id=c.fornecedor_id
     LEFT JOIN compra_item ci ON ci.compra_id=c.id AND ci.deleted_at IS NULL
     LEFT JOIN insumo i ON i.id=ci.insumo_id
     LEFT JOIN (
       SELECT origem_id, MAX(vencimento) AS vencimento FROM lancamento
       WHERE origem_tipo='compra' AND deleted_at IS NULL GROUP BY origem_id
     ) l ON l.origem_id=c.id
     WHERE c.deleted_at IS NULL${filtro}
     GROUP BY c.id, c.fornecedor_id, f.nome, c.data, c.total_cents, c.pago, c.forma_pagamento, c.cancelada_em, c.motivo_cancelamento
     ORDER BY c.data DESC,
              CASE WHEN c.cancelada_em IS NULL AND c.pago=0 THEN 0
                   WHEN c.cancelada_em IS NOT NULL THEN 1
                   ELSE 2 END,
              c.created_at DESC`,
  )
}

export interface CompraItemRow {
  id: string
  insumo_id: string
  insumo_nome: string
  quantidade_base: number
  unidade_base: BaseUnit
  total_cents: number
}

export interface CompraEdicaoRow {
  id: string
  motivo: string
  dados_anteriores: string
  dados_novos: string
  created_at: string
}

export const listarItensCompra = (db: Db, compraId: string) =>
  db.query<CompraItemRow>(
    `SELECT ci.id, ci.insumo_id, i.nome AS insumo_nome, ci.quantidade_base,
            i.unidade_base, ci.total_cents
     FROM compra_item ci
     LEFT JOIN insumo i ON i.id=ci.insumo_id
     WHERE ci.compra_id=? AND ci.deleted_at IS NULL
     ORDER BY i.nome`,
    [compraId],
  )

export const listarHistoricoEdicoesCompra = (db: Db, compraId: string) =>
  db.query<CompraEdicaoRow>(
    `SELECT id, motivo, dados_anteriores, dados_novos, created_at
     FROM historico_edicao_compra
     WHERE compra_id=? AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [compraId],
  )

export const listarInsumos = (db: Db) =>
  db.query<InsumoRow>(
    'SELECT id, nome, tipo, unidade_base, unidade_compra, fator_compra, custo_medio, estoque_atual, estoque_minimo, quantidade_cadastro FROM insumo WHERE deleted_at IS NULL AND ativo = 1 ORDER BY nome',
  )

export async function salvarInsumo(
  db: Db,
  i: { id?: string; nome: string; unidade: Unit; quantidade?: number; totalCents?: number; tipo?: string; estoqueMinimo?: number },
) {
  if (!i.nome.trim()) throw new Error('Informe um nome válido.')
  if (i.estoqueMinimo !== undefined && (!Number.isFinite(i.estoqueMinimo) || i.estoqueMinimo < 0)) {
    throw new Error('O estoque mínimo precisa ser zero ou maior.')
  }
  const t = agora()
  const nome = capitalizarNome(i.nome)
  const atualizandoCusto = i.quantidade !== undefined || i.totalCents !== undefined
  const custoValido = Number.isFinite(i.quantidade) && Number(i.quantidade) > 0
    && Number.isInteger(i.totalCents) && Number(i.totalCents) > 0
  if (atualizandoCusto && !custoValido) {
    throw new Error('Informe quantidade e valor válidos para atualizar o custo.')
  }
  if (i.id) {
    const [atual] = await db.query<{ unidade_base: BaseUnit; tipo: string }>(
      'SELECT unidade_base, tipo FROM insumo WHERE id=? AND deleted_at IS NULL', [i.id],
    )
    if (atual && atual.tipo !== (i.tipo ?? 'ingrediente')) throw new Error('O tipo do insumo não pode ser alterado durante a edição.')
    if (!atual) throw new Error('O insumo que você tentou editar não foi encontrado.')
    if (atual.unidade_base !== baseOf(i.unidade)) {
      const [uso] = await db.query<{ total: number }>(
        'SELECT COUNT(*) AS total FROM receita_item WHERE insumo_id=? AND deleted_at IS NULL', [i.id],
      )
      const [embalagem] = await db.query<{ total: number }>(
        'SELECT COUNT(*) AS total FROM produto_variante WHERE (embalagem_insumo_id=? OR rotulo_insumo_id=?) AND deleted_at IS NULL',
        [i.id, i.id],
      )
      if (Number(uso?.total ?? 0) || Number(embalagem?.total ?? 0)) {
        throw new Error('Não é possível alterar a unidade base enquanto o insumo estiver vinculado a receitas ou embalagens.')
      }
    }
    if (atualizandoCusto) {
      const values = [nome, i.tipo ?? 'ingrediente', baseOf(i.unidade), i.unidade, toBase(1, i.unidade),
        costPerBase(Number(i.totalCents), Number(i.quantidade), i.unidade), t, i.id]
      await db.run(
        `UPDATE insumo SET nome=?, tipo=?, unidade_base=?, unidade_compra=?, fator_compra=?, custo_medio=?,
         estoque_minimo=COALESCE(?, estoque_minimo), updated_at=? WHERE id=? AND deleted_at IS NULL`,
        [...values.slice(0, 6), i.estoqueMinimo ?? null, ...values.slice(6)],
      )
    } else {
      await db.run(
        `UPDATE insumo SET nome=?, tipo=?, estoque_minimo=COALESCE(?, estoque_minimo),
         updated_at=? WHERE id=? AND deleted_at IS NULL`,
        [nome, i.tipo ?? 'ingrediente', i.estoqueMinimo ?? null, t, i.id],
      )
    }
    return i.id
  }
  if (!custoValido) throw new Error('Informe nome, quantidade e valor válidos.')
  const id = novoId()
  const values = [
    nome, i.tipo ?? 'ingrediente', baseOf(i.unidade), i.unidade, toBase(1, i.unidade),
    costPerBase(Number(i.totalCents), Number(i.quantidade), i.unidade),
  ]
  await db.transaction(async () => {
    const quantidadeBase = toBase(Number(i.quantidade), i.unidade)
    await db.run(
      `INSERT INTO insumo
       (id, nome, tipo, unidade_base, unidade_compra, fator_compra, custo_medio, estoque_atual, estoque_minimo, quantidade_cadastro, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, ...values, quantidadeBase, i.estoqueMinimo ?? 0, Number(i.quantidade), t, t],
    )
    await db.run(
      `INSERT INTO movimento_estoque
       (id, item_tipo, item_id, tipo, quantidade, custo_unit, origem_id, data, created_at, updated_at, sequencia)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [novoId(), 'insumo', id, 'cadastro', quantidadeBase, costPerBase(Number(i.totalCents), Number(i.quantidade), i.unidade), null, t, t, t, await proximaSequenciaMovimento(db)],
    )
  })
  return id
}

export async function excluirInsumo(db: Db, id: string) {
  const [recipeUse] = await db.query<{ total: number }>(
    `SELECT COUNT(*) AS total FROM receita_item ri JOIN receita r ON r.id=ri.receita_id
     WHERE ri.insumo_id=? AND ri.deleted_at IS NULL AND r.deleted_at IS NULL`,
    [id],
  )
  const [packageUse] = await db.query<{ total: number }>(
    `SELECT COUNT(*) AS total FROM produto_variante pv JOIN produto p ON p.id=pv.produto_id
     WHERE (pv.embalagem_insumo_id=? OR pv.rotulo_insumo_id=?) AND pv.deleted_at IS NULL AND p.deleted_at IS NULL`,
    [id, id],
  )
  if (Number(recipeUse?.total ?? 0) || Number(packageUse?.total ?? 0)) {
    throw new Error('Este insumo está em uso por uma receita ou embalagem. Remova essas referências antes de excluir.')
  }
  const t = agora()
  await db.transaction(async () => {
    await db.run(
      'UPDATE movimento_estoque SET deleted_at=?, updated_at=? WHERE item_tipo=? AND item_id=? AND deleted_at IS NULL',
      [t, t, 'insumo', id],
    )
    await db.run('UPDATE insumo SET deleted_at = ?, ativo = 0, updated_at = ? WHERE id = ?', [t, t, id])
  })
}

export interface ReceitaRow {
  id: string
  nome: string
  rendimento_qtd: number
  rendimento_unidade: string
  perda_pct: number
  tempo_min: number | null
  modo_preparo: string | null
  passos_preparo: string | null
}

export interface ItemRow {
  id: string
  receita_id: string
  insumo_id: string | null
  subreceita_id: string | null
  quantidade_base: number
}

export const listarReceitas = (db: Db) =>
  db.query<ReceitaRow>(
    'SELECT id, nome, rendimento_qtd, rendimento_unidade, perda_pct, tempo_min, modo_preparo, passos_preparo FROM receita WHERE deleted_at IS NULL ORDER BY nome',
  )

export const buscarInsumo = async (db: Db, id: string) => {
  const [row] = await db.query<InsumoRow>(
    'SELECT id, nome, tipo, unidade_base, unidade_compra, fator_compra, custo_medio FROM insumo WHERE id=? AND deleted_at IS NULL',
    [id],
  )
  return row
}

export const buscarReceita = async (db: Db, id: string) => {
  const [row] = await db.query<ReceitaRow>(
    'SELECT id, nome, rendimento_qtd, rendimento_unidade, perda_pct, tempo_min, modo_preparo, passos_preparo FROM receita WHERE id=? AND deleted_at IS NULL',
    [id],
  )
  return row
}

export const todosItens = (db: Db) =>
  db.query<ItemRow>(
    'SELECT id, receita_id, insumo_id, subreceita_id, quantidade_base FROM receita_item WHERE deleted_at IS NULL ORDER BY created_at',
  )

export interface ReceitaItemInput {
  insumoId?: string
  subreceitaId?: string
  quantidadeBase: number
}

export async function salvarReceita(
  db: Db,
  r: {
    id?: string
    nome: string
    rendimento: number
    rendimentoUnidade?: string
    perdaPct: number
    tempoMin?: number | null
    modoPreparo?: string
    passosPreparo?: string[]
    itens: ReceitaItemInput[]
  },
) {
  if (r.nome.trim().length < 2 || r.nome.trim().length > 60 || !/^[\p{L}\s]+$/u.test(r.nome.trim())
    || !(Number.isFinite(r.rendimento) && r.rendimento > 0)
    || !(Number.isFinite(r.perdaPct) && r.perdaPct >= 0 && r.perdaPct < 1)
    || (r.tempoMin != null && !(Number.isFinite(r.tempoMin) && r.tempoMin >= 0))
    || !r.itens.length) {
    throw new Error('Confira nome, rendimento, perda e ao menos um ingrediente')
  }
  const nome = capitalizarNome(r.nome)
  for (const item of r.itens) {
    if (!(Number.isFinite(item.quantidadeBase) && item.quantidadeBase > 0)
      || (!!item.insumoId === !!item.subreceitaId)) {
      throw new Error('Cada item precisa de quantidade e exatamente um insumo ou sub-receita')
    }
  }
  const id = r.id ?? novoId()
  const t = agora()
  if (r.id) {
    const [existente] = await db.query<{ id: string }>('SELECT id FROM receita WHERE id=? AND deleted_at IS NULL', [r.id])
    if (!existente) throw new Error('A receita que você está editando não foi encontrada.')
  }
  await db.transaction(async () => {
    if (r.id) {
      await db.run(
        `UPDATE receita SET nome=?, rendimento_qtd=?, rendimento_unidade=?, perda_pct=?, tempo_min=?, modo_preparo=?, passos_preparo=?, updated_at=?
         WHERE id=? AND deleted_at IS NULL`,
        [nome, r.rendimento, r.rendimentoUnidade ?? 'un', r.perdaPct, r.tempoMin ?? null,
          r.modoPreparo?.trim() || null, JSON.stringify(r.passosPreparo ?? []), t, id],
      )
      // Keep deletion tombstones so the sheet sync does not restore old ingredients.
      await db.run('UPDATE receita_item SET deleted_at=?, updated_at=? WHERE receita_id=? AND deleted_at IS NULL', [t, t, id])
    } else {
      await db.run(
        'INSERT INTO receita (id, nome, rendimento_qtd, rendimento_unidade, perda_pct, tempo_min, modo_preparo, passos_preparo, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [id, nome, r.rendimento, r.rendimentoUnidade ?? 'un', r.perdaPct, r.tempoMin ?? null,
          r.modoPreparo?.trim() || null, JSON.stringify(r.passosPreparo ?? []), t, t],
      )
    }
    for (const item of r.itens) {
      await db.run(
        'INSERT INTO receita_item (id, receita_id, insumo_id, subreceita_id, quantidade_base, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
        [novoId(), id, item.insumoId ?? null, item.subreceitaId ?? null, item.quantidadeBase, t, t],
      )
    }
  })
  return id
}

export async function excluirReceita(db: Db, id: string) {
  const [componentUse, productUse] = await Promise.all([
    db.query<{ total: number }>(
      `SELECT COUNT(*) AS total FROM receita_item ri JOIN receita r ON r.id=ri.receita_id
       WHERE ri.subreceita_id=? AND ri.deleted_at IS NULL AND r.deleted_at IS NULL`, [id],
    ),
    db.query<{ total: number }>(
      'SELECT COUNT(*) AS total FROM produto WHERE receita_id=? AND deleted_at IS NULL', [id],
    ),
  ])
  if ([componentUse, productUse].some(([row]) => Number(row?.total ?? 0) > 0)) {
    throw new Error('Esta receita está vinculada a outra receita ou produto. Remova essas referências antes de excluir.')
  }
  await db.run('UPDATE receita SET deleted_at = ?, updated_at = ? WHERE id = ?', [agora(), agora(), id])
}

export const lerConfig = async (db: Db) => {
  const rows = await db.query<{ chave: string; valor: string }>('SELECT chave, valor FROM config')
  return Object.fromEntries(rows.map((r) => [r.chave, r.valor])) as Record<string, string>
}

export const salvarConfig = (db: Db, c: Record<string, string>) => {
  const config = { ...c }
  const updatedAt = agora()
  if (c.gas_lote !== undefined) {
    const gas = Number(c.gas_lote)
    if (!(Number.isFinite(gas) && gas >= 0 && gas <= 999.99)) throw new Error('O custo de gás precisa ficar entre R$ 0,00 e R$ 999,99.')
    config.gas_lote_cents = String(Math.round(gas * 100))
  }
  if (c.hora_trabalho !== undefined) {
    const hora = Number(c.hora_trabalho)
    if (!(Number.isFinite(hora) && hora >= 0 && hora <= 999.99)) throw new Error('O valor da hora precisa ficar entre R$ 0,00 e R$ 999,99.')
    config.valor_hora_cents = String(Math.round(hora * 100))
  }
  for (const key of ['taxa_pix', 'taxa_cartao', 'taxa_cartao_credito', 'taxa_cartao_debito', 'margem_padrao']) {
    if (c[key] === undefined) continue
    const percentual = Number(c[key])
    if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
      throw new Error('Taxas e margem devem ficar entre 0% e 100%.')
    }
  }
  return db.transaction(async () => {
    for (const [k, v] of Object.entries(config)) {
      await db.run(
        'INSERT INTO config (chave, valor, updated_at) VALUES (?,?,?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, updated_at = excluded.updated_at',
        [k, v, updatedAt],
      )
    }
  })
}

type CompraInput = {
  insumoId?: string; unidade?: Unit; quantidade?: number; totalCents?: number
  itens?: { insumoId: string; unidade: Unit; quantidade: number; totalCents: number }[]
  fornecedorId: string; pago: boolean; formaPagamento: string
  data: string; vencimento?: string
}

type ItemCompraConvertido = {
  insumoId: string
  unidade: Unit
  quantidade: number
  totalCents: number
  quantidadeBase: number
  custo: number
}

function prepararCompra(c: CompraInput, dataHistoricaPermitida?: string) {
  if (!c.fornecedorId?.trim()) {
    throw new Error('Selecione um fornecedor para registrar a compra.')
  }
  if (typeof c.pago !== 'boolean') {
    throw new Error('Informe a situação do pagamento da compra.')
  }
  if (!c.data?.trim()) {
    throw new Error('Informe a data da compra.')
  }
  if (!c.formaPagamento?.trim()) {
    throw new Error('Informe a forma de pagamento da compra.')
  }
  const itens = c.itens ?? (c.insumoId && c.unidade && c.quantidade !== undefined && c.totalCents !== undefined
    ? [{ insumoId: c.insumoId, unidade: c.unidade, quantidade: c.quantidade, totalCents: c.totalCents }]
    : [])
  if (!itens.length || itens.some((item) =>
    !Number.isFinite(item.quantidade) || item.quantidade <= 0
    || !Number.isSafeInteger(item.totalCents) || item.totalCents <= 0)) {
    throw new Error('Quantidade e total da compra devem ser maiores que zero e válidos.')
  }
  const totalCents = itens.reduce((sum, item) => sum + item.totalCents, 0)
  if (!Number.isSafeInteger(totalCents) || (c.totalCents !== undefined && c.totalCents !== totalCents)) {
    throw new Error('O total da compra deve corresponder à soma dos itens.')
  }
  const dataCompra = dataParaTimestamp(c.data)
  if (c.data < localDateString() && c.data !== dataHistoricaPermitida) {
    throw new Error('A data da compra não pode ser anterior à data de hoje.')
  }
  const pago = c.pago
  if (!pago && !c.vencimento?.trim()) throw new Error('Informe a data de vencimento da compra não paga.')
  if (!pago && c.vencimento && c.vencimento < (c.data ?? localDateString())) {
    throw new Error('A data de vencimento não pode ser anterior à data da compra.')
  }
  const vencimento = c.vencimento ? dataParaTimestamp(c.vencimento) : dataCompra
  const itensConvertidos: ItemCompraConvertido[] = itens.map((item) => {
    const quantidadeBase = toBase(item.quantidade, item.unidade)
    const custo = costPerBase(item.totalCents, item.quantidade, item.unidade)
    if (!Number.isFinite(quantidadeBase) || quantidadeBase <= 0 || !Number.isFinite(custo)) {
      throw new Error('A quantidade ou o custo de um item da compra é inválido.')
    }
    return { ...item, quantidadeBase, custo }
  })
  return { itensConvertidos, totalCents, dataCompra, vencimento, pago, formaPagamento: c.formaPagamento }
}

function resumoCompra(snapshot: {
  fornecedor_id: string | null
  data: string
  total_cents: number
  forma_pagamento: string | null
  vencimento: string | null
  itens: { insumo_id: string; insumo_nome: string; quantidade_base: number; unidade_base: BaseUnit; total_cents: number }[]
}) {
  return JSON.stringify(snapshot)
}

export async function registrarCompra(db: Db, c: CompraInput) {
  const { itensConvertidos, totalCents, dataCompra, vencimento, pago, formaPagamento } = prepararCompra(c)
  const id = novoId()
  const t = agora()
  await db.transaction(async () => {
    const saldos = new Map<string, { estoque: number; custoMedio: number; unidadeBase: BaseUnit }>()
    for (const item of itensConvertidos) {
      let insumo = saldos.get(item.insumoId)
      if (!insumo) {
        const [row] = await db.query<{ unidade_base: BaseUnit; estoque_atual: number; custo_medio: number }>(
          'SELECT unidade_base, estoque_atual, custo_medio FROM insumo WHERE id=? AND deleted_at IS NULL', [item.insumoId],
        )
        if (!row) throw new Error('Um insumo da compra não foi encontrado ou foi excluído.')
        if (row.unidade_base !== baseOf(item.unidade)) {
          throw new Error(`A unidade da compra não corresponde à unidade base do insumo (${row.unidade_base}).`)
        }
        const estoque = Number(row.estoque_atual ?? 0)
        const custoMedio = Number(row.custo_medio ?? 0)
        if (!Number.isFinite(estoque) || !Number.isFinite(custoMedio)) {
          throw new Error('O saldo ou o custo médio do insumo é inválido.')
        }
        insumo = { estoque, custoMedio, unidadeBase: row.unidade_base }
        saldos.set(item.insumoId, insumo)
      } else if (insumo.unidadeBase !== baseOf(item.unidade)) {
        throw new Error(`A unidade da compra não corresponde à unidade base do insumo (${insumo.unidadeBase}).`)
      }
    }
    await db.run(
      'INSERT INTO compra (id, fornecedor_id, data, total_cents, pago, forma_pagamento, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
      [id, c.fornecedorId, dataCompra, totalCents, pago ? 1 : 0, formaPagamento, t, t],
    )
    for (const item of itensConvertidos) {
      const insumo = saldos.get(item.insumoId)
      if (!insumo) throw new Error('Um insumo da compra não foi encontrado ou foi excluído.')
      await db.run(
        'INSERT INTO compra_item (id, compra_id, insumo_id, quantidade_base, total_cents, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
        [novoId(), id, item.insumoId, item.quantidadeBase, item.totalCents, t, t],
      )
      await db.run(
        'INSERT INTO historico_preco_insumo (id, insumo_id, data, custo_por_base, compra_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
        [novoId(), item.insumoId, dataCompra, item.custo, id, t, t],
      )
      const oldStock = insumo.estoque
      const newStock = oldStock + item.quantidadeBase
      const average = weightedAverageCost(oldStock, insumo.custoMedio, item.quantidadeBase, item.totalCents)
      if (!Number.isFinite(newStock) || !Number.isFinite(average)) {
        throw new Error('A compra resultaria em um saldo ou custo médio inválido.')
      }
      await db.run('UPDATE insumo SET custo_medio=?, estoque_atual=?, updated_at=? WHERE id=? AND deleted_at IS NULL',
        [average, newStock, t, item.insumoId])
      insumo.estoque = newStock
      insumo.custoMedio = average
      await db.run(
        `INSERT INTO movimento_estoque (id, item_tipo, item_id, tipo, quantidade, custo_unit, origem_id, data, created_at, updated_at, sequencia)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [novoId(), 'insumo', item.insumoId, 'compra', item.quantidadeBase, item.custo, id, dataCompra, t, t, await proximaSequenciaMovimento(db)],
      )
    }
    await db.run(
      `INSERT INTO lancamento
       (id, tipo, categoria, valor_cents, data, vencimento, pago, negocio, origem_tipo, origem_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [novoId(), 'despesa', 'Compra de insumo', totalCents, dataCompra, vencimento, pago ? 1 : 0, 1, 'compra', id, t, t],
    )
  })
  return id
}

async function reconstruirSaldoInsumo(db: Db, insumoId: string, t: string) {
  const [insumo] = await db.query<{ unidade_base: BaseUnit }>(
    'SELECT unidade_base FROM insumo WHERE id=? AND deleted_at IS NULL', [insumoId],
  )
  if (!insumo) throw new Error('Um insumo desta compra não foi encontrado ou foi excluído.')
  const movimentos = await db.query<{ tipo: string; quantidade: number; custo_unit: number | null }>(
    `SELECT tipo, quantidade, custo_unit FROM movimento_estoque
     WHERE item_tipo='insumo' AND item_id=? AND deleted_at IS NULL
     ORDER BY created_at, sequencia, device_id, id`,
    [insumoId],
  )
  let saldo = 0
  let custoMedio = 0
  for (const movimento of movimentos) {
    const quantidade = Number(movimento.quantidade)
    if (!Number.isFinite(quantidade)) throw new Error('O histórico contém uma quantidade inválida; a compra não foi editada.')
    if ((movimento.tipo === 'compra' || movimento.tipo === 'cadastro') && quantidade > 0) {
      if (movimento.custo_unit === null) throw new Error('O histórico não tem custo suficiente para conciliar; a compra não foi editada.')
      const custoUnitario = Number(movimento.custo_unit)
      if (!Number.isFinite(custoUnitario) || custoUnitario < 0) {
        throw new Error('O histórico contém um custo inválido; a compra não foi editada.')
      }
      custoMedio = weightedAverageCost(saldo, custoMedio, quantidade, custoUnitario * quantidade)
    }
    saldo += quantidade
  }
  if (!Number.isFinite(saldo) || saldo < 0 || !Number.isFinite(custoMedio)) {
    throw new Error('A edição não pode ser conciliada sem deixar o saldo de estoque negativo.')
  }
  await db.run(
    'UPDATE insumo SET estoque_atual=?, custo_medio=?, updated_at=? WHERE id=? AND deleted_at IS NULL',
    [saldo, custoMedio, t, insumoId],
  )
  return { unidadeBase: insumo.unidade_base, estoque: saldo, custoMedio }
}

export async function editarCompra(db: Db, compraId: string, c: CompraInput, motivo = '') {
  const justificativa = motivo.trim() || 'Edição realizada sem motivo informado'
  if (c.pago) throw new Error('Somente compras não pagas podem ser editadas.')
  const t = agora()

  await db.transaction(async () => {
    const [compra] = await db.query<{
      id: string; fornecedor_id: string | null; data: string; total_cents: number
      pago: number; cancelada_em: string | null; forma_pagamento: string | null
    }>(
      `SELECT id, fornecedor_id, data, total_cents, pago, cancelada_em, forma_pagamento
       FROM compra WHERE id=? AND deleted_at IS NULL`,
      [compraId],
    )
    if (!compra) throw new Error('A compra que você está editando não foi encontrada.')
    if (compra.cancelada_em) throw new Error('Compras canceladas não podem ser editadas.')
    if (compra.pago) throw new Error('Somente compras não pagas podem ser editadas.')
    const { itensConvertidos, totalCents, dataCompra, vencimento, formaPagamento } =
      prepararCompra(c, compra.data.slice(0, 10))

    const itensAntigos = await db.query<{
      id: string; insumo_id: string; insumo_nome: string; quantidade_base: number; unidade_base: BaseUnit; total_cents: number
    }>(
      `SELECT ci.id, ci.insumo_id, COALESCE(i.nome, 'Insumo removido') AS insumo_nome, i.unidade_base,
              ci.quantidade_base, ci.total_cents
       FROM compra_item ci LEFT JOIN insumo i ON i.id=ci.insumo_id
       WHERE ci.compra_id=? AND ci.deleted_at IS NULL`,
      [compraId],
    )
    const movimentosAntigos = await db.query<{ id: string; item_id: string; quantidade: number }>(
      `SELECT id, item_id, quantidade FROM movimento_estoque
       WHERE origem_id=? AND item_tipo='insumo' AND tipo='compra' AND deleted_at IS NULL`,
      [compraId],
    )
    if (!itensAntigos.length || itensAntigos.length !== movimentosAntigos.length) {
      throw new Error('Não foi possível conciliar os itens e movimentos desta compra. A compra foi mantida sem alterações.')
    }
    const lancamentos = await db.query<{ id: string; vencimento: string | null; pago: number }>(
      `SELECT id, vencimento, pago FROM lancamento
       WHERE origem_tipo='compra' AND origem_id=? AND deleted_at IS NULL`,
      [compraId],
    )
    if (lancamentos.length !== 1) {
      throw new Error('Não foi possível localizar o lançamento financeiro único desta compra. A compra foi mantida sem alterações.')
    }
    if (lancamentos[0].pago) {
      throw new Error('O lançamento financeiro já está pago; esta compra não pode ser editada.')
    }

    const insumosNovos = new Map<string, { nome: string; unidadeBase: BaseUnit }>()
    for (const item of itensConvertidos) {
      let insumo = insumosNovos.get(item.insumoId)
      if (!insumo) {
        const [row] = await db.query<{ id: string; nome: string; unidade_base: BaseUnit }>(
          'SELECT id, nome, unidade_base FROM insumo WHERE id=? AND deleted_at IS NULL',
          [item.insumoId],
        )
        if (!row) throw new Error('Um insumo da compra não foi encontrado ou foi excluído.')
        insumo = { nome: row.nome, unidadeBase: row.unidade_base }
        insumosNovos.set(item.insumoId, insumo)
      }
      if (insumo.unidadeBase !== baseOf(item.unidade)) {
        throw new Error(`A unidade da compra não corresponde à unidade base do insumo (${insumo.unidadeBase}).`)
      }
    }

    const dadosAnteriores = resumoCompra({
      fornecedor_id: compra.fornecedor_id,
      data: compra.data,
      total_cents: compra.total_cents,
      forma_pagamento: compra.forma_pagamento,
      vencimento: lancamentos[0].vencimento,
      itens: itensAntigos,
    })
    const idsAfetados = [...new Set([
      ...itensAntigos.map((item) => item.insumo_id),
      ...itensConvertidos.map((item) => item.insumoId),
    ])]

    await db.run(
      'UPDATE movimento_estoque SET deleted_at=?, updated_at=? WHERE origem_id=? AND item_tipo=? AND tipo=? AND deleted_at IS NULL',
      [t, t, compraId, 'insumo', 'compra'],
    )
    await db.run(
      'UPDATE compra_item SET deleted_at=?, updated_at=? WHERE compra_id=? AND deleted_at IS NULL',
      [t, t, compraId],
    )
    await db.run(
      'UPDATE historico_preco_insumo SET deleted_at=?, updated_at=? WHERE compra_id=? AND deleted_at IS NULL',
      [t, t, compraId],
    )

    const saldos = new Map<string, { unidadeBase: BaseUnit; estoque: number; custoMedio: number }>()
    for (const insumoId of idsAfetados) {
      saldos.set(insumoId, await reconstruirSaldoInsumo(db, insumoId, t))
    }

    await db.run(
      `UPDATE compra SET fornecedor_id=?, data=?, total_cents=?, forma_pagamento=?, updated_at=?
       WHERE id=? AND deleted_at IS NULL AND pago=0 AND cancelada_em IS NULL`,
      [c.fornecedorId, dataCompra, totalCents, formaPagamento, t, compraId],
    )

    for (const item of itensConvertidos) {
      const saldo = saldos.get(item.insumoId)
      const insumo = insumosNovos.get(item.insumoId)
      if (!saldo || !insumo) throw new Error('Um insumo da compra não foi encontrado.')
      const estoqueNovo = saldo.estoque + item.quantidadeBase
      const custoMedioNovo = weightedAverageCost(
        saldo.estoque, saldo.custoMedio, item.quantidadeBase, item.totalCents,
      )
      if (!Number.isFinite(estoqueNovo) || !Number.isFinite(custoMedioNovo)) {
        throw new Error('A edição resultaria em um saldo ou custo médio inválido.')
      }
      await db.run(
        `INSERT INTO compra_item (id, compra_id, insumo_id, quantidade_base, total_cents, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?)`,
        [novoId(), compraId, item.insumoId, item.quantidadeBase, item.totalCents, t, t],
      )
      await db.run(
        `INSERT INTO historico_preco_insumo (id, insumo_id, data, custo_por_base, compra_id, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?)`,
        [novoId(), item.insumoId, dataCompra, item.custo, compraId, t, t],
      )
      await db.run(
        'UPDATE insumo SET estoque_atual=?, custo_medio=?, updated_at=? WHERE id=? AND deleted_at IS NULL',
        [estoqueNovo, custoMedioNovo, t, item.insumoId],
      )
      saldo.estoque = estoqueNovo
      saldo.custoMedio = custoMedioNovo
      await db.run(
        `INSERT INTO movimento_estoque
         (id, item_tipo, item_id, tipo, quantidade, custo_unit, origem_id, data, motivo, created_at, updated_at, sequencia)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [novoId(), 'insumo', item.insumoId, 'compra', item.quantidadeBase, item.custo, compraId, dataCompra, `Compra editada: ${justificativa}`, t, t, await proximaSequenciaMovimento(db)],
      )
    }

    await db.run(
      `UPDATE lancamento SET valor_cents=?, data=?, vencimento=?, updated_at=?
       WHERE id=? AND deleted_at IS NULL`,
      [totalCents, dataCompra, vencimento, t, lancamentos[0].id],
    )
    const dadosNovos = resumoCompra({
      fornecedor_id: c.fornecedorId,
      data: dataCompra,
      total_cents: totalCents,
      forma_pagamento: formaPagamento,
      vencimento,
      itens: itensConvertidos.map((item) => ({
        insumo_id: item.insumoId,
        insumo_nome: insumosNovos.get(item.insumoId)?.nome ?? 'Insumo',
        quantidade_base: item.quantidadeBase,
        unidade_base: insumosNovos.get(item.insumoId)?.unidadeBase ?? baseOf(item.unidade),
        total_cents: item.totalCents,
      })),
    })
    await db.run(
      `INSERT INTO historico_edicao_compra
       (id, compra_id, motivo, dados_anteriores, dados_novos, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?)`,
      [novoId(), compraId, justificativa, dadosAnteriores, dadosNovos, t, t],
    )
  })
}

function dataParaTimestamp(data: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Informe uma data válida para a compra.')
  const parsed = new Date(`${data}T12:00:00`)
  const dataFormatada = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
  if (Number.isNaN(parsed.getTime()) || dataFormatada !== data) throw new Error('Informe uma data válida para a compra.')
  return parsed.toISOString()
}

export async function atualizarPagamentoCompra(db: Db, compraId: string, pago: boolean, formaPagamento = 'pix') {
  const t = agora()
  const [lancamento] = await db.query<{ id: string }>(
    'SELECT id FROM lancamento WHERE origem_tipo=? AND origem_id=? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1',
    ['compra', compraId],
  )
  await db.transaction(async () => {
    await db.run('UPDATE compra SET pago=?, forma_pagamento=?, updated_at=? WHERE id=? AND deleted_at IS NULL AND cancelada_em IS NULL',
      [pago ? 1 : 0, pago ? formaPagamento : 'pendente', t, compraId])
    if (lancamento) {
      await db.run('UPDATE lancamento SET pago=?, data=?, updated_at=? WHERE id=? AND deleted_at IS NULL', [pago ? 1 : 0, t, t, lancamento.id])
    }
  })
}

export async function cancelarCompra(db: Db, compraId: string, motivo: string) {
  const justificativa = motivo.trim()
  if (!justificativa) throw new Error('Informe o motivo do cancelamento da compra.')
  const t = agora()
  await db.transaction(async () => {
    const [compra] = await db.query<{ id: string; pago: number; cancelada_em: string | null }>(
      'SELECT id, pago, cancelada_em FROM compra WHERE id=? AND deleted_at IS NULL', [compraId],
    )
    if (!compra) throw new Error('A compra não foi encontrada.')
    if (compra.cancelada_em) throw new Error('Esta compra já foi cancelada.')
    if (compra.pago) throw new Error('Compras pagas não podem ser canceladas.')
    const [itemCount] = await db.query<{ total: number }>(
      'SELECT COUNT(*) AS total FROM compra_item WHERE compra_id=? AND deleted_at IS NULL', [compraId],
    )
    const movimentos = await db.query<{ id: string; item_id: string; quantidade: number }>(
      `SELECT id, item_id, quantidade FROM movimento_estoque
       WHERE origem_id=? AND item_tipo='insumo' AND tipo='compra' AND deleted_at IS NULL`,
      [compraId],
    )
    if (!Number(itemCount?.total) || Number(itemCount.total) !== movimentos.length) {
      throw new Error('Não foi possível conciliar os itens e movimentos desta compra. A compra foi mantida sem alterações.')
    }
    const insumoIds = [...new Set(movimentos.map((movement) => movement.item_id))]
    for (const insumoId of insumoIds) {
      await db.run('UPDATE movimento_estoque SET deleted_at=?, updated_at=? WHERE origem_id=? AND item_tipo=? AND item_id=? AND tipo=? AND deleted_at IS NULL',
        [t, t, compraId, 'insumo', insumoId, 'compra'])
      // Preserve the weighted-average sequence used when purchases were entered, including backdated ones.
      const movimentosRestantes = await db.query<{ tipo: string; quantidade: number; custo_unit: number | null }>(
        `SELECT tipo, quantidade, custo_unit FROM movimento_estoque
         WHERE item_tipo='insumo' AND item_id=? AND deleted_at IS NULL
         ORDER BY created_at, sequencia, device_id, id`,
        [insumoId],
      )
      let saldo = 0
      let custoMedio = 0
      for (const movement of movimentosRestantes) {
        const quantidade = Number(movement.quantidade)
        if (!Number.isFinite(quantidade)) throw new Error('O histórico contém uma quantidade inválida; a compra não foi cancelada.')
        if ((movement.tipo === 'compra' || movement.tipo === 'cadastro') && quantidade > 0) {
          if (movement.custo_unit === null) throw new Error('O histórico não tem custo suficiente para conciliar; a compra não foi cancelada.')
          const custoUnitario = Number(movement.custo_unit)
          if (!Number.isFinite(custoUnitario) || custoUnitario < 0) {
            throw new Error('O histórico contém um custo inválido; a compra não foi cancelada.')
          }
          custoMedio = weightedAverageCost(
            saldo, custoMedio, quantidade, custoUnitario * quantidade,
          )
        }
        saldo += quantidade
      }
      if (!Number.isFinite(saldo) || saldo < 0) {
        throw new Error('O saldo atual não permite cancelar esta compra sem ficar negativo.')
      }
      await db.run('UPDATE insumo SET estoque_atual=?, custo_medio=?, updated_at=? WHERE id=? AND deleted_at IS NULL',
        [saldo, custoMedio, t, insumoId])
    }
    await db.run('UPDATE compra SET cancelada_em=?, motivo_cancelamento=?, updated_at=? WHERE id=? AND deleted_at IS NULL',
      [t, justificativa, t, compraId])
    await db.run(
      'UPDATE lancamento SET deleted_at=?, updated_at=? WHERE origem_tipo=? AND origem_id=? AND deleted_at IS NULL',
      [t, t, 'compra', compraId],
    )
    await db.run(
      'UPDATE historico_preco_insumo SET deleted_at=?, updated_at=? WHERE compra_id=? AND deleted_at IS NULL',
      [t, t, compraId],
    )
  })
}

export interface VarianteRow {
  id: string
  produto_id: string
  produto_nome: string
  receita_id: string
  nome: string
  peso_g: number | null
  volume_ml: number | null
  unidades_por_pacote: number
  embalagem_insumo_id: string | null
  rotulo_insumo_id: string | null
  preco_cents: number
  estoque_atual?: number
  estoque_minimo?: number
}

export const listarVariantes = (db: Db) =>
  db.query<VarianteRow>(
    `SELECT v.id, v.produto_id, p.nome AS produto_nome, p.receita_id, v.nome, v.peso_g, v.volume_ml,
            v.unidades_por_pacote, v.embalagem_insumo_id, v.rotulo_insumo_id, v.preco_cents,
            v.estoque_atual, v.estoque_minimo
     FROM produto_variante v JOIN produto p ON p.id = v.produto_id
     WHERE v.deleted_at IS NULL AND p.deleted_at IS NULL ORDER BY p.nome, v.nome`,
  )

export async function atualizarPrecoVariante(db: Db, varianteId: string, precoCents: number) {
  if (!Number.isInteger(precoCents) || precoCents < 0) throw new Error('O preço precisa ser um valor válido em centavos')
  const [existente] = await db.query<{ id: string }>('SELECT id FROM produto_variante WHERE id=? AND deleted_at IS NULL', [varianteId])
  if (!existente) throw new Error('A variante que você está editando não foi encontrada.')
  await db.run(
    'UPDATE produto_variante SET preco_cents=?, updated_at=? WHERE id=? AND deleted_at IS NULL',
    [precoCents, agora(), varianteId],
  )
}

export async function salvarProduto(
  db: Db,
  p: {
    id?: string
    nome: string
    receitaId: string
    variantes: {
      id?: string
      nome: string
      unidades: number
      pesoG?: number | null
      volumeMl?: number | null
      embalagemInsumoId?: string | null
      rotuloInsumoId?: string | null
      precoCents: number
    }[]
  },
) {
  if (!p.nome.trim() || !p.receitaId || !p.variantes.length) throw new Error('Informe produto, receita e ao menos uma variante')
  if (p.variantes.some((v) => !v.nome.trim() || !(v.unidades > 0) || !(v.precoCents > 0)
    || (v.pesoG != null && !(v.pesoG > 0)) || (v.volumeMl != null && !(v.volumeMl > 0)))) {
    throw new Error('Confira nome, rendimento, peso e preço das variantes')
  }
  const nome = capitalizarNome(p.nome)
  const [receita] = await db.query<{ rendimento_unidade: string }>(
    'SELECT rendimento_unidade FROM receita WHERE id=? AND deleted_at IS NULL', [p.receitaId],
  )
  if (!receita) throw new Error('A receita selecionada não foi encontrada.')
  if (receita.rendimento_unidade === 'g' && p.variantes.some((variant) => !(variant.pesoG && variant.pesoG > 0))) {
    throw new Error('Informe o peso em gramas de cada variante desta receita.')
  }
  if (receita.rendimento_unidade === 'ml' && p.variantes.some((variant) => !(variant.volumeMl && variant.volumeMl > 0))) {
    throw new Error('Informe o volume em mililitros de cada variante desta receita.')
  }
  if (receita.rendimento_unidade === 'un' && p.variantes.some((variant) => !Number.isInteger(variant.unidades))) {
    throw new Error('A quantidade por pacote precisa ser um número inteiro.')
  }
  const id = p.id ?? novoId()
  const t = agora()
  await db.transaction(async () => {
    if (p.id) {
      const [existente] = await db.query<{ id: string; receita_id: string }>('SELECT id, receita_id FROM produto WHERE id=? AND deleted_at IS NULL', [id])
      if (existente && existente.receita_id !== p.receitaId) throw new Error('O tipo/receita do produto não pode ser alterado durante a edição.')
      if (!existente) throw new Error('O produto que você está editando não foi encontrado.')
      await db.run('UPDATE produto SET nome=?, receita_id=?, updated_at=? WHERE id=? AND deleted_at IS NULL', [nome, p.receitaId, t, id])
    } else {
      await db.run('INSERT INTO produto (id, nome, receita_id, created_at, updated_at) VALUES (?,?,?,?,?)', [id, nome, p.receitaId, t, t])
    }
    const idsAtuais: string[] = []
    for (const variant of p.variantes) {
      const variantId = variant.id ?? novoId()
      idsAtuais.push(variantId)
      if (variant.id) {
        await db.run(
          `UPDATE produto_variante SET nome=?, peso_g=?, volume_ml=?, embalagem_insumo_id=?, rotulo_insumo_id=?, preco_cents=?, updated_at=?
           WHERE id=? AND produto_id=? AND deleted_at IS NULL`,
          [capitalizarNome(variant.nome), variant.pesoG ?? null, variant.volumeMl ?? null, variant.embalagemInsumoId ?? null,
            variant.rotuloInsumoId ?? null, variant.precoCents, t, variantId, id],
        )
      } else {
        await db.run(
          `INSERT INTO produto_variante (id, produto_id, nome, peso_g, volume_ml, unidades_por_pacote, embalagem_insumo_id, rotulo_insumo_id, preco_cents, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [variantId, id, capitalizarNome(variant.nome), variant.pesoG ?? null, variant.volumeMl ?? null, variant.unidades,
            variant.embalagemInsumoId ?? null, variant.rotuloInsumoId ?? null, variant.precoCents, t, t],
        )
      }
    }
    if (p.id) {
      const atualizadas = idsAtuais.length
        ? `AND id NOT IN (${idsAtuais.map(() => '?').join(',')})`
        : ''
      await db.run(
        `UPDATE produto_variante SET deleted_at=?, updated_at=? WHERE produto_id=? AND deleted_at IS NULL ${atualizadas}`,
        [t, t, id, ...idsAtuais],
      )
    }
  })
  return id
}

export const excluirProduto = (db: Db, id: string) =>
  db.transaction(async () => {
    const t = agora()
    const variantes = await db.query<{ id: string }>(
      'SELECT id FROM produto_variante WHERE produto_id=? AND deleted_at IS NULL', [id],
    )
    await db.run('UPDATE produto_variante SET deleted_at=?, updated_at=? WHERE produto_id=? AND deleted_at IS NULL', [t, t, id])
    for (const variante of variantes) {
      await db.run(
        'UPDATE movimento_estoque SET deleted_at=?, updated_at=? WHERE item_tipo=? AND item_id=? AND deleted_at IS NULL',
        [t, t, 'variante', variante.id],
      )
    }
    await db.run('UPDATE produto SET deleted_at=?, updated_at=? WHERE id=?', [t, t, id])
  })

export async function registrarVenda(
  db: Db,
  v: {
    forma: string
    clienteId?: string | null
    encomendaId?: string | null
    descontoCents?: number
    motivoEstoqueNegativo?: string
    itens: { varianteId: string; quantidade: number; precoCents: number; custoCents: number }[]
  },
  antesDeConfirmar?: (vendaId: string, data: string) => Promise<void>,
): Promise<string> {
  const discount = v.descontoCents ?? 0
  if (!v.itens.length || v.itens.some((i) => !(i.quantidade > 0) || i.precoCents < 0 || i.custoCents < 0)
    || !Number.isInteger(discount) || discount < 0) {
    throw new Error('Adicione itens válidos à venda')
  }
  const id = novoId()
  const t = agora()
  const subtotal = v.itens.reduce((s, i) => s + i.quantidade * i.precoCents, 0)
  if (discount > subtotal) throw new Error('O desconto não pode ser maior que o subtotal da venda.')
  const total = subtotal - discount
  const pagamentoPendente = false
  const reason = v.motivoEstoqueNegativo?.trim() ?? ''
  const [configTax] = await db.query<{ valor: string }>('SELECT valor FROM config WHERE chave=?', [
    v.forma === 'cartao' ? 'taxa_cartao' : v.forma === 'pix' ? 'taxa_pix' : 'taxa_dinheiro',
  ])
  const taxaPercentual = Math.max(0, Number(configTax?.valor ?? 0))
  await db.transaction(async () => {
    if (v.encomendaId) {
      const [existing] = await db.query<{ total: number }>(
        'SELECT COUNT(*) AS total FROM venda WHERE encomenda_id=? AND deleted_at IS NULL', [v.encomendaId],
      )
      if (Number(existing?.total ?? 0) > 0) throw new Error('Esta encomenda já possui uma venda registrada.')
    }
    await db.run(
      `INSERT INTO venda (id, cliente_id, encomenda_id, data, desconto_cents, total_cents, forma_pagamento, status_pagamento, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, v.clienteId ?? null, v.encomendaId ?? null, t, discount, total, v.forma, pagamentoPendente ? 'pendente' : 'pago', t, t],
    )
    for (const i of v.itens) {
      const [variant] = await db.query<{ estoque_atual: number }>(
        'SELECT estoque_atual FROM produto_variante WHERE id=? AND deleted_at IS NULL', [i.varianteId],
      )
      if (!variant) throw new Error('Uma variante desta venda não foi encontrada.')
      const stock = Number(variant.estoque_atual ?? 0)
      if (i.quantidade > stock && !reason) {
        throw new Error(`Estoque insuficiente para uma variante da venda (${stock} disponível). Informe o motivo para confirmar saldo negativo.`)
      }
      await db.run(
        `INSERT INTO venda_item (id, venda_id, variante_id, lote_id, quantidade, preco_unit_cents, custo_unit_cents, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [novoId(), id, i.varianteId, null, i.quantidade, i.precoCents, i.custoCents, t, t],
      )
      await db.run(
        `INSERT INTO movimento_estoque (id, item_tipo, item_id, tipo, quantidade, custo_unit, origem_id, data, motivo, created_at, updated_at, sequencia)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [novoId(), 'variante', i.varianteId, 'venda', -i.quantidade, i.custoCents, null, t, reason || null, t, t, await proximaSequenciaMovimento(db)],
      )
      await db.run('UPDATE produto_variante SET estoque_atual=?, updated_at=? WHERE id=?', [stock - i.quantidade, t, i.varianteId])
    }
    if (total > 0) {
      await db.run(
        `INSERT INTO lancamento
         (id, tipo, categoria, valor_cents, data, vencimento, pago, negocio, origem_tipo, origem_id, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [novoId(), 'receita', 'Venda', total, t, t,
          pagamentoPendente ? 0 : 1, 1, 'venda', id, t, t],
      )
    }
    if (taxaPercentual > 0 && ['pix', 'cartao'].includes(v.forma)) {
      await db.run(
        `INSERT INTO lancamento
         (id, tipo, categoria, valor_cents, data, vencimento, pago, negocio, origem_tipo, origem_id, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [novoId(), 'despesa', 'Taxa de pagamento', Math.round(total * taxaPercentual / 100), t, t, 1, 1, 'venda', id, t, t],
      )
    }
    await antesDeConfirmar?.(id, t)
  })
  return id
}

export async function buscarVenda(db: Db, id: string) {
  const [venda] = await db.query<{
    total_cents: number; desconto_cents: number; forma_pagamento: string; status_pagamento: string
    data: string; cliente_nome: string | null
  }>(
    `SELECT v.total_cents, v.desconto_cents, v.forma_pagamento, v.status_pagamento, v.data, c.nome AS cliente_nome
     FROM venda v LEFT JOIN cliente c ON c.id=v.cliente_id WHERE v.id = ?`, [id],
  )
  const itens = await db.query<{ nome: string; quantidade: number; preco_unit_cents: number; custo_unit_cents: number }>(
    `SELECT p.nome || ' ' || pv.nome AS nome, i.quantidade, i.preco_unit_cents, i.custo_unit_cents
     FROM venda_item i JOIN produto_variante pv ON pv.id = i.variante_id JOIN produto p ON p.id = pv.produto_id
     WHERE i.venda_id = ?`, [id],
  )
  return { venda, itens }
}
