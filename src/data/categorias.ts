import type { Db } from './db'

export interface CategoriaFinanceira {
  id: string
  nome: string
  cor: string
}

const agora = () => new Date().toISOString()
const validarNome = (nome: string) => {
  const limpo = nome.trim()
  if (limpo.length < 2 || limpo.length > 60 || !/^[\p{L}\s]+$/u.test(limpo)) {
    throw new Error('O nome da categoria deve ter de 2 a 60 letras e espaços, sem caracteres especiais.')
  }
  return limpo.replace(/\s+/g, ' ')
}

export function corCategoriaValida(cor: string): boolean {
  if (!/^#[\da-f]{6}$/i.test(cor)) return false
  const canais = [1, 3, 5].map((offset) => Number.parseInt(cor.slice(offset, offset + 2), 16) / 255)
  const linear = canais.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  const luminancia = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
  return luminancia <= 0.55
}

export async function listarCategoriasFinanceiras(db: Db): Promise<CategoriaFinanceira[]> {
  const categorias = await db.query<CategoriaFinanceira>(
    'SELECT id, nome, cor FROM categoria_financeira WHERE deleted_at IS NULL',
  )
  return categorias.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
}

export async function salvarCategoriaFinanceira(
  db: Db,
  input: { id?: string; nome: string; cor: string },
): Promise<string> {
  const nome = validarNome(input.nome)
  if (!corCategoriaValida(input.cor)) throw new Error('Escolha uma cor escura o suficiente para garantir contraste.')
  const [duplicada] = await db.query<{ id: string }>(
    'SELECT id FROM categoria_financeira WHERE lower(nome)=lower(?) AND deleted_at IS NULL AND id<>?',
    [nome, input.id ?? ''],
  )
  if (duplicada) throw new Error('Já existe uma categoria com esse nome.')

  const timestamp = agora()
  if (input.id) {
    const [existente] = await db.query<{ id: string; nome: string }>(
      'SELECT id, nome FROM categoria_financeira WHERE id=? AND deleted_at IS NULL',
      [input.id],
    )
    if (!existente) throw new Error('A categoria que você tentou editar não foi encontrada.')
    await db.transaction(async () => {
      if (existente.nome !== nome) {
        await db.run('UPDATE lancamento SET categoria=?, updated_at=? WHERE categoria=?', [nome, timestamp, existente.nome])
      }
      await db.run(
        'UPDATE categoria_financeira SET nome=?, cor=?, updated_at=? WHERE id=? AND deleted_at IS NULL',
        [nome, input.cor, timestamp, input.id],
      )
    })
    return input.id
  }

  const id = crypto.randomUUID()
  await db.run(
    'INSERT INTO categoria_financeira (id, nome, cor, created_at, updated_at) VALUES (?,?,?,?,?)',
    [id, nome, input.cor, timestamp, timestamp],
  )
  return id
}

export async function excluirCategoriaFinanceira(db: Db, id: string): Promise<void> {
  const timestamp = agora()
  const [existente] = await db.query<{ id: string; nome: string }>(
    'SELECT id, nome FROM categoria_financeira WHERE id=? AND deleted_at IS NULL',
    [id],
  )
  if (!existente) throw new Error('A categoria que você tentou excluir não foi encontrada.')
  await db.transaction(async () => {
    await db.run(
      'UPDATE lancamento SET categoria=?, updated_at=? WHERE categoria=?',
      ['Categoria excluída', timestamp, existente.nome],
    )
    await db.run('UPDATE categoria_financeira SET deleted_at=?, updated_at=? WHERE id=?', [timestamp, timestamp, id])
  })
}
