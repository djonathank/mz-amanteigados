import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { DbProvider, useDb } from './data/DbContext'
import { GoogleSyncProvider } from './data/GoogleSyncContext'
import { lerConfig } from './data/repos'
import Comprovante from './pages/Comprovante'
import Compra from './pages/Compra'
import Custos from './pages/Custos'
import Insumos from './pages/Insumos'
import Inicio from './pages/Inicio'
import Mais from './pages/Mais'
import Precificacao from './pages/Precificacao'
import Produtos from './pages/Produtos'
import Receitas from './pages/Receitas'
import { Icon } from './pages/ui'
import Vender from './pages/Vender'
import PrimeiroAcesso from './pages/PrimeiroAcesso'
import MenuUsuario from './pages/MenuUsuario'
import Relatorios from './pages/Relatorios'
import Gestao from './pages/Gestao'

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
  if (['/mais', '/menu', '/relatorios', '/custos', '/precificacao'].includes(pathname)) return '/vender'
  return pathname
}

function Navegacao() {
  const location = useLocation()
  const navigate = useNavigate()
  const { pathname } = location
  const [cadastroAberto, setCadastroAberto] = useState(false)

  useEffect(() => {
    if (!location.hash) return
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [location.hash, pathname])

  useEffect(() => { setCadastroAberto(false) }, [pathname, location.hash])

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

  const telaComOpcoesDeCadastro = pathname === '/estoque'

  return (
    <>
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
                aria-expanded={telaComOpcoesDeCadastro && cadastroAberto}
                onClick={() => {
                  if (telaComOpcoesDeCadastro) setCadastroAberto((aberto) => !aberto)
                  else abrirCadastro()
                }}
              />
            )
          }

          const utilitario = label === 'Mais' && [
            '/mais', '/menu', '/produtos', '/compra', '/custos', '/precificacao',
            '/planejamento', '/relatorios', '/clientes', '/fornecedores', '/encomendas', '/financeiro',
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
      {pathname === '/estoque' && cadastroAberto && <div className="stock-add-menu" role="menu" aria-label="Ações de insumo">
        <button type="button" role="menuitem" onClick={abrirCadastro}>
          <span className="stock-extra-action-icon"><Icon name="add" /></span>
          <span><b>Cadastrar insumo</b><small>Adicionar ingrediente, embalagem ou rótulo</small></span>
        </button>
        <button type="button" role="menuitem" onClick={() => { setCadastroAberto(false); navigate('/compra#compra-form') }}>
          <span className="stock-extra-action-icon"><Icon name="box" /></span>
          <span><b>Registrar compra</b><small>Adicionar uma compra de insumos</small></span>
        </button>
      </div>}
    </>
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

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  useEffect(() => {
    let ativo = true
    setPerfil(null)
    void lerConfig(db).then((config) => {
      if (ativo) setPerfil(config.nome_usuario?.trim() ?? '')
    }).catch(() => {
      if (ativo) setPerfil('')
    })
    return () => { ativo = false }
  }, [db, location.pathname])

  if (perfil === null) return <p className="sb">Preparando seu espaço...</p>
  const precisaConfigurarPerfil = !perfil
  if (precisaConfigurarPerfil && location.pathname !== '/primeiro-acesso') return <Navigate to="/primeiro-acesso" replace />
  if (!precisaConfigurarPerfil && location.pathname === '/primeiro-acesso') return <Navigate to="/" replace />

  return (
    <div className={`phone${precisaConfigurarPerfil ? ' first-access-shell' : ''}${location.pathname === '/mais' ? ' more-shell' : ''}`}>
      <main>
        <Routes>
          <Route path="/primeiro-acesso" element={<PrimeiroAcesso />} />
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
        </Routes>
      </main>
      {!precisaConfigurarPerfil && <Navegacao />}
    </div>
  )
}
