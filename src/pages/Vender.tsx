import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDb } from '../data/DbContext'
import { carregarBase, custoDaVariante, type Base } from '../data/calculos'
import { registrarVenda } from '../data/repos'
import { listarClientes, salvarEncomenda, type ClienteRow } from '../data/phase3'
import { formatBRL } from '../domain/money'
import { Campo, FecharModal, Selecao, SeletorData } from './ui'

const FORMAS: [string, string][] = [['pix', 'Pix'], ['dinheiro', 'Dinheiro'], ['cartao', 'Cartão']]
const padraoData = () => {
  const hoje = new Date()
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
}
const proximoDia = (data: string) => {
  const proximo = new Date(`${data}T12:00:00`)
  proximo.setDate(proximo.getDate() + 1)
  return `${proximo.getFullYear()}-${String(proximo.getMonth() + 1).padStart(2, '0')}-${String(proximo.getDate()).padStart(2, '0')}`
}
export default function Vender() {
  const db = useDb()
  const nav = useNavigate()
  const [base, setBase] = useState<Base | null>(null)
  const [carrinho, setCarrinho] = useState<Record<string, number>>({})
  const [forma, setForma] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [clientes, setClientes] = useState<ClienteRow[]>([])
  const [desconto, setDesconto] = useState('')
  const [modo, setModo] = useState<'agora' | 'agendada'>('agora')
  const [dataEntrega, setDataEntrega] = useState(padraoData())
  const [observacoes, setObservacoes] = useState('')
  const [motivoEstoquePendente, setMotivoEstoquePendente] = useState('')
  const [motivoEstoque, setMotivoEstoque] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  useEffect(() => {
    let ativo = true
    void Promise.all([carregarBase(db), listarClientes(db)]).then(([dados, customers]) => {
      if (ativo) { setBase(dados); setClientes(customers) }
    })
      .catch((e) => { if (ativo) setErro(e instanceof Error ? e.message : String(e)) })
    return () => { ativo = false }
  }, [db])
  if (!base) return erro
    ? <p className="notice error" role="alert">{erro}</p>
    : <p className="notice" role="status">Carregando produtos...</p>

  const itens = base.variantes.filter((v) => carrinho[v.id])
  const subtotal = itens.reduce((s, v) => s + carrinho[v.id] * v.preco_cents, 0)
  const descontoCents = Math.round(Number(desconto || 0) * 100)
  const total = modo === 'agora' ? Math.max(0, subtotal - descontoCents) : subtotal
  const hoje = padraoData()
  const dataMinimaEncomenda = proximoDia(hoje)
  const mudar = (id: string, d: number) => setCarrinho((atual) => ({ ...atual, [id]: Math.max(0, (atual[id] ?? 0) + d) }))
  const finalizar = async (motivoEstoqueNegativo?: string) => {
    if (!itens.length || salvando || !clienteId || (modo === 'agora' && (!forma || descontoCents > subtotal))
      || (modo === 'agendada' && (!dataEntrega || dataEntrega < dataMinimaEncomenda))) return
    setSalvando(true)
    setErro('')
    try {
      if (modo === 'agendada') {
        await salvarEncomenda(db, {
          clienteId: clienteId || undefined,
          dataEntrega,
          observacoes,
          itens: itens.map((v) => ({ varianteId: v.id, quantidade: carrinho[v.id], precoUnitCents: v.preco_cents })),
        })
        nav('/encomendas')
        return
      }
      const venda = (reason?: string) => registrarVenda(db, {
        forma,
        clienteId: clienteId || null,
        descontoCents,
        motivoEstoqueNegativo: reason,
        itens: itens.map((v) => ({ varianteId: v.id, quantidade: carrinho[v.id], precoCents: v.preco_cents, custoCents: custoDaVariante(v, base) })),
      })
      let id: string
      try {
        id = await venda(motivoEstoqueNegativo)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (motivoEstoqueNegativo || !message.includes('Informe o motivo para confirmar saldo negativo')) throw error
        setMotivoEstoquePendente(message)
        return
      }
      nav(`/venda/${id}`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <h1>Vendas</h1>
      <p className="sb">Venda agora ou agende uma venda para outra data.</p>
      <div className="sg" role="group" aria-label="Tipo de pedido">
        <button type="button" className={modo === 'agora' ? 'a' : ''} onClick={() => setModo('agora')}>Vender agora</button>
        <button type="button" className={modo === 'agendada' ? 'a' : ''} onClick={() => { setModo('agendada'); if (dataEntrega < dataMinimaEncomenda) setDataEntrega(dataMinimaEncomenda) }}>Venda agendada</button>
      </div>
      {erro && <p className="notice error" role="alert">{erro}</p>}
      {base.variantes.length === 0 && <p className="notice">Cadastre um produto em Mais, Produtos à venda.</p>}
      <section className="cd order-intro-card">
        <h2>Pedido</h2>
        <Selecao rotulo="Cliente obrigatório" placeholder="Selecionar cliente" id="venda.cliente" valor={clienteId}
          onChange={setClienteId} opcoes={clientes.map((customer) => [customer.id, customer.nome])} />
        <div className="order-intro-summary"><span>Quantidade</span><b>{itens.reduce((sum, item) => sum + carrinho[item.id], 0) || 0} pacote(s)</b></div>
      </section>
      {clienteId && <>
      <section className="sales-products">
        <div className="g product-grid">
        {base.variantes.map((v) => (
          <button className="tl" key={v.id} data-testid="venda.produto" onClick={() => mudar(v.id, 1)}>
            <span className="product-add" aria-hidden="true">+</span>
            <strong>{v.produto_nome}</strong><b>{v.nome}</b>{formatBRL(v.preco_cents)}
          </button>
        ))}
        </div>
      </section>
      {itens.length > 0 && <div className="cd cart-card">
          <h2>{modo === 'agendada' ? 'Venda agendada' : 'Sua venda'}</h2>
          <div className="cart-lines">
            {itens.map((item) => <div className="r cart-line" key={item.id}>
              <span>{item.produto_nome}<small>{item.nome} · {formatBRL(item.preco_cents * carrinho[item.id])}</small></span>
              <div className="quantity-controls" aria-label={`Quantidade de ${item.produto_nome} ${item.nome}`}>
                <button className="lk" type="button" aria-label={`Remover uma unidade de ${item.nome}`} onClick={() => mudar(item.id, -1)}>−</button>
                <b>{carrinho[item.id]}</b>
                <button className="lk" type="button" aria-label={`Adicionar uma unidade de ${item.nome}`} onClick={() => mudar(item.id, 1)}>+</button>
              </div>
            </div>)}
          </div>
          {modo === 'agendada' ? <>
            <SeletorData rotulo="Data da entrega" id="encomenda.data" valor={dataEntrega}
              min={dataMinimaEncomenda} required onChange={setDataEntrega} />
            <Campo rotulo="Observações" id="encomenda.observacoes" valor={observacoes} onChange={setObservacoes} />
          </> : <>
            <SeletorData rotulo="Data da venda" id="venda.data" valor={hoje} disabled onChange={() => undefined} />
            <Campo rotulo="Desconto (R$)" id="venda.desconto" valor={desconto} onChange={setDesconto} mascara="dinheiro" />
          </>}
          {descontoCents > subtotal && <p className="notice error" role="alert">O desconto não pode ser maior que o subtotal.</p>}
         </div>}
      {modo === 'agora' && itens.length > 0 && <div className="sg approved-payment" role="group" aria-label="Forma de pagamento">
        {FORMAS.map(([value, label]) => <button key={value} type="button" className={forma === value ? 'a' : ''} onClick={() => setForma(value)}>{label}</button>)}
      </div>}
      {itens.length > 0 && (
        <div className="sales-summary" role="region" aria-label="Resumo do carrinho">
          <div><small>{itens.reduce((sum, item) => sum + carrinho[item.id], 0)} itens</small><b>{formatBRL(total)}</b></div>
          <button className="bt" data-testid="venda.finalizar"
            disabled={salvando || !clienteId || (modo === 'agora' && (!forma || descontoCents > subtotal))
              || (modo === 'agendada' && (!dataEntrega || dataEntrega < dataMinimaEncomenda))}
            onClick={() => void finalizar()}>
            {salvando ? 'Salvando...' : modo === 'agora' ? 'Finalizar venda' : 'Agendar venda'}
          </button>
        </div>
      )}
      </>}
      {motivoEstoquePendente && <section className="cd stock-modal" role="alertdialog" aria-modal="true" aria-labelledby="motivo-estoque-titulo">
        <FecharModal onClick={() => { setMotivoEstoquePendente(''); setMotivoEstoque('') }} />
        <h2 id="motivo-estoque-titulo">Confirmar venda com estoque negativo</h2>
        <p className="notice error">{motivoEstoquePendente}</p>
        <Campo rotulo="Motivo" id="venda.motivo-estoque" valor={motivoEstoque} onChange={setMotivoEstoque} />
        <div className="alert-actions">
          <button className="lk" type="button" onClick={() => { setMotivoEstoquePendente(''); setMotivoEstoque('') }}>Cancelar</button>
          <button className="bt" type="button" disabled={!motivoEstoque.trim() || salvando} onClick={() => { setMotivoEstoquePendente(''); void finalizar(motivoEstoque.trim()) }}>Confirmar venda</button>
        </div>
      </section>}
    </>
  )
}
