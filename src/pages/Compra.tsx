import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDb } from '../data/DbContext'
import { listarInsumos, registrarCompra, type InsumoRow } from '../data/repos'
import { listarNecessidadesEncomendas } from '../data/phase2'
import { baseOf, type Unit } from '../domain/units'
import { listarFornecedores, type FornecedorRow } from '../data/phase3'
import { AlertaConclusao, Campo, Selecao } from './ui'

const UNIDADES: [string, string][] = ['kg', 'g', 'l', 'ml', 'un'].map((u) => [u, u])

interface Faltante {
  receita: string; insumo: string; unidade: string; necessario: number; disponivel: number; faltante: number
}

export default function Compra() {
  const db = useDb()
  const [insumos, setInsumos] = useState<InsumoRow[]>([])
  const [fornecedores, setFornecedores] = useState<FornecedorRow[]>([])
  const [necessidades, setNecessidades] = useState<Faltante[]>([])
  const [sel, setSel] = useState('')
  const [qtd, setQtd] = useState('')
  const [un, setUn] = useState('')
  const [total, setTotal] = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [pago, setPago] = useState('1')
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [carregando, setCarregando] = useState(true)
  useEffect(() => {
    let ativo = true
    void Promise.all([listarInsumos(db), listarFornecedores(db), listarNecessidadesEncomendas(db)]).then(([lista, supplierRows, shortages]) => {
      if (!ativo) return
      setInsumos(lista)
      setFornecedores(supplierRows)
      setNecessidades(shortages)
    }).catch((e) => {
      if (ativo) setErro(e instanceof Error ? e.message : String(e))
    }).finally(() => {
      if (ativo) setCarregando(false)
    })
    return () => { ativo = false }
  }, [db])

  const insumo = insumos.find((i) => i.id === sel)
  const compativel = !!insumo && !!un && baseOf(un as Unit) === insumo.unidade_base
  const valido = compativel && Number(qtd) > 0 && Number(total) > 0

  const salvar = async () => {
    if (!valido || salvando) return
    setSalvando(true)
    setErro('')
    try {
      await registrarCompra(db, {
        insumoId: sel, unidade: un as Unit, quantidade: Number(qtd), totalCents: Math.round(Number(total) * 100),
        fornecedorId: fornecedor || null, pago: pago === '1',
      })
      setSel('')
      setQtd('')
      setUn('')
      setTotal('')
      setFornecedor('')
      setPago('1')
      setConfirmacao('Compra registrada. O saldo, custo médio, histórico de preços e financeiro foram atualizados.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <AlertaConclusao mensagem={confirmacao} onConcluir={() => setConfirmacao('')} />
      <Link className="back-link" to="/mais">‹ Mais</Link>
      <h1>Compras</h1>
      <p className="sb">A compra atualiza o estoque e o custo médio ponderado do insumo.</p>
      {erro && <p className="notice error" role="alert">{erro}</p>}
      <div className="cd">
        <div className="section-heading"><h2>O que comprar</h2><span className="pl">{necessidades.length} itens</span></div>
        {necessidades.length === 0
          ? <p className="notice">O estoque atual cobre as encomendas abertas, ou ainda não há encomendas.</p>
          : <>
            <p className="sb">Necessidades calculadas a partir das encomendas abertas e do estoque atual.</p>
            {necessidades.map((item) => <div className="r" key={`${item.receita}-${item.insumo}`}>
              <span><b>{item.insumo}</b><small>Receita: {item.receita} · necessário {item.necessario} · disponível {item.disponivel}</small></span>
              <b>{item.faltante} {item.unidade}</b>
            </div>)}
          </>}
      </div>
      {carregando ? <p className="notice" role="status">Carregando insumos...</p> : insumos.length === 0 ? <p className="notice">Cadastre um insumo na aba Estoque primeiro.</p> : (
        <div className="cd" id="compra-form">
          <h2>Registrar compra</h2>
          <Selecao rotulo="Fornecedor" id="compra.fornecedor" valor={fornecedor} onChange={setFornecedor}
            opcoes={fornecedores.map((row) => [row.id, row.nome])} />
          <Selecao rotulo="Insumo" id="compra.insumo" valor={sel} onChange={setSel} opcoes={insumos.map((i) => [i.id, i.nome])} />
          <div className="g">
            <Campo rotulo="Quantidade" id="compra.quantidade" valor={qtd} onChange={setQtd} mascara="quantidade" />
            <Selecao rotulo="Unidade" id="compra.unidade" valor={un} onChange={setUn} opcoes={UNIDADES} />
          </div>
          {insumo && un && !compativel && <p className="sb">Use uma unidade compatível com o insumo ({insumo.unidade_base}).</p>}
          <Campo rotulo="Valor total pago (R$)" id="compra.total" valor={total} onChange={setTotal} mascara="dinheiro" />
          <Selecao rotulo="Situação do pagamento" id="compra.pago" valor={pago} onChange={setPago}
            opcoes={[['1', 'Pago agora'], ['0', 'Pendente']]} />
          <button className="bt" disabled={!valido || salvando} data-testid="compra.salvar" onClick={salvar}>
            {salvando ? 'Salvando...' : 'Salvar compra'}
          </button>
        </div>
      )}
    </>
  )
}
