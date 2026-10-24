import type { Db } from './db'
import { novoId } from './repos'

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
    await db.run(
      `INSERT INTO movimento_estoque
       (id, item_tipo, item_id, tipo, quantidade, origem_id, data, motivo, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [novoId(), item.tipo, item.id, operacao, item.quantidade, null, t, item.motivo.trim() || null, t, t],
    )
  })
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
