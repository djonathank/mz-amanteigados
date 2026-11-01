import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useDb } from '../data/DbContext'
import {
  alterarStatusEncomenda, entregarEncomenda, excluirCliente, excluirFornecedor, excluirLancamento,
  listarClientes, listarEncomendas, listarFornecedores, listarLancamentos, marcarLancamentoPago,
  salvarCliente, salvarFornecedor, salvarLancamento,
  type ClienteRow, type EncomendaRow, type FornecedorRow, type LancamentoRow,
} from '../data/phase3'
import { formatBRL } from '../domain/money'
import { formatBRDate, localDateString } from '../domain/date'
import { capitalizarNome, formatarTelefone } from '../domain/text'
import { AlertaConclusao, Campo, ConfirmacaoAcao, FecharModal, focarCampo, Icon, MensagemModal, Selecao, SeletorData, useModalAcessivel } from './ui'
import { listarCategoriasFinanceiras, type CategoriaFinanceira } from '../data/categorias'

type Tela = 'clientes' | 'fornecedores' | 'encomendas' | 'financeiro'
interface Props { tela: Tela }

const TIPOS_LANCAMENTO: [string, string][] = [['receita', 'Receita'], ['despesa', 'Despesa']]
const STATUS_PAGAMENTO: [string, string][] = [['1', 'Pago'], ['0', 'Pendente']]
const STATUS_RECEBIMENTO: [string, string][] = [['1', 'Recebido'], ['0', 'Pendente']]
const padraoData = () => localDateString()
const STATUS_ENCOMENDA: [string, string][] = [['todos', 'Todos'], ['agendado', 'Agendado'], ['finalizado', 'Finalizado'], ['cancelado', 'Cancelado']]
const statusLabel: Record<EncomendaRow['status'], string> = {
  agendado: 'Agendado', finalizado: 'Finalizado', cancelado: 'Cancelado',
}
const statusOrdem: Record<EncomendaRow['status'], number> = {
  agendado: 0, finalizado: 1, cancelado: 2,
}
const diaAgenda = (data: string) => {
  const date = new Date(`${data}T12:00:00`)
  return { numero: date.getDate(), semana: date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''), completo: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }
}
const normalizarNomeContato = (value: string) => value.replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').slice(0, 60)
const normalizarTextoCadastro = (value: string) => value.replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').slice(0, 200)
const dataNascimentoValida = (value: string) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && value < localDateString())
const dataMaisRecenteNascimento = () => {
  const ontem = new Date()
  ontem.setDate(ontem.getDate() - 1)
  return localDateString(ontem)
}

export default function Gestao({ tela }: Props) {
  const db = useDb()
  const location = useLocation()
  const navigate = useNavigate()
  const [clientes, setClientes] = useState<ClienteRow[]>([])
  const [fornecedores, setFornecedores] = useState<FornecedorRow[]>([])
  const [encomendas, setEncomendas] = useState<EncomendaRow[]>([])
  const [lancamentos, setLancamentos] = useState<LancamentoRow[]>([])
  const [categorias, setCategorias] = useState<CategoriaFinanceira[]>([])
  const [nome, setNome] = useState('')
  const [idCadastro, setIdCadastro] = useState<string | null>(null)
  const [contato, setContato] = useState('')
  const [endereco, setEndereco] = useState('')
  const [aniversario, setAniversario] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [tipo, setTipo] = useState<'receita' | 'despesa'>('despesa')
  const [categoria, setCategoria] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(padraoData())
  const [vencimento, setVencimento] = useState('')
  const [pago, setPago] = useState('1')
  const [formaEntrega, setFormaEntrega] = useState<Record<string, string>>({})
  const [filtroAgenda, setFiltroAgenda] = useState('todos')
  const [diaSelecionado, setDiaSelecionado] = useState('')
  const [erro, setErro] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [formAberto, setFormAberto] = useState(false)
  const [exclusaoPendente, setExclusaoPendente] = useState<
    { tipo: 'cliente'; row: ClienteRow } | { tipo: 'fornecedor'; row: FornecedorRow } | null
  >(null)
  const [cancelamentoPendente, setCancelamentoPendente] = useState<EncomendaRow | null>(null)
  const [motivoCancelamentoPendente, setMotivoCancelamentoPendente] = useState<EncomendaRow | null>(null)
  const [motivoCancelamentoPedido, setMotivoCancelamentoPedido] = useState('')
  const [estoquePendente, setEstoquePendente] = useState<{ pedido: EncomendaRow; mensagem: string } | null>(null)
  const [motivoEstoque, setMotivoEstoque] = useState('')
  const [pedidoDestacado, setPedidoDestacado] = useState('')

  useEffect(() => {
    const state = location.state as { pedidoAgendado?: boolean; encomendaId?: string } | null
    const pedidoAgendado = state?.pedidoAgendado
    if (pedidoAgendado && tela === 'encomendas') {
      setConfirmacao('Pedido agendado com sucesso.')
      setFiltroAgenda('todos')
      setPedidoDestacado(state?.encomendaId ?? '')
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location, navigate, tela])

  useEffect(() => {
    if (!pedidoDestacado) return
    const timeout = window.setTimeout(() => {
      document.getElementById(`pedido-${pedidoDestacado}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 300)
    return () => window.clearTimeout(timeout)
  }, [pedidoDestacado, encomendas])

  const carregar = useCallback(async () => {
    const [customerRows, supplierRows, orderRows, ledgerRows, categoryRows] = await Promise.all([
      listarClientes(db), listarFornecedores(db), listarEncomendas(db), listarLancamentos(db),
      tela === 'financeiro' ? listarCategoriasFinanceiras(db) : Promise.resolve([]),
    ])
    setClientes(customerRows)
    setFornecedores(supplierRows)
    setEncomendas(orderRows)
    setLancamentos(ledgerRows)
    setCategorias(categoryRows)
  }, [db, tela])

  useEffect(() => {
    void carregar().catch((error) => setErro(error instanceof Error ? error.message : String(error)))
  }, [carregar])

  useEffect(() => {
    const hashDoFormulario = tela === 'clientes' || tela === 'fornecedores' ? `#${tela}-form`
      : tela === 'financeiro' ? '#financeiro-form' : ''
    setFormAberto(Boolean(hashDoFormulario) && location.hash === hashDoFormulario)
  }, [location.hash, tela])

  const reset = () => {
    setFormAberto(false)
    setNome('')
    setIdCadastro(null)
    setContato('')
    setEndereco('')
    setAniversario('')
    setObservacoes('')
    setTipo('despesa')
    setCategoria('')
    setDescricao('')
    setValor('')
    setData(padraoData())
    setVencimento('')
    setPago('1')
    const hashDoFormulario = tela === 'clientes' || tela === 'fornecedores' ? `#${tela}-form`
      : tela === 'financeiro' ? '#financeiro-form' : ''
    if (hashDoFormulario && location.hash === hashDoFormulario) navigate(`${location.pathname}${location.search}`, { replace: true })
  }

  const salvarCadastro = async () => {
    if (salvando) return
    setErro('')
    try {
      setSalvando(true)
      if (tela === 'clientes') {
        await salvarCliente(db, { id: idCadastro ?? undefined, nome, telefone: contato, endereco, aniversario, observacoes })
        const nomeSalvo = capitalizarNome(nome)
        setConfirmacao(idCadastro
          ? `Cliente ${nomeSalvo} atualizado com sucesso!`
          : `Cliente ${nomeSalvo} cadastrado com sucesso!`)
      } else {
        await salvarFornecedor(db, { id: idCadastro ?? undefined, nome, contato, endereco, observacoes })
        const nomeSalvo = capitalizarNome(nome)
        setConfirmacao(idCadastro
          ? `Fornecedor ${nomeSalvo} atualizado com sucesso!`
          : `Fornecedor ${nomeSalvo} cadastrado com sucesso!`)
      }
      reset()
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
      return
    } finally {
      setSalvando(false)
    }
    try {
      await carregar()
    } catch (error) {
      setErro(`Cadastro salvo, mas não foi possível atualizar a lista: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const encomendasAbertas = useMemo(() => encomendas.filter((order) => order.status === 'agendado'), [encomendas])
  const encomendasListadas = encomendas
  const coresCategoria = useMemo(() => new Map(categorias.map((category) => [category.nome.toLocaleLowerCase('pt-BR'), category.cor])), [categorias])
  const diasAgenda = useMemo(() => Array.from(new Set(encomendasAbertas.map((order) => order.data_entrega.slice(0, 10)))).slice(0, 7), [encomendasAbertas])
  const encomendasVisiveis = useMemo(() => encomendasListadas
    .filter((order) =>
      (filtroAgenda === 'todos' || order.status === filtroAgenda) && (!diaSelecionado || order.data_entrega.slice(0, 10) === diaSelecionado)
    )
    .sort((a, b) => a.data_entrega.localeCompare(b.data_entrega) || (statusOrdem[a.status] ?? 99) - (statusOrdem[b.status] ?? 99)),
    [diaSelecionado, encomendasListadas, filtroAgenda])
  const totalAgendado = encomendasAbertas.reduce((sum, order) => sum + Math.max(0, order.total_cents - order.recebido_cents), 0)
  const digitosContato = contato.replace(/\D/g, '')
  const dadosContatoValidos = nome.trim().length >= 2 && nome.trim().length <= 60
    && normalizarNomeContato(nome.trim()) === nome.trim()
    && endereco.length <= 200 && normalizarTextoCadastro(endereco) === endereco
    && observacoes.length <= 200 && normalizarTextoCadastro(observacoes) === observacoes
    && digitosContato.length === 11
    && (tela !== 'clientes' || dataNascimentoValida(aniversario))

  const salvarConta = async () => {
    if (salvando) return
    setErro('')
    try {
      setSalvando(true)
      await salvarLancamento(db, {
        tipo, categoria, valorCents: Math.round(Number(valor || 0) * 100), data,
        vencimento: tipo === 'despesa' ? vencimento || undefined : undefined, pago: pago === '1', negocio: true, descricao,
      })
      setConfirmacao('Lançamento financeiro salvo.')
      reset()
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
      return
    } finally {
      setSalvando(false)
    }
    try {
      await carregar()
    } catch (error) {
      setErro(`Lançamento salvo, mas não foi possível atualizar a lista: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const avancar = async (order: EncomendaRow, motivoEstoqueNegativo?: string) => {
    setErro('')
    try {
      if (order.status !== 'agendado') return
      const form = formaEntrega[order.id]
      if (!form) throw new Error('Selecione a forma de pagamento para finalizar o pedido.')
      const saveDelivery = async (reason?: string) => entregarEncomenda(db, {
        encomendaId: order.id, forma: form, motivoEstoqueNegativo: reason,
      })
      let saleId: string
      try {
        saleId = await saveDelivery(motivoEstoqueNegativo)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!message.includes('estoque insuficiente') && !message.includes('saldo negativo')) throw error
        setMotivoEstoque('')
        setEstoquePendente({ pedido: order, mensagem: message })
        return
      }
      navigate(`/venda/${saleId}`)
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    }
  }

  const confirmarExclusao = async () => {
    if (!exclusaoPendente) return
    const pendente = exclusaoPendente
    setExclusaoPendente(null)
    try {
      if (pendente.tipo === 'cliente') await excluirCliente(db, pendente.row.id)
      else await excluirFornecedor(db, pendente.row.id)
      await carregar()
      setConfirmacao(pendente.tipo === 'cliente' ? 'Dados pessoais do cliente removidos.' : 'Fornecedor excluído.')
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    }
  }

  const confirmarCancelamentoPedido = async () => {
    if (!cancelamentoPendente) return
    const pedido = cancelamentoPendente
    const motivo = motivoCancelamentoPedido.trim()
    setCancelamentoPendente(null)
    try {
      await alterarStatusEncomenda(db, pedido.id, 'cancelado', motivo)
      setMotivoCancelamentoPedido('')
      await carregar()
      setConfirmacao('Pedido cancelado.')
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    }
  }

  const editarCadastro = (row: ClienteRow | FornecedorRow) => {
    setFormAberto(true)
    setIdCadastro(row.id)
    setNome(row.nome)
    setContato(formatarTelefone('telefone' in row ? row.telefone ?? '' : row.contato ?? ''))
    setObservacoes(row.observacoes ?? '')
    if ('telefone' in row) {
      setEndereco(row.endereco ?? '')
      setAniversario(row.aniversario ?? '')
    } else {
      setEndereco(row.endereco ?? '')
      setAniversario('')
    }
    window.scrollTo(0, 0)
    focarCampo(`${tela}.nome`)
  }

  const titulos: Record<Tela, string> = {
    clientes: 'Clientes', fornecedores: 'Fornecedores', encomendas: 'Gestão de pedidos', financeiro: 'Financeiro',
  }

  useModalAcessivel(Boolean(exclusaoPendente || motivoCancelamentoPendente || cancelamentoPendente || estoquePendente), () => {
    setExclusaoPendente(null)
    setMotivoCancelamentoPendente(null)
    setMotivoCancelamentoPedido('')
    setCancelamentoPendente(null)
    setEstoquePendente(null)
  }, estoquePendente ? '#gestao-estoque-motivo'
    : motivoCancelamentoPendente ? '#gestao-motivo-cancelamento'
    : exclusaoPendente ? '#gestao-confirmar-exclusao' : '#gestao-confirmar-cancelamento')

  return (
    <>
      <AlertaConclusao mensagem={confirmacao} onConcluir={() => setConfirmacao('')} />
      <Link className="back-link" to="/mais">‹ Mais</Link>
      <h1>{titulos[tela]}</h1>
      {erro && tela !== 'financeiro' && <p className="notice error" role="alert">{erro}</p>}
      {tela === 'financeiro' && <MensagemModal tipo="erro" mensagem={erro} onFechar={() => setErro('')} />}

      {(tela === 'clientes' || tela === 'fornecedores') && (
        <>
          {formAberto && <div className="alert-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) reset() }}><section className="cd add-dialog form-dialog" id={`${tela}-form`} role="dialog" aria-modal="true" aria-labelledby={`${tela}-form-title`}>
            <FecharModal onClick={reset} />
            <h2 id={`${tela}-form-title`}>{idCadastro ? 'Editar' : 'Novo'} {tela === 'clientes' ? 'cliente' : 'fornecedor'}</h2>
            <Campo rotulo="Nome completo" id={`${tela}.nome`} valor={nome} onChange={(value) => setNome(normalizarNomeContato(value))}
              limite={60} minLength={2} required />
            {tela === 'clientes' && <>
              <Campo rotulo="Telefone" id="clientes.contato" tipo="tel" valor={contato}
                onChange={(value) => setContato(formatarTelefone(value))} inputMode="numeric" required />
              <Campo rotulo="Endereço" id="clientes.endereco" valor={endereco}
                onChange={(value) => setEndereco(normalizarTextoCadastro(value))} limite={200} />
              <SeletorData rotulo="Data de nascimento" id="clientes.aniversario" valor={aniversario}
                onChange={setAniversario} max={dataMaisRecenteNascimento()} />
            </>}
            {tela === 'fornecedores' && <>
              <Campo rotulo="Telefone" id="fornecedores.contato" tipo="tel" valor={contato}
                onChange={(value) => setContato(formatarTelefone(value))} inputMode="numeric" required />
              <Campo rotulo="Endereço" id="fornecedores.endereco" valor={endereco}
                onChange={(value) => setEndereco(normalizarTextoCadastro(value))} limite={200} />
            </>}
            <Campo rotulo="Observações" id={`${tela}.observacoes`} valor={observacoes}
              onChange={(value) => setObservacoes(normalizarTextoCadastro(value))} limite={200} />
            <div className="form-actions">
              <button className="bt o" type="button" disabled={salvando} onClick={reset}>Cancelar</button>
              <button className="bt" type="button" disabled={!dadosContatoValidos || salvando} onClick={() => void salvarCadastro()} data-testid={`${tela}.salvar`}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </section></div>}
          <section className="cd">
            <h2>Cadastrados</h2>
            {tela === 'clientes' && clientes.map((client) => <div className="r contact-row" key={client.id}>
              <span>{client.nome}<small>{client.telefone || client.endereco || 'Sem contato'}</small></span>
              <div className="contact-row-actions">
                <button className="lk icon-action" type="button" aria-label={`Editar ${client.nome}`} title="Editar"
                  onClick={() => editarCadastro(client)}><Icon name="edit" /></button>
                <button className="lk icon-action" type="button" aria-label={`Remover dados de ${client.nome}`} title="Remover dados"
                  onClick={() => setExclusaoPendente({ tipo: 'cliente', row: client })}><Icon name="trash" /></button>
              </div>
            </div>)}
            {tela === 'clientes' && !clientes.length && <p className="notice">Nenhum cliente cadastrado.</p>}
            {tela === 'fornecedores' && fornecedores.map((supplier) => <div className="r contact-row" key={supplier.id}>
              <span>{supplier.nome}
                <small>{supplier.contato || 'Sem contato'}</small>
                {supplier.endereco && <small>{supplier.endereco}</small>}
              </span>
              <div className="contact-row-actions">
                <button className="lk icon-action" type="button" aria-label={`Editar ${supplier.nome}`} title="Editar"
                  onClick={() => editarCadastro(supplier)}><Icon name="edit" /></button>
                <button className="lk icon-action" type="button" aria-label={`Excluir ${supplier.nome}`} title="Excluir"
                  onClick={() => setExclusaoPendente({ tipo: 'fornecedor', row: supplier })}><Icon name="trash" /></button>
              </div>
            </div>)}
            {tela === 'fornecedores' && !fornecedores.length && <p className="notice">Nenhum fornecedor cadastrado.</p>}
          </section>
        </>
      )}

      {exclusaoPendente && <ConfirmacaoAcao
        id="gestao-confirmar-exclusao"
        titulo={exclusaoPendente.tipo === 'cliente' ? 'Remover dados do cliente?' : 'Excluir fornecedor?'}
        mensagem={exclusaoPendente.tipo === 'cliente'
          ? `Os dados pessoais de "${exclusaoPendente.row.nome}" serão removidos. O histórico financeiro será mantido sem vínculo ao cliente.`
          : `O fornecedor "${exclusaoPendente.row.nome}" será excluído.`}
        confirmar={exclusaoPendente.tipo === 'cliente' ? 'Remover dados' : 'Excluir'}
        perigosa
        onCancelar={() => setExclusaoPendente(null)}
        onConfirmar={() => void confirmarExclusao()}
      />}

      {cancelamentoPendente && <ConfirmacaoAcao
        id="gestao-confirmar-cancelamento"
        titulo="Cancelar pedido?"
        mensagem={<>
          Deseja realmente cancelar o pedido de {cancelamentoPendente.cliente_nome || 'cliente não informado'}?
          <small className="cancellation-reason-preview">Motivo: {motivoCancelamentoPedido.trim()}</small>
        </>}
        confirmar="Sim"
        perigosa
        onCancelar={() => setCancelamentoPendente(null)}
        onConfirmar={() => void confirmarCancelamentoPedido()}
      />}

      {motivoCancelamentoPendente && <div className="alert-overlay" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setMotivoCancelamentoPendente(null)
      }}>
        <section id="gestao-motivo-cancelamento" className="alert-dialog" role="dialog" aria-modal="true" aria-labelledby="gestao-motivo-cancelamento-titulo" tabIndex={-1}>
          <FecharModal onClick={() => setMotivoCancelamentoPendente(null)} />
          <span className="alert-icon danger"><Icon name="trash" size={26} /></span>
          <h2 id="gestao-motivo-cancelamento-titulo">Motivo do cancelamento</h2>
          <p>Informe por que o pedido de {motivoCancelamentoPendente.cliente_nome || 'cliente não informado'} será cancelado.</p>
          <label className="fl">
            <small>Motivo do cancelamento (obrigatório)</small>
            <input id="gestao-motivo-cancelamento-input" autoFocus value={motivoCancelamentoPedido}
              onChange={(event) => setMotivoCancelamentoPedido(event.target.value)} maxLength={200} />
          </label>
          <div className="alert-actions">
            <button className="bt o" type="button" onClick={() => setMotivoCancelamentoPendente(null)}>Cancelar</button>
            <button className="bt danger-button" type="button" disabled={!motivoCancelamentoPedido.trim()} onClick={() => {
              setCancelamentoPendente(motivoCancelamentoPendente)
              setMotivoCancelamentoPendente(null)
            }}>Continuar</button>
          </div>
        </section>
      </div>}

      {estoquePendente && <div className="alert-overlay" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setEstoquePendente(null)
      }}>
        <section className="cd add-dialog stock-sale-dialog" role="dialog" aria-modal="true" aria-labelledby="gestao-estoque-titulo">
          <FecharModal onClick={() => setEstoquePendente(null)} />
          <h2 id="gestao-estoque-titulo">Estoque insuficiente</h2>
          <p>{estoquePendente.mensagem}</p>
          <Campo id="gestao-estoque-motivo" rotulo="Motivo para finalizar" valor={motivoEstoque}
            onChange={setMotivoEstoque} limite={200} required
            placeholder="Descreva por que a venda pode continuar" />
          <div className="form-actions">
            <button className="bt o" type="button" onClick={() => setEstoquePendente(null)}>Cancelar</button>
            <button className="bt" type="button" disabled={!motivoEstoque.trim()} onClick={() => {
              const pedido = estoquePendente.pedido
              const motivo = motivoEstoque.trim()
              setEstoquePendente(null)
              void avancar(pedido, motivo)
            }}>Finalizar pedido</button>
          </div>
        </section>
      </div>}

      {tela === 'encomendas' && <>
        <section className="scheduled-dashboard" aria-labelledby="scheduled-title">
          <div className="scheduled-heading"><div><h2 id="scheduled-title">Resumo dos pedidos</h2><p className="sb">Vendas agendadas, finalizadas e canceladas</p></div></div>
          <div className="scheduled-metrics"><div><small>Saldo a receber</small><b>{formatBRL(totalAgendado)}</b></div><div><small>Agendados</small><b>{encomendasAbertas.length}</b></div><div><small>Finalizados</small><b>{encomendasListadas.filter((order) => order.status === 'finalizado').length}</b></div><div><small>Cancelados</small><b>{encomendasListadas.filter((order) => order.status === 'cancelado').length}</b></div></div>
          {!!diasAgenda.length && <div className="agenda-strip" aria-label="Dias com entregas"><button type="button" className={!diaSelecionado ? 'selected' : ''} onClick={() => setDiaSelecionado('')}>Todos</button>{diasAgenda.map((dia) => { const info = diaAgenda(dia); return <button type="button" key={dia} className={diaSelecionado === dia ? 'selected' : ''} onClick={() => setDiaSelecionado(dia)}><small>{info.semana}</small><b>{info.numero}</b></button> })}</div>}
          <div className="scheduled-filters" aria-label="Filtrar pedidos">{STATUS_ENCOMENDA.map(([value, label]) => <button key={value} type="button" aria-pressed={filtroAgenda === value} className={filtroAgenda === value ? 'selected' : ''} onClick={() => setFiltroAgenda(value)}>{label}</button>)}</div>
        </section>
        <section className="cd">
          {!encomendas.length && <p className="notice">Nenhum pedido registrado. Faça uma venda agendada na tela Vendas para começar.</p>}
          {!!encomendas.length && !encomendasVisiveis.length && (
            <p className="notice">
              {filtroAgenda === 'todos'
                ? 'Nenhum pedido encontrado para os filtros selecionados.'
                : `Nenhum pedido ${statusLabel[filtroAgenda as EncomendaRow['status']].toLocaleLowerCase('pt-BR')} encontrado.`}
            </p>
          )}
          {encomendasVisiveis.map((order) => <div className={`order-card${pedidoDestacado === order.id ? ' order-card-new' : ''}`} id={`pedido-${order.id}`} key={order.id}>
            <div className="order-card-top"><div className="order-avatar">{(order.cliente_nome || 'S').slice(0, 1).toUpperCase()}</div><div><b>{order.cliente_nome || 'Sem cliente'}</b><small>{order.origem === 'agora' ? 'Venda agora' : `Agendada para ${formatBRDate(order.data_entrega.slice(0, 10))}`}</small></div><span className={`order-status ${order.status}`}>{statusLabel[order.status]}</span></div>
            <div className="order-summary"><span>Total <b>{formatBRL(order.total_cents)}</b></span></div>
            {order.observacoes && <small>{order.observacoes}</small>}
            {order.status === 'agendado' && (
              <>
                <Selecao rotulo="Forma de pagamento ao finalizar" id={`encomenda.pagamento.${order.id}`}
                  valor={formaEntrega[order.id] ?? ''} onChange={(value) => setFormaEntrega((current) => ({ ...current, [order.id]: value }))}
                  opcoes={[['pix', 'Pix'], ['dinheiro', 'Dinheiro'], ['cartao_debito', 'Cartão de débito'], ['cartao_credito', 'Cartão de crédito']]} />
                <button className="bt" type="button" disabled={!formaEntrega[order.id]} onClick={() => void avancar(order)}>
                  Finalizar pedido
                </button>
                <button className="bt o" type="button" onClick={() => {
                  setMotivoCancelamentoPedido('')
                  setMotivoCancelamentoPendente(order)
                }}>Cancelar pedido</button>
              </>
            )}
            {order.status === 'finalizado' && order.venda_id && (
              <Link className="bt" to={`/venda/${order.venda_id}`}>Ver comprovante</Link>
            )}
          </div>)}
        </section>
      </>}

      {tela === 'financeiro' && <>
        {formAberto && <div className="alert-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) reset() }}><section className="cd add-dialog form-dialog" id="financeiro-form" role="dialog" aria-modal="true" aria-labelledby="financeiro-form-title">
          <FecharModal onClick={reset} />
          <h2 id="financeiro-form-title">Novo lançamento</h2>
          <Selecao rotulo="Tipo" id="financeiro.tipo" valor={tipo}
            onChange={(value) => {
              setTipo(value as 'receita' | 'despesa')
              setVencimento('')
            }}
            opcoes={TIPOS_LANCAMENTO} />
          <Campo rotulo="Descrição" id="financeiro.descricao" valor={descricao} onChange={setDescricao}
            limite={100} required placeholder="O que é este lançamento?" />
          <Selecao rotulo="Categoria" id="financeiro.categoria" valor={categoria} onChange={setCategoria}
            opcoes={categorias.map((item) => [item.nome, item.nome])} placeholder="Selecione uma categoria" />
          <Link className="lk" to="/categorias">Gerenciar categorias</Link>
          <Campo rotulo="Valor (R$)" id="financeiro.valor" valor={valor} onChange={setValor} mascara="dinheiro" />
          <div className="g">
            <SeletorData rotulo="Data" id="financeiro.data" valor={data} required onChange={setData} />
            {tipo === 'despesa' && <SeletorData rotulo="Vencimento" id="financeiro.vencimento" valor={vencimento} onChange={setVencimento} />}
          </div>
          <Selecao rotulo={tipo === 'receita' ? 'Recebimento' : 'Pagamento'} id="financeiro.pago" valor={pago}
            onChange={setPago} opcoes={tipo === 'receita' ? STATUS_RECEBIMENTO : STATUS_PAGAMENTO} />
          <button className="bt" disabled={!descricao.trim() || !categoria.trim() || !(Number(valor) > 0) || salvando} onClick={() => void salvarConta()}
            data-testid="financeiro.salvar">{salvando ? 'Salvando...' : 'Salvar lançamento'}</button>
        </section></div>}
        <section className="cd">
          <h2>Movimentações</h2>
          {!lancamentos.length && <p className="notice">Ainda não há lançamentos financeiros.</p>}
          {lancamentos.map((entry) => <div className="r" key={entry.id}>
            <span className="finance-category-label">
              <span className="finance-category-name">{!entry.origem_tipo && entry.descricao ? entry.descricao : entry.categoria || entry.tipo}
                {entry.categoria && (entry.categoria === 'Categoria excluída'
                  ? <span className="category-color-dot category-color-deleted" role="img" aria-label="Categoria excluída"><Icon name="lock" size={13} /></span>
                  : <i className="category-color-dot" style={{ backgroundColor: coresCategoria.get(entry.categoria.toLocaleLowerCase('pt-BR')) ?? '#704214' }} aria-hidden="true" />)}
              </span>
              <small>{entry.tipo} · {formatBRDate(entry.data)} · {entry.pago ? (entry.tipo === 'receita' ? 'Recebido' : 'Pago') : 'Pendente'}{entry.negocio ? ' · negócio' : ' · pessoal'}</small>
            </span>
            <b>{formatBRL(entry.valor_cents)}</b>
            {!entry.pago && <button className="lk" type="button" onClick={async () => {
              try { await marcarLancamentoPago(db, entry.id); await carregar(); setConfirmacao(entry.tipo === 'receita' ? 'Receita marcada como recebida.' : 'Despesa marcada como paga.') }
              catch (error) { setErro(error instanceof Error ? error.message : String(error)) }
            }}>{entry.tipo === 'receita' ? 'Marcar recebido' : 'Marcar pago'}</button>}
            {!entry.origem_tipo && <button className="lk" type="button" onClick={async () => {
              try { await excluirLancamento(db, entry.id); await carregar(); setConfirmacao('Lançamento removido.') }
              catch (error) { setErro(error instanceof Error ? error.message : String(error)) }
            }}>Excluir</button>}
          </div>)}
        </section>
      </>}
    </>
  )
}
