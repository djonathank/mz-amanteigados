import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDb } from '../data/DbContext'
import { listarVariantes, type VarianteRow } from '../data/repos'
import {
  alterarStatusEncomenda, entregarEncomenda, excluirCliente, excluirFornecedor, excluirLancamento,
  listarClientes, listarEncomendas, listarFornecedores, listarLancamentos, listarItensEncomenda, marcarLancamentoPago,
  salvarCliente, salvarEncomenda, salvarFornecedor, salvarLancamento,
  type ClienteRow, type EncomendaRow, type FornecedorRow, type LancamentoRow,
} from '../data/phase3'
import { formatBRL } from '../domain/money'
import { formatBRDate } from '../domain/date'
import { AlertaConclusao, Campo, focarCampo, Selecao } from './ui'

type Tela = 'clientes' | 'fornecedores' | 'encomendas' | 'financeiro'
interface Props { tela: Tela }
interface ItemForm { varianteId: string; quantidade: string }

const TIPOS_LANCAMENTO: [string, string][] = [['receita', 'Receita'], ['despesa', 'Despesa']]
const STATUS_PAGAMENTO: [string, string][] = [['1', 'Pago'], ['0', 'Pendente']]
const padraoData = () => new Date().toISOString().slice(0, 10)
const STATUS_ENCOMENDA: [string, string][] = [['todos', 'Todos'], ['pedido', 'Pedido realizado'], ['pago', 'Pago'], ['cancelado', 'Cancelado']]
const statusLabel: Record<string, string> = { pedido: 'Pedido realizado', pago: 'Pago', produzindo: 'Pedido realizado', pronto: 'Pedido realizado', entregue: 'Pago', cancelado: 'Cancelado' }
const statusOrdem: Record<string, number> = { pedido: 0, produzindo: 0, pronto: 0, pago: 1, entregue: 1, cancelado: 2 }
const diaAgenda = (data: string) => {
  const date = new Date(`${data}T12:00:00`)
  return { numero: date.getDate(), semana: date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''), completo: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }
}

export default function Gestao({ tela }: Props) {
  const db = useDb()
  const [clientes, setClientes] = useState<ClienteRow[]>([])
  const [fornecedores, setFornecedores] = useState<FornecedorRow[]>([])
  const [encomendas, setEncomendas] = useState<EncomendaRow[]>([])
  const [lancamentos, setLancamentos] = useState<LancamentoRow[]>([])
  const [variantes, setVariantes] = useState<VarianteRow[]>([])
  const [nome, setNome] = useState('')
  const [idCadastro, setIdCadastro] = useState<string | null>(null)
  const [contato, setContato] = useState('')
  const [endereco, setEndereco] = useState('')
  const [aniversario, setAniversario] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [encomendaEditando, setEncomendaEditando] = useState<string | null>(null)
  const [dataEntrega, setDataEntrega] = useState('')
  const [sinal, setSinal] = useState('')
  const [itens, setItens] = useState<ItemForm[]>([{ varianteId: '', quantidade: '' }])
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

  const carregar = useCallback(async () => {
    const [customerRows, supplierRows, orderRows, ledgerRows, variantRows] = await Promise.all([
      listarClientes(db), listarFornecedores(db), listarEncomendas(db), listarLancamentos(db), listarVariantes(db),
    ])
    setClientes(customerRows)
    setFornecedores(supplierRows)
    setEncomendas(orderRows)
    setLancamentos(ledgerRows)
    setVariantes(variantRows)
  }, [db])

  useEffect(() => {
    void carregar().catch((error) => setErro(error instanceof Error ? error.message : String(error)))
  }, [carregar])

  const reset = () => {
    setNome('')
    setIdCadastro(null)
    setContato('')
    setEndereco('')
    setAniversario('')
    setObservacoes('')
    setClienteId('')
    setEncomendaEditando(null)
    setDataEntrega('')
    setSinal('')
    setItens([{ varianteId: '', quantidade: '' }])
    setTipo('despesa')
    setCategoria('')
    setValor('')
    setData(padraoData())
    setVencimento('')
    setPago('1')
  }

  const salvarCadastro = async () => {
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
      await carregar()
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    } finally {
      setSalvando(false)
    }
  }

  const salvarPedido = async () => {
    setErro('')
    setSalvando(true)
    try {
      await salvarEncomenda(db, {
        id: encomendaEditando ?? undefined,
        clienteId: clienteId || undefined,
        dataEntrega,
        sinalCents: Math.round(Number(sinal || 0) * 100),
        observacoes,
        itens: itens.map((item) => {
          const variant = variantes.find((row) => row.id === item.varianteId)
          if (!variant) throw new Error('Selecione uma variante válida para cada item.')
          return { varianteId: variant.id, quantidade: Number(item.quantidade), precoUnitCents: variant.preco_cents }
        }),
      })
      setConfirmacao(encomendaEditando ? 'Encomenda atualizada.' : 'Encomenda registrada e lançamentos financeiros atualizados.')
      reset()
      await carregar()
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    } finally {
      setSalvando(false)
    }
  }

  const totalPedido = useMemo(() => itens.reduce((sum, item) => {
    const variant = variantes.find((row) => row.id === item.varianteId)
    return sum + Number(item.quantidade || 0) * (variant?.preco_cents ?? 0)
  }, 0), [itens, variantes])

  const encomendasAbertas = useMemo(() => encomendas.filter((order) => !['cancelado', 'pago', 'entregue'].includes(order.status)), [encomendas])
  const encomendasListadas = useMemo(() => encomendas.filter((order) => order.status !== 'entregue'), [encomendas])
  const diasAgenda = useMemo(() => Array.from(new Set(encomendasAbertas.map((order) => order.data_entrega.slice(0, 10)))).slice(0, 7), [encomendasAbertas])
  const encomendasVisiveis = useMemo(() => encomendasListadas
    .filter((order) =>
      (filtroAgenda === 'todos' || order.status === filtroAgenda) && (!diaSelecionado || order.data_entrega.slice(0, 10) === diaSelecionado)
    )
    .sort((a, b) => a.data_entrega.localeCompare(b.data_entrega) || (statusOrdem[a.status] ?? 99) - (statusOrdem[b.status] ?? 99)),
    [diaSelecionado, encomendasListadas, filtroAgenda])
  const totalAgendado = encomendasAbertas.reduce((sum, order) => sum + order.total_cents, 0)

  const salvarConta = async () => {
    setErro('')
    try {
      setSalvando(true)
      await salvarLancamento(db, {
        tipo, categoria, valorCents: Math.round(Number(valor || 0) * 100), data,
        vencimento: vencimento || undefined, pago: pago === '1', negocio: true,
      })
      setConfirmacao('Lançamento financeiro salvo.')
      reset()
      await carregar()
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    } finally {
      setSalvando(false)
    }
  }

  const avancar = async (order: EncomendaRow) => {
    setErro('')
    try {
      if (order.status === 'pronto') {
        const form = formaEntrega[order.id]
        if (!form) throw new Error('Selecione a forma de pagamento para registrar a entrega.')
        const saveDelivery = async (reason?: string) => entregarEncomenda(db, {
          encomendaId: order.id, forma: form, motivoEstoqueNegativo: reason,
        })
        try {
          await saveDelivery()
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (!message.includes('Informe o motivo para confirmar saldo negativo')) throw error
          const reason = window.prompt(`${message}\n\nDescreva o motivo para continuar:`)?.trim()
          if (!reason) throw new Error('Entrega cancelada. Informe um motivo para permitir saldo negativo.')
          await saveDelivery(reason)
        }
        setConfirmacao('Encomenda entregue e venda registrada.')
      } else if (order.status === 'pedido') {
        await alterarStatusEncomenda(db, order.id, 'pago')
        setConfirmacao('Pedido marcado como pago.')
      }
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

  const editarPedido = async (order: EncomendaRow) => {
    try {
      const orderItems = await listarItensEncomenda(db, order.id)
      setEncomendaEditando(order.id)
      setClienteId(order.cliente_id ?? '')
      setDataEntrega(order.data_entrega.slice(0, 10))
      setSinal((order.sinal_cents / 100).toFixed(2))
      setObservacoes(order.observacoes ?? '')
      setItens(orderItems.map((item) => ({ varianteId: item.variante_id, quantidade: String(item.quantidade) })))
      window.scrollTo(0, 0)
      focarCampo('encomenda.cliente')
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    }
  }

  const titulos: Record<Tela, string> = {
    clientes: 'Clientes', fornecedores: 'Fornecedores', encomendas: 'Encomendas', financeiro: 'Financeiro',
  }

  return (
    <>
      <AlertaConclusao mensagem={confirmacao} onConcluir={() => setConfirmacao('')} />
      <Link className="back-link" to="/mais">‹ Mais</Link>
      <h1>{titulos[tela]}</h1>
      <div className="quick-actions">
        <Link to="/clientes">Clientes</Link><Link to="/fornecedores">Fornecedores</Link>
        {tela !== 'encomendas' && <Link to="/encomendas">Encomendas</Link>}<Link to="/financeiro">Financeiro</Link>
      </div>
      {erro && <p className="notice error" role="alert">{erro}</p>}

      {(tela === 'clientes' || tela === 'fornecedores') && (
        <>
          <section className="cd" id={`${tela}-form`}>
            <h2>{idCadastro ? 'Editar' : 'Novo'} {tela === 'clientes' ? 'cliente' : 'fornecedor'}</h2>
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
          </section>
          <section className="cd">
            <h2>Cadastrados</h2>
            {tela === 'clientes' && clientes.map((client) => <div className="r" key={client.id}>
              <span>{client.nome}<small>{client.whatsapp || client.endereco || 'Sem contato'}</small></span>
              <button className="lk" type="button" onClick={() => editarCadastro(client)}>Editar</button>
              <button className="lk" type="button" onClick={() => void removerCliente(client)}>Remover dados</button>
            </div>)}
            {tela === 'fornecedores' && fornecedores.map((supplier) => <div className="r" key={supplier.id}>
              <span>{supplier.nome}<small>{supplier.contato || 'Sem contato'}</small></span>
              <button className="lk" type="button" onClick={() => editarCadastro(supplier)}>Editar</button>
              <button className="lk" type="button" onClick={async () => {
                if (!window.confirm(`Excluir fornecedor "${supplier.nome}"?`)) return
                try { await excluirFornecedor(db, supplier.id); await carregar(); setConfirmacao('Fornecedor excluído.') }
                catch (error) { setErro(error instanceof Error ? error.message : String(error)) }
              }}>Excluir</button>
            </div>)}
          </section>
        </>
      )}

      {tela === 'encomendas' && <>
        <section className="scheduled-dashboard" aria-labelledby="scheduled-title">
          <div className="scheduled-heading"><div><h2 id="scheduled-title">Vendas agendadas</h2><p className="sb">Acompanhe produção e próximas entregas</p></div><span className="scheduled-count">{encomendasAbertas.length} abertas</span></div>
          <div className="scheduled-metrics"><div><small>Agendado</small><b>{formatBRL(totalAgendado)}</b></div><div><small>Pago</small><b>{encomendasListadas.filter((order) => ['pago', 'entregue'].includes(order.status)).length}</b></div><div><small>Cancelado</small><b>{encomendasListadas.filter((order) => order.status === 'cancelado').length}</b></div></div>
          {!!diasAgenda.length && <div className="agenda-strip" aria-label="Dias com entregas"><button type="button" className={!diaSelecionado ? 'selected' : ''} onClick={() => setDiaSelecionado('')}>Todos</button>{diasAgenda.map((dia) => { const info = diaAgenda(dia); return <button type="button" key={dia} className={diaSelecionado === dia ? 'selected' : ''} onClick={() => setDiaSelecionado(dia)}><small>{info.semana}</small><b>{info.numero}</b></button> })}</div>}
          <div className="scheduled-filters" role="tablist" aria-label="Filtrar pedidos">{STATUS_ENCOMENDA.map(([value, label]) => <button key={value} type="button" className={filtroAgenda === value ? 'selected' : ''} onClick={() => setFiltroAgenda(value)}>{label}</button>)}</div>
        </section>
        <section className="cd">
          <h2>Gestão de pedidos</h2>
          {!encomendas.length && <p className="notice">Nenhuma encomenda registrada.</p>}
          {encomendasVisiveis.map((order) => <div className="order-card" key={order.id}>
            <div className="order-card-top"><div className="order-avatar">{(order.cliente_nome || 'S').slice(0, 1).toUpperCase()}</div><div><b>{order.cliente_nome || 'Sem cliente'}</b><small>Entrega {formatBRDate(order.data_entrega.slice(0, 10))}</small></div><span className={`order-status ${order.status}`}>{statusLabel[order.status]}</span></div>
            <div className="order-summary"><span>Total <b>{formatBRL(order.total_cents)}</b></span></div>
            {order.observacoes && <small>{order.observacoes}</small>}
            {order.status === 'pedido' && (
              <button className="bt" type="button" onClick={() => void avancar(order)}>
                Marcar como pago
              </button>
            )}
            {order.status === 'pedido' && <button className="lk" type="button" onClick={async () => {
              try { await alterarStatusEncomenda(db, order.id, 'cancelado'); await carregar(); setConfirmacao('Encomenda cancelada.') }
              catch (error) { setErro(error instanceof Error ? error.message : String(error)) }
            }}>Cancelar encomenda</button>}
          </div>)}
          {!!encomendasAbertas.length && !encomendasVisiveis.length && <p className="notice">Nenhuma venda agendada combina com esse filtro.</p>}
        </section>
      </>}

      {tela === 'financeiro' && <>
        <section className="cd" id="financeiro-form">
          <h2>Novo lançamento</h2>
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
        </section>
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
