import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useDb } from '../data/DbContext'
import {
  atualizarPagamentoCompra, cancelarCompra, editarCompra, listarCompras,
  listarItensCompra, listarInsumos, registrarCompra,
  type CompraItemRow, type CompraRow, type InsumoRow, type StatusCompra,
} from '../data/repos'
import { baseOf, costPerBase, formatQuantity, toBase, type Unit } from '../domain/units'
import { weightedAverageCost } from '../domain/cost'
import { listarFornecedores, type FornecedorRow } from '../data/phase3'
import { AlertaConclusao, Campo, ConfirmacaoAcao, FecharModal, focarCampo, Icon, Selecao, SeletorData, useModalAcessivel } from './ui'
import { formatBRL } from '../domain/money'
import { filtrarNumeroSemMascara } from '../domain/inputMask'

const UNIDADES: [string, string][] = ['kg', 'g', 'l', 'ml', 'un'].map((u) => [u, u])
const FORMAS_PAGAMENTO: [string, string][] = [
  ['pix', 'Pix'], ['dinheiro', 'Dinheiro'], ['cartao_debito', 'Cartão de débito'],
  ['cartao_credito', 'Cartão de crédito'], ['transferencia', 'Transferência'],
  ['boleto', 'Boleto'], ['outro', 'Outro'],
]
type LinhaCompra = { id: string; insumoId: string; quantidade: string; unidade: string; total: string }
const novaLinha = (): LinhaCompra => ({ id: crypto.randomUUID(), insumoId: '', quantidade: '', unidade: '', total: '' })
const dataHoje = () => {
  const data = new Date()
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`
}
const formaPagamentoLabel = (forma: string | null) =>
  FORMAS_PAGAMENTO.find(([value]) => value === forma)?.[1] ?? (forma === 'pendente' ? 'A definir' : forma || 'Não informada')

export default function Compra() {
  const db = useDb()
  const location = useLocation()
  const navigate = useNavigate()
  const [insumos, setInsumos] = useState<InsumoRow[]>([])
  const [fornecedores, setFornecedores] = useState<FornecedorRow[]>([])
  const [compras, setCompras] = useState<CompraRow[]>([])
  const [comprasCanceladas, setComprasCanceladas] = useState<CompraRow[]>([])
  const [statusCompra, setStatusCompra] = useState<StatusCompra>('todas')
  const [linhas, setLinhas] = useState<LinhaCompra[]>([novaLinha()])
  const [fornecedor, setFornecedor] = useState('')
  const [pago, setPago] = useState('1')
  const [formaPagamento, setFormaPagamento] = useState('pix')
  const [dataCompra, setDataCompra] = useState(dataHoje)
  const [vencimento, setVencimento] = useState('')
  const [busca, setBusca] = useState('')
  const [filtroFornecedor, setFiltroFornecedor] = useState('')
  const [dataInicial, setDataInicial] = useState('')
  const [dataFinal, setDataFinal] = useState('')
  const [compraDetalhe, setCompraDetalhe] = useState<CompraRow | null>(null)
  const [itensDetalhe, setItensDetalhe] = useState<CompraItemRow[]>([])
  const [compraEditando, setCompraEditando] = useState<CompraRow | null>(null)
  const [motivoEdicao, setMotivoEdicao] = useState('')
  const [formaPagamentoDetalhe, setFormaPagamentoDetalhe] = useState('pix')
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [compraCancelamento, setCompraCancelamento] = useState<CompraRow | null>(null)
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false)
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [formAberto, setFormAberto] = useState(false)
  const [confirmarCustoAberto, setConfirmarCustoAberto] = useState(false)
  const [confirmarDescarteFormulario, setConfirmarDescarteFormulario] = useState(false)
  const formularioBaseline = useRef('')
  const [erroFormulario, setErroFormulario] = useState('')
  const [validacaoFormularioAtiva, setValidacaoFormularioAtiva] = useState(false)
  const carregar = useCallback(async () => {
    const [lista, supplierRows, purchaseRows, cancelledRows] = await Promise.all([
      listarInsumos(db), listarFornecedores(db), listarCompras(db, 'todas'), listarCompras(db, 'canceladas'),
    ])
    setInsumos(lista)
    setFornecedores(supplierRows)
    setCompras(purchaseRows)
    setComprasCanceladas(cancelledRows)
  }, [db])
  useEffect(() => {
    let ativo = true
    void carregar().catch((e) => {
      if (ativo) setErro(e instanceof Error ? e.message : String(e))
    }).finally(() => {
      if (ativo) setCarregando(false)
    })
    return () => { ativo = false }
  }, [carregar])
  useEffect(() => { setFormAberto(location.hash === '#compra-form') }, [location.hash])
  useEffect(() => {
    if (formAberto) focarCampo('compra.fornecedor')
  }, [formAberto])

  const formularioAtual = JSON.stringify({ linhas, fornecedor, pago, formaPagamento, dataCompra, vencimento, motivoEdicao })
  const formularioAlterado = Boolean(formularioBaseline.current) && formularioAtual !== formularioBaseline.current
  useEffect(() => {
    if (formAberto && !formularioBaseline.current) formularioBaseline.current = formularioAtual
  }, [formAberto])

  const limparFormulario = () => {
    const linhaInicial = novaLinha()
    setLinhas([linhaInicial])
    setFornecedor('')
    setPago('1')
    setFormaPagamento('pix')
    setDataCompra(dataHoje())
    setVencimento('')
    setCompraEditando(null)
    setMotivoEdicao('')
    setConfirmarDescarteFormulario(false)
    setErroFormulario('')
    setValidacaoFormularioAtiva(false)
    formularioBaseline.current = JSON.stringify({
      linhas: [linhaInicial], fornecedor: '', pago: '1', formaPagamento: 'pix',
      dataCompra: dataHoje(), vencimento: '', motivoEdicao: '',
    })
  }

  const abrirFormulario = () => {
    limparFormulario()
    setFormAberto(true)
    if (location.hash !== '#compra-form') navigate('/compra#compra-form')
  }

  const descartarFormulario = () => {
    setFormAberto(false)
    limparFormulario()
    if (location.hash === '#compra-form') navigate(`${location.pathname}${location.search}`, { replace: true })
  }

  const fecharFormulario = () => {
    if (salvando) return
    if (formularioAlterado) {
      setConfirmarDescarteFormulario(true)
      return
    }
    descartarFormulario()
  }

  const abrirEdicao = async (compra: CompraRow) => {
    setErro('')
    try {
      const itens = await listarItensCompra(db, compra.id)
      if (!itens.length) throw new Error('Esta compra não tem itens disponíveis para edição.')
      const linhasEditadas = itens.map((item) => {
        const insumo = insumos.find((row) => row.id === item.insumo_id)
        if (!insumo) throw new Error(`O insumo "${item.insumo_nome}" não está ativo e não pode ser editado.`)
        const unidade = insumo.unidade_compra as Unit
        return {
          id: crypto.randomUUID(),
          insumoId: item.insumo_id,
          quantidade: String(item.quantidade_base / toBase(1, unidade)),
          unidade,
          total: String(item.total_cents / 100),
        }
      })
      setCompraEditando(compra)
      setMotivoEdicao('')
      setLinhas(linhasEditadas)
      setFornecedor(compra.fornecedor_id ?? '')
      setPago('0')
      setFormaPagamento(compra.forma_pagamento ?? 'pendente')
      setDataCompra(compra.data.slice(0, 10))
      setVencimento(compra.vencimento?.slice(0, 10) ?? '')
      formularioBaseline.current = JSON.stringify({
        linhas: linhasEditadas, fornecedor: compra.fornecedor_id ?? '', pago: '0',
        formaPagamento: compra.forma_pagamento ?? 'pendente', dataCompra: compra.data.slice(0, 10),
        vencimento: compra.vencimento?.slice(0, 10) ?? '', motivoEdicao: '',
      })
      setErroFormulario('')
      setValidacaoFormularioAtiva(false)
      setCompraDetalhe(null)
      setFormAberto(true)
      if (location.hash !== '#compra-form') navigate('/compra#compra-form')
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    }
  }

  const itensCompra = useMemo(() => linhas.map((linha) => {
    const insumo = insumos.find((item) => item.id === linha.insumoId)
    const unidade = linha.unidade as Unit
    const quantidade = Number(linha.quantidade)
    const totalCents = Math.round(Number(linha.total) * 100)
    const compativel = Boolean(insumo && linha.unidade && baseOf(unidade) === insumo.unidade_base)
    const valido = Boolean(insumo && compativel && Number.isFinite(quantidade) && quantidade > 0
      && Number.isSafeInteger(totalCents) && totalCents > 0)
    const custo = valido ? costPerBase(totalCents, quantidade, unidade) : 0
    return { ...linha, insumo, quantidade, totalCents, compativel, valido, custo }
  }), [insumos, linhas])
  const hoje = dataHoje()
  const totalCompra = itensCompra.reduce((sum, item) => sum + item.totalCents, 0)
  const dataCompraValida = Boolean(dataCompra)
    && (dataCompra >= hoje || dataCompra === compraEditando?.data.slice(0, 10))
  const statusPagamentoValido = pago === '1' || pago === '0'
  const custosAcima = itensCompra.filter((item) => item.valido
    && item.custo > Number(item.insumo?.custo_medio ?? 0))
  const custosAcimaResumo = [...new Map(custosAcima.map((item) => [item.insumoId, item.insumo])).entries()]
    .map(([insumoId, insumo]) => {
      const itens = itensCompra.filter((item) => item.insumoId === insumoId && item.valido)
      const quantidadeBase = itens.reduce((sum, item) => sum + toBase(item.quantidade, item.unidade as Unit), 0)
      const totalCents = itens.reduce((sum, item) => sum + item.totalCents, 0)
      const custoCompra = quantidadeBase > 0 ? totalCents / quantidadeBase : 0
      const custoAtual = Number(insumo?.custo_medio ?? 0)
      const mediaEstimada = weightedAverageCost(
        Number(insumo?.estoque_atual ?? 0), custoAtual, quantidadeBase, totalCents,
      )
      return { insumo, custoAtual, custoCompra, mediaEstimada }
    })
  const comprasAtivas = compras.filter((compra) => !compra.cancelada_em)
  const comprasPagas = comprasAtivas.filter((compra) => compra.pago).length
  const comprasPendentes = comprasAtivas.filter((compra) => !compra.pago).length
  const comprasVencidas = comprasAtivas.filter((compra) => !compra.pago
    && (compra.vencimento?.slice(0, 10) ?? compra.data.slice(0, 10)) < hoje)
  const comprasAVencer = comprasAtivas.filter((compra) => !compra.pago
    && (compra.vencimento?.slice(0, 10) ?? compra.data.slice(0, 10)) >= hoje)
  const totalPendenteCents = comprasAtivas.filter((compra) => !compra.pago)
    .reduce((total, compra) => total + compra.total_cents, 0)
  const totalVencidoCents = comprasVencidas.reduce((total, compra) => total + compra.total_cents, 0)
  const totalAVencerCents = comprasAVencer.reduce((total, compra) => total + compra.total_cents, 0)
  const motivosInvalidosFormulario = [
    !fornecedor ? 'Selecione um fornecedor.' : '',
    !dataCompraValida ? 'Informe uma data válida: hoje ou futura (ou mantenha a data original ao editar).' : '',
    !itensCompra.length ? 'Adicione ao menos um item.' : '',
    itensCompra.some((item) => !item.valido) ? 'Revise os itens: insumo, unidade, quantidade e valor precisam ser válidos.' : '',
    !Number.isSafeInteger(totalCompra) || totalCompra <= 0 ? 'O total da compra precisa ser maior que zero.' : '',
    pago === '0' && !vencimento ? 'Informe o vencimento da compra não paga.' : '',
    pago === '0' && vencimento && vencimento < hoje ? 'O vencimento deve ser hoje ou uma data futura.' : '',
    pago === '0' && vencimento && vencimento < dataCompra ? 'O vencimento não pode ser anterior à data da compra.' : '',
  ].filter(Boolean)
  const valido = statusPagamentoValido && motivosInvalidosFormulario.length === 0 && Boolean(formaPagamento)
  const comprasExibidas = (statusCompra === 'canceladas' ? comprasCanceladas : compras.filter((compra) =>
    statusCompra === 'todas' || (!compra.cancelada_em
      && (statusCompra === 'pagas' ? Boolean(compra.pago) : !compra.pago))))
    .filter((compra) => !filtroFornecedor || compra.fornecedor_id === filtroFornecedor)
    .filter((compra) => {
      const dia = compra.data.slice(0, 10)
      return (!dataInicial || dia >= dataInicial) && (!dataFinal || dia <= dataFinal)
    })
    .filter((compra) => !busca || `${compra.itens} ${compra.fornecedor_nome ?? ''}`
      .toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR')))
    .sort((a, b) => {
      const prioridadeA = a.cancelada_em ? 2 : a.pago ? 1 : 0
      const prioridadeB = b.cancelada_em ? 2 : b.pago ? 1 : 0
      return b.data.slice(0, 10).localeCompare(a.data.slice(0, 10)) || prioridadeA - prioridadeB
    })

  const atualizarListas = async () => {
    await carregar()
  }

  const alterarLinha = (id: string, campo: keyof Omit<LinhaCompra, 'id'>, valor: string) => {
    setLinhas((atuais) => atuais.map((linha) => linha.id === id ? { ...linha, [campo]: valor } : linha))
  }

  const marcarComoPago = async (id: string) => {
    setErro('')
    try {
      await atualizarPagamentoCompra(db, id, true, formaPagamentoDetalhe)
      await atualizarListas()
      setCompraDetalhe(null)
      setConfirmacao('Compra marcada como paga.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  const salvar = async (confirmado = false) => {
    if (salvando) return
    setValidacaoFormularioAtiva(true)
    if (!valido) return
    if (custosAcima.length && !confirmado) {
      setConfirmarCustoAberto(true)
      return
    }
    setSalvando(true)
    setErro('')
    setErroFormulario('')
    try {
      const dadosCompra = {
        itens: itensCompra.map((item) => ({
          insumoId: item.insumoId, unidade: item.unidade as Unit, quantidade: item.quantidade, totalCents: item.totalCents,
        })),
        totalCents: totalCompra, fornecedorId: fornecedor, pago: pago === '1',
        formaPagamento, data: dataCompra, vencimento: pago === '0' ? vencimento : undefined,
      }
      if (compraEditando) await editarCompra(db, compraEditando.id, dadosCompra, motivoEdicao)
      else await registrarCompra(db, dadosCompra)
      descartarFormulario()
      setConfirmarCustoAberto(false)
      await atualizarListas()
      setConfirmacao(compraEditando
        ? 'Compra editada. Estoque, custo médio e financeiro foram conciliados; os dados anteriores foram preservados no histórico.'
        : 'Compra registrada. Estoque, custo médio, histórico de preços e financeiro foram atualizados.')
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : String(e)
      setErro(mensagem)
      setErroFormulario(mensagem)
    } finally {
      setSalvando(false)
    }

  }

  const abrirDetalhe = async (compra: CompraRow) => {
    setErro('')
    setCarregandoDetalhe(true)
    try {
      const itens = await listarItensCompra(db, compra.id)
      setItensDetalhe(itens)
      setFormaPagamentoDetalhe(compra.forma_pagamento && compra.forma_pagamento !== 'pendente'
        ? compra.forma_pagamento : 'pix')
      setCompraDetalhe(compra)
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    } finally {
      setCarregandoDetalhe(false)
    }
  }

  const confirmarCancelamento = async () => {
    if (!compraCancelamento || !motivoCancelamento.trim()) {
      setErro('Informe o motivo do cancelamento.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      await cancelarCompra(db, compraCancelamento.id, motivoCancelamento)
      setCompraCancelamento(null)
      setMotivoCancelamento('')
      setCompraDetalhe(null)
      await atualizarListas()
      setConfirmacao('Compra cancelada. Estoque, custo médio, histórico e financeiro foram conciliados.')
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    } finally {
      setSalvando(false)
    }
  }

  useModalAcessivel(formAberto, fecharFormulario, '#compra-form')
  useModalAcessivel(confirmarCustoAberto, () => setConfirmarCustoAberto(false), '#confirmar-custo-dialog')
  useModalAcessivel(Boolean(compraDetalhe), () => setCompraDetalhe(null), '#compra-detalhe-dialog')
  useModalAcessivel(Boolean(compraCancelamento), () => {
    if (!salvando) setCompraCancelamento(null)
  }, '#cancelar-compra-dialog')
  useModalAcessivel(confirmarDescarteFormulario, () => setConfirmarDescarteFormulario(false), '#compra-descartar-formulario')

  return (
    <>
      <AlertaConclusao mensagem={confirmacao} onConcluir={() => setConfirmacao('')} />
      <Link className="back-link" to="/mais">‹ Mais</Link>
      <h1>Compras</h1>
      <p className="sb">Registre suas compras, acompanhe pagamentos e controle vencimentos. Compras pagas não podem ser canceladas, enquanto compras em aberto podem ser revisadas.</p>
      {erro && <p className="notice error" role="alert">{erro}</p>}
      {!carregando && <section className="scheduled-dashboard purchase-list" aria-labelledby="purchase-title">
        <div className="section-heading"><h2>Histórico de compras</h2></div>
        <div className="scheduled-metrics">
          <div><small>Pagas</small><b>{comprasPagas}</b></div>
          <div><small>Não pagas</small><b>{comprasPendentes}</b></div>
          <div><small>Canceladas</small><b>{comprasCanceladas.length}</b></div>
        </div>
        <div className="scheduled-metrics" aria-label="Resumo financeiro de compras pendentes">
          <div><small>Total a pagar</small><b>{formatBRL(totalPendenteCents)}</b></div>
          <div><small>Vencidas</small><b>{formatBRL(totalVencidoCents)}</b></div>
          <div><small>A vencer</small><b>{formatBRL(totalAVencerCents)}</b></div>
        </div>
        {comprasVencidas.length > 0 && <p className="notice error" role="status">
          Há {comprasVencidas.length} compra(s) vencida(s), totalizando {formatBRL(totalVencidoCents)}. Veja a data de vencimento em cada registro.
        </p>}
        <div className="scheduled-filters purchase-status-filters" role="group" aria-label="Filtrar compras por status">
          {([['todas', 'Todos'], ['pagas', 'Pagas'], ['pendentes', 'Não pagas'], ['canceladas', 'Canceladas']] as [StatusCompra, string][]).map(([value, label]) => <button
            key={value} type="button" className={`bt o${statusCompra === value ? ' active' : ''}`} aria-pressed={statusCompra === value}
            onClick={() => setStatusCompra(value)}>{label}</button>)}
        </div>
        <div className="purchase-filters">
          <div className="search-field"><Icon name="stock" /><input aria-label="Buscar compra" placeholder="Buscar insumo ou fornecedor" value={busca} onChange={(event) => setBusca(event.target.value)} /></div>
          <div className="purchase-supplier"><Selecao rotulo="Fornecedor" id="compra.filtro-fornecedor" valor={filtroFornecedor || 'todos'} onChange={(value) => setFiltroFornecedor(value === 'todos' ? '' : value)}
            opcoes={[['todos', 'Todos'], ...fornecedores.map((row) => [row.id, row.nome] as [string, string])]} /></div>
          <SeletorData rotulo="De" id="compras.data-inicial" valor={dataInicial} onChange={setDataInicial} />
          <SeletorData rotulo="Até" id="compras.data-final" valor={dataFinal} onChange={setDataFinal} />
        </div>
        {!comprasExibidas.length && <p className="notice">Nenhuma compra encontrada para estes filtros.</p>}
        {comprasExibidas.map((compra) => <article className="purchase-row" key={compra.id}>
          <div><b>{compra.itens}</b><small>
            <span>{compra.fornecedor_nome ?? 'Sem fornecedor'} · {new Date(compra.data).toLocaleDateString('pt-BR')}</span>
            <span>{compra.cancelada_em ? 'Cancelada' : compra.pago ? 'Paga' : 'Não paga'}</span>
            {!compra.pago && !compra.cancelada_em && (() => {
              const vencimento = compra.vencimento?.slice(0, 10) ?? compra.data.slice(0, 10)
              const vencimentoStatus = vencimento < hoje
                ? ['purchase-due-overdue', 'Vencida']
                : vencimento === hoje
                  ? ['purchase-due-today', 'Vence hoje']
                  : ['purchase-due-upcoming', 'A vencer']
              return <span className={`purchase-due ${vencimentoStatus[0]}`}>
                {vencimentoStatus[1]} · {new Date(`${vencimento}T00:00:00`).toLocaleDateString('pt-BR')}
              </span>
            })()}
          </small></div>
          <strong>{formatBRL(compra.total_cents)}</strong>
          <button className="lk" type="button" onClick={() => void abrirDetalhe(compra)}>Detalhes</button>
        </article>)}
      </section>}
      {carregando && <p className="notice" role="status">Carregando insumos e compras...</p>}
      {!carregando && !insumos.length && <p className="notice">Cadastre um insumo na tela Estoque antes de registrar uma compra.</p>}
      {formAberto && insumos.length > 0 && <div className="alert-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) fecharFormulario() }}><section className="cd add-dialog form-dialog" id="compra-form" role="dialog" aria-modal="true" aria-labelledby="compra-form-title" tabIndex={-1}>
          <FecharModal onClick={fecharFormulario} />
          <h2 id="compra-form-title">{compraEditando ? 'Editar compra não paga' : 'Registrar compra'}</h2>
          <p className="helper">{compraEditando
            ? 'Revise os dados desta compra. As alterações serão refletidas automaticamente no estoque e no financeiro, mantendo o histórico completo da operação.'
            : 'Selecione o fornecedor, informe a data da compra e adicione os insumos com suas respectivas quantidades e valores para atualizar o estoque e os custos.'}</p>
          {erroFormulario && <p className="notice error" role="alert">{erroFormulario}</p>}
          {fornecedores.length === 0 && <p className="notice warning">
            Cadastre um fornecedor antes de registrar uma compra. <Link to="/fornecedores#fornecedores-form">Cadastrar fornecedor</Link>
          </p>}
          <Selecao rotulo="Fornecedor" id="compra.fornecedor" valor={fornecedor} onChange={setFornecedor}
            opcoes={fornecedores.map((row) => [row.id, row.nome])} required />
          <SeletorData rotulo="Data da compra" id="compra.data" valor={dataCompra} min={hoje}
            permitirValor={compraEditando?.data.slice(0, 10)} required onChange={setDataCompra} />
          {validacaoFormularioAtiva && !dataCompraValida && dataCompra && <p className="notice error" role="alert">
            A data deve ser hoje ou futura. Na edição, você pode manter a data original da compra.
          </p>}
          {validacaoFormularioAtiva && dataCompra < hoje && dataCompra !== compraEditando?.data.slice(0, 10)
            && <p className="notice error" role="alert">A data da compra não pode ser anterior à data de hoje.</p>}
          <h3>Itens da compra</h3>
          {itensCompra.map((linha, index) => <div className="purchase-item-form" key={linha.id}>
            <div className="section-heading"><b>Item {index + 1}</b>{linhas.length > 1 && <button className="lk" type="button" onClick={() => setLinhas((items) => items.filter((item) => item.id !== linha.id))}>Remover</button>}</div>
            <Selecao rotulo="Insumo" id={`compra.insumo.${linha.id}`} valor={linha.insumoId} onChange={(id) => {
              const escolhido = insumos.find((item) => item.id === id)
              setLinhas((items) => items.map((item) => item.id === linha.id
                ? { ...item, insumoId: id, unidade: escolhido?.unidade_compra ?? '' } : item))
            }} opcoes={insumos.map((item) => [item.id, item.nome])} />
            <div className="g">
              <Campo rotulo="Quantidade" id={`compra.quantidade.${linha.id}`} valor={linha.quantidade}
                onChange={(value) => alterarLinha(linha.id, 'quantidade', filtrarNumeroSemMascara(value))}
                inputMode="decimal" limite={15} placeholder="Ex.: 1.5 ou 14000" />
              <Selecao rotulo="Unidade" id={`compra.unidade.${linha.id}`} valor={linha.unidade}
                onChange={(value) => alterarLinha(linha.id, 'unidade', value)} opcoes={UNIDADES} disabled={Boolean(linha.insumoId)} />
            </div>
            {linha.insumo && linha.unidade && !linha.compativel && <p className="sb">Use unidade compatível com {linha.insumo.unidade_base}.</p>}
            <Campo rotulo="Valor do item (R$)" id={`compra.total.${linha.id}`} valor={linha.total}
              onChange={(value) => alterarLinha(linha.id, 'total', value)} mascara="dinheiro" />
            {linha.valido && linha.custo > Number(linha.insumo?.custo_medio ?? 0) && <p className="notice warning">
              <Icon name="price" /> Custo acima da média atual: {formatBRL(linha.custo)} por {linha.insumo?.unidade_base}.
            </p>}
          </div>)}
          <button className="bt o" type="button" onClick={() => setLinhas((items) => [...items, novaLinha()])}>
            <Icon name="add" /> Adicionar outro item
          </button>
          <h3>Pagamento</h3>
          {compraEditando
            ? <p className="purchase-status-badge">Não paga</p>
            : <Selecao rotulo="Situação do pagamento" id="compra.pago" valor={pago} onChange={(value) => {
              setPago(value)
              setFormaPagamento(value === '1' ? 'pix' : 'pendente')
            }} opcoes={[['1', 'Pago'], ['0', 'Não pago']]} required />}
          {pago === '1'
            ? <Selecao rotulo="Forma de pagamento" id="compra.forma-pagamento" valor={formaPagamento}
              onChange={setFormaPagamento} opcoes={FORMAS_PAGAMENTO} required />
            : <>
              <Selecao rotulo="Forma de pagamento" id="compra.forma-prevista" valor={formaPagamento}
                onChange={setFormaPagamento} opcoes={[['pendente', 'A definir'], ...FORMAS_PAGAMENTO]} required />
              <SeletorData rotulo="Data de vencimento" id="compra.vencimento" valor={vencimento} min={hoje} required onChange={setVencimento} />
              {validacaoFormularioAtiva && !vencimento && <p className="notice error" role="alert">Informe a data de vencimento da compra não paga.</p>}
              {validacaoFormularioAtiva && vencimento && vencimento < hoje
                && <p className="notice error" role="alert">O vencimento deve ser hoje ou uma data futura.</p>}
              {validacaoFormularioAtiva && vencimento && dataCompra && vencimento < dataCompra
                && <p className="notice error" role="alert">O vencimento não pode ser anterior à data da compra.</p>}
            </>}
          {compraEditando && <>
            <Campo rotulo="Motivo da edição" id="compra.motivo-edicao" valor={motivoEdicao}
              onChange={setMotivoEdicao} limite={100} placeholder="Ex.: correção da quantidade recebida" />
            {/* <p className="helper">Se informado, o motivo será guardado com os dados anteriores e atualizados da compra.</p> */}
          </>}
          {validacaoFormularioAtiva && !valido && <ul className="form-validation-hints" aria-label="Itens pendentes para salvar">
            {motivosInvalidosFormulario.map((motivo) => <li key={motivo}>{motivo}</li>)}
            {!formaPagamento && <li>Informe a forma de pagamento.</li>}
          </ul>}
          <div className="purchase-form-footer">
            <div className="purchase-total"><span>Total da compra</span><b>{formatBRL(totalCompra)}</b></div>
            <div className="form-actions">
              <button className="bt o" type="button" disabled={salvando} onClick={descartarFormulario}>
                {compraEditando ? 'Cancelar edição' : 'Cancelar'}
              </button>
              <button className="bt" type="button" disabled={salvando} data-testid="compra.salvar" onClick={() => void salvar()}>
                {salvando ? 'Salvando...' : compraEditando ? 'Salvar' : 'Salvar'}
              </button>
            </div>
          </div>
        </section></div>}
      {confirmarDescarteFormulario && <ConfirmacaoAcao
        id="compra-descartar-formulario"
        titulo="Descartar alterações?"
        mensagem="Os dados desta compra ainda não foram salvos e serão perdidos."
        confirmar="Descartar alterações"
        onCancelar={() => setConfirmarDescarteFormulario(false)}
        onConfirmar={descartarFormulario}
      />}
      {confirmarCustoAberto && <div className="alert-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmarCustoAberto(false) }}>
        <section id="confirmar-custo-dialog" className="alert-dialog" role="dialog" aria-modal="true" aria-labelledby="confirmar-custo-title" tabIndex={-1}>
          <FecharModal onClick={() => setConfirmarCustoAberto(false)} />
          <span className="alert-icon"><Icon name="price" size={26} /></span>
          <h2 id="confirmar-custo-title">Custo acima do atual</h2>
          <p>{compraEditando ? 'O custo unitário desta compra editada está acima do custo médio atual:' : 'O custo unitário desta compra está acima do custo médio atual:'}</p>
          <ul className="purchase-cost-comparison">{custosAcimaResumo.map(({ insumo, custoAtual, custoCompra, mediaEstimada }) => <li key={insumo?.id}>
            <b>{insumo?.nome}</b>
            <span>Média atual: {formatBRL(custoAtual)} por {insumo?.unidade_base}</span>
            <span>Nesta compra: {formatBRL(custoCompra)} por {insumo?.unidade_base}</span>
            {compraEditando
              ? <span>A edição recalculará a média após conciliar o histórico.</span>
              : <span>Média estimada após a compra: {formatBRL(mediaEstimada)} por {insumo?.unidade_base}</span>}
          </li>)}</ul>
          <p>{compraEditando ? 'Salvar esta edição' : 'Registrar a compra'} recalculará a média ponderada do estoque.</p>
          <div className="alert-actions"><button className="bt o" type="button" onClick={() => setConfirmarCustoAberto(false)}>Voltar</button><button className="bt" type="button" onClick={() => void salvar(true)}>{compraEditando ? 'Confirmar edição' : 'Confirmar compra'}</button></div>
        </section>
      </div>}
      {carregandoDetalhe && <p className="notice" role="status">Carregando detalhes da compra...</p>}
      {compraDetalhe && <div className="alert-overlay" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setCompraDetalhe(null)
      }}>
        <section id="compra-detalhe-dialog" className="cd add-dialog form-dialog purchase-detail" role="dialog" aria-modal="true" aria-labelledby="compra-detalhe-title" tabIndex={-1}>
          <FecharModal onClick={() => setCompraDetalhe(null)} />
          <h2 id="compra-detalhe-title">Detalhes da compra</h2>
          <p>{compraDetalhe.fornecedor_nome ?? 'Sem fornecedor'} · {new Date(compraDetalhe.data).toLocaleString('pt-BR')}</p>
          <div className="purchase-detail-items">{itensDetalhe.map((item) => <div className="r" key={item.id}>
            <span>{item.insumo_nome}<small>{formatQuantity(item.quantidade_base)} {item.unidade_base} · {formatBRL(item.total_cents / item.quantidade_base)} por {item.unidade_base}</small></span>
            <b>{formatBRL(item.total_cents)}</b>
          </div>)}</div>
          <div className="purchase-total"><span>Total</span><b>{formatBRL(compraDetalhe.total_cents)}</b></div>
          <p>Situação: <b>{compraDetalhe.cancelada_em ? 'Cancelada' : compraDetalhe.pago ? 'Paga' : 'Não paga'}</b></p>
          <p>Forma de pagamento: <b>{formaPagamentoLabel(compraDetalhe.forma_pagamento)}</b></p>
          {compraDetalhe.vencimento && <p>Vencimento: {new Date(compraDetalhe.vencimento).toLocaleDateString('pt-BR')}</p>}
          {compraDetalhe.cancelada_em && <p className="notice warning">Cancelada em {new Date(compraDetalhe.cancelada_em).toLocaleString('pt-BR')}: {compraDetalhe.motivo_cancelamento}</p>}
          {!compraDetalhe.pago && !compraDetalhe.cancelada_em && <>
            <Selecao rotulo="Forma de pagamento" id="compra.forma-quitar" valor={formaPagamentoDetalhe}
              onChange={setFormaPagamentoDetalhe} opcoes={FORMAS_PAGAMENTO} />
            <button className="bt" type="button" onClick={() => void marcarComoPago(compraDetalhe.id)}>Marcar como paga</button>
            <button className="bt o" type="button" onClick={() => void abrirEdicao(compraDetalhe)}>
              {/* <Icon name="edit" />  */}
              Editar compra
            </button>
          </>}
          {!compraDetalhe.pago && !compraDetalhe.cancelada_em && <button className="bt o danger-button" type="button" onClick={() => {
            setCompraCancelamento(compraDetalhe)
            setMotivoCancelamento('')
          }}>Cancelar compra</button>}
          {Boolean(compraDetalhe.pago) && !compraDetalhe.cancelada_em && <p className="notice warning">
            Compras pagas não podem ser canceladas por aqui para preservar a conciliação do caixa.
          </p>}
        </section>
      </div>}
      {compraCancelamento && <div className="alert-overlay" onMouseDown={(event) => {
        if (event.target === event.currentTarget && !salvando) setCompraCancelamento(null)
      }}>
        <section id="cancelar-compra-dialog" className="alert-dialog" role="alertdialog" aria-modal="true" aria-labelledby="cancelar-compra-title" tabIndex={-1}>
          <FecharModal onClick={() => !salvando && setCompraCancelamento(null)} />
          <span className="alert-icon danger"><Icon name="trash" size={26} /></span>
          <h2 id="cancelar-compra-title">Cancelar compra?</h2>
          <p>A compra será mantida no histórico como cancelada. O sistema tentará conciliar estoque, custo médio e financeiro; saldos negativos impedem o cancelamento.</p>
          <label className="fl"><small>Motivo do cancelamento (obrigatório)</small>
            <input value={motivoCancelamento} onChange={(event) => setMotivoCancelamento(event.target.value)} />
          </label>
          <div className="alert-actions">
            <button className="bt o" type="button" disabled={salvando} onClick={() => setCompraCancelamento(null)}>Voltar</button>
            <button className="bt danger-button" type="button" disabled={salvando || !motivoCancelamento.trim()} onClick={() => void confirmarCancelamento()}>
              {salvando ? 'Cancelando...' : 'Confirmar cancelamento'}
            </button>
          </div>
        </section>
      </div>}
    </>
  )
}
