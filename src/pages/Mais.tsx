import { Link } from 'react-router-dom'
import { Icon } from './ui'

export default function Mais() {
  return (
    <div className="more-page">
      <h1>Mais</h1>
      <p className="sb">Tudo do seu negócio</p>
      <div className="menu-grid">
        <Link className="menu-tile" to="/produtos" data-testid="mais.produtos"><span className="ic"><Icon name="box" /></span>Produtos à venda<small>Embalagens e preços</small></Link>
        <Link className="menu-tile" to="/vender" data-testid="mais.vendas"><span className="ic"><Icon name="cart" /></span>Vendas<small>Vendas e encomendas</small></Link>
        <Link className="menu-tile" to="/encomendas" data-testid="mais.encomendas"><span className="ic"><Icon name="cart" /></span>Encomendas<small>Pedidos e entregas</small></Link>
        <Link className="menu-tile" to="/compra" data-testid="mais.compra"><span className="ic"><Icon name="cart" /></span>Compras<small>Necessidades e compras de insumos</small></Link>
        <Link className="menu-tile" to="/custos" data-testid="mais.custos"><span className="ic"><Icon name="settings" /></span>Custos e configurações<small>Taxas e margem padrão</small></Link>
        <Link className="menu-tile" to="/precificacao" data-testid="mais.precificacao"><span className="ic"><Icon name="price" /></span>Precificação<small>Simular preço do pacote</small></Link>
        <Link className="menu-tile" to="/clientes" data-testid="mais.clientes"><span className="ic"><Icon name="more" /></span>Clientes<small>Contatos e histórico</small></Link>
        <Link className="menu-tile" to="/fornecedores" data-testid="mais.fornecedores"><span className="ic"><Icon name="box" /></span>Fornecedores<small>Contatos e compras</small></Link>
        <Link className="menu-tile" to="/financeiro" data-testid="mais.financeiro"><span className="ic"><Icon name="cost" /></span>Financeiro<small>A pagar, a receber e caixa</small></Link>
        <Link className="menu-tile" to="/relatorios" data-testid="mais.relatorios"><span className="ic"><Icon name="price" /></span>Relatórios<small>Resultados e exportações</small></Link>
      </div>
    </div>
  )
}
