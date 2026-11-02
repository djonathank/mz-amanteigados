import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { lazy, Suspense, useEffect, useState } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { DbProvider, useDb } from './data/DbContext'
import { GoogleSyncProvider } from './data/GoogleSyncContext'
import { lerConfig } from './data/repos'
import { subscribeDatabaseChanges } from './data/db'
import Inicio from './pages/Inicio'
import Mais from './pages/Mais'
import { Icon } from './pages/ui'
import Login from './pages/Login'
import MenuUsuario from './pages/MenuUsuario'
import AppLoading from './AppLoading'

const Comprovante = lazy(() => import('./pages/Comprovante'))
const Compra = lazy(() => import('./pages/Compra'))
const Custos = lazy(() => import('./pages/Custos'))
const Categorias = lazy(() => import('./pages/Categorias'))
const Insumos = lazy(() => import('./pages/Insumos'))
const Precificacao = lazy(() => import('./pages/Precificacao'))
const Produtos = lazy(() => import('./pages/Produtos'))
const Receitas = lazy(() => import('./pages/Receitas'))
const Vender = lazy(() => import('./pages/Vender'))
const Relatorios = lazy(() => import('./pages/Relatorios'))
const Gestao = lazy(() => import('./pages/Gestao'))

const tabs = [
  ['/', 'Início', 'home'],
  ['/receitas', 'Receitas', 'recipe'],
  ['/vender', 'Vender', 'sell'],
  ['/estoque', 'Estoque', 'stock'],
  ['/mais', 'Mais', 'more'],
] as const

function destinoCadastro(pathname: string): string {
  if (pathname === '/' || pathname.startsWith('/venda/')) return '/vender'
  if (pathname === '/receitas') return '/receitas#receita-form'
  if (pathname === '/produtos') return '/produtos#produto-form'
  if (pathname === '/estoque') return '/estoque#insumo-form'
  if (pathname === '/compra') return '/compra#compra-form'
  if (pathname === '/planejamento') return '/planejamento#compra-form'
  if (pathname === '/clientes' || pathname === '/fornecedores') return `${pathname}#${pathname.slice(1)}-form`
  if (pathname === '/encomendas') return '/vender'
  if (pathname === '/financeiro') return '/financeiro#financeiro-form'
  if (pathname === '/categorias') return '/categorias#categoria-form'
  if (['/mais', '/menu', '/relatorios', '/custos', '/precificacao'].includes(pathname)) return '/vender'
  return pathname
}

function Navegacao() {
  const location = useLocation()
  const navigate = useNavigate()
  const { pathname } = location

  useEffect(() => {
    if (!location.hash) return
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [location.hash, pathname])

  const abrirCadastro = () => {
    if (pathname === '/estoque') {
      navigate('/estoque#insumo-form')
      return
    }
    if (pathname === '/produtos') {
      navigate('/produtos#produto-form')
      return
    }
    navigate(destinoCadastro(pathname))
  }

  return (
    <nav className="nv" aria-label="Navegação principal">
      {tabs.map(([path, label, icon]) => {
        if (path === '/vender') {
          const vendaAtiva = pathname === '/vender' || pathname.startsWith('/venda/')
          return (
            <button
              key={path}
              type="button"
              className={`nav-add${vendaAtiva ? ' active' : ''}`}
              aria-label="Criar novo"
              data-testid="nav.add"
              onClick={abrirCadastro}
            >
              <span className="nav-add-symbol" aria-hidden="true">+</span>
            </button>
          )
        }

        const utilitario = label === 'Mais' && [
          '/mais', '/menu', '/produtos', '/compra', '/custos', '/precificacao',
          '/planejamento', '/relatorios', '/clientes', '/fornecedores', '/encomendas', '/financeiro', '/categorias',
        ].includes(pathname)
        return (
          <NavLink
            key={path}
            to={path}
            end
            className={({ isActive }) => isActive || utilitario ? 'active' : undefined}
            onClick={(event) => {
              if (path === '/mais' && pathname === '/mais') {
                event.preventDefault()
                window.scrollTo(0, 0)
              }
            }}
            data-testid={`nav.${label.toLowerCase()}`}
          >
            <span className="nav-icon"><Icon name={icon} size={19} /></span>
            <span className="nav-label">{label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}

export default function App() {
  return (
    <DbProvider>
      <GoogleSyncProvider>
        <BrowserRouter>
          <Rotas />
        </BrowserRouter>
      </GoogleSyncProvider>
    </DbProvider>
  )
}

function Rotas() {
  const location = useLocation()
  const db = useDb()
  const [perfil, setPerfil] = useState<string | null>(null)
  const loginForcado = Boolean(
    location.state
      && typeof location.state === 'object'
      && 'login' in location.state
      && location.state.login === true,
  )

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let ativo = true
    let removerListener: (() => void) | null = null
    void CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      const indiceHistorico = window.history.state?.idx
      if (canGoBack || (typeof indiceHistorico === 'number' && indiceHistorico > 0)) {
        window.history.back()
        return
      }
      void CapacitorApp.exitApp().catch((error: unknown) => {
        console.error('Não foi possível fechar o aplicativo pelo botão Voltar.', error)
      })
    }).then((listener) => {
      if (ativo) removerListener = () => { void listener.remove() }
      else void listener.remove()
    }).catch((error: unknown) => {
      console.error('Não foi possível registrar o botão Voltar do Android.', error)
    })

    return () => {
      ativo = false
      removerListener?.()
    }
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  useEffect(() => {
    let ativo = true
    const carregarPerfil = () => {
      void lerConfig(db).then((config) => {
      if (ativo) setPerfil(config.nome_usuario?.trim() ?? '')
      }).catch(() => {
      if (ativo) setPerfil('')
      })
    }
    carregarPerfil()
    const cancelar = subscribeDatabaseChanges(carregarPerfil)
    return () => {
      ativo = false
      cancelar()
    }
  }, [db])

  if (perfil === null) return <AppLoading />
  const precisaConfigurarPerfil = !perfil || loginForcado
  if (precisaConfigurarPerfil && location.pathname !== '/login' && location.pathname !== '/primeiro-acesso') return <Navigate to="/login" replace />
  if (!precisaConfigurarPerfil && location.pathname === '/login' && !loginForcado) return <Navigate to="/" replace />

  return (
    <div className={`phone${precisaConfigurarPerfil ? ' first-access-shell' : ''}${location.pathname === '/mais' ? ' more-shell' : ''}`}>
      <main>
        <Suspense fallback={<AppLoading />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/primeiro-acesso" element={<Navigate to="/login" replace />} />
          <Route path="/" element={<Inicio />} />
          <Route path="/precificacao" element={<Precificacao />} />
          <Route path="/receitas" element={<Receitas />} />
          <Route path="/estoque" element={<Insumos />} />
          <Route path="/producao" element={<Navigate to="/mais" replace />} />
          <Route path="/planejamento" element={<Compra />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/clientes" element={<Gestao tela="clientes" />} />
          <Route path="/fornecedores" element={<Gestao tela="fornecedores" />} />
          <Route path="/encomendas" element={<Gestao tela="encomendas" />} />
          <Route path="/financeiro" element={<Gestao tela="financeiro" />} />
          <Route path="/vender" element={<Vender />} />
          <Route path="/venda/:id" element={<Comprovante />} />
          <Route path="/mais" element={<Mais />} />
          <Route path="/menu" element={<MenuUsuario />} />
          <Route path="/produtos" element={<Produtos />} />
          <Route path="/compra" element={<Compra />} />
          <Route path="/custos" element={<Custos />} />
          <Route path="/categorias" element={<Categorias />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </main>
      {!precisaConfigurarPerfil && <Navegacao />}
    </div>
  )
}
