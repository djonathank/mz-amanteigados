import { Link } from 'react-router-dom'
import { Icon } from './ui'

export const maisOpcoes = [
  { to: '/custos', icon: 'calculator', titulo: 'Custos', descricao: 'Taxas e margem padrão', teste: 'mais.custos' },
  { to: '/clientes', icon: 'users', titulo: 'Clientes', descricao: 'Contatos e histórico', teste: 'mais.clientes' },
  { to: '/fornecedores', icon: 'truck', titulo: 'Fornecedores', descricao: 'Contatos e compras', teste: 'mais.fornecedores' },
  { to: '/estoque', icon: 'stock', titulo: 'Estoque', descricao: 'Saldos e movimentações', teste: 'mais.estoque' },
  { to: '/receitas', icon: 'recipe', titulo: 'Receitas', descricao: 'Fichas técnicas e custos', teste: 'mais.receitas' },
  { to: '/compra', icon: 'cart', titulo: 'Compras', descricao: 'Necessidades e compras de insumos', teste: 'mais.compra' },
  { to: '/produtos', icon: 'box', titulo: 'Produtos à venda', descricao: 'Embalagens e preços', teste: 'mais.produtos' },
  { to: '/vender', icon: 'sell', titulo: 'Vendas', descricao: 'Vender agora ou agendar', teste: 'mais.vendas' },
  { to: '/encomendas', icon: 'calendar', titulo: 'Gestão de pedidos', descricao: 'Acompanhar e finalizar pedidos', teste: 'mais.encomendas' },
  { to: '/precificacao', icon: 'price', titulo: 'Precificação', descricao: 'Simular preço do pacote', teste: 'mais.precificacao' },
  { to: '/financeiro', icon: 'cost', titulo: 'Financeiro', descricao: 'A pagar, a receber e caixa', teste: 'mais.financeiro' },
  { to: '/categorias', icon: 'tag', titulo: 'Categorias', descricao: 'Organize receitas e despesas', teste: 'mais.categorias' },
  { to: '/relatorios', icon: 'chart', titulo: 'Relatórios', descricao: 'Resultados e exportações', teste: 'mais.relatorios' },
] as const

export default function Mais() {
  return (
    <div className="more-page">
      <h1>Mais</h1>
      <p className="sb">Tudo do seu negócio</p>
      <div className="menu-grid">
        {maisOpcoes.map((opcao) => (
          <Link className="menu-tile" to={opcao.to} data-testid={opcao.teste} key={opcao.to}>
            <span className="ic"><Icon name={opcao.icon} /></span>
            {opcao.titulo}
            <small>{opcao.descricao}</small>
          </Link>
        ))}
      </div>
    </div>
  )
}
