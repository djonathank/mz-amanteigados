import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
import init from './migrations/001_init.sql?raw'
import phase1 from './migrations/002_phase1_fields.sql?raw'
import phase1b from './migrations/003_variant_volume.sql?raw'
import phase1d from './migrations/005_config_sync_timestamp.sql?raw'
import phases2to4 from './migrations/007_phase2_4.sql?raw'

const NOME = 'mzgestao'
const sqlite = new SQLiteConnection(CapacitorSQLite)
const web = Capacitor.getPlatform() === 'web'

export interface Db {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>
  run(sql: string, params?: unknown[]): Promise<void>
  transaction(fn: () => Promise<void>): Promise<void>
}

let aberto: Promise<Db> | null = null
const onChangeListeners = new Set<() => void>()
let suspenderNotificacoes = 0

export const subscribeDatabaseChanges = (listener: () => void) => {
  onChangeListeners.add(listener)
  return () => onChangeListeners.delete(listener)
}

export async function withoutDatabaseChangeNotifications<T>(operation: () => Promise<T>): Promise<T> {
  suspenderNotificacoes++
  try {
    return await operation()
  } finally {
    suspenderNotificacoes--
  }
}

const notifyDatabaseChanged = () => {
  if (suspenderNotificacoes === 0) onChangeListeners.forEach((listener) => listener())
}

/** Abre o banco uma única vez (seguro com o StrictMode do React). */
export const openDb = (): Promise<Db> => (aberto ??= abrir())

async function abrir(): Promise<Db> {
  if (web) {
    const { defineCustomElements } = await import('jeep-sqlite/loader')
    defineCustomElements(window)
    document.body.appendChild(document.createElement('jeep-sqlite'))
    await customElements.whenDefined('jeep-sqlite')
    await sqlite.initWebStore()
  }
  const conn = await sqlite.createConnection(NOME, false, 'no-encryption', 1, false)
  if (web) await conn.delete()
  await conn.open()
  await conn.execute('PRAGMA foreign_keys = ON')

  await conn.execute('CREATE TABLE IF NOT EXISTS _migracoes (versao INTEGER PRIMARY KEY)')
  const feita = await conn.query('SELECT versao FROM _migracoes WHERE versao = 1')
  if (!feita.values?.length) {
    const sql = init.split('\n').filter((l) => !l.startsWith('--') && !l.startsWith('PRAGMA')).join('\n')
    await conn.execute(sql)
    await conn.run('INSERT INTO _migracoes (versao) VALUES (1)', [], false)
  }
  const feita2 = await conn.query('SELECT versao FROM _migracoes WHERE versao = 2')
  if (!feita2.values?.length) {
    const cols = await conn.query('PRAGMA table_info(receita)')
    if (!(cols.values ?? []).some((c: any) => c.name === 'passos_preparo')) {
      const sql = phase1.split('\n').filter((l) => !l.startsWith('--') && l.trim()).join('\n')
      await conn.execute(sql)
    }
    await conn.run('INSERT INTO _migracoes (versao) VALUES (2)', [], false)
  }
  const feita3 = await conn.query('SELECT versao FROM _migracoes WHERE versao = 3')
  if (!feita3.values?.length) {
    const cols = await conn.query('PRAGMA table_info(produto_variante)')
    if (!(cols.values ?? []).some((c: any) => c.name === 'volume_ml')) {
      const sql = phase1b.split('\n').filter((l) => !l.startsWith('--') && l.trim()).join('\n')
      await conn.execute(sql)
    } else {
      await conn.run(
        `UPDATE produto_variante SET volume_ml=peso_g
         WHERE volume_ml IS NULL AND peso_g IS NOT NULL
         AND produto_id IN (SELECT p.id FROM produto p JOIN receita r ON r.id=p.receita_id WHERE r.rendimento_unidade='ml')`,
        [],
        false,
      )
    }
    await conn.run('INSERT INTO _migracoes (versao) VALUES (3)', [], false)
  }
  // Migration scripts 004, 006, 008 and 009 were removed from the project.
  // Versions 4 and 6 only changed demo rows; 8 cleared demo rows. The web
  // database is recreated empty, so those data-only migrations are unnecessary.
  const feita5 = await conn.query('SELECT versao FROM _migracoes WHERE versao = 5')
  if (!feita5.values?.length) {
    const cols = await conn.query('PRAGMA table_info(config)')
    if (!(cols.values ?? []).some((c: { name: string }) => c.name === 'updated_at')) {
      const sql = phase1d.split('\n').filter((l) => !l.startsWith('--') && l.trim()).join('\n')
      await conn.execute(sql)
    }
    await conn.run('INSERT INTO _migracoes (versao) VALUES (5)', [], false)
  }
  const feita7 = await conn.query('SELECT versao FROM _migracoes WHERE versao = 7')
  if (!feita7.values?.length) {
    const cols = await conn.query('PRAGMA table_info(movimento_estoque)')
    if (!(cols.values ?? []).some((c: { name: string }) => c.name === 'motivo')) {
      await conn.execute('ALTER TABLE movimento_estoque ADD COLUMN motivo TEXT')
    }
    const variantCols = await conn.query('PRAGMA table_info(produto_variante)')
    if (!(variantCols.values ?? []).some((c: { name: string }) => c.name === 'estoque_minimo')) {
      await conn.execute('ALTER TABLE produto_variante ADD COLUMN estoque_minimo REAL NOT NULL DEFAULT 0')
    }
    const indexes = phases2to4.split('\n')
      .filter((l) => !l.startsWith('--') && !l.trim().startsWith('ALTER TABLE') && l.trim())
      .join('\n')
    await conn.execute(indexes)
    await conn.run('INSERT INTO _migracoes (versao) VALUES (7)', [], false)
  }
  // Bancos antigos podem ter a migração marcada, mas sem a coluna adicionada
  // (por exemplo, se foram criados por uma versão intermediária do aplicativo).
  // Verifique o schema também quando a versão já estiver registrada para que a
  // abertura seja autocorretiva e as listagens não quebrem depois de salvar.
  const variantColumns = await conn.query('PRAGMA table_info(produto_variante)')
  if (!(variantColumns.values ?? []).some((c: { name: string }) => c.name === 'estoque_minimo')) {
    await conn.execute('ALTER TABLE produto_variante ADD COLUMN estoque_minimo REAL NOT NULL DEFAULT 0')
  }
  let emTransacao = false
  const persistir = async () => { /* Spreadsheet is the persistent store. */ }
  const db: Db = {
    async query<T>(sql: string, params: unknown[] = []) {
      return ((await conn.query(sql, params as any[])).values ?? []) as T[]
    },
    async run(sql: string, params: unknown[] = []) {
      await conn.run(sql, params as any[], false)
      if (!emTransacao) {
        await persistir()
        notifyDatabaseChanged()
      }
    },
    async transaction(fn: () => Promise<void>) {
      await conn.beginTransaction()
      emTransacao = true
      try {
        await fn()
        await conn.commitTransaction()
      } catch (e) {
        await conn.rollbackTransaction()
        throw e
      } finally {
        emTransacao = false
      }
      await persistir()
      notifyDatabaseChanged()
    },
  }
  return db
}
