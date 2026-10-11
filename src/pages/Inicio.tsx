import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDb } from '../data/DbContext'
import { formatBRL } from '../domain/money'
import { Icon } from './ui'
import { carregarAvatar } from './avatar'

interface Resumo {
  faturamentoMes: number
  lucroMes: number
  vendasHoje: number
  receitas: number
  produtos: number
  insumos: number
  itensExemplo: number
  nomeUsuario: string
}

export default function Inicio() {
  const db = useDb()
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [erro, setErro] = useState('')
  const agora = new Date()
  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).toISOString()
  const fimHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1).toISOString()
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString()
  const fimMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 1).toISOString()
  const saudacao = agora.getHours() < 12 ? 'Bom dia!' : agora.getHours() < 18 ? 'Boa tarde!' : 'Boa noite!'

  useEffect(() => {
    let ativo = true
    const carregar = async () => {
      try {
        const [vendas, lucro, vendasHoje, receitas, produtos, insumos, exemplos, usuario] = await Promise.all([
          db.query<{ total: number }>(
            'SELECT COALESCE(SUM(total_cents), 0) AS total FROM venda WHERE deleted_at IS NULL AND data >= ? AND data < ?',
            [inicioMes, fimMes],
          ),
          db.query<{ total: number }>(
            `SELECT COALESCE(SUM(vi.quantidade * (vi.preco_unit_cents - vi.custo_unit_cents)), 0) AS total
             FROM venda_item vi JOIN venda v ON v.id = vi.venda_id
             WHERE v.deleted_at IS NULL AND v.data >= ? AND v.data < ?`,
            [inicioMes, fimMes],
          ),
          db.query<{ total: number }>(
            'SELECT COUNT(*) AS total FROM venda WHERE deleted_at IS NULL AND data >= ? AND data < ?',
            [inicioHoje, fimHoje],
          ),
          db.query<{ total: number }>('SELECT COUNT(*) AS total FROM receita WHERE deleted_at IS NULL'),
          db.query<{ total: number }>('SELECT COUNT(*) AS total FROM produto WHERE deleted_at IS NULL'),
          db.query<{ total: number }>('SELECT COUNT(*) AS total FROM insumo WHERE deleted_at IS NULL'),
          db.query<{ total: number }>(
            `SELECT
              (SELECT COUNT(*) FROM insumo WHERE deleted_at IS NULL AND nome LIKE '%(exemplo)%') +
              (SELECT COUNT(*) FROM receita WHERE deleted_at IS NULL AND nome LIKE '%(exemplo)%') +
              (SELECT COUNT(*) FROM produto WHERE deleted_at IS NULL AND nome LIKE '%(exemplo)%') AS total`,
          ),
          db.query<{ valor: string }>('SELECT valor FROM config WHERE chave=?', ['nome_usuario']),
        ])
        if (!ativo) return
        setResumo({
          faturamentoMes: vendas[0]?.total ?? 0,
          lucroMes: lucro[0]?.total ?? 0,
          vendasHoje: vendasHoje[0]?.total ?? 0,
          receitas: receitas[0]?.total ?? 0,
          produtos: produtos[0]?.total ?? 0,
          insumos: insumos[0]?.total ?? 0,
          itensExemplo: exemplos[0]?.total ?? 0,
          nomeUsuario: usuario[0]?.valor ?? '',
        })
        setErro('')
      } catch (e) {
        if (ativo) setErro(e instanceof Error ? e.message : String(e))
      }
    }
    void carregar()
    return () => { ativo = false }
  }, [db, inicioHoje, fimHoje, inicioMes, fimMes])

  const mesNome = agora.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  return (
    <>
      <header className="home-header">
        <Link className="home-avatar-link" to="/menu" aria-label="Abrir menu do usuário" data-testid="inicio.menu-usuario">
          <img className="home-avatar" src={carregarAvatar()} alt="" />
        </Link>
        <div><small>{agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</small><h1>{saudacao}</h1>
         <p className="sb">{resumo?.nomeUsuario} </p>
        </div>
       
      </header>
      
      {erro && <p className="notice error" role="alert">Não foi possível carregar o resumo: {erro}</p>}
      {!resumo ? <p className="notice" role="status">Carregando o resumo...</p> : (
        <>
          {/* {resumo.itensExemplo > 0 && <p className="notice">Catálogo demonstrativo: os cadastros com “(exemplo)” são dados de teste e podem ser excluídos.</p>} */}
          <section className="hero" aria-label="Faturamento no mês">
            <small>Faturamento no mês</small>
            <b>{formatBRL(resumo.faturamentoMes)}</b>
            <small>Lucro estimado nas vendas: {formatBRL(resumo.lucroMes)}</small>
          </section>

          <section className="quick-actions" aria-label="Ações rápidas">
            <Link to="/vender"><span className="quick-icon"><Icon name="sell" /></span>Vender</Link>
            <Link to="/receitas"><span className="quick-icon"><Icon name="recipe" /></span>Receitas</Link>
            <Link to="/compra"><span className="quick-icon"><Icon name="cart" /></span>Comprar</Link>
          </section>

          <section className="metric-grid" aria-label="Resumo operacional">
            <div className="cd metric"><small>Vendas hoje</small><b>{resumo.vendasHoje}</b><span>registradas</span></div>
            <div className="cd metric"><small>Receitas</small><b>{resumo.receitas}</b><span>cadastradas</span></div>
            <div className="cd metric"><small>Produtos</small><b>{resumo.produtos}</b><span>à venda</span></div>
            <div className="cd metric"><small>Insumos</small><b>{resumo.insumos}</b><span>cadastrados</span></div>
          </section>

          <section className="cd home-links">
            <h2>Comece por aqui</h2>
            <Link to="/precificacao" className="r"><span className="ic"><Icon name="price" /></span><span>Precificar produto<small>Calcule preço e margem</small></span><span aria-hidden="true">›</span></Link>
            <Link to="/mais" className="r"><span className="ic"><Icon name="more" /></span><span>Mais opções<small>Produtos, custos e sincronização</small></span><span aria-hidden="true">›</span></Link>
          </section>
        </>
      )}
    </>
  )
}
