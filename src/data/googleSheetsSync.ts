import type { Db } from './db'

export const SYNC_TABLES = [
  'insumo', 'fornecedor', 'cliente', 'receita', 'receita_item', 'produto', 'produto_variante',
  'compra', 'compra_item', 'historico_preco_insumo', 'movimento_estoque',
  'venda', 'venda_item', 'encomenda', 'encomenda_item', 'lancamento', 'config',
] as const

const META_SHEET = '_meta'
const SPREADSHEET_NAME = 'MZ Gestão - Dados'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const SHEETS_API = 'https://sheets.googleapis.com/v4'
const SCHEMA_VERSION = 7

export type SyncTable = typeof SYNC_TABLES[number]
export type SyncRow = Record<string, unknown>
type Column = { name: string; type: string; notnull: number; pk: number; dflt_value: unknown }
type GoogleSheet = { properties: { sheetId: number; title: string } }
type Spreadsheet = { spreadsheetId: string; sheets: GoogleSheet[] }
type ValueRange = { values?: unknown[][] }

export interface SyncProgress {
  spreadsheetId: string
  spreadsheetUrl: string
  records: number
}

export async function encontrarOuCriarPlanilha(token: string, db: Db): Promise<Spreadsheet> {
  const query = new URLSearchParams({
    q: `name='${SPREADSHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    fields: 'files(id,name,webViewLink)',
    pageSize: '100',
  })
  const result = await googleRequest<{ files?: { id: string; name: string }[] }>(
    `${DRIVE_API}/files?${query}`, token,
  )
  if ((result.files?.length ?? 0) > 1) {
    throw new Error('Há mais de uma planilha MZ Gestão - Dados no Drive. Renomeie ou remova as duplicadas antes de sincronizar.')
  }
  if (result.files?.[0]) return obterPlanilha(token, result.files[0].id)

  const sheets: { properties: { title: string; gridProperties: { frozenRowCount: number } } }[] = SYNC_TABLES.map((title) => ({
    properties: { title, gridProperties: { frozenRowCount: 1 } },
  }))
  sheets.push({ properties: { title: META_SHEET, gridProperties: { frozenRowCount: 1 } } })
  const created = await googleRequest<Spreadsheet>(`${SHEETS_API}/spreadsheets`, token, {
    method: 'POST',
    body: JSON.stringify({ properties: { title: SPREADSHEET_NAME }, sheets }),
  })
  await inicializarPlanilha(token, db, created)
  return created
}

export async function obterPlanilha(token: string, spreadsheetId: string): Promise<Spreadsheet> {
  return googleRequest<Spreadsheet>(
    `${SHEETS_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,sheets.properties`,
    token,
  )
}

export async function sincronizarPlanilha(
  token: string,
  db: Db,
  spreadsheet: Spreadsheet,
  aplicarDados: (operation: () => Promise<void>) => Promise<void>,
): Promise<SyncProgress> {
  const current = await obterPlanilha(token, spreadsheet.spreadsheetId)
  await garantirAbas(token, db, current)
  const schema = await carregarSchema(db)
  const ranges = [`'${META_SHEET}'!A:B`, ...SYNC_TABLES.map((table) => `'${table}'!A:ZZ`)]
  const query = new URLSearchParams()
  for (const range of ranges) query.append('ranges', range)
  query.set('valueRenderOption', 'UNFORMATTED_VALUE')
  const response = await googleRequest<{ valueRanges?: ValueRange[] }>(
    `${SHEETS_API}/spreadsheets/${encodeURIComponent(current.spreadsheetId)}/values:batchGet?${query}`,
    token,
  )
  const valueRanges = response.valueRanges ?? []
  const meta = new Map((valueRanges[0]?.values ?? []).slice(1).map((row) => [String(row[0] ?? ''), row[1]]))
  const remoteVersion = Number(meta.get('schema_version'))
  if (!Number.isInteger(remoteVersion) || remoteVersion < 1 || remoteVersion > SCHEMA_VERSION) {
    throw new Error('A versão da planilha é incompatível com este app. Atualize o app nos aparelhos antes de sincronizar.')
  }

  const merged = {} as Record<SyncTable, SyncRow[]>
  let recordCount = 0
  for (const [index, table] of SYNC_TABLES.entries()) {
    const columns = schema[table]
    const values = valueRanges[index + 1]?.values ?? []
    const headers = values[0]?.map(String) ?? []
    if (!colunasCompativeis(headers, columns.map((column) => column.name))) {
      throw new Error(`As colunas da aba "${table}" não correspondem ao esquema do aplicativo.`)
    }
    const remote = values.slice(1).filter((row) => row.some((value) => value !== '' && value != null))
      .map((row) => parseSheetRow(row, columns, headers))
    const local = await db.query<SyncRow>(`SELECT * FROM ${table}`)
    merged[table] = mesclarLinhas(table, local, remote)
    recordCount += merged[table].length
  }

  reconstruirSaldosSincronizados(merged)
  await aplicarDados(() => substituirTabelas(db, schema, merged))
  await escreverPlanilha(token, current.spreadsheetId, schema, merged, new Date().toISOString())
  return {
    spreadsheetId: current.spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${current.spreadsheetId}/edit`,
    records: recordCount,
  }
}

async function inicializarPlanilha(token: string, db: Db, spreadsheet: Spreadsheet) {
  const schema = await carregarSchema(db)
  const values = [
    { range: `'${META_SHEET}'!A1:B3`, values: [['chave', 'valor'], ['schema_version', SCHEMA_VERSION], ['sincronizado_em', new Date().toISOString()]] },
    ...SYNC_TABLES.map((table) => ({ range: `'${table}'!A1`, values: [schema[table].map((column) => column.name)] })),
  ]
  await googleRequest(`${SHEETS_API}/spreadsheets/${encodeURIComponent(spreadsheet.spreadsheetId)}/values:batchUpdate`, token, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'RAW', data: values }),
  })
}

async function garantirAbas(token: string, db: Db, spreadsheet: Spreadsheet) {
  const current = new Set(spreadsheet.sheets.map((sheet) => sheet.properties.title))
  const missing = [...SYNC_TABLES, META_SHEET].filter((title) => !current.has(title))
  if (missing.length) {
    await googleRequest(`${SHEETS_API}/spreadsheets/${encodeURIComponent(spreadsheet.spreadsheetId)}:batchUpdate`, token, {
      method: 'POST',
      body: JSON.stringify({ requests: missing.map((title) => ({
        addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } },
      })) }),
    })
    const schema = await carregarSchema(db)
    const headers: { range: string; values: (string | number)[][] }[] = missing.filter((title): title is SyncTable => SYNC_TABLES.includes(title as SyncTable))
      .map((table) => ({ range: `'${table}'!A1`, values: [schema[table].map((column) => column.name)] }))
    if (missing.includes(META_SHEET)) {
      headers.push({ range: `'${META_SHEET}'!A1:B3`, values: [['chave', 'valor'], ['schema_version', SCHEMA_VERSION], ['sincronizado_em', new Date().toISOString()]] })
    }
    await googleRequest(`${SHEETS_API}/spreadsheets/${encodeURIComponent(spreadsheet.spreadsheetId)}/values:batchUpdate`, token, {
      method: 'POST',
      body: JSON.stringify({ valueInputOption: 'RAW', data: headers }),
    })
  }
}

async function carregarSchema(db: Db): Promise<Record<SyncTable, Column[]>> {
  const schema = {} as Record<SyncTable, Column[]>
  for (const table of SYNC_TABLES) {
    schema[table] = await db.query<Column>(`PRAGMA table_info(${table})`)
  }
  return schema
}

export function parseSheetRow(values: unknown[], columns: Column[], headers: string[]): SyncRow {
  return Object.fromEntries(columns.map((column) => {
    const index = headers.indexOf(column.name)
    if (index < 0) {
      if (column.dflt_value != null) return [column.name, parseDefaultValue(column)]
      if (column.notnull) throw new Error(`A aba não contém a coluna obrigatória ${column.name}.`)
      return [column.name, null]
    }
    const value = values[index]
    if (value === '' || value == null) return [column.name, column.notnull ? '' : null]
    if (column.type.toUpperCase().includes('INT') || column.type.toUpperCase().includes('REAL')
      || column.type.toUpperCase().includes('NUM')) {
      const number = Number(value)
      if (!Number.isFinite(number)) throw new Error(`Valor numérico inválido na coluna ${column.name}.`)
      return [column.name, number]
    }
    return [column.name, String(value)]
  }))
}

function parseDefaultValue(column: Column): unknown {
  const value = String(column.dflt_value)
  if (column.type.toUpperCase().includes('INT') || column.type.toUpperCase().includes('REAL')
    || column.type.toUpperCase().includes('NUM')) {
    const parsed = Number(value.replace(/^'|'$/g, ''))
    if (!Number.isFinite(parsed)) throw new Error(`Valor padrão inválido na coluna ${column.name}.`)
    return parsed
  }
  return value.replace(/^'|'$/g, '')
}

export function mesclarLinhas(table: SyncTable, local: SyncRow[], remote: SyncRow[]): SyncRow[] {
  const key = table === 'config' ? 'chave' : 'id'
  const merged = new Map<string, SyncRow>()
  for (const row of remote) merged.set(String(row[key]), row)
  for (const row of local) {
    const id = String(row[key])
    const remoteRow = merged.get(id)
    if (!remoteRow || newer(row, remoteRow)) merged.set(id, row)
  }
  return [...merged.values()]
}

export function reconstruirSaldosSincronizados(data: {
  insumo: SyncRow[]; produto_variante: SyncRow[]; movimento_estoque: SyncRow[]
}) {
  const balances = new Map<string, number>()
  for (const movement of data.movimento_estoque) {
    if (movement.deleted_at != null) continue
    const key = `${String(movement.item_tipo)}:${String(movement.item_id)}`
    balances.set(key, (balances.get(key) ?? 0) + Number(movement.quantidade ?? 0))
  }
  for (const row of data.insumo) row.estoque_atual = balances.get(`insumo:${String(row.id)}`) ?? 0
  for (const row of data.produto_variante) row.estoque_atual = balances.get(`variante:${String(row.id)}`) ?? 0
}

function newer(local: SyncRow, remote: SyncRow): boolean {
  const localTime = String(local.updated_at ?? local.created_at ?? '')
  const remoteTime = String(remote.updated_at ?? remote.created_at ?? '')
  if (localTime !== remoteTime) return localTime > remoteTime
  return String(local.device_id ?? '') >= String(remote.device_id ?? '')
}

export async function substituirTabelas(db: Db, schema: Record<SyncTable, Column[]>, data: Record<SyncTable, SyncRow[]>) {
  await db.transaction(async () => {
    await db.run('PRAGMA defer_foreign_keys = ON')
    for (const table of [...SYNC_TABLES].reverse()) await db.run(`DELETE FROM ${table}`)
    for (const table of SYNC_TABLES) {
      const columns = schema[table].map((column) => column.name)
      for (const row of data[table]) {
        await db.run(
          `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
          columns.map((column) => row[column] ?? null),
        )
      }
    }
    const violations = await db.query<{ table: string; rowid: number; parent: string; fkid: number }>(
      'PRAGMA foreign_key_check',
    )
    if (violations.length) {
      const first = violations[0]
      throw new Error(
        `A planilha contém uma referência inválida na tabela "${first.table}" (linha ${first.rowid}, tabela relacionada "${first.parent}"). Corrija os dados antes de sincronizar.`,
      )
    }
  })
}

async function escreverPlanilha(
  token: string, spreadsheetId: string, schema: Record<SyncTable, Column[]>,
  data: Record<SyncTable, SyncRow[]>, syncedAt: string,
) {
  const rows = [
    { range: `'${META_SHEET}'!A1:B3`, values: [['chave', 'valor'], ['schema_version', SCHEMA_VERSION], ['sincronizado_em', syncedAt]] },
    ...SYNC_TABLES.map((table) => ({
      range: `'${table}'!A1`,
      values: [
        schema[table].map((column) => column.name),
        ...data[table].map((row) => schema[table].map((column) => row[column.name] ?? '')),
      ],
    })),
  ]
  await googleRequest(`${SHEETS_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, token, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'RAW', data: rows }),
  })
}

export function colunasCompativeis(left: string[], right: string[]): boolean {
  return left.length <= right.length && left.every((column, index) => column === right[index])
}

async function googleRequest<T = void>(url: string, token: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(body.error?.message ?? `Google API retornou HTTP ${response.status}.`)
  }
  if (response.status === 204) return undefined as T
  return await response.json() as T
}
