import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Capacitor } from '@capacitor/core'
import { useDb } from './DbContext'
import { withoutDatabaseChangeNotifications, subscribeDatabaseChanges } from './db'
import { encontrarOuCriarPlanilha, obterPlanilha, sincronizarPlanilha } from './googleSheetsSync'

const SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.file']
const STORAGE_EMAIL = 'mz_google_email'
const STORAGE_SHEET = (email: string) => `mz_google_sheet_${email.toLowerCase()}`
let inicializacao: Promise<void> | null = null

interface Sessao {
  email: string
  nome: string
  accessToken: string
  accessTokenExpiresAt: number
}

interface TokenResponse {
  access_token: string
  expires_in: number
  error?: string
}

interface GoogleWebApi {
  accounts: {
    oauth2: {
      initTokenClient: (options: {
        client_id: string
        scope: string
        callback: (response: TokenResponse) => void
      }) => { requestAccessToken: (options?: { prompt?: string }) => void }
      revoke: (token: string, callback: () => void) => void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleWebApi
  }
}

interface Estado {
  email: string
  nome: string
  planilhaUrl: string
  sincronizadoEm: string
  sincronizando: boolean
  erro: string
}

interface GoogleSyncContextValue extends Estado {
  autenticacaoPronta: boolean
  conectar: () => Promise<{ email: string; nome: string }>
  desconectar: () => Promise<void>
  sincronizarAgora: () => Promise<void>
}

const Contexto = createContext<GoogleSyncContextValue | null>(null)
const estadoVazio: Estado = {
  email: '',
  nome: '',
  planilhaUrl: '',
  sincronizadoEm: '',
  sincronizando: false,
  erro: '',
}

function inicializarGoogle() {
  if (!inicializacao) {
    if (Capacitor.isNativePlatform()) {
      inicializacao = import('@codetrix-studio/capacitor-google-auth')
        .then(({ GoogleAuth }) => GoogleAuth.initialize({ scopes: SCOPES }))
    } else if (!import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID) {
      inicializacao = Promise.reject(new Error('Configure VITE_GOOGLE_WEB_CLIENT_ID para habilitar o login Google na web.'))
    } else {
      inicializacao = carregarGoogleIdentityServices()
    }
  }
  return inicializacao
}

export function GoogleSyncProvider({ children }: { children: ReactNode }) {
  const db = useDb()
  const [estado, setEstado] = useState(estadoVazio)
  const [autenticacaoPronta, setAutenticacaoPronta] = useState(false)
  const sessao = useRef<Sessao | null>(null)
  const sincronizacaoAtual = useRef<Promise<void> | null>(null)

  const sync = useCallback(async (atual: Sessao, salvarPlanilhaId = '') => {
    if (sincronizacaoAtual.current) return sincronizacaoAtual.current
    const operacao = (async () => {
      setEstado((value) => ({ ...value, sincronizando: true, erro: '' }))
      try {
        const planilha = salvarPlanilhaId
          ? await obterPlanilha(atual.accessToken, salvarPlanilhaId)
          : await encontrarOuCriarPlanilha(atual.accessToken, db)
        const result = await sincronizarPlanilha(
          atual.accessToken,
          db,
          planilha,
          (operation) => withoutDatabaseChangeNotifications(operation),
        )
        const sincronizadoEm = new Date().toISOString()
        localStorage.setItem(STORAGE_EMAIL, atual.email)
        localStorage.setItem(STORAGE_SHEET(atual.email), result.spreadsheetId)
        setEstado({
          email: atual.email,
          nome: atual.nome,
          planilhaUrl: result.spreadsheetUrl,
          sincronizadoEm,
          sincronizando: false,
          erro: '',
        })
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : String(error)
        setEstado((value) => ({ ...value, sincronizando: false, erro: mensagem }))
        throw error
      } finally {
        sincronizacaoAtual.current = null
      }
    })()
    sincronizacaoAtual.current = operacao
    return operacao
  }, [db])

  const renovarESincronizar = useCallback(async (atual: Sessao) => {
    let renovada = atual
    if (Capacitor.isNativePlatform()) {
      const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth')
      const authentication = await GoogleAuth.refresh()
      if (!authentication.accessToken) throw new Error('A sessão do Google expirou. Conecte a conta novamente.')
      renovada = { ...atual, accessToken: authentication.accessToken }
    } else if (Date.now() >= atual.accessTokenExpiresAt) {
      throw new Error('A autorização Google expirou. Conecte a conta novamente para continuar sincronizando.')
    }
    sessao.current = renovada
    setEstado((value) => ({ ...value, email: renovada.email, nome: renovada.nome }))
    const sheetId = localStorage.getItem(STORAGE_SHEET(atual.email)) ?? ''
    await sync(renovada, sheetId)
  }, [sync])

  useEffect(() => {
    let ativo = true
    if (Capacitor.isNativePlatform()) {
      void inicializarGoogle().then(async () => {
        const email = localStorage.getItem(STORAGE_EMAIL)
        if (!email || !ativo) return
        const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth')
        const authentication = await GoogleAuth.refresh()
        if (!authentication.accessToken || !ativo) return
        const atual = { email, nome: '', accessToken: authentication.accessToken, accessTokenExpiresAt: Number.MAX_SAFE_INTEGER }
        sessao.current = atual
        setEstado((value) => ({ ...value, email }))
        await renovarESincronizar(atual)
      }).catch((error) => {
        if (ativo) setEstado((value) => ({
          ...value,
          erro: `Entre novamente com sua conta Google: ${error instanceof Error ? error.message : String(error)}`,
        }))
      }).finally(() => {
        if (ativo) setAutenticacaoPronta(true)
      })
    } else {
      const email = localStorage.getItem(STORAGE_EMAIL)
      if (email) setEstado((value) => ({
        ...value,
        erro: 'Entre novamente com sua conta Google para acessar o aplicativo.',
      }))
      setAutenticacaoPronta(true)
    }
    return () => { ativo = false }
  }, [renovarESincronizar])

  useEffect(() => {
    let timer = 0
    const scheduleSync = () => {
      if (!sessao.current) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const atual = sessao.current
        if (atual) void renovarESincronizar(atual).catch((error) => setEstado((value) => ({
          ...value,
          sincronizando: false,
          erro: error instanceof Error ? error.message : String(error),
        })))
      }, 1500)
    }
    const unsubscribe = subscribeDatabaseChanges(scheduleSync)
    const onOnline = () => scheduleSync()
    window.addEventListener('online', onOnline)
    return () => {
      window.clearTimeout(timer)
      unsubscribe()
      window.removeEventListener('online', onOnline)
    }
  }, [renovarESincronizar])

  const conectar = useCallback(async () => {
    setEstado((value) => ({ ...value, erro: '' }))
    try {
      await inicializarGoogle()
      let atual: Sessao
      if (Capacitor.isNativePlatform()) {
        const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth')
        const user = await GoogleAuth.signIn()
        if (!user.email || !user.authentication.accessToken) {
          throw new Error('O Google não retornou o e-mail e a autorização necessários para sincronizar.')
        }
        atual = {
          email: user.email,
          nome: user.name,
          accessToken: user.authentication.accessToken,
          accessTokenExpiresAt: Number.MAX_SAFE_INTEGER,
        }
      } else {
        const token = await solicitarTokenWeb()
        if (!token.access_token || !(token.expires_in > 0)) {
          throw new Error('O Google não retornou um token de acesso válido.')
        }
        const profile = await obterPerfilGoogle(token.access_token)
        if (!profile.email) throw new Error('O Google não retornou o e-mail da conta autenticada.')
        atual = {
          email: profile.email,
          nome: profile.name ?? '',
          accessToken: token.access_token,
          accessTokenExpiresAt: Date.now() + token.expires_in * 1000,
        }
      }
      sessao.current = atual
      setEstado((value) => ({
        ...value,
        email: atual.email,
        nome: atual.nome,
        erro: '',
      }))
      await sync(atual)
      return { email: atual.email, nome: atual.nome }
    } catch (error) {
      setEstado((value) => ({
        ...value,
        sincronizando: false,
        erro: error instanceof Error ? error.message : String(error),
      }))
      throw error
    }
  }, [sync])

  const desconectar = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth')
      await GoogleAuth.signOut()
    } else if (sessao.current && window.google) {
      await new Promise<void>((resolve) => {
        window.google?.accounts.oauth2.revoke(sessao.current?.accessToken ?? '', resolve)
      })
    }
    sessao.current = null
    if (estado.email) localStorage.removeItem(STORAGE_SHEET(estado.email))
    localStorage.removeItem(STORAGE_EMAIL)
    setEstado(estadoVazio)
  }, [estado.email])

  const sincronizarAgora = useCallback(async () => {
    const atual = sessao.current
    if (!atual) throw new Error('Conecte uma conta Google antes de sincronizar.')
    await renovarESincronizar(atual)
  }, [renovarESincronizar])

  return (
    <Contexto.Provider value={    { ...estado, autenticacaoPronta, conectar, desconectar, sincronizarAgora }}>
      {children}
    </Contexto.Provider>
  )
}

function carregarGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts.oauth2) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existente = document.querySelector<HTMLScriptElement>('script[data-google-identity]')
    const script = existente ?? document.createElement('script')
    const falha = () => reject(new Error('Não foi possível carregar o serviço de login do Google.'))
    script.addEventListener('load', () => window.google?.accounts.oauth2
      ? resolve()
      : reject(new Error('O serviço de login do Google não foi inicializado.')), { once: true })
    script.addEventListener('error', falha, { once: true })
    if (!existente) {
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.dataset.googleIdentity = 'true'
      document.head.appendChild(script)
    }
  })
}

function solicitarTokenWeb(): Promise<TokenResponse> {
  const clientId = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID
  if (!clientId || !window.google) return Promise.reject(new Error('O login Google na web não está configurado.'))
  return new Promise((resolve, reject) => {
    const client = window.google?.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES.join(' '),
      callback: (response) => response.error
        ? reject(new Error(response.error))
        : response.access_token
          ? resolve(response)
          : reject(new Error('O Google não retornou um token de acesso.')),
    })
    client?.requestAccessToken({ prompt: 'select_account' })
  })
}

async function obterPerfilGoogle(token: string): Promise<{ email?: string; name?: string }> {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(`Não foi possível verificar a conta Google (HTTP ${response.status}).`)
  return await response.json() as { email?: string; name?: string }
}

export function useGoogleSync() {
  const context = useContext(Contexto)
  if (!context) throw new Error('A sincronização Google ainda não foi inicializada.')
  return context
}
