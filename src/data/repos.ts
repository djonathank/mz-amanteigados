import { baseOf, costPerBase, toBase, type BaseUnit, type Unit } from '../domain/units'
import { weightedAverageCost } from '../domain/cost'
import type { Db } from './db'

const agora = () => new Date().toISOString()
export const novoId = () => crypto.randomUUID()

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
}

export const listarInsumos = (db: Db) =>
  db.query<InsumoRow>(
    'SELECT id, nome, tipo, unidade_base, unidade_compra, fator_compra, custo_medio, estoque_atual, estoque_minimo FROM insumo WHERE deleted_at IS NULL AND ativo = 1 ORDER BY nome',
  )

export async function salvarInsumo(
  db: Db,
  i: { id?: string; nome: string; unidade: Unit; quantidade?: number; totalCents?: number; tipo?: string },
) {
  if (!i.nome.trim()) throw new Error('Informe um nome válido.')
  const t = agora()
  const atualizandoCusto = i.quantidade !== undefined || i.totalCents !== undefined
  const custoValido = Number.isFinite(i.quantidade) && Number(i.quantidade) > 0
    && Number.isInteger(i.totalCents) && Number(i.totalCents) > 0
  if (atualizandoCusto && !custoValido) {
    throw new Error('Informe quantidade e valor válidos para atualizar o custo.')
  }
  if (i.id) {
    const [atual] = await db.query<{ unidade_base: BaseUnit }>(
      'SELECT unidade_base FROM insumo WHERE id=? AND deleted_at IS NULL', [i.id],
    )
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
      const values = [i.nome.trim(), i.tipo ?? 'ingrediente', baseOf(i.unidade), i.unidade, toBase(1, i.unidade),
        costPerBase(Number(i.totalCents), Number(i.quantidade), i.unidade), t, i.id]
      await db.run(
        'UPDATE insumo SET nome=?, tipo=?, unidade_base=?, unidade_compra=?, fator_compra=?, custo_medio=?, updated_at=? WHERE id=? AND deleted_at IS NULL',
        values,
      )
    } else {
      await db.run('UPDATE insumo SET nome=?, tipo=?, updated_at=? WHERE id=? AND deleted_at IS NULL',
        [i.nome.trim(), i.tipo ?? 'ingrediente', t, i.id])
    }
    return i.id
  }
  if (!custoValido) throw new Error('Informe nome, quantidade e valor válidos.')
  const id = novoId()
  const values = [
    i.nome.trim(), i.tipo ?? 'ingrediente', baseOf(i.unidade), i.unidade, toBase(1, i.unidade),
    costPerBase(Number(i.totalCents), Number(i.quantidade), i.unidade),
  ]
  await db.run(
    'INSERT INTO insumo (id, nome, tipo, unidade_base, unidade_compra, fator_compra, custo_medio, estoque_atual, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [id, ...values, 0, t, t],
  )
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
  await db.run('UPDATE insumo SET deleted_at = ?, ativo = 0, updated_at = ? WHERE id = ?', [agora(), agora(), id])
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
  if (!r.nome.trim() || !(Number.isFinite(r.rendimento) && r.rendimento > 0)
    || !(Number.isFinite(r.perdaPct) && r.perdaPct >= 0 && r.perdaPct < 1)
    || (r.tempoMin != null && !(Number.isFinite(r.tempoMin) && r.tempoMin >= 0))
    || !r.itens.length) {
    throw new Error('Confira nome, rendimento, perda e ao menos um ingrediente')
  }
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
        [r.nome.trim(), r.rendimento, r.rendimentoUnidade ?? 'un', r.perdaPct, r.tempoMin ?? null,
          r.modoPreparo?.trim() || null, JSON.stringify(r.passosPreparo ?? []), t, id],
      )
      // Keep deletion tombstones so the sheet sync does not restore old ingredients.
      await db.run('UPDATE receita_item SET deleted_at=?, updated_at=? WHERE receita_id=? AND deleted_at IS NULL', [t, t, id])
    } else {
      await db.run(
        'INSERT INTO receita (id, nome, rendimento_qtd, rendimento_unidade, perda_pct, tempo_min, modo_preparo, passos_preparo, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [id, r.nome.trim(), r.rendimento, r.rendimentoUnidade ?? 'un', r.perdaPct, r.tempoMin ?? null,
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
    if (!(Number.isFinite(gas) && gas >= 0)) throw new Error('O custo de gás precisa ser um valor válido.')
    config.gas_lote_cents = String(Math.round(gas * 100))
  }
  if (c.hora_trabalho !== undefined) {
    const hora = Number(c.hora_trabalho)
    if (!(Number.isFinite(hora) && hora >= 0)) throw new Error('O valor da hora precisa ser válido.')
    config.valor_hora_cents = String(Math.round(hora * 100))
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

export async function registrarCompra(
  db: Db,
  c: {
    insumoId: string; unidade: Unit; quantidade: number; totalCents: number; forma?: string
    fornecedorId?: string | null; pago?: boolean
  },
) {
  if (!(c.quantidade > 0) || !(c.totalCents > 0)) throw new Error('Quantidade e total da compra devem ser maiores que zero')
  const id = novoId()
  const t = agora()
  const quantidadeBase = toBase(c.quantidade, c.unidade)
  const custo = costPerBase(c.totalCents, c.quantidade, c.unidade)
  await db.transaction(async () => {
    const [insumo] = await db.query<{ unidade_base: BaseUnit; estoque_atual: number; custo_medio: number }>(
      'SELECT unidade_base, estoque_atual, custo_medio FROM insumo WHERE id=? AND deleted_at IS NULL', [c.insumoId],
    )
    if (!insumo) throw new Error('O insumo da compra não foi encontrado ou foi excluído.')
    if (insumo.unidade_base !== baseOf(c.unidade)) {
      throw new Error(`A unidade da compra não corresponde à unidade base do insumo (${insumo.unidade_base}).`)
    }
    await db.run(
      'INSERT INTO compra (id, fornecedor_id, data, total_cents, pago, forma_pagamento, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
      [id, c.fornecedorId ?? null, t, c.totalCents, c.pago === false ? 0 : 1, c.forma ?? 'pix', t, t],
    )
    await db.run(
      'INSERT INTO compra_item (id, compra_id, insumo_id, quantidade_base, total_cents, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
      [novoId(), id, c.insumoId, quantidadeBase, c.totalCents, t, t],
    )
    await db.run(
      'INSERT INTO historico_preco_insumo (id, insumo_id, data, custo_por_base, created_at, updated_at) VALUES (?,?,?,?,?,?)',
      [novoId(), c.insumoId, t, custo, t, t],
    )
    const oldStock = Number(insumo.estoque_atual ?? 0)
    const newStock = oldStock + quantidadeBase
    const average = weightedAverageCost(oldStock, Number(insumo.custo_medio ?? 0), quantidadeBase, c.totalCents)
    await db.run('UPDATE insumo SET custo_medio=?, estoque_atual=?, updated_at=? WHERE id=? AND deleted_at IS NULL',
      [average, newStock, t, c.insumoId])
    await db.run(
      `INSERT INTO movimento_estoque (id, item_tipo, item_id, tipo, quantidade, custo_unit, origem_id, data, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [novoId(), 'insumo', c.insumoId, 'compra', quantidadeBase, custo, id, t, t, t],
    )
    if (c.pago === false) {
      await db.run(
        `INSERT INTO lancamento
         (id, tipo, categoria, valor_cents, data, vencimento, pago, negocio, origem_tipo, origem_id, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [novoId(), 'despesa', 'Compra de insumo', c.totalCents, t, t, 0, 1, 'compra', id, t, t],
      )
    } else {
      await db.run(
        `INSERT INTO lancamento
         (id, tipo, categoria, valor_cents, data, vencimento, pago, negocio, origem_tipo, origem_id, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [novoId(), 'despesa', 'Compra de insumo', c.totalCents, t, t, 1, 1, 'compra', id, t, t],
      )
    }
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
      const [existente] = await db.query<{ id: string }>('SELECT id FROM produto WHERE id=? AND deleted_at IS NULL', [id])
      if (!existente) throw new Error('O produto que você está editando não foi encontrado.')
      await db.run('UPDATE produto SET nome=?, receita_id=?, updated_at=? WHERE id=? AND deleted_at IS NULL', [p.nome.trim(), p.receitaId, t, id])
    } else {
      await db.run('INSERT INTO produto (id, nome, receita_id, created_at, updated_at) VALUES (?,?,?,?,?)', [id, p.nome.trim(), p.receitaId, t, t])
    }
    const idsAtuais: string[] = []
    for (const variant of p.variantes) {
      const variantId = variant.id ?? novoId()
      idsAtuais.push(variantId)
      if (variant.id) {
        await db.run(
          `UPDATE produto_variante SET nome=?, peso_g=?, volume_ml=?, unidades_por_pacote=?, embalagem_insumo_id=?, rotulo_insumo_id=?, preco_cents=?, updated_at=?
           WHERE id=? AND produto_id=? AND deleted_at IS NULL`,
          [variant.nome.trim(), variant.pesoG ?? null, variant.volumeMl ?? null, variant.unidades, variant.embalagemInsumoId ?? null,
            variant.rotuloInsumoId ?? null, variant.precoCents, t, variantId, id],
        )
      } else {
        await db.run(
          `INSERT INTO produto_variante (id, produto_id, nome, peso_g, volume_ml, unidades_por_pacote, embalagem_insumo_id, rotulo_insumo_id, preco_cents, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [variantId, id, variant.nome.trim(), variant.pesoG ?? null, variant.volumeMl ?? null, variant.unidades,
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
    await db.run('UPDATE produto_variante SET deleted_at=?, updated_at=? WHERE produto_id=? AND deleted_at IS NULL', [t, t, id])
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
        `INSERT INTO movimento_estoque (id, item_tipo, item_id, tipo, quantidade, custo_unit, origem_id, data, motivo, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [novoId(), 'variante', i.varianteId, 'venda', -i.quantidade, i.custoCents, null, t, reason || null, t, t],
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
