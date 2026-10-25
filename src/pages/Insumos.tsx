import { useCallback, useEffect, useRef, useState } from 'react'
import { useDb } from '../data/DbContext'
import { excluirInsumo, listarInsumos, salvarInsumo, type InsumoRow } from '../data/repos'
import { formatBRL } from '../domain/money'
import { baseOf, formatQuantity, toBase, type Unit } from '../domain/units'
import { ajustarEstoque, definirEstoqueMinimoInsumo, listarAlertasEstoque, listarMovimentos } from '../data/phase2'
import { gerarCsv } from '../data/reports'
import { AlertaConclusao, Campo, ConfirmacaoAcao, FecharModal, focarCampo, Icon, Selecao, SeletorData, useModalAcessivel } from './ui'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { filtrarEntradaNumerica, filtrarNumeroSemMascara } from '../domain/inputMask'

const UNIDADES: [string, string][] = [['kg', 'kg'], ['g', 'g'], ['l', 'L'], ['ml', 'ml'], ['un', 'unidades']]
const TIPOS: [string, string][] = [['ingrediente', 'Ingrediente'], ['embalagem', 'Embalagem'], ['rotulo', 'Rótulo']]
const TIPOS_MOVIMENTO: [string, string][] = [
  ['ajuste', 'Ajuste'],
  ['consumo', 'Consumo'],
  ['perda', 'Perda'],
  ['inventario', 'Inventário'],
]
const FILTROS_MOVIMENTO: [string, string][] = [
  ['todos', 'Todos'],
  ['cadastro', 'Cadastro'],
  ['compra', 'Compra'],
  ['ajuste', 'Ajuste'],
  ['consumo', 'Consumo'],
  ['perda', 'Perda'],
  ['inventario', 'Inventário'],
  ['venda', 'Venda'],
]
const dataHoje = () => {
  const hoje = new Date()
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
}

function validarPaginaMovimentos(page: Awaited<ReturnType<typeof listarMovimentos>>) {
  if (!page || !Array.isArray(page.items) || typeof page.hasMore !== 'boolean') {
    throw new Error('Não foi possível carregar o histórico de movimentações: resposta inválida.')
  }
  return page
}

function baixarCsv(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = nome
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function Insumos() {
  const db = useDb()
  const location = useLocation()
  const navigate = useNavigate()
  const [lista, setLista] = useState<InsumoRow[]>([])
  const [movimentos, setMovimentos] = useState<Awaited<ReturnType<typeof listarMovimentos>>['items']>([])
  const [movimentosTemMais, setMovimentosTemMais] = useState(false)
  const [carregandoMovimentos, setCarregandoMovimentos] = useState(true)
  const [carregandoMaisMovimentos, setCarregandoMaisMovimentos] = useState(false)
  const movimentoRequest = useRef(0)
  const [alertas, setAlertas] = useState<Awaited<ReturnType<typeof listarAlertasEstoque>>>([])
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState('')
  const [unidade, setUnidade] = useState<Unit | ''>('')
  const [qtd, setQtd] = useState('')
  const [preco, setPreco] = useState('')
  const [estoqueMinimo, setEstoqueMinimo] = useState('0')
  const [custoInicial, setCustoInicial] = useState<{ qtd: string; preco: string } | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [filtro, setFiltro] = useState('')
  const [apenasReposicao, setApenasReposicao] = useState(false)
  const [tipoFiltro, setTipoFiltro] = useState('todos')
  const [ordenacao, setOrdenacao] = useState('nome')
  const [filtroMovimento, setFiltroMovimento] = useState('')
  const [tipoMovimentoFiltro, setTipoMovimentoFiltro] = useState('todos')
  const [dataInicialMovimento, setDataInicialMovimento] = useState('')
  const [dataFinalMovimento, setDataFinalMovimento] = useState('')
  const [acoesAbertasId, setAcoesAbertasId] = useState<string | null>(null)
  const [exclusaoPendente, setExclusaoPendente] = useState<InsumoRow | null>(null)
  const [movimentoAberto, setMovimentoAberto] = useState<{ insumo: InsumoRow; modo: 'movimento' | 'saldo' | 'minimo' } | null>(null)
  const [valorMovimento, setValorMovimento] = useState('')
  const [motivoMovimento, setMotivoMovimento] = useState('')
  const [operacaoMovimento, setOperacaoMovimento] = useState<'ajuste' | 'consumo' | 'perda' | 'inventario'>('ajuste')
  const [valorMinimo, setValorMinimo] = useState('')
  const [erroMovimento, setErroMovimento] = useState('')
  const [salvandoMovimento, setSalvandoMovimento] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [formAberto, setFormAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [confirmarDescarteFormulario, setConfirmarDescarteFormulario] = useState(false)
  const [confirmarDescarteMovimento, setConfirmarDescarteMovimento] = useState(false)
  const [exportandoMovimentos, setExportandoMovimentos] = useState(false)
  const baselineFormulario = useRef('')
  const baselineMovimento = useRef('')

  const carregarMovimentos = useCallback(async () => {
    const request = ++movimentoRequest.current
    setCarregandoMovimentos(true)
    try {
      const page = validarPaginaMovimentos(await listarMovimentos(
        db, undefined, undefined, dataInicialMovimento, dataFinalMovimento, filtroMovimento,
        tipoMovimentoFiltro === 'todos' ? '' : tipoMovimentoFiltro,
      ))
      if (request !== movimentoRequest.current) return
      setMovimentos(page.items)
      setMovimentosTemMais(page.hasMore)
      setErro((mensagem) => mensagem.startsWith('O histórico de estoque retornou dados incompatíveis;') ? '' : mensagem)
    } catch (error) {
      if (request === movimentoRequest.current) setErro(error instanceof Error ? error.message : String(error))
    } finally {
      if (request === movimentoRequest.current) setCarregandoMovimentos(false)
    }
  }, [db, dataInicialMovimento, dataFinalMovimento, filtroMovimento, tipoMovimentoFiltro])

  const carregar = useCallback(async () => {
    try {
      const [insumos, warnings] = await Promise.all([listarInsumos(db), listarAlertasEstoque(db)])
      setLista(insumos)
      setAlertas(warnings)
    } finally {
      setCarregando(false)
    }
  }, [db])
  useEffect(() => {
    void carregar().catch((e) => setErro(e instanceof Error ? e.message : String(e)))
  }, [carregar])
  useEffect(() => { void carregarMovimentos() }, [carregarMovimentos])
  useEffect(() => {
    if (Array.isArray(movimentos)) return
    setErro('O histórico de estoque retornou dados incompatíveis; atualizando a lista para evitar interromper a tela.')
    setMovimentos([])
    void carregarMovimentos()
  }, [movimentos, carregarMovimentos])
  useEffect(() => { if (location.hash === '#insumo-form') setFormAberto(true) }, [location.hash])
  useEffect(() => {
    if (formAberto && !editando) focarCampo('insumo.nome')
  }, [formAberto, editando])

  const formularioAtual = JSON.stringify([nome, tipo, unidade, qtd, preco, estoqueMinimo])
  const formularioAlterado = Boolean(baselineFormulario.current) && formularioAtual !== baselineFormulario.current
  const movimentoAtual = JSON.stringify([valorMovimento, motivoMovimento, operacaoMovimento, valorMinimo])
  const movimentoAlterado = Boolean(baselineMovimento.current) && movimentoAtual !== baselineMovimento.current
  const movimentosLista = Array.isArray(movimentos) ? movimentos : []
  useEffect(() => {
    if (formAberto && !baselineFormulario.current) baselineFormulario.current = formularioAtual
  }, [formAberto])

  const limpar = () => {
    setNome('')
    setTipo('')
    setUnidade('')
    setQtd('')
    setPreco('')
    setEstoqueMinimo('0')
    setCustoInicial(null)
    setEditando(null)
    setErro('')
    setFormAberto(false)
    setConfirmarDescarteFormulario(false)
    baselineFormulario.current = JSON.stringify(['', '', '', '', '', '0'])
    if (location.hash === '#insumo-form') navigate(`${location.pathname}${location.search}`, { replace: true })
  }

  const solicitarFecharFormulario = () => {
    if (salvando) return
    if (formularioAlterado) {
      setConfirmarDescarteFormulario(true)
      return
    }
    limpar()
  }

  const fecharFormulario = () => {
    if (!salvando) limpar()
  }

  const editar = (insumo: InsumoRow) => {
    setFormAberto(true)
    setEditando(insumo.id)
    setNome(insumo.nome)
    setTipo(insumo.tipo)
    setUnidade(insumo.unidade_compra as Unit)
    const qtdSalva = String(Number(insumo.quantidade_cadastro ?? (
      Number(insumo.estoque_atual ?? 0) / Number(insumo.fator_compra || 1)
    )))
    const precoSalvo = ((insumo.custo_medio * toBase(Number(qtdSalva), insumo.unidade_compra as Unit)) / 100).toFixed(2)
    setQtd(qtdSalva)
    setPreco(precoSalvo)
    setEstoqueMinimo(String(Number(insumo.estoque_minimo ?? 0)))
    setCustoInicial({ qtd: qtdSalva, preco: precoSalvo })
    baselineFormulario.current = JSON.stringify([
      insumo.nome, insumo.tipo, insumo.unidade_compra, qtdSalva, precoSalvo, String(Number(insumo.estoque_minimo ?? 0)),
    ])
    setConfirmacao('')
    setErro('')
    document.getElementById('insumo-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    focarCampo('insumo.nome')
  }

  const semAlterarCusto = Boolean(editando) && custoInicial !== null
    && qtd === custoInicial.qtd && preco === custoInicial.preco
  const dadosCustoValidos = semAlterarCusto || (Number(qtd) > 0 && Number(preco) > 0)
  const minimo = Number(estoqueMinimo)
  const minimoValido = estoqueMinimo.trim() !== '' && Number.isInteger(minimo) && minimo >= 0
  const quantidadeUnitariaValida = unidade !== 'un' || !qtd.trim() || Number.isInteger(Number(qtd))
  const valido = nome.trim() !== '' && !!tipo && !!unidade && dadosCustoValidos && minimoValido && quantidadeUnitariaValida
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
        estoqueMinimo: minimo,
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
      await carregarMovimentos()
    } catch (e) {
      setErro(`Insumo salvo, mas não foi possível atualizar a lista: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const apagar = async (insumo: InsumoRow) => {
    try {
      await excluirInsumo(db, insumo.id)
      await carregar()
      await carregarMovimentos()
      if (editando === insumo.id) limpar()
      setErro('')
      setConfirmacao('Insumo excluído.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  const abrirMovimento = (insumo: InsumoRow, modo: 'movimento' | 'saldo' | 'minimo') => {
    setAcoesAbertasId(null)
    setMovimentoAberto({ insumo, modo })
    setValorMovimento(modo === 'saldo' ? String(Number(insumo.estoque_atual ?? 0)) : '')
    setMotivoMovimento('')
    setOperacaoMovimento('ajuste')
    setValorMinimo(String(Number(insumo.estoque_minimo ?? 0)))
    setErroMovimento('')
    baselineMovimento.current = JSON.stringify([
      modo === 'saldo' ? String(Number(insumo.estoque_atual ?? 0)) : '',
      '', 'ajuste', String(Number(insumo.estoque_minimo ?? 0)),
    ])
  }

  const descartarMovimento = () => {
    if (salvandoMovimento) return
    setMovimentoAberto(null)
    setErroMovimento('')
    setConfirmarDescarteMovimento(false)
  }

  const fecharMovimento = () => {
    if (salvandoMovimento) return
    if (movimentoAlterado) {
      setConfirmarDescarteMovimento(true)
      return
    }
    descartarMovimento()
  }

  const quantidadeMovimento = valorMovimento.trim() ? Number(valorMovimento.replace(',', '.')) : Number.NaN
  const saldoAtualMovimento = Number(movimentoAberto?.insumo.estoque_atual ?? 0)
  const saldoProjetado = movimentoAberto?.modo === 'saldo'
    ? quantidadeMovimento
    : saldoAtualMovimento + quantidadeMovimento
  const diferencaInventario = quantidadeMovimento - saldoAtualMovimento
  const quantidadeInteiraValida = Number.isInteger(quantidadeMovimento)
  const minimoMovimento = valorMinimo.trim() ? Number(valorMinimo.replace(',', '.')) : Number.NaN
  const minimoInteiroValido = Number.isInteger(minimoMovimento)
  const validadeMovimento = movimentoAberto?.modo === 'minimo'
    ? Number.isFinite(minimoMovimento) && minimoMovimento >= 0 && minimoInteiroValido
    : Number.isFinite(quantidadeMovimento) && quantidadeInteiraValida
      && (movimentoAberto?.modo === 'saldo' || quantidadeMovimento !== 0)
      && (movimentoAberto?.modo !== 'movimento' || operacaoMovimento !== 'perda' || quantidadeMovimento < 0)
      && (movimentoAberto?.modo !== 'movimento' || operacaoMovimento !== 'consumo' || quantidadeMovimento < 0)
      && Number.isFinite(saldoProjetado) && saldoProjetado >= 0
      && (movimentoAberto?.modo !== 'saldo' || saldoProjetado !== saldoAtualMovimento)

  const ajudaValidacaoMovimento = movimentoAberto?.modo === 'minimo'
    ? !Number.isFinite(minimoMovimento) || minimoMovimento < 0
      ? 'Informe um mínimo igual ou maior que zero.'
      : !minimoInteiroValido ? 'O estoque mínimo deve ser um número inteiro.' : ''
    : !Number.isFinite(quantidadeMovimento)
      ? 'Informe uma quantidade válida.'
      : !quantidadeInteiraValida ? 'Informe uma quantidade inteira.'
        : movimentoAberto?.modo === 'movimento' && quantidadeMovimento === 0
          ? 'Informe uma quantidade diferente de zero.'
        : movimentoAberto?.modo === 'movimento' && operacaoMovimento === 'perda' && quantidadeMovimento >= 0
          ? 'Para registrar uma perda, informe uma quantidade negativa.'
            : movimentoAberto?.modo === 'movimento' && operacaoMovimento === 'consumo' && quantidadeMovimento >= 0
              ? 'Para registrar um consumo, informe uma quantidade negativa.'
            : movimentoAberto?.modo === 'saldo' && saldoProjetado === saldoAtualMovimento
            ? 'O saldo contado é igual ao saldo atual.'
            : saldoProjetado < 0 ? 'Essa movimentação deixaria o estoque negativo.' : ''

  const salvarMovimento = async () => {
    if (!movimentoAberto) return
    const { insumo, modo } = movimentoAberto
    if (modo === 'minimo') {
      const minimo = Number(valorMinimo.replace(',', '.'))
      if (!Number.isInteger(minimo) || minimo < 0) {
        setErroMovimento('Informe um estoque mínimo inteiro, zero ou maior.')
        return
      }
      setSalvandoMovimento(true)
      try {
        await definirEstoqueMinimoInsumo(db, insumo.id, minimo)
        setMovimentoAberto(null)
        setConfirmacao('Estoque mínimo atualizado.')
      } catch (error) {
        setErroMovimento(error instanceof Error ? error.message : String(error))
        return
      } finally {
        setSalvandoMovimento(false)
      }
      try {
        await carregar()
        await carregarMovimentos()
      } catch (error) {
        setErro(error instanceof Error ? error.message : String(error))
      }
      return
    }
    const valorInformado = Number(valorMovimento.replace(',', '.'))
    const saldoAtual = Number(insumo.estoque_atual ?? 0)
    if (!Number.isInteger(valorInformado) || (modo === 'saldo' ? valorInformado < 0 : valorInformado === 0)) {
      setErroMovimento(modo === 'saldo'
        ? 'Informe um saldo contado inteiro válido, zero ou maior.'
        : 'Informe uma quantidade inteira diferente de zero.')
      return
    }
    const quantidade = modo === 'saldo' ? valorInformado - saldoAtual : valorInformado
    if (quantidade === 0) {
      setErroMovimento('O saldo contado é igual ao saldo atual.')
      return
    }
    const motivo = motivoMovimento.trim()
    setSalvandoMovimento(true)
    setErroMovimento('')
    try {
      await ajustarEstoque(db, {
        tipo: 'insumo', id: insumo.id, quantidade, motivo,
        operacao: modo === 'saldo' ? 'inventario' : operacaoMovimento,
      })
      setMovimentoAberto(null)
      setErro('')
      setConfirmacao(modo === 'saldo' ? 'Inventário registrado.' : 'Movimentação registrada.')
    } catch (error) {
      setErroMovimento(error instanceof Error ? error.message : String(error))
      setSalvandoMovimento(false)
      return
    }
    try {
      await carregar()
      await carregarMovimentos()
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    } finally {
      setSalvandoMovimento(false)
    }
  }

  const itensReposicao = lista.filter((item) => Number(item.estoque_atual ?? 0) <= Number(item.estoque_minimo ?? 0))
  const valorEstoqueCents = lista.reduce((total, item) =>
    total + Number(item.custo_medio ?? 0) * Number(item.estoque_atual ?? 0), 0)
  const itensVisiveis = lista.filter((insumo) =>
    insumo.nome.toLocaleLowerCase('pt-BR').includes(filtro.toLocaleLowerCase('pt-BR'))
    && (!apenasReposicao || Number(insumo.estoque_atual ?? 0) <= Number(insumo.estoque_minimo ?? 0))
    && (tipoFiltro === 'todos' || insumo.tipo === tipoFiltro))
    .sort((a, b) => ordenacao === 'tipo'
      ? a.tipo.localeCompare(b.tipo, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR')
      : a.nome.localeCompare(b.nome, 'pt-BR'))
  const movimentosVisiveis = movimentosLista.filter((movement) =>
    movement.item_nome.toLocaleLowerCase('pt-BR').includes(filtroMovimento.toLocaleLowerCase('pt-BR'))
    && (tipoMovimentoFiltro === 'todos' || movement.tipo === tipoMovimentoFiltro))

  const carregarMaisMovimentos = async () => {
    if (carregandoMaisMovimentos || !movimentosTemMais) return
    setCarregandoMaisMovimentos(true)
    const request = movimentoRequest.current
    try {
      const page = validarPaginaMovimentos(await listarMovimentos(
        db, undefined, undefined, dataInicialMovimento, dataFinalMovimento,
        filtroMovimento, tipoMovimentoFiltro === 'todos' ? '' : tipoMovimentoFiltro, movimentosLista.length,
      ))
      if (request !== movimentoRequest.current) return
      setMovimentos((atuais) => [...(Array.isArray(atuais) ? atuais : []), ...page.items])
      setMovimentosTemMais(page.hasMore)
    } catch (error) {
      if (request === movimentoRequest.current) setErro(error instanceof Error ? error.message : String(error))
    } finally {
      setCarregandoMaisMovimentos(false)
    }
  }

  const exportarMovimentos = async () => {
    if (exportandoMovimentos) return
    setExportandoMovimentos(true)
    setErro('')
    try {
      const registros: (string | number)[][] = []
      let offset = 0
      let temMais = true
      while (temMais) {
        const page = validarPaginaMovimentos(await listarMovimentos(
          db, undefined, undefined, dataInicialMovimento, dataFinalMovimento,
          filtroMovimento, tipoMovimentoFiltro === 'todos' ? '' : tipoMovimentoFiltro, offset,
        ))
        if (page.hasMore && page.items.length === 0) {
          throw new Error('A consulta do histórico não avançou; não foi possível concluir a exportação.')
        }
        registros.push(...page.items.map((movement) => [
          movement.item_nome,
          FILTROS_MOVIMENTO.find(([tipo]) => tipo === movement.tipo)?.[1] ?? movement.tipo,
          new Date(movement.data).toLocaleString('pt-BR'),
          movement.quantidade,
          movement.unidade,
          movement.saldo_resultante - movement.quantidade,
          movement.saldo_resultante,
          movement.motivo ?? '',
        ]))
        offset += page.items.length
        temMais = page.hasMore
      }
      if (!registros.length) {
        setErro('Não há movimentações com os filtros atuais para exportar.')
        return
      }
      baixarCsv(`mz-movimentacoes-estoque-${dataHoje()}.csv`, gerarCsv([{
        nome: 'Movimentações de estoque',
        colunas: ['Insumo ou produto', 'Tipo', 'Data', 'Quantidade', 'Unidade', 'Saldo anterior', 'Saldo resultante', 'Motivo'],
        linhas: registros,
      }]))
      setConfirmacao(`${registros.length} movimentações exportadas.`)
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    } finally {
      setExportandoMovimentos(false)
    }
  }

  useModalAcessivel(Boolean(movimentoAberto), fecharMovimento, '#estoque-movimento-dialog')
  useModalAcessivel(formAberto, solicitarFecharFormulario, '#insumo-form')
  useModalAcessivel(confirmarDescarteFormulario, () => setConfirmarDescarteFormulario(false), '#estoque-descartar-formulario')
  useModalAcessivel(confirmarDescarteMovimento, () => setConfirmarDescarteMovimento(false), '#estoque-descartar-movimento')
  useModalAcessivel(Boolean(exclusaoPendente), () => setExclusaoPendente(null), '#estoque-confirmar-exclusao')

  return (
    <>
      <AlertaConclusao mensagem={confirmacao} onConcluir={() => setConfirmacao('')} />
      {movimentoAberto && <div className="alert-overlay" onMouseDown={(event) => {
        if (event.target === event.currentTarget) fecharMovimento()
      }}>
        <section id="estoque-movimento-dialog" className="alert-dialog stock-modal" role="dialog" aria-modal="true" aria-labelledby="movimento-title" tabIndex={-1}>
          <FecharModal onClick={fecharMovimento} />
          <span className="alert-icon"><Icon name={movimentoAberto.modo === 'minimo' ? 'settings' : movimentoAberto.modo === 'saldo' ? 'stock' : 'add'} size={26} /></span>
          <h2 id="movimento-title">{movimentoAberto.modo === 'minimo' ? 'Ajustar estoque mínimo' : movimentoAberto.modo === 'saldo' ? 'Registrar inventário' : 'Adicionar ou remover quantidade'}</h2>
          <p><b>{movimentoAberto.insumo.nome}</b><br />Saldo atual: {formatQuantity(saldoAtualMovimento)} {movimentoAberto.insumo.unidade_base}</p>
          {movimentoAberto.modo === 'minimo' ? <>
            <label className="stock-modal-field">
              <span>Estoque mínimo ({movimentoAberto.insumo.unidade_base})</span>
              <input autoFocus type="text" inputMode="numeric" value={valorMinimo}
                onFocus={(event) => event.currentTarget.select()} onChange={(event) => {
                  setValorMinimo(filtrarNumeroSemMascara(event.target.value, false))
                  setErroMovimento('')
                }} />
            </label>
            {ajudaValidacaoMovimento && <p className="notice error" role="alert">{ajudaValidacaoMovimento}</p>}
          </> : <>
            {movimentoAberto.modo === 'movimento' && <Selecao
              rotulo="Tipo de movimentação"
              id="estoque.operacao"
              valor={operacaoMovimento}
              onChange={(value) => setOperacaoMovimento(value as 'ajuste' | 'consumo' | 'perda' | 'inventario')}
              opcoes={TIPOS_MOVIMENTO}
            />}
            <label className="stock-modal-field">
              <span>{movimentoAberto.modo === 'saldo'
                ? `Saldo contado (${movimentoAberto.insumo.unidade_base})`
                : 'Quantidade (positivo para entrada, negativo para saída)'}</span>
              <input autoFocus type="text" inputMode="numeric" value={valorMovimento}
                onFocus={(event) => event.currentTarget.select()} onChange={(event) => {
                  setValorMovimento(filtrarEntradaNumerica(event.target.value, {
                    negativo: movimentoAberto.modo === 'movimento',
                    decimal: false,
                  }))
                  setErroMovimento('')
                }}
                placeholder={movimentoAberto.modo === 'saldo' ? 'Informe o saldo total contado' : 'Ex.: 2 ou -2'}
                aria-describedby="estoque-saldo-previsto estoque-movimento-validacao" />
            </label>
            {movimentoAberto.modo === 'saldo' && <p className="stock-inventory-difference" aria-live="polite">
              Diferença em relação ao saldo atual:{' '}
              <b className={Number.isFinite(diferencaInventario) && diferencaInventario < 0 ? 'negative' : 'positive'}>
                {Number.isFinite(diferencaInventario)
                  ? `${diferencaInventario > 0 ? '+' : ''}${formatQuantity(diferencaInventario)} ${movimentoAberto.insumo.unidade_base}`
                  : '—'}
              </b>
            </p>}
            <p id="estoque-saldo-previsto" className={`stock-balance-preview${saldoProjetado < 0 ? ' error' : ''}`} aria-live="polite">
              {movimentoAberto.modo === 'saldo' ? 'Saldo após inventário' : 'Saldo após movimentação'}:{' '}
              <b>{Number.isFinite(saldoProjetado) ? `${formatQuantity(saldoProjetado)} ${movimentoAberto.insumo.unidade_base}` : '—'}</b>
            </p>
            {valorMovimento.trim() && ajudaValidacaoMovimento && <p id="estoque-movimento-validacao" className="notice error" role="alert">{ajudaValidacaoMovimento}</p>}
            <label className="stock-modal-field">
              <span>Motivo de adicionar ou remover quantidade</span>
              <input type="text" value={motivoMovimento} maxLength={100} onChange={(event) => {
                setMotivoMovimento(event.target.value)
                setErroMovimento('')
              }} placeholder="Ex.: uso na produção" />
            </label>
          </>}
          {erroMovimento && <p className="notice error" role="alert">{erroMovimento}</p>}
          <div className="alert-actions">
            <button className="bt o" type="button" disabled={salvandoMovimento} onClick={fecharMovimento}>Cancelar</button>
            <button className="bt" type="button" disabled={salvandoMovimento || !validadeMovimento} onClick={() => void salvarMovimento()}>
              {salvandoMovimento ? 'Salvando...' : movimentoAberto.modo === 'minimo' ? 'Salvar' : 'Salvar'}
            </button>
          </div>
        </section>
      </div>}
      {exclusaoPendente && <ConfirmacaoAcao
        id="estoque-confirmar-exclusao"
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
      {confirmarDescarteFormulario && <ConfirmacaoAcao
        id="estoque-descartar-formulario"
        titulo="Descartar alterações?"
        mensagem="As alterações deste insumo ainda não foram salvas e serão perdidas."
        confirmar="Descartar alterações"
        onCancelar={() => setConfirmarDescarteFormulario(false)}
        onConfirmar={limpar}
      />}
      {confirmarDescarteMovimento && <ConfirmacaoAcao
        id="estoque-descartar-movimento"
        titulo="Descartar movimentação?"
        mensagem="Os dados informados neste ajuste ainda não foram salvos."
        confirmar="Descartar dados"
        onCancelar={() => setConfirmarDescarteMovimento(false)}
        onConfirmar={descartarMovimento}
      />}
      <h1>Estoque</h1>
      <p className="sb">Gerencie ingredientes, embalagens e rótulos com total controle sobre quantidades, custos e histórico de movimentações..</p>
      {erro && <p className="notice error" role="alert">{erro}</p>}
      <div className="scheduled-metrics stock-metrics">
        <div><small>Insumos cadastrados</small><b>{lista.length}</b></div>
        <div><small>Para reposição</small><b>{itensReposicao.length}</b></div>
        <div><small>Valor estimado em estoque</small><b>{formatBRL(valorEstoqueCents)}</b></div>
      </div>
      <div className="stock-filters">
        <button className="bt o" type="button" aria-pressed={apenasReposicao}
          onClick={() => setApenasReposicao((value) => !value)}>
          {apenasReposicao ? 'Mostrar todos os insumos' : 'Mostrar apenas itens para reposição'}
        </button>
        <div className="search-field">
          <Icon name="stock" />
          <input aria-label="Buscar insumo" placeholder="Buscar insumo..." onChange={(event) => setFiltro(event.target.value)} />
        </div>
        <Selecao rotulo="Tipo de insumo" id="estoque.filtro-tipo" valor={tipoFiltro} onChange={setTipoFiltro}
          opcoes={[['todos', 'Todos'], ...TIPOS]} />
        <Selecao rotulo="Ordenar por" id="estoque.ordenacao" valor={ordenacao} onChange={setOrdenacao}
          opcoes={[['nome', 'Nome'], ['tipo', 'Tipo']]} />
      </div>
      {alertas.some((item) => item.tipo === 'variante') && <div className="cd">
        <h2>Produtos acabados para reposição</h2>
        {alertas.filter((item) => item.tipo === 'variante').map((item) => <div className="r" key={item.id}>
          <span>{item.nome}<small>Saldo {formatQuantity(item.saldo)} pacote(s) · mínimo {formatQuantity(item.minimo)}</small></span>
          <Link className="lk" to="/produtos">Gerenciar</Link>
        </div>)}
      </div>}
      <div className="cd">
        <div className="section-heading"><h2>Insumos</h2><span className="pl">{lista.length} {lista.length === 1 ? 'item' : 'itens'}</span></div>
        {carregando && <p className="notice" role="status">Carregando insumos...</p>}
        {!carregando && lista.length === 0 && <p className="notice">Cadastre seu primeiro insumo, por exemplo manteiga.</p>}
        {!carregando && lista.length > 0 && itensVisiveis.length === 0
          && <p className="notice">Nenhum insumo encontrado para estes filtros.</p>}
        {!carregando && itensVisiveis.map((insumo) => (
          <div className="r stock-row" key={insumo.id} data-testid="insumo.item">
            <span className="ic" aria-hidden="true"><Icon name={insumo.tipo === 'ingrediente' ? 'recipe' : 'box'} /></span>
            <div className="stock-row-content">{insumo.nome}<small>Tipo: {TIPOS.find(([tipo]) => tipo === insumo.tipo)?.[1] ?? insumo.tipo}</small>
              <small>{formatBRL(insumo.custo_medio * insumo.fator_compra)} por {insumo.unidade_compra}</small>
              <small>Saldo: {formatQuantity(Number(insumo.estoque_atual ?? 0))} {insumo.unidade_base} · mínimo: {formatQuantity(Number(insumo.estoque_minimo ?? 0))} {insumo.unidade_base}</small>
            </div>
            <div className="stock-primary-actions">
              <button className="lk icon-action" aria-label={`Editar ${insumo.nome}`} title="Editar" onClick={() => editar(insumo)}><Icon name="edit" /></button>
              <button className="lk icon-action" aria-label={`Excluir ${insumo.nome}`} title="Excluir" onClick={() => setExclusaoPendente(insumo)}><Icon name="trash" /></button>
              <button className="lk icon-action" type="button" aria-label={`Movimentar estoque de ${insumo.nome}`} title="Movimentar estoque"
                aria-expanded={acoesAbertasId === insumo.id}
                aria-controls={`acoes-estoque-${insumo.id}`}
                onClick={() => setAcoesAbertasId((id) => id === insumo.id ? null : insumo.id)}>
                <Icon name="add" />
              </button>
            </div>
            {acoesAbertasId === insumo.id && <div className="stock-extra-actions" id={`acoes-estoque-${insumo.id}`}>
              <button className="stock-extra-action" type="button" onClick={() => abrirMovimento(insumo, 'movimento')}>
                <span className="stock-extra-action-icon"><Icon name="add" /></span>
                <span><b>Adicionar ou remover quantidade</b><small>Registrar uma movimentação</small></span>
              </button>
              <button className="stock-extra-action" type="button" onClick={() => abrirMovimento(insumo, 'minimo')}>
                <span className="stock-extra-action-icon"><Icon name="settings" /></span>
                <span><b>Estoque mínimo</b><small>Definir alerta de reposição</small></span>
              </button>
            </div>}
          </div>
        ))}
      </div>
      <div className="cd stock-movements">
        <div className="section-heading">
          <h2>Movimentações recentes</h2>
          {/* <button className="bt o" type="button" disabled={exportandoMovimentos}
            onClick={() => void exportarMovimentos()}>
            {exportandoMovimentos ? 'Preparando CSV...' : 'Exportar CSV'}
          </button> */}
        </div>
        <div className="stock-filters">
          <div className="search-field">
            <Icon name="stock" />
            <input aria-label="Buscar movimentação" placeholder="Buscar por insumo..." value={filtroMovimento}
              onChange={(event) => setFiltroMovimento(event.target.value)} />
          </div>
          <Selecao rotulo="Tipo de movimentação" id="estoque.filtro-movimento" valor={tipoMovimentoFiltro}
            onChange={setTipoMovimentoFiltro} opcoes={FILTROS_MOVIMENTO} />
          <SeletorData rotulo="De" id="estoque.movimentos.data-inicial" valor={dataInicialMovimento} onChange={setDataInicialMovimento} />
          <SeletorData rotulo="Até" id="estoque.movimentos.data-final" valor={dataFinalMovimento} onChange={setDataFinalMovimento} />
        </div>
        <p className="helper">Exibindo {movimentosLista.length} {movimentosLista.length === 1 ? 'movimentação' : 'movimentações'}.</p>
        {carregandoMovimentos && <p className="notice" role="status">Carregando movimentações...</p>}
        {!carregandoMovimentos && !movimentosLista.length && <p className="notice">As movimentações aparecerão aqui após compras, ajustes e vendas.</p>}
        {movimentosLista.length > 0 && movimentosVisiveis.length === 0 && <p className="notice">Nenhuma movimentação encontrada para estes filtros.</p>}
        {movimentosVisiveis.map((movement) => <div className="r" key={movement.id}>
          <span>{movement.item_nome}<small>
            {FILTROS_MOVIMENTO.find(([type]) => type === movement.tipo)?.[1] ?? movement.tipo} · {new Date(movement.data).toLocaleString('pt-BR')}
            <br />Saldo anterior: {formatQuantity(movement.saldo_resultante - movement.quantidade)} {movement.unidade} → Saldo atual: {formatQuantity(movement.saldo_resultante)} {movement.unidade}
          </small></span>
          <b>{movement.quantidade > 0 ? '+' : ''}{formatQuantity(movement.quantidade)} {movement.unidade}</b>
        </div>)}
        {movimentosTemMais && <button className="bt o" type="button" disabled={carregandoMaisMovimentos}
          onClick={() => void carregarMaisMovimentos()}>
          {carregandoMaisMovimentos ? 'Carregando...' : 'Carregar mais movimentações'}
        </button>}
      </div>
      {formAberto && <div className="alert-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) solicitarFecharFormulario() }}>
      <section className="add-dialog form-dialog" id="insumo-form" role="dialog" aria-modal="true" aria-labelledby="insumo-form-title" tabIndex={-1}>
        <FecharModal onClick={fecharFormulario} />
        <h2 id="insumo-form-title">{editando ? 'Editar insumo' : 'Novo insumo'}</h2>
        {!editando && <p className="helper">Cadastre seu primeiro insumo Informe o nome, tipo de insumo, unidade de medida, quantidade, valor e estoque mínimo para iniciar o controle de estoque</p>}
        {editando && <p className="helper">Atualize os dados cadastrais do insumo. Os campos tipo, unidade de compra e quantidade inicial permanecem bloqueados para garantir a integridade do histórico. O custo médio só será recalculado se o valor for alterado.</p>}
        {erro && <p className="notice error" role="alert">{erro}</p>}
        <Campo rotulo="Nome Completo" id="insumo.nome" valor={nome} onChange={setNome} placeholder="Ex.: farinha de trigo" />
        <Selecao rotulo="Tipo de insumo" id="insumo.tipo" valor={tipo} onChange={setTipo} opcoes={TIPOS} disabled={Boolean(editando)} />
        <div className="g">
          <Campo rotulo="Quantidade" id="insumo.quantidade" valor={qtd}
            onChange={(value) => setQtd(filtrarNumeroSemMascara(value))} inputMode="decimal" disabled={Boolean(editando)}
            limite={15} placeholder="Ex.: 1.5 ou 14000" />
          <Selecao rotulo="Unidade de compra" id="insumo.unidade" valor={unidade} onChange={(value) => {
            setUnidade(value as Unit)
          }} opcoes={UNIDADES} disabled={Boolean(editando)} />
        </div>
        {unidade === 'un' && !quantidadeUnitariaValida && <p className="notice error" role="alert">Para unidades, informe uma quantidade inteira.</p>}
        <Campo rotulo="Valor total (R$)" id="insumo.preco" valor={preco} onChange={setPreco} mascara="dinheiro" />
        {unidade === 'kg' && <p className="helper">O custo será convertido automaticamente para centavos por grama.</p>}
        {unidade === 'l' && <p className="helper">O custo será convertido automaticamente para centavos por mililitro.</p>}
        <Campo rotulo={`Estoque mínimo${unidade ? ` (${baseOf(unidade)})` : ''}`} id="insumo.estoque-minimo"
          valor={estoqueMinimo} onChange={(value) => setEstoqueMinimo(filtrarNumeroSemMascara(value, false))}
          inputMode="numeric" limite={10} placeholder="0" />
        {!minimoValido && <p className="notice error" role="alert">O estoque mínimo deve ser um número inteiro igual ou maior que zero.</p>}
        {/* <p className="helper">Informe um valor inteiro para receber o alerta de reposição. Novos insumos começam com estoque mínimo zero.</p> */}
        <div className="form-actions">
          <button className="bt o" type="button" disabled={salvando} onClick={fecharFormulario}>
            {editando ? 'Cancelar edição' : 'Cancelar'}
          </button>
          <button className="bt" disabled={!valido || salvando} data-testid="insumo.salvar" onClick={salvar}>
            {salvando ? 'Salvando...' : editando ? 'Salvar' : 'Salvar'}
          </button>
        </div>
      </section></div>}
    </>
  )
}
