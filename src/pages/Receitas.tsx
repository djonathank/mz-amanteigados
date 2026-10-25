import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useDb } from '../data/DbContext'
import {
  buscarReceita, excluirReceita, lerConfig, listarInsumos, listarReceitas, salvarReceita, todosItens,
  type InsumoRow, type ItemRow, type ReceitaItemInput, type ReceitaRow,
} from '../data/repos'
import { custoPorUnidade, type Base } from '../data/calculos'
import { recipeBatchCost } from '../domain/cost'
import { formatBRL } from '../domain/money'
import { toBase, type Unit } from '../domain/units'
import { capitalizarNome } from '../domain/text'
import type { Receita } from '../domain/types'
import { AlertaConclusao, Campo, ConfirmacaoAcao, FecharModal, focarCampo, Icon, MensagemModal, Selecao, useModalAcessivel } from './ui'

interface Linha {
  tipo: 'insumo' | 'subreceita'
  id: string
  quantidadeBase: number
}

const UNIDADES: [string, string][] = [['un', 'unidades'], ['g', 'gramas'], ['kg', 'quilogramas'], ['ml', 'mililitros'], ['l', 'litros']]
const normalizarNomeReceita = (value: string) => value.replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').slice(0, 60)
const unidadeBase = (unidade: Unit) => unidade === 'kg' ? 'g' : unidade === 'l' ? 'ml' : unidade

const formatarCustoUnitario = (custoCents: number, unidade: string) => custoCents > 0 && custoCents < 1
  ? `${custoCents.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 4 })} centavos por ${unidade}`
  : `${formatBRL(custoCents)} por ${unidade}`

function construirReceita(
  receita: ReceitaRow,
  itens: ItemRow[],
  receitas: ReceitaRow[],
  gasCents: number,
  pilha: Set<string> = new Set(),
): Receita {
  if (pilha.has(receita.id)) throw new Error(`Ciclo de sub-receitas detectado em "${receita.nome}"`)
  const seguinte = new Set(pilha).add(receita.id)
  const componentes = itens.filter((item) => item.receita_id === receita.id).map((item) => {
    if (item.subreceita_id) {
      const sub = receitas.find((candidata) => candidata.id === item.subreceita_id)
      if (!sub) throw new Error(`Sub-receita não encontrada (${item.subreceita_id})`)
      return { subReceita: construirReceita(sub, itens, receitas, gasCents, seguinte), quantidadeBase: item.quantidade_base }
    }
    if (!item.insumo_id) throw new Error(`Componente inválido na receita "${receita.nome}"`)
    return { insumoId: item.insumo_id, quantidadeBase: item.quantidade_base }
  })
  return {
    id: receita.id,
    nome: receita.nome,
    rendimentoQtd: receita.rendimento_qtd,
    perdaPct: receita.perda_pct,
    itens: componentes,
    tempoMin: receita.tempo_min ?? 0,
    gasCents,
  }
}

export default function Receitas() {
  const db = useDb()
  const location = useLocation()
  const navigate = useNavigate()
  const [insumos, setInsumos] = useState<InsumoRow[]>([])
  const [receitas, setReceitas] = useState<ReceitaRow[]>([])
  const [itens, setItens] = useState<ItemRow[]>([])
  const [config, setConfig] = useState<Record<string, string>>({})
  const [nome, setNome] = useState('')
  const [rend, setRend] = useState('')
  const [unidade, setUnidade] = useState('')
  const [perda, setPerda] = useState('')
  const [tempo, setTempo] = useState('')
  const [modo, setModo] = useState('')
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [sel, setSel] = useState('')
  const [qtd, setQtd] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [formAberto, setFormAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [receitaPendente, setReceitaPendente] = useState<ReceitaRow | null>(null)

  const carregar = useCallback(async () => {
    const [listaInsumos, listaReceitas, listaItens, configuracao] = await Promise.all([
      listarInsumos(db), listarReceitas(db), todosItens(db), lerConfig(db),
    ])
    setInsumos(listaInsumos)
    setReceitas(listaReceitas)
    setItens(listaItens)
    setConfig(configuracao)
  }, [db])
  useEffect(() => {
    void carregar().catch((e) => setErro(e instanceof Error ? e.message : String(e))).finally(() => setCarregando(false))
  }, [carregar])
  useEffect(() => { if (location.hash === '#receita-form') setFormAberto(true) }, [location.hash])

  const custos = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i.custo_medio])), [insumos])
  const opcoesInsumo = insumos.map((i) => [i.id, `${i.nome} (${i.unidade_base})`] as [string, string])
  const receitaTemporaria: ReceitaRow = {
    id: editando ?? 'rascunho',
    nome: nome || 'Rascunho',
    rendimento_qtd: unidade ? toBase(Number(rend), unidade as Unit) : 0,
    rendimento_unidade: unidade ? unidadeBase(unidade as Unit) : '',
    perda_pct: Number(perda) / 100,
    tempo_min: Number(tempo) || 0,
    modo_preparo: modo,
    passos_preparo: null,
  }
  const itensTemporarios: ItemRow[] = linhas.map((linha, index) => ({
    id: `rascunho-${index}`,
    receita_id: receitaTemporaria.id,
    insumo_id: linha.tipo === 'insumo' ? linha.id : null,
    subreceita_id: linha.tipo === 'subreceita' ? linha.id : null,
    quantidade_base: Number(linha.quantidadeBase),
  }))
  const receitasComRascunho = receitas.filter((recipe) => recipe.id !== editando).concat(receitaTemporaria)
  const itensComRascunho = itens.filter((item) => item.receita_id !== editando).concat(itensTemporarios)
  const gasCents = Number(config.gas_lote_cents ?? Number(config.gas_lote || 0) * 100)
  const horaCents = Number(config.valor_hora_cents ?? Number(config.hora_trabalho_cents ?? Number(config.hora_trabalho || 0) * 100))
  const base: Base = { insumos, receitas, itens, variantes: [], config }
  const nomeDe = (linha: Linha) => linha.tipo === 'insumo'
    ? insumos.find((i) => i.id === linha.id)?.nome ?? 'Insumo removido'
    : receitas.find((r) => r.id === linha.id)?.nome ?? 'Sub-receita removida'
  let custoLote = 0
  let erroCalculo = ''
  const podeCalcular = Number(rend) > 0 && !!unidade && perda.trim() !== '' && linhas.length > 0
  if (podeCalcular) {
    try {
      const arvore = construirReceita(receitaTemporaria, itensComRascunho, receitasComRascunho, gasCents)
      custoLote = recipeBatchCost(arvore, custos, horaCents)
    } catch (e) {
      erroCalculo = e instanceof Error ? e.message : String(e)
    }
  }
  const rendimentoUtil = Number(rend) > 0 && Number(perda) >= 0 && Number(perda) < 100
    ? toBase(Number(rend), unidade as Unit) * (1 - Number(perda) / 100)
    : 0
  const custoPorSaida = rendimentoUtil > 0 ? custoLote / rendimentoUtil : 0
  const labelUnidade = unidadeBase(unidade as Unit)
  const quantidadeItemLabel = insumos.find((i) => i.id === sel)?.unidade_base ?? ''
  const valido = nome.trim().length >= 2 && nome.trim().length <= 60
    && normalizarNomeReceita(nome.trim()) === nome.trim()
    && rend.trim() !== '' && Number.isFinite(Number(rend)) && Number(rend) > 0 && !!unidade
    && perda.trim() !== '' && Number(perda) >= 0 && Number(perda) < 100
    && linhas.length > 0 && !erroCalculo

  const limpar = () => {
    setFormAberto(false)
    if (location.hash === '#receita-form') navigate(`${location.pathname}${location.search}`, { replace: true })
    setEditando(null)
    setNome('')
    setRend('')
    setUnidade('')
    setPerda('')
    setTempo('')
    setModo('')
    setLinhas([])
    setSel('')
    setQtd('')
    setErro('')
    setAviso('')
  }

  const editar = async (id: string) => {
    setFormAberto(true)
    try {
      const selecionada = await buscarReceita(db, id)
      if (!selecionada) throw new Error('A receita que você tentou editar não foi encontrada.')
      const filhos = itens.filter((item) => item.receita_id === id)
      setEditando(id)
      setNome(selecionada.nome)
      const rendimentoUnidade = selecionada.rendimento_unidade as Unit
      const exibirEmUnidadeMaior = rendimentoUnidade === 'g' && selecionada.rendimento_qtd >= 1000
        && selecionada.rendimento_qtd % 1000 === 0 ? 'kg'
        : rendimentoUnidade === 'ml' && selecionada.rendimento_qtd >= 1000
          && selecionada.rendimento_qtd % 1000 === 0 ? 'l'
          : rendimentoUnidade
      const unidadeEdicao = UNIDADES.some(([value]) => value === exibirEmUnidadeMaior) ? exibirEmUnidadeMaior : 'un'
      setRend(String(unidadeEdicao === 'kg' || unidadeEdicao === 'l'
        ? selecionada.rendimento_qtd / 1000
        : selecionada.rendimento_qtd))
      setUnidade(unidadeEdicao)
      setPerda(String(selecionada.perda_pct * 100))
      setTempo(selecionada.tempo_min == null ? '' : String(selecionada.tempo_min))
      const parsedSteps: unknown = selecionada.passos_preparo ? JSON.parse(selecionada.passos_preparo) : []
      const etapas = Array.isArray(parsedSteps)
        ? parsedSteps.filter((step): step is string => typeof step === 'string' && step.trim() !== '')
        : []
      setModo([selecionada.modo_preparo?.trim(), ...etapas].filter(Boolean).join('\n'))
      setLinhas(filhos.map((item) => item.insumo_id
        ? { tipo: 'insumo', id: item.insumo_id, quantidadeBase: item.quantidade_base }
        : item.subreceita_id ? { tipo: 'subreceita', id: item.subreceita_id, quantidadeBase: item.quantidade_base } : null
      ).filter((item): item is Linha => item !== null))
      const primeiroInsumo = filhos.find((item) => item.insumo_id)
      setSel(primeiroInsumo?.insumo_id ?? '')
      setQtd('')
      setAviso('')
      setErro('')
      document.getElementById('receita-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      focarCampo('receita.nome')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  const adicionar = () => {
    if (!sel || !(Number(qtd) > 0)) return
    setLinhas((anteriores) => [...anteriores, { tipo: 'insumo', id: sel, quantidadeBase: Number(qtd) }])
    setSel('')
    setQtd('')
  }

  const salvar = async () => {
    if (!valido || salvando) return
    const atualizando = Boolean(editando)
    setSalvando(true)
    setErro('')
    try {
      const inputs: ReceitaItemInput[] = linhas.map((linha) => ({
        ...(linha.tipo === 'insumo' ? { insumoId: linha.id } : { subreceitaId: linha.id }),
        quantidadeBase: Number(linha.quantidadeBase),
      }))
      await salvarReceita(db, {
        id: editando ?? undefined,
        nome,
        rendimento: toBase(Number(rend), unidade as Unit),
        rendimentoUnidade: unidadeBase(unidade as Unit),
        perdaPct: Number(perda) / 100,
        tempoMin: tempo ? Number(tempo) : null,
        modoPreparo: modo,
        passosPreparo: [],
        itens: inputs,
      })
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      return
    } finally {
      setSalvando(false)
    }
    const nomeSalvo = capitalizarNome(nome)
    limpar()
    setAviso(atualizando
      ? `Receita ${nomeSalvo} atualizada com sucesso!`
      : `Receita ${nomeSalvo} cadastrada com sucesso!`)
    try {
      await carregar()
    } catch (e) {
      setErro(`Receita salva, mas não foi possível atualizar a lista: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const apagar = async () => {
    if (!receitaPendente) return
    const selecionada = receitaPendente
    setReceitaPendente(null)
    setErro('')
    try {
      await excluirReceita(db, selecionada.id)
      if (editando === selecionada.id) limpar()
      setAviso(`Receita ${selecionada.nome} excluída com sucesso!`)
      try {
        await carregar()
      } catch (e) {
        setErro(`Receita excluída, mas não foi possível atualizar a lista: ${e instanceof Error ? e.message : String(e)}`)
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  useModalAcessivel(Boolean(receitaPendente), () => setReceitaPendente(null), '#receita-confirmar-exclusao')

  return (
    <>
      <AlertaConclusao mensagem={aviso} onConcluir={() => setAviso('')} />
      <MensagemModal tipo="erro" mensagem={aviso ? '' : erro} onFechar={() => setErro('')} />
      <h1>Receitas</h1>
      <p className="sb">Fichas técnicas e custos das receitas</p>
      <div className="cd">
        <div className="section-heading"><h2>Suas fichas técnicas</h2></div>
        {carregando && <p className="notice" role="status">Carregando receitas...</p>}
        {!carregando && receitas.length === 0 && <p className="notice">Nenhuma receita cadastrada.</p>}
        {!carregando && receitas.map((recipe) => {
          let custo = 0
          let avisoCusto = ''
          try {
            custo = custoPorUnidade(recipe, base)
          } catch (e) {
            avisoCusto = e instanceof Error ? e.message : String(e)
          }
          const saida = recipe.rendimento_unidade === 'g'
            ? Math.max(1, Math.floor(recipe.rendimento_qtd * 0.15))
            : recipe.rendimento_unidade === 'ml'
              ? Math.max(1, Math.floor(recipe.rendimento_qtd / 150))
              : Math.max(1, Math.floor(recipe.rendimento_qtd / 8))
          return (
            <div className="r" key={recipe.id} data-testid="receita.item">
              <span className="ic" aria-hidden="true"><Icon name="recipe" /></span>
              <div>{recipe.nome}<small>{avisoCusto || `${formatBRL(custo * recipe.rendimento_qtd * (1 - recipe.perda_pct))} por receita · ${formatarCustoUnitario(custo, recipe.rendimento_unidade)}`}</small></div>
              <div className="row-actions">
                <Link className="lk" to={`/precificacao?receita=${recipe.id}&lote=${(custo * recipe.rendimento_qtd * (1 - recipe.perda_pct) / 100).toFixed(2)}&pacotes=${recipe.rendimento_qtd * (1 - recipe.perda_pct)}`}>Precificar</Link>
                <button className="lk icon-action" aria-label={`Editar ${recipe.nome}`} onClick={() => editar(recipe.id)}><Icon name="edit" /></button>
                <button className="lk icon-action" aria-label={`Excluir ${recipe.nome}`} onClick={() => setReceitaPendente(recipe)}><Icon name="trash" /></button>
              </div>
            </div>
          )
        })}
      </div>
      {formAberto && <div className="alert-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) limpar() }}><section className="add-dialog form-dialog" id="receita-form" role="dialog" aria-modal="true" aria-labelledby="receita-form-title">
        <FecharModal onClick={limpar} />
        <h2 id="receita-form-title">{editando ? 'Editar receita' : 'Nova receita'}</h2>
        <Campo rotulo="Nome da receita" id="receita.nome" valor={nome} onChange={(value) => setNome(normalizarNomeReceita(value))}
          limite={60} minLength={2} required placeholder="Ex.: massa amanteigada" />
        <div className="g recipe-yield-fields">
          <Campo rotulo="Rendimento" id="receita.rendimento" valor={rend} onChange={setRend}
            mascara={unidade === 'un' ? 'inteiro' : 'quantidade'} limite={60} />
          <Selecao rotulo="Unidade do rendimento" id="receita.unidade" valor={unidade} onChange={setUnidade} opcoes={UNIDADES} />
        </div>
        <div className="g">
          <Campo rotulo="Perda ou quebra (%)" id="receita.perda" valor={perda} onChange={setPerda} mascara="percentual" maxDigitos={10} />
          <Campo rotulo="Tempo de preparo (min)" id="receita.tempo" valor={tempo} onChange={setTempo} mascara="inteiro" maxDigitos={10} />
        </div>
        <div className="cd subcard">
          <h3>Ingredientes</h3>
          {/* {linhas.length === 0 && <p className="sb">Adicione os ingredientes necessários para calcular o custo.</p>} */}
          {linhas.map((linha, index) => (
            <div className="r" key={`${linha.tipo}-${linha.id}-${index}`}>
              <div>{nomeDe(linha)}<small>{linha.quantidadeBase} {linha.tipo === 'insumo' ? insumos.find((i) => i.id === linha.id)?.unidade_base : receitas.find((r) => r.id === linha.id)?.rendimento_unidade}</small></div>
              <button className="lk" onClick={() => setLinhas((anteriores) => anteriores.filter((_, i) => i !== index))}>Remover</button>
            </div>
          ))}
          <div className="g">
            <div className="ingredient-selector">
              <Selecao rotulo="Ingrediente" id="receita.componente" valor={sel} onChange={(value) => { setSel(value); setQtd('') }} opcoes={opcoesInsumo} />
            </div>
          </div>
          <div className="g ingredient-controls">
            <Campo rotulo={quantidadeItemLabel ? `Quantidade (${quantidadeItemLabel})` : 'Quantidade'} id="receita.quantidade"
              valor={qtd} onChange={setQtd} mascara="quantidade" maxDigitos={10} disabled={!sel} />
            <button className="bt o add-line" type="button" onClick={adicionar} disabled={!sel || !(Number(qtd) > 0)} data-testid="receita.adicionar-ingrediente"><Icon name="add" /> Adicionar ingrediente</button>
          </div>
        </div>
        {linhas.length > 0 && rendimentoUtil > 0 && !!unidade && perda.trim() !== '' && !erroCalculo && (
          <div className="cost-summary">
            <div><small>Custo total da receita</small><b>{formatBRL(custoLote)}</b></div>
            <div><small>Custo por {labelUnidade}</small><b>{formatBRL(custoPorSaida)}</b></div>
          </div>
        )}
        {erroCalculo && <p className="notice error">{erroCalculo}</p>}
        <div className="form-actions">
          <button className="bt o" type="button" disabled={salvando} onClick={limpar}>Cancelar</button>
          <button className="bt" type="button" disabled={!valido || salvando} data-testid="receita.salvar" onClick={salvar}>
            {salvando ? 'Salvando...' : editando ? 'Salvar' : 'Salvar'}
          </button>
        </div>
      </section></div>}
      {receitaPendente && <ConfirmacaoAcao
        id="receita-confirmar-exclusao"
        titulo="Excluir receita?"
        mensagem={`Tem certeza que deseja excluir a receita ${receitaPendente.nome}?`}
        confirmar="Excluir"
        perigosa
        onCancelar={() => setReceitaPendente(null)}
        onConfirmar={() => void apagar()}
      />}
    </>
  )
}
