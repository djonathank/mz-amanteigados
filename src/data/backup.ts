import type { Db } from './db'

const TABELAS = [
  'insumo', 'fornecedor', 'cliente', 'receita', 'receita_item', 'produto', 'produto_variante', 'compra', 'compra_item',
  'historico_preco_insumo', 'movimento_estoque', 'lote', 'lote_saida', 'venda', 'venda_item', 'encomenda', 'encomenda_item',
  'lancamento', 'config', 'sync_outbox', 'sync_state', 'sheet_row_map',
] as const // pais antes dos filhos (chaves estrangeiras)
const VERSAO = 1
type BackupTable = typeof TABELAS[number]

export interface BackupValidation {
  valido: boolean
  schemaVersion?: number
  totalRegistros: number
  contagemPorTabela: Partial<Record<BackupTable, number>>
  erros: string[]
}

export async function exportarBackup(db: Db): Promise<string> {
  const dados: Record<string, unknown[]> = {}
  for (const t of TABELAS) dados[t] = await db.query<Record<string, unknown>>(`SELECT * FROM ${t}`)
  return JSON.stringify({ schema_version: VERSAO, exportado_em: new Date().toISOString(), dados })
}

/** Validates and previews a V1 backup without changing database contents. */
export async function validarBackup(db: Db, texto: string): Promise<BackupValidation> {
  const result: BackupValidation = { valido: false, totalRegistros: 0, contagemPorTabela: {}, erros: [] }
  let parsed: any
  try {
    parsed = JSON.parse(texto)
  } catch {
    result.erros.push('O arquivo não contém JSON válido')
    return result
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    result.erros.push('A raiz do backup deve ser um objeto')
    return result
  }
  result.schemaVersion = parsed.schema_version
  if (parsed.schema_version !== VERSAO) result.erros.push('Arquivo de backup inválido ou de outra versão')
  const dados = parsed.dados
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    result.erros.push('A propriedade dados deve ser um objeto')
    return result
  }
  for (const table of Object.keys(dados)) {
    if (!TABELAS.includes(table as BackupTable)) result.erros.push(`Tabela desconhecida no backup: ${table}`)
  }
  for (const table of TABELAS) {
    const rows = dados[table]
    if (rows === undefined) {
      result.contagemPorTabela[table] = 0
      continue
    }
    if (!Array.isArray(rows)) {
      result.erros.push(`A tabela ${table} deve conter uma lista de registros`)
      continue
    }
    result.contagemPorTabela[table] = rows.length
    result.totalRegistros += rows.length
    const columns = await db.query<{ name: string; notnull: number; dflt_value: unknown; pk: number }>(
      `PRAGMA table_info(${table})`,
    )
    const definitions = new Map(columns.map((c) => [c.name, c]))
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index]
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        result.erros.push(`Registro ${index + 1} da tabela ${table} deve ser um objeto`)
        continue
      }
      const keys = Object.keys(row)
      if (keys.length === 0) {
        result.erros.push(`Registro ${index + 1} da tabela ${table} está vazio`)
        continue
      }
      for (const key of keys) {
        if (!definitions.has(key)) result.erros.push(`Coluna desconhecida em ${table}: ${key}`)
        const value = row[key]
        if (value !== null && typeof value === 'object') result.erros.push(`Valor inválido em ${table}.${key}`)
      }
      for (const [name, definition] of definitions) {
        if ((definition.pk > 0 || (definition.notnull > 0 && definition.dflt_value == null))
          && (!Object.prototype.hasOwnProperty.call(row, name) || row[name] == null)) {
          result.erros.push(`Campo obrigatório ausente: ${table}.${name} (registro ${index + 1})`)
        }
      }
    }
  }
  result.valido = result.erros.length === 0
  return result
}

export const previsualizarBackup = validarBackup

/** Substitui todos os dados pelo conteúdo do backup. Devolve quantos registros foram restaurados. */
export async function importarBackup(db: Db, texto: string): Promise<number> {
  const validation = await validarBackup(db, texto)
  if (!validation.valido) throw new Error(validation.erros.join('; '))
  const b = JSON.parse(texto) as { dados: Partial<Record<BackupTable, Record<string, unknown>[]>> }
  let total = 0
  await db.transaction(async () => {
    for (const t of [...TABELAS].reverse()) await db.run(`DELETE FROM ${t}`)
    for (const t of TABELAS) {
      for (const linha of b.dados[t] ?? []) {
        const cols = Object.keys(linha)
        await db.run(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((c) => linha[c]))
        total++
      }
    }
  })
  return total
}
