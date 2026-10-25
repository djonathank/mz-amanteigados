import { Link } from 'react-router-dom'
import { Icon } from './ui'

export default function Mais() {
  return (
    <div className="more-page">
      <h1>Mais</h1>
      <p className="sb">Tudo do seu negócio</p>
      <div className="menu-grid">
        <Link className="menu-tile" to="/custos" data-testid="mais.custos"><span className="ic"><Icon name="calculator" /></span>Custos<small>Taxas e margem padrão</small></Link>
        <Link className="menu-tile" to="/clientes" data-testid="mais.clientes"><span className="ic"><Icon name="users" /></span>Clientes<small>Contatos e histórico</small></Link>
        <Link className="menu-tile" to="/fornecedores" data-testid="mais.fornecedores"><span className="ic"><Icon name="truck" /></span>Fornecedores<small>Contatos e compras</small></Link>
        <Link className="menu-tile" to="/estoque" data-testid="mais.estoque"><span className="ic"><Icon name="stock" /></span>Estoque<small>Saldos e movimentações</small></Link>
        <Link className="menu-tile" to="/receitas" data-testid="mais.receitas"><span className="ic"><Icon name="recipe" /></span>Receitas<small>Fichas técnicas e custos</small></Link>
        <Link className="menu-tile" to="/compra" data-testid="mais.compra"><span className="ic"><Icon name="cart" /></span>Compras<small>Necessidades e compras de insumos</small></Link>
        <Link className="menu-tile" to="/produtos" data-testid="mais.produtos"><span className="ic"><Icon name="box" /></span>Produtos à venda<small>Embalagens e preços</small></Link>
        <Link className="menu-tile" to="/vender" data-testid="mais.vendas"><span className="ic"><Icon name="sell" /></span>Vendas<small>Vender agora ou agendar</small></Link>
        <Link className="menu-tile" to="/encomendas" data-testid="mais.encomendas"><span className="ic"><Icon name="calendar" /></span>Gestão de pedidos<small>Acompanhar e finalizar pedidos</small></Link>
        <Link className="menu-tile" to="/precificacao" data-testid="mais.precificacao"><span className="ic"><Icon name="price" /></span>Precificação<small>Simular preço do pacote</small></Link>
        <Link className="menu-tile" to="/financeiro" data-testid="mais.financeiro"><span className="ic"><Icon name="cost" /></span>Financeiro<small>A pagar, a receber e caixa</small></Link>
        <Link className="menu-tile" to="/categorias" data-testid="mais.categorias"><span className="ic"><Icon name="tag" /></span>Categorias<small>Organize receitas e despesas</small></Link>
        <Link className="menu-tile" to="/relatorios" data-testid="mais.relatorios"><span className="ic"><Icon name="chart" /></span>Relatórios<small>Resultados e exportações</small></Link>
      </div>
    </div>
  )
}
