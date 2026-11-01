import type { Db } from './db'
import { SYNC_TABLES, type SyncTable } from './googleSheetsSync'

type Column = { name: string; type: string; notnull: number; pk: number; dflt_value: unknown }

export interface BackupPreview {
  valido: boolean
  totalRegistros: number
  erros: string[]
}

export async function criarBackup(db: Db): Promise<string> {
  const dados = {} as Record<SyncTable, Record<string, unknown>[]>
  for (const table of SYNC_TABLES) {
    dados[table] = await db.query(`SELECT * FROM ${table}`)
  }
  return JSON.stringify({ schema_version: 1, dados }, null, 2)
}

export async function validarBackup(db: Db, texto: string): Promise<BackupPreview> {
  let payload: unknown
  try {
    payload = JSON.parse(texto)
  } catch {
    return { valido: false, totalRegistros: 0, erros: ['Arquivo não contém JSON válido.'] }
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valido: false, totalRegistros: 0, erros: ['Formato de backup inválido.'] }
  }

  const root = payload as { schema_version?: unknown; dados?: unknown }
  if (root.schema_version !== 1 || !root.dados || typeof root.dados !== 'object' || Array.isArray(root.dados)) {
    return { valido: false, totalRegistros: 0, erros: ['Versão ou estrutura do backup não é suportada.'] }
  }

  const dados = root.dados as Record<string, unknown>
  const erros: string[] = []
  let totalRegistros = 0
  for (const [table, rows] of Object.entries(dados)) {
    if (!SYNC_TABLES.includes(table as SyncTable)) {
      erros.push(`Tabela desconhecida: "${table}".`)
      continue
    }
    if (!Array.isArray(rows)) {
      erros.push(`A tabela "${table}" deve conter uma lista.`)
      continue
    }
    totalRegistros += rows.length
    const columns = await db.query<Column>(`PRAGMA table_info(${table})`)
    const allowed = new Set(columns.map((column) => column.name))
    for (const [index, row] of rows.entries()) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        erros.push(`Linha ${index + 1} da tabela "${table}" é inválida.`)
        continue
      }
      for (const [column, value] of Object.entries(row)) {
        if (!allowed.has(column)) erros.push(`Coluna desconhecida "${column}" na tabela "${table}".`)
        else if (value !== null && typeof value === 'object') erros.push(`Valor inválido na coluna "${column}" da tabela "${table}".`)
      }
    }
  }
  return { valido: erros.length === 0, totalRegistros, erros }
}

export async function importarBackup(db: Db, texto: string): Promise<void> {
  const preview = await validarBackup(db, texto)
  if (!preview.valido) throw new Error(preview.erros.join(' '))
  const payload = JSON.parse(texto) as { dados: Record<SyncTable, Record<string, unknown>[] | undefined> }

  await db.transaction(async () => {
    await db.run('PRAGMA defer_foreign_keys = ON')
    for (const table of SYNC_TABLES) await db.run(`DELETE FROM ${table}`)
    for (const table of SYNC_TABLES) {
      const rows = payload.dados[table] ?? []
      const columns = await db.query<Column>(`PRAGMA table_info(${table})`)
      for (const row of rows) {
        const columnNames = columns.map((column) => column.name).filter((name) => Object.prototype.hasOwnProperty.call(row, name))
        if (!columnNames.length) continue
        const placeholders = columnNames.map(() => '?').join(', ')
        await db.run(
          `INSERT INTO ${table} (${columnNames.join(', ')}) VALUES (${placeholders})`,
          columnNames.map((name) => row[name]),
        )
      }
    }
  })
}
