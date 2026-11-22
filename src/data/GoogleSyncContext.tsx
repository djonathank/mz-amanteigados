import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Capacitor } from '@capacitor/core'
import { Network } from '@capacitor/network'
import { useDb } from './DbContext'
import { withoutDatabaseChangeNotifications, subscribeDatabaseChanges } from './db'
import { encontrarOuCriarPlanilha, encontrarPlanilhaExistente, obterPlanilha, sincronizarPlanilha } from './googleSheetsSync'

const SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.file']
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
  reconectar: () => Promise<{ email: string; nome: string }>
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

async function autenticarGoogle(): Promise<Sessao> {
  await inicializarGoogle()
  if (Capacitor.isNativePlatform()) {
    const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth')
    let user
    try {
      user = await GoogleAuth.signIn()
    } catch (error) {
      throw traduzirErroLoginNativo(error)
    }
    if (!user.email || !user.authentication.accessToken) {
      throw new Error('O Google não retornou o e-mail e a autorização necessários para sincronizar.')
    }
    return {
      email: user.email,
      nome: user.name,
      accessToken: user.authentication.accessToken,
      accessTokenExpiresAt: Number.MAX_SAFE_INTEGER,
    }
  }
  const token = await solicitarTokenWeb()
  if (!token.access_token || !(token.expires_in > 0)) {
    throw new Error('O Google não retornou um token de acesso válido.')
  }
  const profile = await obterPerfilGoogle(token.access_token)
  if (!profile.email) throw new Error('O Google não retornou o e-mail da conta autenticada.')
  return {
    email: profile.email,
    nome: profile.name ?? '',
    accessToken: token.access_token,
    accessTokenExpiresAt: Date.now() + token.expires_in * 1000,
  }
}

function traduzirErroLoginNativo(error: unknown): Error {
  if (!error || typeof error !== 'object') {
    return new Error(error instanceof Error ? error.message : String(error))
  }

  const detalhe = error as { code?: unknown; status?: unknown; statusCode?: unknown; message?: unknown }
  const codigo = String(detalhe.code ?? detalhe.statusCode ?? detalhe.status ?? '')
  if (codigo === '10' || codigo === 'DEVELOPER_ERROR') {
    return new Error(
      'O Google recusou a configuração deste app (erro 10). Confira no Google Cloud o package br.com.mzbolachas.gestao e o SHA-1 da chave que assinou este APK (debug ou release). Depois gere e instale um APK novo.',
    )
  }
  if (codigo === '7' || codigo === 'NETWORK_ERROR') {
    return new Error('Não foi possível conectar ao Google. Verifique a internet e tente novamente.')
  }
  const mensagem = typeof detalhe.message === 'string' ? detalhe.message : 'Falha ao entrar com o Google.'
  return codigo ? new Error(`${mensagem} (código ${codigo})`) : new Error(mensagem)
}

export function GoogleSyncProvider({ children }: { children: ReactNode }) {
  const db = useDb()
  const [estado, setEstado] = useState(estadoVazio)
  const [autenticacaoPronta, setAutenticacaoPronta] = useState(false)
  const sessao = useRef<Sessao | null>(null)
  const sincronizacaoAtual = useRef<Promise<void> | null>(null)

  const sync = useCallback(async (
    atual: Sessao,
    options: { spreadsheetId?: string; origem?: 'mesclar' | 'planilha'; criarSeAusente?: boolean } = {},
  ) => {
    while (sincronizacaoAtual.current) {
      await sincronizacaoAtual.current.catch(() => undefined)
    }
    const operacao = (async () => {
      setEstado((value) => ({ ...value, sincronizando: true, erro: '' }))
      try {
        const planilha = options.spreadsheetId
          ? await obterPlanilha(atual.accessToken, options.spreadsheetId)
          : options.criarSeAusente === false
            ? await encontrarPlanilhaExistente(atual.accessToken)
            : await encontrarOuCriarPlanilha(atual.accessToken, db)
        if (!planilha) throw new Error('Não foi encontrada a planilha MZ Gestão - Dados nesta conta Google.')
        const result = await sincronizarPlanilha(
          atual.accessToken,
          db,
          planilha,
          (operation) => withoutDatabaseChangeNotifications(operation),
          options.origem ?? 'mesclar',
        )
        const sincronizadoEm = new Date().toISOString()
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
    await sync(renovada)
  }, [sync])

  useEffect(() => {
    let ativo = true
    if (Capacitor.isNativePlatform()) {
      void db.query<{ valor: string }>("SELECT valor FROM config WHERE chave='nome_usuario'").then(async ([perfil]) => {
        if (!perfil?.valor?.trim() || !ativo) return
        await inicializarGoogle()
        const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth')
        const authentication = await GoogleAuth.refresh()
        if (!authentication.accessToken || !ativo) return
        const profile = await obterPerfilGoogle(authentication.accessToken)
        if (!profile.email || !ativo) return
        const atual = { email: profile.email, nome: profile.name ?? '', accessToken: authentication.accessToken, accessTokenExpiresAt: Number.MAX_SAFE_INTEGER }
        sessao.current = atual
        setEstado((value) => ({ ...value, email: atual.email, nome: atual.nome }))
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
      setAutenticacaoPronta(true)
    }
    return () => { ativo = false }
  }, [db, renovarESincronizar])

  useEffect(() => {
    let ativo = true
    let sincronizacaoAutomaticaEmCurso = false
    let sincronizacaoPendente = false
    let removerListener: (() => Promise<void>) | undefined
    const tentarSincronizar = () => {
      const atual = sessao.current
      if (!atual) return
      if (sincronizacaoAutomaticaEmCurso || sincronizacaoAtual.current) {
        sincronizacaoPendente = true
        return
      }
      sincronizacaoAutomaticaEmCurso = true
      void (async () => {
        const conectado = Capacitor.isNativePlatform()
          ? (await Network.getStatus()).connected
          : navigator.onLine
        if (conectado && ativo && !sincronizacaoAtual.current) await renovarESincronizar(atual)
      })().catch((error) => setEstado((value) => ({
        ...value,
        sincronizando: false,
        erro: error instanceof Error ? error.message : String(error),
      }))).finally(() => {
        sincronizacaoAutomaticaEmCurso = false
        if (sincronizacaoPendente && ativo) {
          sincronizacaoPendente = false
          tentarSincronizar()
        }
      })
    }
    const unsubscribe = subscribeDatabaseChanges(tentarSincronizar)
    const timer = window.setInterval(tentarSincronizar, 100_000)
    const onOnline = () => tentarSincronizar()
    const onVisible = () => {
      if (document.visibilityState === 'visible') tentarSincronizar()
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    if (Capacitor.isNativePlatform()) {
      void Network.addListener('networkStatusChange', (status) => {
        if (status.connected) tentarSincronizar()
      }).then((listener) => {
        if (ativo) removerListener = () => listener.remove()
        else void listener.remove()
      }).catch((error: unknown) => setEstado((value) => ({
        ...value,
        erro: `Não foi possível monitorar a conexão de rede: ${error instanceof Error ? error.message : String(error)}`,
      })))
      void Network.getStatus().then((status) => {
        if (ativo && status.connected) tentarSincronizar()
      }).catch((error: unknown) => setEstado((value) => ({
        ...value,
        erro: `Não foi possível verificar a conexão de rede: ${error instanceof Error ? error.message : String(error)}`,
      })))
    }
    return () => {
      ativo = false
      unsubscribe()
      window.clearInterval(timer)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
      if (removerListener) void removerListener()
    }
  }, [renovarESincronizar])

  const conectar = useCallback(async () => {
    setEstado((value) => ({ ...value, erro: '' }))
    try {
      const atual = await autenticarGoogle()
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

  const reconectar = useCallback(async () => {
    setEstado((value) => ({ ...value, sincronizando: true, erro: '' }))
    try {
      const atual = await autenticarGoogle()
      if (estado.email && estado.email.toLocaleLowerCase() !== atual.email.toLocaleLowerCase()) {
        throw new Error('A conta Google selecionada é diferente da conectada. Desconecte a conta atual antes de trocar.')
      }
      sessao.current = atual
      setEstado((value) => ({ ...value, email: atual.email, nome: atual.nome }))
      await sync(atual, { origem: 'planilha', criarSeAusente: false })
      return { email: atual.email, nome: atual.nome }
    } catch (error) {
      setEstado((value) => ({
        ...value,
        sincronizando: false,
        erro: error instanceof Error ? error.message : String(error),
      }))
      throw error
    }
  }, [estado.email, sync])

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
    setEstado(estadoVazio)
  }, [db])

  const sincronizarAgora = useCallback(async () => {
    const atual = sessao.current
    if (!atual) throw new Error('Conecte uma conta Google antes de sincronizar.')
    await renovarESincronizar(atual)
  }, [renovarESincronizar])

  return (
    <Contexto.Provider value={{ ...estado, autenticacaoPronta, conectar, reconectar, desconectar, sincronizarAgora }}>
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
        ? reject(new Error(response.error === 'invalid_client'
          ? `O Google recusou o cliente OAuth para esta origem: ${window.location.origin}. Cadastre esta origem exata em Origens JavaScript autorizadas do cliente Web no Google Cloud Console.`
          : response.error))
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
