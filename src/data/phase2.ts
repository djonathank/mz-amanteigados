import { custoDaVariante, carregarBase } from './calculos'
import type { Db } from './db'
import { novoId } from './repos'

const agora = () => new Date().toISOString()

interface RecipeRow {
  id: string
  nome: string
  rendimento_qtd: number
  rendimento_unidade: string
  perda_pct: number
}

interface RecipeItemRow {
  insumo_id: string | null
  subreceita_id: string | null
  quantidade_base: number
}

export interface StockRow {
  id: string
  nome: string
  tipo: string
  unidade_base: string
  estoque_atual: number
  estoque_minimo: number
  custo_medio: number
}

export interface BatchRow {
  id: string
  codigo: string
  receita_nome: string
  data_fabricacao: string
  data_validade: string | null
  variante_nome: string
  produto_nome: string
  quantidade: number
  saldo: number
  custo_unit_cents: number
}

export interface ProducaoInput {
  receitaId: string
  quantidadePrevista: number
  dataFabricacao: string
  dataValidade?: string
  saidas: { varianteId: string; quantidade: number }[]
  motivoEstoqueNegativo?: string
}

export async function listarSaldos(db: Db): Promise<StockRow[]> {
  return db.query<StockRow>(
    `SELECT id, nome, tipo, unidade_base, estoque_atual, estoque_minimo, custo_medio
     FROM insumo WHERE deleted_at IS NULL AND ativo=1 ORDER BY nome`,
  )
}

export async function definirEstoqueMinimoInsumo(db: Db, id: string, minimo: number) {
  if (!Number.isFinite(minimo) || minimo < 0) throw new Error('O estoque mínimo precisa ser zero ou maior.')
  await db.run('UPDATE insumo SET estoque_minimo=?, updated_at=? WHERE id=? AND deleted_at IS NULL', [minimo, agora(), id])
}

export async function definirEstoqueMinimoVariante(db: Db, id: string, minimo: number) {
  if (!Number.isFinite(minimo) || minimo < 0) throw new Error('O estoque mínimo precisa ser zero ou maior.')
  await db.run('UPDATE produto_variante SET estoque_minimo=?, updated_at=? WHERE id=? AND deleted_at IS NULL', [minimo, agora(), id])
}

export async function ajustarEstoque(
  db: Db,
  item: {
    tipo: 'insumo' | 'variante'; id: string; quantidade: number; motivo: string
    operacao?: 'ajuste' | 'perda'
  },
) {
  if (!Number.isFinite(item.quantidade) || item.quantidade === 0) throw new Error('Informe uma quantidade de ajuste diferente de zero.')
  const operacao = item.operacao ?? 'ajuste'
  if (operacao === 'perda' && (item.quantidade > 0 || !item.motivo.trim())) {
    throw new Error('Informe uma quantidade negativa e o motivo da perda.')
  }
  const table = item.tipo === 'insumo' ? 'insumo' : 'produto_variante'
  const label = item.tipo === 'insumo' ? 'insumo' : 'produto'
  const t = agora()
  await db.transaction(async () => {
    const [row] = await db.query<{ estoque_atual: number }>(
      `SELECT estoque_atual FROM ${table} WHERE id=? AND deleted_at IS NULL`, [item.id],
    )
    if (!row) throw new Error(`O ${label} selecionado não foi encontrado.`)
    const balance = Number(row.estoque_atual) + item.quantidade
    if (balance < 0 && !item.motivo.trim()) throw new Error('Informe o motivo para permitir saldo negativo.')
    await db.run(`UPDATE ${table} SET estoque_atual=?, updated_at=? WHERE id=?`, [balance, t, item.id])
    let remaining = item.quantidade
    if (item.tipo === 'variante' && item.quantidade < 0) {
      const lots = await db.query<{ id: string; saldo: number }>(
        `SELECT l.id, SUM(m.quantidade) AS saldo FROM lote l
         JOIN movimento_estoque m ON m.origem_id=l.id AND m.item_tipo='variante' AND m.item_id=?
         WHERE l.deleted_at IS NULL AND m.deleted_at IS NULL
         GROUP BY l.id HAVING saldo>0
         ORDER BY CASE WHEN l.data_validade IS NULL THEN 1 ELSE 0 END, l.data_validade, l.data_fabricacao`,
        [item.id],
      )
      for (const lot of lots) {
        if (remaining === 0) break
        const quantity = Math.min(-remaining, Number(lot.saldo))
        if (quantity > 0) {
              await inserirMovimentoAjuste(db, item, -quantity, lot.id, t, operacao)
          remaining += quantity
        }
      }
    }
    if (remaining !== 0) await inserirMovimentoAjuste(db, item, remaining, null, t, operacao)
  })
}

async function inserirMovimentoAjuste(
  db: Db,
  item: { tipo: 'insumo' | 'variante'; id: string; motivo: string },
  quantidade: number,
  origemId: string | null,
  t: string,
  operacao: 'ajuste' | 'perda',
) {
  await db.run(
    `INSERT INTO movimento_estoque
     (id, item_tipo, item_id, tipo, quantidade, origem_id, data, motivo, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [novoId(), item.tipo, item.id, operacao, quantidade, origemId, t, item.motivo.trim() || null, t, t],
  )
}

async function carregarReceita(db: Db, id: string): Promise<RecipeRow> {
  const [recipe] = await db.query<RecipeRow>(
    'SELECT id, nome, rendimento_qtd, rendimento_unidade, perda_pct FROM receita WHERE id=? AND deleted_at IS NULL', [id],
  )
  if (!recipe) throw new Error('A receita selecionada não foi encontrada.')
  if (!(recipe.rendimento_qtd > 0) || !(recipe.perda_pct >= 0 && recipe.perda_pct < 1)) {
    throw new Error(`Rendimento ou perda inválidos na receita "${recipe.nome}".`)
  }
  return recipe
}

export async function calcularNecessidadesInsumos(db: Db, receitaId: string, quantidadeUtil: number) {
  if (!(Number.isFinite(quantidadeUtil) && quantidadeUtil > 0)) throw new Error('A quantidade a produzir precisa ser maior que zero.')
  const totals = new Map<string, number>()
  const walk = async (id: string, targetUsefulAmount: number, stack: Set<string>): Promise<void> => {
    if (stack.has(id)) throw new Error('Foi detectado um ciclo entre as sub-receitas.')
    const recipe = await carregarReceita(db, id)
    const scale = targetUsefulAmount / (recipe.rendimento_qtd * (1 - recipe.perda_pct))
    const items = await db.query<RecipeItemRow>(
      'SELECT insumo_id, subreceita_id, quantidade_base FROM receita_item WHERE receita_id=? AND deleted_at IS NULL', [id],
    )
    if (!items.length) throw new Error(`A receita "${recipe.nome}" não possui ingredientes.`)
    const next = new Set(stack).add(id)
    for (const item of items) {
      const amount = Number(item.quantidade_base) * scale
      if (!(amount > 0)) throw new Error(`Quantidade inválida na receita "${recipe.nome}".`)
      if (item.insumo_id) totals.set(item.insumo_id, (totals.get(item.insumo_id) ?? 0) + amount)
      else if (item.subreceita_id) {
        const child = await carregarReceita(db, item.subreceita_id)
        if (child.rendimento_unidade !== recipe.rendimento_unidade) {
          throw new Error(`A sub-receita "${child.nome}" usa uma unidade diferente de "${recipe.nome}".`)
        }
        await walk(item.subreceita_id, amount, next)
      }
      else throw new Error(`A receita "${recipe.nome}" possui um ingrediente incompleto.`)
    }
  }
  await walk(receitaId, quantidadeUtil, new Set())
  const ids = [...totals.keys()]
  if (!ids.length) throw new Error('A receita não possui insumos calculáveis.')
  const rows = await db.query<{
    id: string; nome: string; unidade_base: string; estoque_atual: number; quantidade: number
  }>(
    `SELECT id, nome, unidade_base, estoque_atual FROM insumo WHERE deleted_at IS NULL AND id IN (${ids.map(() => '?').join(',')})`,
    ids,
  )
  if (rows.length !== ids.length) throw new Error('Um ou mais insumos da receita foram removidos.')
  return rows.map((row) => ({ ...row, quantidade: totals.get(row.id) ?? 0 }))
}

function conteudoVariante(
  variant: { peso_g: number | null; volume_ml: number | null; unidades_por_pacote: number },
  unidade: string,
): number {
  const amount = unidade === 'ml' ? variant.volume_ml : unidade === 'g' ? variant.peso_g : variant.unidades_por_pacote
  if (!(amount != null && Number.isFinite(amount) && amount > 0)) {
    throw new Error(`A variante precisa informar seu conteúdo em ${unidade}.`)
  }
  return amount
}

export async function registrarProducao(db: Db, input: ProducaoInput): Promise<string> {
  if (!(input.quantidadePrevista > 0) || !input.saidas.length
    || input.saidas.some((saida) => !Number.isInteger(saida.quantidade) || saida.quantidade < 1)
    || new Set(input.saidas.map((saida) => saida.varianteId)).size !== input.saidas.length) {
    throw new Error('Informe a quantidade prevista e ao menos uma saída de produção válida.')
  }
  const recipe = await carregarReceita(db, input.receitaId)
  if (input.dataValidade && input.dataValidade < input.dataFabricacao) {
    throw new Error('A validade não pode ser anterior à fabricação.')
  }
  const base = await carregarBase(db)
  const outputRows = await db.query<{
    id: string; produto_nome: string; receita_id: string; nome: string; peso_g: number | null
    volume_ml: number | null; unidades_por_pacote: number; embalagem_insumo_id: string | null; rotulo_insumo_id: string | null
  }>(
    `SELECT v.id, p.nome AS produto_nome, p.receita_id, v.nome, v.peso_g, v.volume_ml, v.unidades_por_pacote,
            v.embalagem_insumo_id, v.rotulo_insumo_id
     FROM produto_variante v JOIN produto p ON p.id=v.produto_id
     WHERE v.id IN (${input.saidas.map(() => '?').join(',')}) AND v.deleted_at IS NULL AND p.deleted_at IS NULL`,
    input.saidas.map((saida) => saida.varianteId),
  )
  if (outputRows.length !== input.saidas.length) throw new Error('Uma ou mais variantes selecionadas não existem.')
  if (outputRows.some((row) => row.receita_id !== recipe.id)) throw new Error('Todas as variantes produzidas devem pertencer a produtos desta receita.')
  const outputMap = new Map(outputRows.map((row) => [row.id, row]))
  const contentTotal = input.saidas.reduce((sum, output) => {
    const row = outputMap.get(output.varianteId)
    if (!row) throw new Error('Variante de produção não encontrada.')
    return sum + conteudoVariante(row, recipe.rendimento_unidade) * output.quantidade
  }, 0)
  const materials = await calcularNecessidadesInsumos(db, recipe.id, contentTotal)
  const packagingNeeds = new Map<string, number>()
  for (const output of input.saidas) {
    const row = outputMap.get(output.varianteId)!
    for (const packageId of [row.embalagem_insumo_id, row.rotulo_insumo_id]) {
      if (packageId) packagingNeeds.set(packageId, (packagingNeeds.get(packageId) ?? 0) + output.quantidade)
    }
  }
  const packagingRows = packagingNeeds.size
    ? await db.query<{ id: string; nome: string; estoque_atual: number; deleted_at: string | null }>(
      `SELECT id, nome, estoque_atual, deleted_at FROM insumo WHERE id IN (${[...packagingNeeds.keys()].map(() => '?').join(',')})`,
      [...packagingNeeds.keys()],
    )
    : []
  if (packagingRows.length !== packagingNeeds.size || packagingRows.some((row) => row.deleted_at)) {
    throw new Error('Um insumo de embalagem ou rótulo foi removido.')
  }
  const needsByIngredient = new Map<string, { id: string; nome: string; amount: number; stock: number }>()
  for (const material of materials) {
    needsByIngredient.set(material.id, {
      id: material.id, nome: material.nome, amount: material.quantidade, stock: Number(material.estoque_atual),
    })
  }
  for (const packageItem of packagingRows) {
    const current = needsByIngredient.get(packageItem.id)
    needsByIngredient.set(packageItem.id, {
      id: packageItem.id,
      nome: packageItem.nome,
      amount: (current?.amount ?? 0) + (packagingNeeds.get(packageItem.id) ?? 0),
      stock: Number(packageItem.estoque_atual),
    })
  }
  const required = [...needsByIngredient.values()]
  const reason = input.motivoEstoqueNegativo?.trim() ?? ''
  const lowItems = required.filter((item) => item.stock < item.amount).map((item) => item.nome)
  if (lowItems.length && !reason) {
    throw new Error(`Estoque insuficiente para: ${[...new Set(lowItems)].join(', ')}. Informe o motivo para confirmar saldo negativo.`)
  }
  const variants = new Map(base.variantes.map((variant) => [variant.id, variant]))
  const t = agora()
  const lotId = novoId()
  const code = `LOT-${t.slice(0, 10).replaceAll('-', '')}-${lotId.slice(0, 6).toUpperCase()}`
  const lotCost = input.saidas.reduce((sum, output) => {
    const variant = variants.get(output.varianteId)
    if (!variant) throw new Error('Não foi possível calcular o custo de uma variante produzida.')
    return sum + custoDaVariante(variant, base) * output.quantidade
  }, 0)
  await db.transaction(async () => {
    await db.run(
      `INSERT INTO lote (id, codigo, receita_id, data_fabricacao, data_validade, qtd_prevista, qtd_real, custo_total_cents, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [lotId, code, recipe.id, input.dataFabricacao, input.dataValidade || null, input.quantidadePrevista, contentTotal, Math.round(lotCost), t, t],
    )
    for (const item of required) {
      const [stock] = await db.query<{ estoque_atual: number; custo_medio: number }>(
        'SELECT estoque_atual, custo_medio FROM insumo WHERE id=? AND deleted_at IS NULL', [item.id],
      )
      if (!stock) throw new Error(`O insumo "${item.nome}" foi removido.`)
      const newStock = Number(stock.estoque_atual) - item.amount
      if (newStock < 0 && !reason) {
        throw new Error(`Estoque insuficiente para "${item.nome}". Informe o motivo para confirmar saldo negativo.`)
      }
      await db.run('UPDATE insumo SET estoque_atual=?, updated_at=? WHERE id=?', [newStock, t, item.id])
      await db.run(
        `INSERT INTO movimento_estoque (id, item_tipo, item_id, tipo, quantidade, custo_unit, origem_id, data, motivo, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [novoId(), 'insumo', item.id, 'producao', -item.amount, stock.custo_medio, lotId, t, reason || null, t, t],
      )
    }
    for (const output of input.saidas) {
      const variant = variants.get(output.varianteId)!
      const unitCost = custoDaVariante(variant, base)
      await db.run(
        'INSERT INTO lote_saida (id, lote_id, variante_id, quantidade_pacotes, created_at, updated_at) VALUES (?,?,?,?,?,?)',
        [novoId(), lotId, output.varianteId, output.quantidade, t, t],
      )
      const [stock] = await db.query<{ estoque_atual: number }>('SELECT estoque_atual FROM produto_variante WHERE id=?', [output.varianteId])
      await db.run('UPDATE produto_variante SET estoque_atual=?, updated_at=? WHERE id=?', [Number(stock?.estoque_atual ?? 0) + output.quantidade, t, output.varianteId])
      await db.run(
        `INSERT INTO movimento_estoque (id, item_tipo, item_id, tipo, quantidade, custo_unit, origem_id, data, motivo, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [novoId(), 'variante', output.varianteId, 'producao', output.quantidade, unitCost, lotId, t, null, t, t],
      )
    }
  })
  return lotId
}

export async function listarLotes(db: Db): Promise<BatchRow[]> {
  return db.query<BatchRow>(
    `SELECT l.id, l.codigo, r.nome AS receita_nome, l.data_fabricacao, l.data_validade,
            p.nome AS produto_nome, v.nome AS variante_nome, ls.quantidade_pacotes AS quantidade,
            COALESCE(SUM(m.quantidade), 0) AS saldo,
            COALESCE((SELECT custo_unit FROM movimento_estoque mp
              WHERE mp.item_tipo='variante' AND mp.item_id=v.id AND mp.origem_id=l.id AND mp.tipo='producao'
              ORDER BY mp.data LIMIT 1), 0) AS custo_unit_cents
     FROM lote l JOIN receita r ON r.id=l.receita_id
     JOIN lote_saida ls ON ls.lote_id=l.id JOIN produto_variante v ON v.id=ls.variante_id
     JOIN produto p ON p.id=v.produto_id
     LEFT JOIN movimento_estoque m ON m.item_tipo='variante' AND m.item_id=v.id AND m.origem_id=l.id AND m.deleted_at IS NULL
     WHERE l.deleted_at IS NULL
     GROUP BY l.id, v.id
     HAVING saldo > 0
     ORDER BY CASE WHEN l.data_validade IS NULL THEN 1 ELSE 0 END, l.data_validade, l.data_fabricacao`,
  )
}

export async function listarMovimentos(db: Db, itemTipo?: string, itemId?: string) {
  const filters: string[] = ['m.deleted_at IS NULL']
  const params: unknown[] = []
  if (itemTipo) { filters.push('m.item_tipo=?'); params.push(itemTipo) }
  if (itemId) { filters.push('m.item_id=?'); params.push(itemId) }
  return db.query<{
    id: string; item_tipo: string; item_id: string; item_nome: string; tipo: string
    quantidade: number; custo_unit: number | null; data: string; motivo: string | null
  }>(
    `SELECT m.id, m.item_tipo, m.item_id, COALESCE(i.nome, p.nome || ' · ' || v.nome) AS item_nome,
            m.tipo, m.quantidade, m.custo_unit, m.data, m.motivo
     FROM movimento_estoque m
     LEFT JOIN insumo i ON m.item_tipo='insumo' AND i.id=m.item_id
     LEFT JOIN produto_variante v ON m.item_tipo='variante' AND v.id=m.item_id
     LEFT JOIN produto p ON p.id=v.produto_id
     WHERE ${filters.join(' AND ')} ORDER BY m.data DESC LIMIT 250`,
    params,
  )
}

export async function listarAlertasEstoque(db: Db) {
  const [insumos, variantes] = await Promise.all([
    db.query<{ id: string; nome: string; saldo: number; minimo: number; unidade: string }>(
      `SELECT id, nome, estoque_atual AS saldo, estoque_minimo AS minimo, unidade_base AS unidade
       FROM insumo WHERE deleted_at IS NULL AND ativo=1 AND estoque_atual<=estoque_minimo ORDER BY nome`,
    ),
    db.query<{ id: string; nome: string; saldo: number; minimo: number; unidade: string }>(
      `SELECT v.id, p.nome || ' · ' || v.nome AS nome, v.estoque_atual AS saldo, v.estoque_minimo AS minimo, 'pacotes' AS unidade
       FROM produto_variante v JOIN produto p ON p.id=v.produto_id
       WHERE v.deleted_at IS NULL AND p.deleted_at IS NULL AND v.estoque_atual<=v.estoque_minimo ORDER BY p.nome, v.nome`,
    ),
  ])
  return [...insumos.map((row) => ({ ...row, tipo: 'insumo' })), ...variantes.map((row) => ({ ...row, tipo: 'variante' }))]
}

export async function listarNecessidadesEncomendas(db: Db) {
  const rows = await db.query<{
    variante_id: string; receita_id: string; receita_nome: string; rendimento_unidade: string
    quantidade: number; estoque_atual: number; peso_g: number | null; volume_ml: number | null; unidades_por_pacote: number
  }>(
    `SELECT v.id AS variante_id, p.receita_id, r.nome AS receita_nome, r.rendimento_unidade,
            SUM(ei.quantidade) AS quantidade, v.estoque_atual, v.peso_g, v.volume_ml, v.unidades_por_pacote
     FROM encomenda e JOIN encomenda_item ei ON ei.encomenda_id=e.id
     JOIN produto_variante v ON v.id=ei.variante_id JOIN produto p ON p.id=v.produto_id
     JOIN receita r ON r.id=p.receita_id
     WHERE e.deleted_at IS NULL AND ei.deleted_at IS NULL AND v.deleted_at IS NULL AND e.status IN ('pedido','produzindo','pronto')
     GROUP BY v.id`,
  )
  const demand = new Map<string, { nome: string; unit: string; amount: number }>()
  for (const row of rows) {
    const content = conteudoVariante(row, row.rendimento_unidade)
    const current = demand.get(row.receita_id) ?? { nome: row.receita_nome, unit: row.rendimento_unidade, amount: 0 }
    const packagesToProduce = Math.max(0, Number(row.quantidade) - Number(row.estoque_atual))
    current.amount += content * packagesToProduce
    demand.set(row.receita_id, current)
  }
  const shortages: { receita: string; insumo: string; unidade: string; necessario: number; disponivel: number; faltante: number }[] = []
  for (const [recipeId, recipeDemand] of demand) {
    const required = await calcularNecessidadesInsumos(db, recipeId, recipeDemand.amount)
    for (const item of required) {
      const missing = Math.max(0, item.quantidade - Number(item.estoque_atual))
      if (missing > 0) shortages.push({
        receita: recipeDemand.nome, insumo: item.nome, unidade: item.unidade_base,
        necessario: item.quantidade, disponivel: Number(item.estoque_atual), faltante: missing,
      })
    }
  }
  return shortages
}

export function contentForRecipeUnit(row: {
  rendimento_unidade: string; peso_g: number | null; volume_ml: number | null; unidades_por_pacote: number
}) {
  return conteudoVariante(row, row.rendimento_unidade)
}
