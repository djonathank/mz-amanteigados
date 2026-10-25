import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { openDb, type Db } from './db'
import AppLoading from '../AppLoading'

const Ctx = createContext<Db | null>(null)

export const useDb = (): Db => {
  const db = useContext(Ctx)
  if (!db) throw new Error('Banco ainda não foi aberto')
  return db
}

export function DbProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Db | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    openDb().then(setDb).catch((e) => setErro(String(e?.message ?? e)))
  }, [])

  if (erro) return <p className="sb" role="alert">Não foi possível abrir os dados: {erro}</p>
  if (!db) return <AppLoading />
  return <Ctx.Provider value={db}>{children}</Ctx.Provider>
}
