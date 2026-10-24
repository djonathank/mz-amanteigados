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
import { AlertaConclusao, Campo, FecharModal, focarCampo, Selecao } from './ui'

type Tela = 'clientes' | 'fornecedores' | 'encomendas' | 'financeiro'
interface Props { tela: Tela }

const TIPOS_LANCAMENTO: [string, string][] = [['receita', 'Receita'], ['despesa', 'Despesa']]
const STATUS_PAGAMENTO: [string, string][] = [['1', 'Pago'], ['0', 'Pendente']]
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

export default function Gestao({ tela }: Props) {
  const db = useDb()
  const location = useLocation()
  const navigate = useNavigate()
  const [clientes, setClientes] = useState<ClienteRow[]>([])
  const [fornecedores, setFornecedores] = useState<FornecedorRow[]>([])
  const [encomendas, setEncomendas] = useState<EncomendaRow[]>([])
  const [lancamentos, setLancamentos] = useState<LancamentoRow[]>([])
  const [nome, setNome] = useState('')
  const [idCadastro, setIdCadastro] = useState<string | null>(null)
  const [contato, setContato] = useState('')
  const [endereco, setEndereco] = useState('')
  const [aniversario, setAniversario] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [tipo, setTipo] = useState<'receita' | 'despesa'>('despesa')
  const [categoria, setCategoria] = useState('')
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

  const carregar = useCallback(async () => {
    const [customerRows, supplierRows, orderRows, ledgerRows] = await Promise.all([
      listarClientes(db), listarFornecedores(db), listarEncomendas(db), listarLancamentos(db),
    ])
    setClientes(customerRows)
    setFornecedores(supplierRows)
    setEncomendas(orderRows)
    setLancamentos(ledgerRows)
  }, [db])

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
        await salvarCliente(db, { id: idCadastro ?? undefined, nome, whatsapp: contato, endereco, aniversario, observacoes })
        setConfirmacao(idCadastro ? 'Cliente atualizado.' : 'Cliente salvo.')
      } else {
        await salvarFornecedor(db, { id: idCadastro ?? undefined, nome, contato, observacoes })
        setConfirmacao(idCadastro ? 'Fornecedor atualizado.' : 'Fornecedor salvo.')
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
  const diasAgenda = useMemo(() => Array.from(new Set(encomendasAbertas.map((order) => order.data_entrega.slice(0, 10)))).slice(0, 7), [encomendasAbertas])
  const encomendasVisiveis = useMemo(() => encomendasListadas
    .filter((order) =>
      (filtroAgenda === 'todos' || order.status === filtroAgenda) && (!diaSelecionado || order.data_entrega.slice(0, 10) === diaSelecionado)
    )
    .sort((a, b) => a.data_entrega.localeCompare(b.data_entrega) || (statusOrdem[a.status] ?? 99) - (statusOrdem[b.status] ?? 99)),
    [diaSelecionado, encomendasListadas, filtroAgenda])
  const totalAgendado = encomendasAbertas.reduce((sum, order) => sum + order.total_cents - order.sinal_cents, 0)

  const salvarConta = async () => {
    if (salvando) return
    setErro('')
    try {
      setSalvando(true)
      await salvarLancamento(db, {
        tipo, categoria, valorCents: Math.round(Number(valor || 0) * 100), data,
        vencimento: vencimento || undefined, pago: pago === '1', negocio: true,
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

  const avancar = async (order: EncomendaRow) => {
    setErro('')
    try {
      if (order.status !== 'agendado') return
      const form = formaEntrega[order.id]
      if (!form) throw new Error('Selecione a forma de pagamento para finalizar o pedido.')
      const saveDelivery = async (reason?: string) => entregarEncomenda(db, {
        encomendaId: order.id, forma: form, motivoEstoqueNegativo: reason,
      })
      try {
        await saveDelivery()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!message.includes('Informe o motivo para confirmar saldo negativo')) throw error
        const reason = window.prompt(`${message}\n\nDescreva o motivo para continuar:`)?.trim()
        if (!reason) throw new Error('Finalização cancelada. Informe um motivo para permitir saldo negativo.')
        await saveDelivery(reason)
      }
      setConfirmacao('Pedido finalizado e venda registrada.')
      await carregar()
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    }
  }

  const removerCliente = async (client: ClienteRow) => {
    if (!window.confirm(`Remover os dados pessoais de "${client.nome}"? O histórico financeiro será mantido sem vínculo ao cliente.`)) return
    try {
      await excluirCliente(db, client.id)
      await carregar()
      setConfirmacao('Dados pessoais do cliente removidos.')
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    }
  }

  const editarCadastro = (row: ClienteRow | FornecedorRow) => {
    setFormAberto(true)
    setIdCadastro(row.id)
    setNome(row.nome)
    setContato('whatsapp' in row ? row.whatsapp ?? '' : row.contato ?? '')
    setObservacoes(row.observacoes ?? '')
    if ('whatsapp' in row) {
      setEndereco(row.endereco ?? '')
      setAniversario(row.aniversario ?? '')
    }
    window.scrollTo(0, 0)
    focarCampo(`${tela}.nome`)
  }

  const titulos: Record<Tela, string> = {
    clientes: 'Clientes', fornecedores: 'Fornecedores', encomendas: 'Gestão de pedidos', financeiro: 'Financeiro',
  }

  return (
    <>
      <AlertaConclusao mensagem={confirmacao} onConcluir={() => setConfirmacao('')} />
      <Link className="back-link" to="/mais">‹ Mais</Link>
      <h1>{titulos[tela]}</h1>
      {erro && <p className="notice error" role="alert">{erro}</p>}

      {(tela === 'clientes' || tela === 'fornecedores') && (
        <>
          {formAberto && <div className="alert-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) reset() }}><section className="cd add-dialog form-dialog" id={`${tela}-form`} role="dialog" aria-modal="true" aria-labelledby={`${tela}-form-title`}>
            <FecharModal onClick={reset} />
            <h2 id={`${tela}-form-title`}>{idCadastro ? 'Editar' : 'Novo'} {tela === 'clientes' ? 'cliente' : 'fornecedor'}</h2>
            <Campo rotulo="Nome" id={`${tela}.nome`} valor={nome} onChange={setNome} />
            {tela === 'clientes' && <>
              <Campo rotulo="WhatsApp ou telefone" id="clientes.contato" valor={contato} onChange={setContato} />
              <Campo rotulo="Endereço" id="clientes.endereco" valor={endereco} onChange={setEndereco} />
              <Campo rotulo="Aniversário" id="clientes.aniversario" tipo="date" valor={aniversario} onChange={setAniversario} />
            </>}
            {tela === 'fornecedores' && <Campo rotulo="Contato" id="fornecedores.contato" valor={contato} onChange={setContato} />}
            <Campo rotulo="Observações" id={`${tela}.observacoes`} valor={observacoes} onChange={setObservacoes} />
            <button className="bt" disabled={!nome.trim() || salvando} onClick={() => void salvarCadastro()} data-testid={`${tela}.salvar`}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </section></div>}
          <section className="cd">
            <h2>Cadastrados</h2>
            {tela === 'clientes' && clientes.map((client) => <div className="r" key={client.id}>
              <span>{client.nome}<small>{client.whatsapp || client.endereco || 'Sem contato'}</small></span>
              <button className="lk" type="button" onClick={() => editarCadastro(client)}>Editar</button>
              <button className="lk" type="button" onClick={() => void removerCliente(client)}>Remover dados</button>
            </div>)}
            {tela === 'clientes' && !clientes.length && <p className="notice">Nenhum cliente cadastrado.</p>}
            {tela === 'fornecedores' && fornecedores.map((supplier) => <div className="r" key={supplier.id}>
              <span>{supplier.nome}<small>{supplier.contato || 'Sem contato'}</small></span>
              <button className="lk" type="button" onClick={() => editarCadastro(supplier)}>Editar</button>
              <button className="lk" type="button" onClick={async () => {
                if (!window.confirm(`Excluir fornecedor "${supplier.nome}"?`)) return
                try { await excluirFornecedor(db, supplier.id); await carregar(); setConfirmacao('Fornecedor excluído.') }
                catch (error) { setErro(error instanceof Error ? error.message : String(error)) }
              }}>Excluir</button>
            </div>)}
            {tela === 'fornecedores' && !fornecedores.length && <p className="notice">Nenhum fornecedor cadastrado.</p>}
          </section>
        </>
      )}

      {tela === 'encomendas' && <>
        <section className="scheduled-dashboard" aria-labelledby="scheduled-title">
          <div className="scheduled-heading"><div><h2 id="scheduled-title">Resumo dos pedidos</h2><p className="sb">Vendas agendadas, finalizadas e canceladas</p></div><span className="scheduled-count">{encomendasAbertas.length} agendados</span></div>
          <div className="scheduled-metrics"><div><small>Saldo a receber</small><b>{formatBRL(totalAgendado)}</b></div><div><small>Finalizados</small><b>{encomendasListadas.filter((order) => order.status === 'finalizado').length}</b></div><div><small>Cancelados</small><b>{encomendasListadas.filter((order) => order.status === 'cancelado').length}</b></div></div>
          {!!diasAgenda.length && <div className="agenda-strip" aria-label="Dias com entregas"><button type="button" className={!diaSelecionado ? 'selected' : ''} onClick={() => setDiaSelecionado('')}>Todos</button>{diasAgenda.map((dia) => { const info = diaAgenda(dia); return <button type="button" key={dia} className={diaSelecionado === dia ? 'selected' : ''} onClick={() => setDiaSelecionado(dia)}><small>{info.semana}</small><b>{info.numero}</b></button> })}</div>}
          <div className="scheduled-filters" aria-label="Filtrar pedidos">{STATUS_ENCOMENDA.map(([value, label]) => <button key={value} type="button" aria-pressed={filtroAgenda === value} className={filtroAgenda === value ? 'selected' : ''} onClick={() => setFiltroAgenda(value)}>{label}</button>)}</div>
        </section>
        <section className="cd">
          {!encomendas.length && <p className="notice">Nenhum pedido registrado. Faça uma venda agendada na tela Vendas para começar.</p>}
          {encomendasVisiveis.map((order) => <div className="order-card" key={order.id}>
            <div className="order-card-top"><div className="order-avatar">{(order.cliente_nome || 'S').slice(0, 1).toUpperCase()}</div><div><b>{order.cliente_nome || 'Sem cliente'}</b><small>{order.origem === 'agora' ? 'Venda agora' : `Agendada para ${formatBRDate(order.data_entrega.slice(0, 10))}`}</small></div><span className={`order-status ${order.status}`}>{statusLabel[order.status]}</span></div>
            <div className="order-summary"><span>Total <b>{formatBRL(order.total_cents)}</b></span></div>
            {order.observacoes && <small>{order.observacoes}</small>}
            {order.status === 'agendado' && (
              <>
                <Selecao rotulo="Forma de pagamento ao finalizar" id={`encomenda.pagamento.${order.id}`}
                  valor={formaEntrega[order.id] ?? ''} onChange={(value) => setFormaEntrega((current) => ({ ...current, [order.id]: value }))}
                  opcoes={[['pix', 'Pix'], ['dinheiro', 'Dinheiro'], ['cartao', 'Cartão']]} />
                <button className="bt" type="button" disabled={!formaEntrega[order.id]} onClick={() => void avancar(order)}>
                  Finalizar pedido
                </button>
                <button className="lk" type="button" onClick={async () => {
              try { await alterarStatusEncomenda(db, order.id, 'cancelado'); await carregar(); setConfirmacao('Encomenda cancelada.') }
              catch (error) { setErro(error instanceof Error ? error.message : String(error)) }
                }}>Cancelar pedido</button>
              </>
            )}
          </div>)}
          {!!encomendasAbertas.length && !encomendasVisiveis.length && <p className="notice">Nenhuma venda agendada combina com esse filtro.</p>}
        </section>
      </>}

      {tela === 'financeiro' && <>
        {formAberto && <div className="alert-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) reset() }}><section className="cd add-dialog form-dialog" id="financeiro-form" role="dialog" aria-modal="true" aria-labelledby="financeiro-form-title">
          <FecharModal onClick={reset} />
          <h2 id="financeiro-form-title">Novo lançamento</h2>
          <Selecao rotulo="Tipo" id="financeiro.tipo" valor={tipo} onChange={(value) => setTipo(value as 'receita' | 'despesa')} opcoes={TIPOS_LANCAMENTO} />
          <Campo rotulo="Categoria" id="financeiro.categoria" valor={categoria} onChange={setCategoria} />
          <Campo rotulo="Valor (R$)" id="financeiro.valor" valor={valor} onChange={setValor} mascara="dinheiro" />
          <div className="g">
            <Campo rotulo="Data" id="financeiro.data" tipo="date" valor={data} onChange={setData} />
            <Campo rotulo="Vencimento" id="financeiro.vencimento" tipo="date" valor={vencimento} onChange={setVencimento} />
          </div>
          <Selecao rotulo="Pagamento" id="financeiro.pago" valor={pago} onChange={setPago} opcoes={STATUS_PAGAMENTO} />
          <button className="bt" disabled={!categoria.trim() || !(Number(valor) > 0) || salvando} onClick={() => void salvarConta()}
            data-testid="financeiro.salvar">{salvando ? 'Salvando...' : 'Salvar lançamento'}</button>
        </section></div>}
        <section className="cd">
          <h2>Movimentações</h2>
          {!lancamentos.length && <p className="notice">Ainda não há lançamentos financeiros.</p>}
          {lancamentos.map((entry) => <div className="r" key={entry.id}>
            <span>{entry.categoria || entry.tipo}<small>{entry.tipo} · {formatBRDate(entry.data)} · {entry.pago ? 'Pago' : 'Pendente'}{entry.negocio ? ' · negócio' : ' · pessoal'}</small></span>
            <b>{formatBRL(entry.valor_cents)}</b>
            {!entry.pago && <button className="lk" type="button" onClick={async () => {
              try { await marcarLancamentoPago(db, entry.id); await carregar(); setConfirmacao('Lançamento marcado como pago.') }
              catch (error) { setErro(error instanceof Error ? error.message : String(error)) }
            }}>Marcar pago</button>}
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
