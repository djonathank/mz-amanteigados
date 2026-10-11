import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDb } from '../data/DbContext'
import { carregarBase, custoDaVariante, type Base } from '../data/calculos'
import { atualizarPrecoVariante } from '../data/repos'
import { formatBRL } from '../domain/money'
import { profit, realMargin, suggestedPrice, unitCost } from '../domain/pricing'
import { Campo, Selecao } from './ui'

const FORMAS_PAGAMENTO: [string, string][] = [['pix', 'Pix'], ['cartao', 'Cartão'], ['dinheiro', 'Dinheiro']]

export default function Precificacao() {
  const db = useDb()
  const [search] = useSearchParams()
  const [base, setBase] = useState<Base | null>(null)
  const [varianteId, setVarianteId] = useState('')
  const [lote, setLote] = useState(Number(search.get('lote')) || 60.2)
  const [pacotes, setPacotes] = useState(Number(search.get('pacotes')) || 8)
  const [margem, setMargem] = useState(40)
  const [formaPagamento, setFormaPagamento] = useState<'pix' | 'cartao' | 'dinheiro'>('pix')
  const [aumento, setAumento] = useState(10)
  const [aviso, setAviso] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    let ativo = true
    void carregarBase(db).then((dados) => {
      if (!ativo) return
      setBase(dados)
      const receitaId = search.get('receita')
      const padrao = dados.variantes.find((variant) => variant.receita_id === receitaId)?.id ?? dados.variantes[0]?.id ?? 'manual'
      setVarianteId(padrao)
      const margemConfigurada = Number(dados.config.margem_padrao ?? 40)
      setMargem(Number.isFinite(margemConfigurada) ? margemConfigurada : 40)
    }).catch((e) => {
      if (ativo) setErro(e instanceof Error ? e.message : String(e))
    })
    return () => { ativo = false }
  }, [db, search])

  const taxa = formaPagamento === 'cartao'
    ? Number(base?.config.taxa_cartao ?? 3.5)
    : formaPagamento === 'pix'
      ? Number(base?.config.taxa_pix ?? 0)
      : 0
  const opcoesPagamento: [string, string][] = [
    ['pix', `Pix (${Number(base?.config.taxa_pix ?? 0)}%)`],
    ['cartao', `Cartão (${Number(base?.config.taxa_cartao ?? 3.5)}%)`],
    ['dinheiro', 'Dinheiro (0%)'],
  ]

  const variante = base?.variantes.find((item) => item.id === varianteId)
  const receita = variante ? base?.receitas.find((item) => item.id === variante.receita_id) : undefined
  let custoPacote = 0
  let calculoErro = ''
  try {
    custoPacote = variante && base
      ? custoDaVariante(variante, base)
      : base && Number.isFinite(lote) && Number.isFinite(pacotes) && pacotes > 0
        ? unitCost(Math.round(lote * 100), pacotes)
        : 0
  } catch (e) {
    calculoErro = e instanceof Error ? e.message : String(e)
  }
  const quantidadePacotes = variante ? 1 : pacotes
  const valido = Number.isFinite(custoPacote) && custoPacote > 0
    && Number.isFinite(quantidadePacotes) && quantidadePacotes > 0
    && Number.isFinite(margem) && margem >= 0 && Number.isFinite(taxa) && taxa >= 0 && margem + taxa < 100
  let preco = 0
  if (valido) {
    try {
      preco = suggestedPrice({ custoUnitario: custoPacote, margem: margem / 100, taxa: taxa / 100 })
    } catch (e) {
      calculoErro = e instanceof Error ? e.message : String(e)
    }
  }

  const simulacao = useMemo(() => {
    if (!base || !receita || !variante || !(Number.isFinite(aumento) && aumento >= 0)
      || !(Number.isFinite(margem) && margem >= 0 && Number.isFinite(taxa) && taxa >= 0 && margem + taxa < 100)) {
      return { itens: [], erro: '' }
    }
    try {
    const usados = new Set<string>()
    const visitar = (receitaId: string, percorridas: Set<string>) => {
      if (percorridas.has(receitaId)) return
      const proximas = new Set(percorridas).add(receitaId)
      base.itens.filter((item) => item.receita_id === receitaId).forEach((item) => {
        if (item.insumo_id) usados.add(item.insumo_id)
        if (item.subreceita_id) visitar(item.subreceita_id, proximas)
      })
    }
    visitar(receita.id, new Set())
    const itens = base.insumos.filter((insumo) => usados.has(insumo.id)).map((insumo) => {
      const comAumento: Base = {
        ...base,
        insumos: base.insumos.map((item) => item.id === insumo.id
          ? { ...item, custo_medio: item.custo_medio * (1 + aumento / 100) }
          : item),
      }
      const novoCusto = custoDaVariante(variante, comAumento)
      const resultado = suggestedPrice({ custoUnitario: novoCusto, margem: margem / 100, taxa: taxa / 100 })
      return { insumo, custoNovo: novoCusto, precoNovo: resultado, delta: novoCusto - custoPacote }
    })
    return { itens, erro: '' }
    } catch (e) {
      return { itens: [], erro: e instanceof Error ? e.message : String(e) }
    }
  }, [aumento, base, custoPacote, margem, receita, taxa, variante])
  const simulacoes = simulacao.itens

  const campo = (rotulo: string, valor: number, set: (n: number) => void, id: string, mascara: 'dinheiro' | 'percentual' | 'inteiro' = 'percentual') => (
    <Campo
      rotulo={rotulo}
      id={`preco.${id}`}
      valor={valor}
      mascara={mascara}
      onChange={(value) => set(value === '' || value === '-' ? 0 : Number(value))}
    />
  )

  const salvarPreco = async () => {
    if (!variante || !valido) return
    try {
      await atualizarPrecoVariante(db, variante.id, preco)
      setBase((atual) => actualizaPreco(atual, variante.id, preco))
      setAviso(`Preço sugerido de ${variante.nome} salvo no cadastro do produto.`)
      setErro('')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  if (!base && !erro) return <p className="notice" role="status">Carregando dados para precificar...</p>

  return (
    <>
      <h1>Precificação</h1>
      <p className="sb">Calcule preço, lucro e margem de cada pacote</p>
      {erro && <p className="notice error" role="alert">{erro}</p>}
      {aviso && <p className="notice success" role="status">{aviso}</p>}
      {calculoErro && <p className="notice error" role="alert">{calculoErro}</p>}
      {base && base.variantes.length > 0 && (
        <div className="cd">
          <h2>Produto para precificar</h2>
          <Selecao
            rotulo="Produto e embalagem"
            id="preco.variante"
            valor={varianteId}
            onChange={(id) => { setVarianteId(id); setAviso('') }}
            opcoes={[['manual', 'Informar custo do lote'], ...base.variantes.map((item) => [item.id, `${item.produto_nome} · ${item.nome}`] as [string, string])]}
          />
          {receita && <p className="helper">Receita: {receita.nome} · custo inclui ingredientes, tempo de preparo, gás, embalagem e rótulo.</p>}
        </div>
      )}
      <div className="hero">
        <small>Preço sugerido {variante ? 'por pacote' : 'por pacote'}</small>
        <b data-testid="preco.resultado">{valido && !calculoErro ? formatBRL(preco) : '--'}</b>
        {valido && !calculoErro && (
          <small>
            custo {formatBRL(custoPacote)} · lucro {formatBRL(profit(preco, custoPacote, taxa / 100))} ·
            margem real {(realMargin(preco, custoPacote, taxa / 100) * 100).toFixed(1).replace('.', ',')}%
          </small>
        )}
        {!valido && !erro && <small>Confira o custo, o rendimento e se a margem mais as taxas ficam abaixo de 100%.</small>}
      </div>
      <div className="cd">
        <h2>Simular preço</h2>
        {!variante && (
          <>
            {campo('Custo do lote (R$)', lote, setLote, 'custo-lote', 'dinheiro')}
            {campo('Pacotes que o lote rende', pacotes, setPacotes, 'pacotes', 'inteiro')}
          </>
        )}
        <div className="g">
          {campo('Margem desejada (%)', margem, setMargem, 'margem')}
          <Selecao
            rotulo="Forma de pagamento"
            id="preco.forma-pagamento"
            valor={formaPagamento}
            onChange={(value) => {
              if (value === 'pix' || value === 'cartao' || value === 'dinheiro') setFormaPagamento(value)
            }}
            opcoes={opcoesPagamento}
          />
        </div>
        <p className="helper">
          A margem inicial vem de Custos e configurações. A taxa considera a tarifa do meio de pagamento selecionado; dinheiro não tem taxa.
        </p>
        {variante && valido && <button className="bt" data-testid="preco.salvar" onClick={salvarPreco}>Salvar preço no produto</button>}
        {base?.variantes.length === 0 && <p className="notice">Cadastre uma receita e um produto para calcular o custo automaticamente. Enquanto isso, informe o custo do lote acima.</p>}
      </div>
    </>
  )
}

function actualizaPreco(base: Base | null, id: string, precoCents: number): Base | null {
  if (!base) return base
  return { ...base, variantes: base.variantes.map((v) => v.id === id ? { ...v, preco_cents: precoCents } : v) }
}
