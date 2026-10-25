import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDb } from '../data/DbContext'
import { carregarBase, custoDaVariante, custoPorUnidade, type Base } from '../data/calculos'
import { atualizarPrecoVariante } from '../data/repos'
import { formatBRL } from '../domain/money'
import { profit, realMargin, suggestedPrice, unitCost } from '../domain/pricing'
import { AlertaConclusao, Campo, MensagemModal, Selecao } from './ui'

export default function Precificacao() {
  const db = useDb()
  const [search] = useSearchParams()
  const [base, setBase] = useState<Base | null>(null)
  const [varianteId, setVarianteId] = useState('')
  const [custoReceita, setCustoReceita] = useState('')
  const [pacotes, setPacotes] = useState('')
  const [margem, setMargem] = useState('40')
  const [formaPagamento, setFormaPagamento] = useState<'pix' | 'cartao_credito' | 'cartao_debito' | 'dinheiro'>('pix')
  const [aumento, setAumento] = useState(10)
  const [aviso, setAviso] = useState('')
  const [erro, setErro] = useState('')
  const [erroCalculadoFechado, setErroCalculadoFechado] = useState('')

  useEffect(() => {
    let ativo = true
    void carregarBase(db).then((dados) => {
      if (!ativo) return
      setBase(dados)
      const receitaId = search.get('receita')
      const receitaSelecionada = dados.receitas.find((item) => item.id === receitaId)
      const padrao = receitaSelecionada
        ? 'manual'
        : dados.variantes.find((variant) => variant.receita_id === receitaId)?.id ?? dados.variantes[0]?.id ?? 'manual'
      setVarianteId(padrao)
      if (receitaSelecionada) {
        const rendimentoUtil = receitaSelecionada.rendimento_qtd * (1 - receitaSelecionada.perda_pct)
        const custoTotal = custoPorUnidade(receitaSelecionada, dados) * rendimentoUtil / 100
        setCustoReceita(Number.isFinite(custoTotal) ? custoTotal.toFixed(2) : '')
        setPacotes(String(Math.round(rendimentoUtil)))
      } else {
        setCustoReceita('')
        setPacotes('')
      }
      const margemConfigurada = Number(dados.config.margem_padrao ?? 40)
      setMargem(Number.isFinite(margemConfigurada) ? String(margemConfigurada) : '40')
    }).catch((e) => {
      if (ativo) setErro(e instanceof Error ? e.message : String(e))
    })
    return () => { ativo = false }
  }, [db, search])

  const taxa = formaPagamento === 'cartao_credito'
    ? Number(base?.config.taxa_cartao_credito ?? base?.config.taxa_cartao ?? 3.5)
    : formaPagamento === 'cartao_debito'
      ? Number(base?.config.taxa_cartao_debito ?? base?.config.taxa_cartao ?? 3.5)
      : formaPagamento === 'pix' ? Number(base?.config.taxa_pix ?? 0) : 0
  const opcoesPagamento: [string, string][] = [
    ['pix', `Pix (${Number(base?.config.taxa_pix ?? 0)}%)`],
    ['cartao_credito', `Cartão de crédito (${Number(base?.config.taxa_cartao_credito ?? base?.config.taxa_cartao ?? 3.5)}%)`],
    ['cartao_debito', `Cartão de débito (${Number(base?.config.taxa_cartao_debito ?? base?.config.taxa_cartao ?? 3.5)}%)`],
    ['dinheiro', 'Dinheiro (0%)'],
  ]

  const variante = base?.variantes.find((item) => item.id === varianteId)
  const receita = variante ? base?.receitas.find((item) => item.id === variante.receita_id) : undefined
  let custoPacote = 0
  let calculoErro = ''
  try {
    custoPacote = variante && base
      ? custoDaVariante(variante, base)
      : base && Number.isFinite(Number(custoReceita)) && Number.isFinite(Number(pacotes)) && Number(pacotes) > 0
        ? unitCost(Math.round(Number(custoReceita) * 100), Number(pacotes))
        : 0
  } catch (e) {
    calculoErro = e instanceof Error ? e.message : String(e)
  }
  const quantidadePacotes = variante ? 1 : Number(pacotes)
  const margemNumero = Number(margem)
  const custoManualValido = Boolean(variante)
    || (Number(custoReceita) >= 0 && Number(custoReceita) <= 999.99)
  const valido = Number.isFinite(custoPacote) && custoPacote > 0
    && custoManualValido
    && Number.isInteger(quantidadePacotes) && quantidadePacotes > 0 && quantidadePacotes <= 999
    && Number.isFinite(margemNumero) && margemNumero >= 0 && margemNumero <= 100
    && Number.isFinite(taxa) && taxa >= 0 && taxa <= 100 && margemNumero + taxa < 100
  let preco = 0
  if (valido) {
    try {
      preco = suggestedPrice({ custoUnitario: custoPacote, margem: margemNumero / 100, taxa: taxa / 100 })
    } catch (e) {
      calculoErro = e instanceof Error ? e.message : String(e)
    }
  }

  const simulacao = useMemo(() => {
    if (!base || !receita || !variante || !(Number.isFinite(aumento) && aumento >= 0)
      || !(Number.isFinite(margemNumero) && margemNumero >= 0 && margemNumero <= 100
        && Number.isFinite(taxa) && taxa >= 0 && taxa <= 100 && margemNumero + taxa < 100)) {
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
      const resultado = suggestedPrice({ custoUnitario: novoCusto, margem: margemNumero / 100, taxa: taxa / 100 })
      return { insumo, custoNovo: novoCusto, precoNovo: resultado, delta: novoCusto - custoPacote }
    })
    return { itens, erro: '' }
    } catch (e) {
      return { itens: [], erro: e instanceof Error ? e.message : String(e) }
    }
  }, [aumento, base, custoPacote, margemNumero, receita, taxa, variante])
  const simulacoes = simulacao.itens
  const erroCalculado = calculoErro || simulacao.erro
  const erroVisivel = erro || (erroCalculado === erroCalculadoFechado ? '' : erroCalculado)

  useEffect(() => {
    if (!erroCalculado) setErroCalculadoFechado('')
  }, [erroCalculado])

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
      <p className="sb">Calcule preço, lucro e margem de cada produto</p>
      <AlertaConclusao mensagem={aviso} onConcluir={() => setAviso('')} />
      <MensagemModal tipo="erro" mensagem={erroVisivel}
        onFechar={() => { setErro(''); setErroCalculadoFechado(erroCalculado) }} />
      {base && base.variantes.length > 0 && (
        <div className="cd">
          <h2>Produto para precificar</h2>
          <Selecao
            rotulo="Produto e embalagem"
            id="preco.variante"
            valor={varianteId}
            onChange={(id) => { setVarianteId(id); setAviso('') }}
            opcoes={[['manual', 'Informar custo da receita'], ...base.variantes.map((item) => [item.id, `${item.produto_nome} · ${item.nome}`] as [string, string])]}
          />
          {receita && <p className="helper">Receita: {receita.nome} · custo inclui ingredientes, tempo de preparo, gás, embalagem e rótulo.</p>}
        </div>
      )}
      <div className="hero">
        <small>Preço sugerido {variante ? 'por produto' : 'por produto'}</small>
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
            <Campo rotulo="Custo total da receita (R$)" id="preco.custo-receita" valor={custoReceita}
              mascara="dinheiro" maxDigitos={5} onChange={(value) => { setCustoReceita(value); setErro(''); setErroCalculadoFechado('') }} />
            <Campo rotulo="Rendimento por receita" id="preco.pacotes" valor={pacotes}
              mascara="inteiro" onChange={(value) => { setPacotes(value); setErro(''); setErroCalculadoFechado('') }} maxDigitos={3} />
          </>
        )}
        <div className="g">
          <Campo rotulo="Margem de lucro (%)" id="preco.margem" valor={margem} mascara="percentual"
            onChange={(value) => { setMargem(value); setErro(''); setErroCalculadoFechado('') }} maxDigitos={5} />
          <Selecao
            rotulo="Forma de pagamento"
            id="preco.forma-pagamento"
            valor={formaPagamento}
            onChange={(value) => {
              if (value === 'pix' || value === 'cartao_credito' || value === 'cartao_debito' || value === 'dinheiro') setFormaPagamento(value)
            }}
            opcoes={opcoesPagamento}
          />
        </div>
        {/* <p className="helper">
          A margem inicial vem de Custos. A taxa considera a tarifa do meio de pagamento selecionado; dinheiro não tem taxa.
        </p> */}
        {variante && <>
          {campo('Aumento simulado de cada insumo (%)', aumento, setAumento, 'aumento-insumo')}
          <p className="helper">Veja como o custo e o preço sugerido mudariam se cada insumo usado nesta receita subir esse percentual.</p>
          {simulacao.erro && <p className="notice error" role="alert">{simulacao.erro}</p>}
          {simulacoes.map(({ insumo, custoNovo, precoNovo, delta }) => <div className="r" key={insumo.id}>
            <span>{insumo.nome}<small>Custo do pacote {formatBRL(custoPacote)} → {formatBRL(custoNovo)} ({delta >= 0 ? '+' : ''}{formatBRL(delta)})</small></span>
            <b>{formatBRL(precoNovo)}</b>
          </div>)}
        </>}
        {variante && valido && <button className="bt" data-testid="preco.salvar" onClick={salvarPreco}>Salvar preço no produto</button>}
        {base?.variantes.length === 0 && <p className="notice">Cadastre uma receita e um produto para calcular o custo automaticamente. Enquanto isso, informe o custo total da receita acima.</p>}
      </div>
    </>
  )
}

function actualizaPreco(base: Base | null, id: string, precoCents: number): Base | null {
  if (!base) return base
  return { ...base, variantes: base.variantes.map((v) => v.id === id ? { ...v, preco_cents: precoCents } : v) }
}
