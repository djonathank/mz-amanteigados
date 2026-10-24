import { useCallback, useEffect, useState } from 'react'
import { useDb } from '../data/DbContext'
import { excluirInsumo, listarInsumos, salvarInsumo, type InsumoRow } from '../data/repos'
import { formatBRL } from '../domain/money'
import type { Unit } from '../domain/units'
import { ajustarEstoque, definirEstoqueMinimoInsumo, listarAlertasEstoque, listarMovimentos } from '../data/phase2'
import { AlertaConclusao, Campo, ConfirmacaoAcao, FecharModal, focarCampo, Icon, Selecao } from './ui'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { normalizarNumeroDigitado, type NumericMask } from '../domain/inputMask'

const UNIDADES: [string, string][] = [['kg', 'kg'], ['g', 'g'], ['l', 'L'], ['ml', 'ml'], ['un', 'unidades']]
const mascaraQuantidade = (unidade: string): NumericMask => unidade === 'un' ? 'inteiro' : 'quantidade'
const TIPOS: [string, string][] = [['ingrediente', 'Ingrediente'], ['embalagem', 'Embalagem'], ['rotulo', 'Rótulo']]

export default function Insumos() {
  const db = useDb()
  const location = useLocation()
  const navigate = useNavigate()
  const [lista, setLista] = useState<InsumoRow[]>([])
  const [movimentos, setMovimentos] = useState<Awaited<ReturnType<typeof listarMovimentos>>>([])
  const [alertas, setAlertas] = useState<Awaited<ReturnType<typeof listarAlertasEstoque>>>([])
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState('')
  const [unidade, setUnidade] = useState<Unit | ''>('')
  const [qtd, setQtd] = useState('')
  const [preco, setPreco] = useState('')
  const [custoInicial, setCustoInicial] = useState<{ qtd: string; preco: string } | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [filtro, setFiltro] = useState('')
  const [apenasReposicao, setApenasReposicao] = useState(false)
  const [acoesAbertas, setAcoesAbertas] = useState<string | null>(null)
  const [exclusaoPendente, setExclusaoPendente] = useState<InsumoRow | null>(null)
  const [movimentoAberto, setMovimentoAberto] = useState<{ insumo: InsumoRow; definirSaldo: boolean } | null>(null)
  const [valorMovimento, setValorMovimento] = useState('')
  const [motivoMovimento, setMotivoMovimento] = useState('')
  const [atualizarMinimo, setAtualizarMinimo] = useState(false)
  const [valorMinimo, setValorMinimo] = useState('')
  const [erroMovimento, setErroMovimento] = useState('')
  const [salvandoMovimento, setSalvandoMovimento] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [formAberto, setFormAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const [insumos, history, warnings] = await Promise.all([
        listarInsumos(db), listarMovimentos(db), listarAlertasEstoque(db),
      ])
      setLista(insumos)
      setMovimentos(history)
      setAlertas(warnings)
    } finally {
      setCarregando(false)
    }
  }, [db])
  useEffect(() => {
    void carregar().catch((e) => setErro(e instanceof Error ? e.message : String(e)))
  }, [carregar])
  useEffect(() => { if (location.hash === '#insumo-form') setFormAberto(true) }, [location.hash])

  const limpar = () => {
    setNome('')
    setTipo('')
    setUnidade('')
    setQtd('')
    setPreco('')
    setCustoInicial(null)
    setEditando(null)
    setErro('')
    setFormAberto(false)
    if (location.hash === '#insumo-form') navigate(`${location.pathname}${location.search}`, { replace: true })
  }

  const editar = (insumo: InsumoRow) => {
    setFormAberto(true)
    setEditando(insumo.id)
    setNome(insumo.nome)
    setTipo(insumo.tipo)
    setUnidade(insumo.unidade_compra as Unit)
    const qtdSalva = '1'
    const precoSalvo = ((insumo.custo_medio * insumo.fator_compra) / 100).toFixed(2)
    setQtd(qtdSalva)
    setPreco(precoSalvo)
    setCustoInicial({ qtd: qtdSalva, preco: precoSalvo })
    setConfirmacao('')
    setErro('')
    document.getElementById('insumo-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    focarCampo('insumo.nome')
  }

  const semAlterarCusto = Boolean(editando) && custoInicial !== null
    && qtd === custoInicial.qtd && preco === custoInicial.preco
  const dadosCustoValidos = semAlterarCusto || (Number(qtd) > 0 && Number(preco) > 0)
  const valido = nome.trim() !== '' && !!tipo && !!unidade && dadosCustoValidos
  const mascaraDaQuantidade = unidade ? mascaraQuantidade(unidade) : 'quantidade'
  const salvar = async () => {
    if (!valido || !unidade || salvando) return
    const atualizando = Boolean(editando)
    setSalvando(true)
    setErro('')
    try {
      await salvarInsumo(db, {
        id: editando ?? undefined,
        nome,
        tipo,
        unidade,
        quantidade: semAlterarCusto || !qtd.trim() ? undefined : Number(qtd),
        totalCents: semAlterarCusto || !preco.trim() ? undefined : Math.round(Number(preco) * 100),
      })
      limpar()
      setConfirmacao(atualizando ? 'Insumo atualizado.' : 'Insumo salvo.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      return
    } finally {
      setSalvando(false)
    }
    try {
      await carregar()
    } catch (e) {
      setErro(`Insumo salvo, mas não foi possível atualizar a lista: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const apagar = async (insumo: InsumoRow) => {
    try {
      await excluirInsumo(db, insumo.id)
      await carregar()
      if (editando === insumo.id) limpar()
      setErro('')
      setConfirmacao('Insumo excluído.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  const abrirMovimento = (insumo: InsumoRow, definirSaldo: boolean) => {
    setAcoesAbertas(null)
    setMovimentoAberto({ insumo, definirSaldo })
    setValorMovimento(definirSaldo ? String(Number(insumo.estoque_atual ?? 0)) : '')
    setMotivoMovimento('')
    setAtualizarMinimo(false)
    setValorMinimo(String(Number(insumo.estoque_minimo ?? 0)))
    setErroMovimento('')
  }

  const fecharMovimento = () => {
    if (salvandoMovimento) return
    setMovimentoAberto(null)
    setErroMovimento('')
  }

  const salvarMovimento = async () => {
    if (!movimentoAberto) return
    const { insumo, definirSaldo } = movimentoAberto
    const saldoAtual = Number(insumo.estoque_atual ?? 0)
    const valorInformado = Number(valorMovimento.replace(',', '.'))
    if (!Number.isFinite(valorInformado) || (definirSaldo ? valorInformado < 0 : valorInformado === 0)) {
      setErroMovimento(definirSaldo ? 'Informe um saldo numérico válido, zero ou maior.' : 'Informe uma quantidade numérica diferente de zero.')
      return
    }
    const quantidade = definirSaldo ? valorInformado - saldoAtual : valorInformado
    if (quantidade === 0) {
      setErroMovimento('O novo saldo é igual ao saldo atual.')
      return
    }
    const saldoFinal = quantidade + saldoAtual
    const motivo = motivoMovimento.trim()
    if (saldoFinal < 0 && !motivo) {
      setErroMovimento('Informe o motivo para deixar o saldo negativo.')
      return
    }
    let minimo: number | null = null
    if (atualizarMinimo) {
      minimo = Number(valorMinimo.replace(',', '.'))
      if (!Number.isFinite(minimo) || minimo < 0) {
        setErroMovimento('Informe um estoque mínimo válido, zero ou maior.')
        return
      }
    }
    setSalvandoMovimento(true)
    setMovimentoAberto(null)
    setErroMovimento('')
    try {
      await ajustarEstoque(db, { tipo: 'insumo', id: insumo.id, quantidade, motivo, operacao: 'ajuste' })
      if (minimo !== null) await definirEstoqueMinimoInsumo(db, insumo.id, minimo)
      await carregar()
      setErro('')
      setConfirmacao(minimo !== null
        ? `${definirSaldo ? 'Saldo ajustado' : 'Quantidade movimentada'} e estoque mínimo atualizado.`
        : definirSaldo ? 'Saldo do insumo ajustado.' : 'Quantidade do insumo movimentada.')
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    } finally {
      setSalvandoMovimento(false)
    }
  }

  return (
    <>
      <AlertaConclusao mensagem={confirmacao} onConcluir={() => setConfirmacao('')} />
      {movimentoAberto && <div className="alert-overlay" onMouseDown={(event) => {
        if (event.target === event.currentTarget) fecharMovimento()
      }}>
        <section className="alert-dialog stock-modal" role="dialog" aria-modal="true" aria-labelledby="movimento-title">
          <FecharModal onClick={fecharMovimento} />
          <span className="alert-icon"><Icon name={movimentoAberto.definirSaldo ? 'stock' : 'add'} size={26} /></span>
          <h2 id="movimento-title">{movimentoAberto.definirSaldo ? 'Ajustar o estoque' : 'Adicionar ou remover quantidade'}</h2>
          <p><b>{movimentoAberto.insumo.nome}</b><br />Saldo atual: {Number(movimentoAberto.insumo.estoque_atual ?? 0)} {movimentoAberto.insumo.unidade_base}</p>
          <label className="stock-modal-field">
            <span>{movimentoAberto.definirSaldo ? 'Novo saldo total' : 'Quantidade'}</span>
            <input autoFocus type="text" inputMode="decimal" value={valorMovimento} onChange={(event) => setValorMovimento(event.target.value)} placeholder={movimentoAberto.definirSaldo ? 'Ex.: 10' : 'Ex.: 2 ou -2'} />
          </label>
          <label className="stock-modal-field">
            <span>Motivo <small>(opcional, obrigatório se o saldo ficar negativo)</small></span>
            <input type="text" value={motivoMovimento} onChange={(event) => setMotivoMovimento(event.target.value)} placeholder="Ex.: inventário ou perda" />
          </label>
          <label className="stock-modal-check">
            <input type="checkbox" checked={atualizarMinimo} onChange={(event) => setAtualizarMinimo(event.target.checked)} />
            <span>Atualizar estoque mínimo deste insumo</span>
          </label>
          {atualizarMinimo && <label className="stock-modal-field">
            <span>Estoque mínimo ({movimentoAberto.insumo.unidade_base})</span>
            <input type="text" inputMode="decimal" value={valorMinimo} onChange={(event) => setValorMinimo(event.target.value)} />
          </label>}
          {erroMovimento && <p className="notice error" role="alert">{erroMovimento}</p>}
          <div className="alert-actions">
            <button className="bt o" type="button" onClick={fecharMovimento}>Cancelar</button>
            <button className="bt" type="button" disabled={salvandoMovimento} onClick={() => void salvarMovimento()}>{salvandoMovimento ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </section>
      </div>}
      {exclusaoPendente && <ConfirmacaoAcao
        titulo="Excluir insumo?"
        mensagem={`O item "${exclusaoPendente.nome}" será excluído dos cadastros.`}
        confirmar="Excluir"
        perigosa
        onCancelar={() => setExclusaoPendente(null)}
        onConfirmar={() => {
          const item = exclusaoPendente
          setExclusaoPendente(null)
          void apagar(item)
        }}
      />}
      <h1>Estoque</h1>
      <p className="sb">Saldo, custo médio, mínimo e movimentações dos ingredientes e embalagens.</p>
      {erro && <p className="notice error" role="alert">{erro}</p>}
      <div className="stock-filters">
        <button className="bt o" type="button" aria-pressed={apenasReposicao}
          onClick={() => setApenasReposicao((value) => !value)}>
          {apenasReposicao ? 'Mostrar todos os insumos' : 'Mostrar apenas itens para reposição'}
        </button>
        <div className="search-field">
          <Icon name="stock" />
          <input aria-label="Buscar insumo" placeholder="Buscar insumo..." onChange={(event) => setFiltro(event.target.value)} />
        </div>
      </div>
      {alertas.some((item) => item.tipo === 'variante') && <div className="cd">
        <h2>Produtos acabados para reposição</h2>
        {alertas.filter((item) => item.tipo === 'variante').map((item) => <div className="r" key={item.id}>
          <span>{item.nome}<small>Saldo {item.saldo} pacote(s) · mínimo {item.minimo}</small></span>
          <Link className="lk" to="/produtos">Gerenciar</Link>
        </div>)}
      </div>}
      <div className="cd">
        <div className="section-heading"><h2>Insumos</h2><span className="pl">{lista.length} itens</span></div>
        {carregando && <p className="notice" role="status">Carregando insumos...</p>}
        {!carregando && lista.length === 0 && <p className="notice">Cadastre seu primeiro insumo, por exemplo manteiga.</p>}
        {!carregando && lista.length > 0 && lista.filter((insumo) => insumo.nome.toLocaleLowerCase('pt-BR').includes(filtro.toLocaleLowerCase('pt-BR'))
          && (!apenasReposicao || Number(insumo.estoque_atual ?? 0) <= Number(insumo.estoque_minimo ?? 0))).length === 0
          && <p className="notice">Nenhum insumo encontrado para estes filtros.</p>}
        {!carregando && lista.filter((insumo) => insumo.nome.toLocaleLowerCase('pt-BR').includes(filtro.toLocaleLowerCase('pt-BR'))
          && (!apenasReposicao || Number(insumo.estoque_atual ?? 0) <= Number(insumo.estoque_minimo ?? 0))).map((insumo) => (
          <div className="r stock-row" key={insumo.id} data-testid="insumo.item">
            <span className="ic" aria-hidden="true"><Icon name={insumo.tipo === 'ingrediente' ? 'recipe' : 'box'} /></span>
            <div className="stock-row-content">{insumo.nome}<small>{formatBRL(insumo.custo_medio * insumo.fator_compra)} por {insumo.unidade_compra} · {insumo.tipo}</small>
              <small>Saldo: {Number(insumo.estoque_atual ?? 0)} {insumo.unidade_base} · mínimo: {Number(insumo.estoque_minimo ?? 0)}</small>
            </div>
            <div className="stock-primary-actions">
              <button className="lk icon-action" aria-label={`Editar ${insumo.nome}`} title="Editar" onClick={() => editar(insumo)}><Icon name="edit" /></button>
              <button className="lk icon-action" aria-label={`Excluir ${insumo.nome}`} title="Excluir" onClick={() => setExclusaoPendente(insumo)}><Icon name="trash" /></button>
              <button className="lk icon-action" type="button" aria-label={`Mais ações para ${insumo.nome}`} title="Mais ações"
                aria-expanded={acoesAbertas === insumo.id} onClick={() => setAcoesAbertas((aberta) => aberta === insumo.id ? null : insumo.id)}>
                <Icon name="add" />
              </button>
            </div>
            {acoesAbertas === insumo.id && <div className="stock-extra-actions">
              <button className="stock-extra-action" type="button" aria-label={`Ajustar o estoque de ${insumo.nome}`} onClick={() => abrirMovimento(insumo, true)}>
                <span className="stock-extra-action-icon"><Icon name="stock" /></span>
                <span><b>Ajustar o estoque</b><small>Definir o saldo total atual</small></span>
              </button>
              <button className="stock-extra-action" type="button" aria-label={`Adicionar ou remover quantidade de ${insumo.nome}`} onClick={() => abrirMovimento(insumo, false)}>
                <span className="stock-extra-action-icon"><Icon name="add" /></span>
                <span><b>Adicionar ou remover</b><small>Movimentar uma quantidade</small></span>
              </button>
            </div>}
          </div>
        ))}
      </div>
      <div className="cd">
        <h2>Movimentações recentes</h2>
        {!movimentos.length && <p className="notice">As movimentações aparecerão aqui após compras, ajustes e vendas.</p>}
        {movimentos.map((movement) => <div className="r" key={movement.id}>
          <span>{movement.item_nome}<small>{movement.tipo} · {new Date(movement.data).toLocaleString('pt-BR')}{movement.motivo ? ` · ${movement.motivo}` : ''}</small></span>
          <b>{movement.quantidade > 0 ? '+' : ''}{movement.quantidade}</b>
        </div>)}
      </div>
      {formAberto && <div className="alert-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) limpar() }}>
      <section className="add-dialog form-dialog" id="insumo-form" role="dialog" aria-modal="true" aria-labelledby="insumo-form-title">
        <FecharModal onClick={limpar} />
        <h2 id="insumo-form-title">{editando ? 'Editar insumo' : 'Novo insumo'}</h2>
        {erro && <p className="notice error" role="alert">{erro}</p>}
        <Campo rotulo="Nome" id="insumo.nome" valor={nome} onChange={setNome} placeholder="Ex.: farinha de trigo" />
        <Selecao rotulo="Tipo" id="insumo.tipo" valor={tipo} onChange={setTipo} opcoes={TIPOS} />
        <div className="g">
          <Campo rotulo="Quantidade comprada" id="insumo.quantidade" valor={qtd} onChange={setQtd} mascara={mascaraDaQuantidade}
            placeholder={mascaraDaQuantidade === 'quantidade' ? 'Ex.: 1,5' : 'Ex.: 500'} />
          <Selecao rotulo="Unidade de compra" id="insumo.unidade" valor={unidade} onChange={(value) => {
            setUnidade(value as Unit)
            setQtd((atual) => normalizarNumeroDigitado(atual, mascaraQuantidade(value)).replace(/\.0+$/, ''))
          }} opcoes={UNIDADES} disabled={Boolean(editando)} />
        </div>
        <Campo rotulo="Valor total pago (R$)" id="insumo.preco" valor={preco} onChange={setPreco} mascara="dinheiro" />
        {editando && <p className="helper">Quantidade e valor são uma referência calculada do custo médio salvo. Se não os alterar, o custo atual será preservado; altere ambos para recalculá-lo.</p>}
        {unidade === 'kg' && <p className="helper">O custo será convertido automaticamente para centavos por grama.</p>}
        {unidade === 'l' && <p className="helper">O custo será convertido automaticamente para centavos por mililitro.</p>}
        {editando && <p className="helper">A unidade de compra fica bloqueada durante a edição para evitar recalcular o custo na unidade errada.</p>}
        <button className="bt" disabled={!valido || salvando} data-testid="insumo.salvar" onClick={salvar}>
          {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Salvar insumo'}
        </button>
        {editando && <button className="bt o" onClick={limpar}>Cancelar edição</button>}
      </section></div>}
    </>
  )
}
