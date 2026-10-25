import type { Db } from './db'
import { novoId, proximaSequenciaMovimento } from './repos'

const agora = () => new Date().toISOString()

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
    tipo: 'insumo' | 'variante'; id: string; quantidade: number; motivo?: string
    operacao?: 'ajuste' | 'perda' | 'consumo' | 'inventario'
  },
) {
  if (!Number.isFinite(item.quantidade) || item.quantidade === 0) throw new Error('Informe uma quantidade de ajuste diferente de zero.')
  const operacao = item.operacao ?? 'ajuste'
  if ((operacao === 'perda' || operacao === 'consumo') && item.quantidade > 0) {
    throw new Error(operacao === 'perda'
      ? 'Informe uma quantidade negativa para a perda.'
      : 'Informe uma quantidade negativa para o consumo.')
  }
  const table = item.tipo === 'insumo' ? 'insumo' : 'produto_variante'
  const label = item.tipo === 'insumo' ? 'insumo' : 'produto'
  const t = agora()
  await db.transaction(async () => {
    const [row] = await db.query<{ estoque_atual: number }>(
      `SELECT estoque_atual FROM ${table} WHERE id=? AND deleted_at IS NULL`, [item.id],
    )
    if (!row) throw new Error(`O ${label} selecionado não foi encontrado.`)
    const estoqueAtual = Number(row.estoque_atual ?? 0)
    if (!Number.isFinite(estoqueAtual)) throw new Error('O saldo atual do estoque é inválido.')
    const balance = estoqueAtual + item.quantidade
    if (!Number.isFinite(balance)) throw new Error('O ajuste resultaria em um saldo inválido.')
    if (balance < 0) {
      throw new Error('Saldo insuficiente. Este ajuste deixaria o estoque negativo; reduza a quantidade ou registre uma compra antes de continuar.')
    }
    await db.run(`UPDATE ${table} SET estoque_atual=?, updated_at=? WHERE id=?`, [balance, t, item.id])
    await db.run(
      `INSERT INTO movimento_estoque
       (id, item_tipo, item_id, tipo, quantidade, origem_id, data, motivo, created_at, updated_at, sequencia)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [novoId(), item.tipo, item.id, operacao, item.quantidade, null, t, item.motivo?.trim() || null, t, t, await proximaSequenciaMovimento(db)],
    )
  })
}

export const TAMANHO_PAGINA_MOVIMENTOS = 50

export async function listarMovimentos(
  db: Db,
  itemTipo?: string,
  itemId?: string,
  dataInicial?: string,
  dataFinal?: string,
  busca?: string,
  tipoMovimento?: string,
  offset = 0,
) {
  const filters: string[] = ['m.deleted_at IS NULL']
  const params: unknown[] = []
  if (itemTipo) { filters.push('m.item_tipo=?'); params.push(itemTipo) }
  if (itemId) { filters.push('m.item_id=?'); params.push(itemId) }
  if (dataInicial) { filters.push('m.data>=?'); params.push(dataInicial) }
  if (dataFinal) { filters.push('m.data<=?'); params.push(`${dataFinal}T23:59:59.999Z`) }
  const filtrosExternos: string[] = []
  if (busca?.trim()) {
    filtrosExternos.push("COALESCE(i.nome, p.nome || ' · ' || v.nome, '') LIKE ? COLLATE NOCASE")
    params.push(`%${busca.trim()}%`)
  }
  if (tipoMovimento) { filtrosExternos.push('m.tipo=?'); params.push(tipoMovimento) }
  params.push(TAMANHO_PAGINA_MOVIMENTOS + 1, offset)
  const rows = await db.query<{
    id: string; item_tipo: string; item_id: string; item_nome: string; unidade: string; tipo: string
    quantidade: number; saldo_resultante: number; custo_unit: number | null; data: string; motivo: string | null
  }>(
    `WITH historico AS (
       SELECT m.*,
              SUM(m.quantidade) OVER (
                PARTITION BY m.item_tipo, m.item_id ORDER BY m.data, m.sequencia, m.created_at, m.device_id, m.id
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
              ) AS saldo_resultante
       FROM movimento_estoque m WHERE m.deleted_at IS NULL
     )
     SELECT m.id, m.item_tipo, m.item_id, COALESCE(i.nome, p.nome || ' · ' || v.nome) AS item_nome,
            COALESCE(i.unidade_base, 'pacotes') AS unidade, m.tipo, m.quantidade, m.saldo_resultante,
            m.custo_unit, m.data, m.motivo
     FROM historico m
     LEFT JOIN insumo i ON m.item_tipo='insumo' AND i.id=m.item_id
     LEFT JOIN produto_variante v ON m.item_tipo='variante' AND v.id=m.item_id
     LEFT JOIN produto p ON p.id=v.produto_id
     WHERE ${filters.join(' AND ')}${filtrosExternos.length ? ` AND ${filtrosExternos.join(' AND ')}` : ''}
     ORDER BY m.data DESC, m.sequencia DESC, m.created_at DESC, m.device_id DESC, m.id DESC LIMIT ? OFFSET ?`,
    params,
  )
  return {
    items: rows.slice(0, TAMANHO_PAGINA_MOVIMENTOS),
    hasMore: rows.length > TAMANHO_PAGINA_MOVIMENTOS,
  }
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
