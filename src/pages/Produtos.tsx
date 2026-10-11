import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDb } from '../data/DbContext'
import { carregarBase, custoDaVariante, custoPorUnidade, type Base } from '../data/calculos'
import { excluirProduto, salvarProduto, type VarianteRow } from '../data/repos'
import { formatBRL } from '../domain/money'
import { realMargin, suggestedPrice } from '../domain/pricing'
import { ajustarEstoque, definirEstoqueMinimoVariante } from '../data/phase2'
import { AlertaConclusao, Campo, focarCampo, Icon, Selecao } from './ui'

interface Linha {
  id?: string
  nome: string
  unidades: number
  pesoG: number | null
  volumeMl: number | null
  embalagemInsumoId: string | null
  rotuloInsumoId: string | null
  precoCents: number
}

const NENHUM = 'nenhum'
const opcoesInsumo = (base: Base, tipos: string[]) => [
  [NENHUM, 'Sem cadastro de insumo'],
  ...base.insumos.filter((item) => tipos.includes(item.tipo)).map((item) => [item.id, item.nome]),
] as [string, string][]

export default function Produtos() {
  const db = useDb()
  const [base, setBase] = useState<Base | null>(null)
  const [nome, setNome] = useState('')
  const [rec, setRec] = useState('')
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [vn, setVn] = useState('')
  const [un, setUn] = useState('')
  const [peso, setPeso] = useState('')
  const [volume, setVolume] = useState('')
  const [embalagem, setEmbalagem] = useState('')
  const [rotulo, setRotulo] = useState('')
  const [preco, setPreco] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [editandoLinha, setEditandoLinha] = useState<number | null>(null)
  const [erro, setErro] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [orientacao, setOrientacao] = useState('')

  const carregar = useCallback(async () => {
    const b = await carregarBase(db)
    setBase(b)
  }, [db])
  useEffect(() => {
    void carregar().catch((e) => setErro(e instanceof Error ? e.message : String(e)))
  }, [carregar])
  if (!base) return erro
    ? <p className="notice error" role="alert">{erro}</p>
    : <p className="notice" role="status">Carregando produtos...</p>

  const margem = Number(base.config.margem_padrao || 40) / 100
  const taxa = Number(base.config.taxa_pix || 0) / 100
  const receita = base.receitas.find((r) => r.id === rec)
  const medidaFisica = receita?.rendimento_unidade === 'g' || receita?.rendimento_unidade === 'ml'
  const quantidadeCusto = medidaFisica
    ? receita?.rendimento_unidade === 'ml' ? Number(volume) : Number(peso)
    : Number(un)
  const custoPacote = receita && quantidadeCusto > 0
    ? Math.round(custoPorUnidade(receita, base) * quantidadeCusto)
    : 0
  const embalagemCents = [embalagem, rotulo]
    .filter((id) => id !== NENHUM)
    .reduce((sum, id) => sum + (base.insumos.find((item) => item.id === id)?.custo_medio ?? 0), 0)
  const custoTotalPacote = custoPacote + embalagemCents
  const sugerido = custoTotalPacote > 0 && margem + taxa < 1
    ? suggestedPrice({ custoUnitario: custoTotalPacote, margem, taxa })
    : 0

  const limpar = () => {
    setNome('')
    setRec('')
    setLinhas([])
    setVn('')
    setUn('')
    setPeso('')
    setVolume('')
    setEmbalagem('')
    setRotulo('')
    setPreco('')
    setEditando(null)
    setEditandoLinha(null)
    setErro('')
    setOrientacao('')
  }

  const editar = (produto: { id: string; nome: string; receitaId: string; variantes: VarianteRow[] }) => {
    const unidadeReceita = base?.receitas.find((recipe) => recipe.id === produto.receitaId)?.rendimento_unidade
    setEditando(produto.id)
    setNome(produto.nome)
    setRec(produto.receitaId)
    setEditandoLinha(null)
    setVn('')
    setUn('1')
    setPeso('')
    setVolume('')
    setEmbalagem('')
    setRotulo('')
    setPreco('')
    setLinhas(produto.variantes.map((v) => ({
      id: v.id,
      nome: v.nome,
      unidades: v.unidades_por_pacote,
      pesoG: v.peso_g,
      volumeMl: v.volume_ml ?? (unidadeReceita === 'ml' ? v.peso_g : null),
      embalagemInsumoId: v.embalagem_insumo_id,
      rotuloInsumoId: v.rotulo_insumo_id,
      precoCents: v.preco_cents,
    })))
    setErro('')
    setConfirmacao('')
    setOrientacao('')
    document.getElementById('produto-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    focarCampo('produto.nome')
  }

  const adicionar = () => {
    const medidaValida = receita?.rendimento_unidade === 'g'
      ? Number(peso) > 0
      : receita?.rendimento_unidade === 'ml'
        ? Number(volume) > 0
        : Number.isInteger(Number(un)) && Number(un) > 0
    if (!vn.trim() || !medidaValida || !(Number(preco) > 0)) return
    const pesoNumero = Number(peso)
    const volumeNumero = Number(volume)
    const variante: Linha = {
      nome: vn.trim(),
      unidades: Number(un),
      pesoG: receita?.rendimento_unidade === 'g' && pesoNumero > 0 ? pesoNumero : null,
      volumeMl: receita?.rendimento_unidade === 'ml' && volumeNumero > 0 ? volumeNumero : null,
      embalagemInsumoId: !embalagem || embalagem === NENHUM ? null : embalagem,
      rotuloInsumoId: !rotulo || rotulo === NENHUM ? null : rotulo,
      precoCents: Math.round(Number(preco) * 100),
    }
    setLinhas((anteriores) => editandoLinha == null
      ? [...anteriores, variante]
      : anteriores.map((linha, index) => index === editandoLinha ? { ...variante, id: linha.id } : linha))
    setEditandoLinha(null)
    setVn('')
    setUn('')
    setPeso('')
    setVolume('')
    setEmbalagem('')
    setRotulo('')
    setPreco('')
  }

  const editarLinha = (index: number) => {
    const linha = linhas[index]
    setEditandoLinha(index)
    setVn(linha.nome)
    setUn(String(linha.unidades))
    setPeso(linha.pesoG == null ? '' : String(linha.pesoG))
    setVolume(linha.volumeMl == null ? '' : String(linha.volumeMl))
    setEmbalagem(linha.embalagemInsumoId ?? '')
    setRotulo(linha.rotuloInsumoId ?? '')
    setPreco((linha.precoCents / 100).toFixed(2))
  }

  const salvar = async () => {
    if (!nome.trim() || !rec || !linhas.length) return
    const atualizando = Boolean(editando)
    try {
      await salvarProduto(db, {
        id: editando ?? undefined,
        nome,
        receitaId: rec,
        variantes: linhas,
      })
      limpar()
      setConfirmacao(atualizando ? 'Produto atualizado.' : 'Produto salvo.')
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  const produtos = Array.from(new Map(base.variantes.map((v) => [
    v.produto_id,
    { id: v.produto_id, nome: v.produto_nome, receitaId: v.receita_id, variantes: base.variantes.filter((item) => item.produto_id === v.produto_id) },
  ])).values())
  const quantidadeLabel = receita?.rendimento_unidade === 'g'
    ? 'Peso da receita no pacote (g)'
    : receita?.rendimento_unidade === 'ml'
      ? 'Volume por pacote (ml)'
      : 'Unidades por pacote'
  const medidaValida = receita?.rendimento_unidade === 'g'
    ? Number(peso) > 0
    : receita?.rendimento_unidade === 'ml'
      ? Number(volume) > 0
      : Number.isInteger(Number(un)) && Number(un) > 0
  const ajustarVariante = async (variant: VarianteRow, perda = false) => {
    const value = window.prompt(`Saldo atual: ${variant.estoque_atual} pacote(s). Informe a quantidade ${perda ? 'perdida' : 'do ajuste'}:`)
    if (value === null) return
    const amount = Number(value.replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0) {
      setErro('Informe uma quantidade maior que zero.')
      return
    }
    const quantity = perda ? -amount : amount
    const reason = perda || Number(variant.estoque_atual) + quantity < 0
      ? window.prompt(perda ? 'Informe o motivo da perda:' : 'Informe o motivo do saldo negativo:')?.trim() ?? ''
      : ''
    try {
      await ajustarEstoque(db, {
        tipo: 'variante', id: variant.id, quantidade: quantity, motivo: reason,
        operacao: perda ? 'perda' : 'ajuste',
      })
      await carregar()
      setErro('')
      setConfirmacao(perda ? 'Perda registrada.' : 'Estoque atualizado.')
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <>
      <Link className="back-link" to="/mais">‹ Mais</Link>
      <h1>Produtos à venda</h1>
      <p className="sb">Ligue cada receita às embalagens, rótulos e preços</p>
      <div className="cd">
        <div className="section-heading"><h2>Seus produtos</h2><span className="pl">{produtos.length} cadastrados</span></div>
        {!produtos.length && <p className="notice">Nenhum produto ainda. Cadastre a primeira receita e depois crie o produto.</p>}
        {produtos.map((produto) => (
          <div className="product-row" key={produto.id}>
            <span className="ic" aria-hidden="true"><Icon name="box" /></span>
            <div className="product-row-content"><b>{produto.nome}</b>{produto.variantes.map((variant) => (
              <small key={variant.id}>{variant.nome} · {formatBRL(variant.preco_cents)}</small>
            ))}</div>
            <button className="lk icon-action" aria-label={`Editar ${produto.nome}`} onClick={() => editar(produto)}><Icon name="edit" /></button>
            <button className="lk icon-action" aria-label={`Excluir ${produto.nome}`} onClick={async () => {
              if (confirm(`Excluir "${produto.nome}" e suas variantes?`)) {
                try {
                  await excluirProduto(db, produto.id)
                  await carregar()
                  if (editando === produto.id) limpar()
                  setErro('')
                  setConfirmacao('Produto excluído.')
                } catch (e) {
                  setErro(e instanceof Error ? e.message : String(e))
                }
              }
            }}><Icon name="trash" /></button>
          </div>
        ))}
      </div>
      <AlertaConclusao mensagem={confirmacao} onConcluir={() => setConfirmacao('')} />
      <div className="cd" id="produto-form">
        <h2>{editando ? 'Editar produto' : 'Novo produto'}</h2>
        {erro && <p className="notice error" role="alert">{erro}</p>}
        <Campo rotulo="Nome do produto" id="produto.nome" valor={nome} onChange={setNome} placeholder="Ex.: bolacha amanteigada" />
        {base.receitas.length === 0
          ? <p className="notice">Cadastre uma receita na aba Receitas antes de criar produtos.</p>
          : <Selecao rotulo="Receita" id="produto.receita" valor={rec} onChange={(id) => {
            if (editando && id !== rec) {
              setLinhas([])
              setEditandoLinha(null)
              setVn('')
              setPreco('')
              setPeso('')
              setVolume('')
              setEmbalagem('')
              setRotulo('')
              setOrientacao('Receita alterada. Recrie as variantes para manter o peso ou volume compatível.')
            }
            setRec(id)
          }} opcoes={base.receitas.map((r) => [r.id, `${r.nome} · ${r.rendimento_qtd} ${r.rendimento_unidade}`])} />}
        {orientacao && <p className="notice" role="status">{orientacao}</p>}
        {linhas.map((linha, index) => (
          <div className="r" key={linha.id ?? `novo-${index}`}>
            <div>{linha.nome}<small>{linha.pesoG ? `${linha.pesoG} g` : linha.volumeMl ? `${linha.volumeMl} ml` : `${linha.unidades} un`} · {formatBRL(linha.precoCents)}</small></div>
            <div className="row-actions">
              <button className="lk icon-action" aria-label={`Editar variante ${linha.nome}`} onClick={() => editarLinha(index)}><Icon name="edit" /></button>
              <button className="lk icon-action" aria-label={`Remover variante ${linha.nome}`} onClick={() => {
                setLinhas((anteriores) => anteriores.filter((_, i) => i !== index))
                if (editandoLinha === index) {
                  setEditandoLinha(null)
                  setVn('')
                  setPreco('')
                  setPeso('')
                  setVolume('')
                }
                else if (editandoLinha != null && editandoLinha > index) setEditandoLinha(editandoLinha - 1)
              }}><Icon name="trash" /></button>
            </div>
          </div>
        ))}
        <Campo rotulo="Nome da embalagem / variante" id="produto.variante" valor={vn} onChange={setVn} placeholder="Ex.: Pacote 150 g" />
        <div className="g">
          <Campo rotulo={quantidadeLabel} id="produto.unidades" mascara={receita?.rendimento_unidade === 'un' ? 'inteiro' : 'quantidade'}
            valor={receita?.rendimento_unidade === 'ml' ? volume : receita?.rendimento_unidade === 'g' ? peso : un}
            onChange={receita?.rendimento_unidade === 'ml' ? setVolume : receita?.rendimento_unidade === 'g' ? setPeso : setUn} />
          <Campo rotulo="Preço de venda (R$)" id="produto.preco" valor={preco} onChange={setPreco} mascara="dinheiro" />
        </div>
        <div className="g">
          <Selecao rotulo="Embalagem (opcional)" id="produto.insumo-embalagem" valor={embalagem} onChange={setEmbalagem} opcoes={opcoesInsumo(base, ['embalagem'])} />
          <Selecao rotulo="Rótulo (opcional)" id="produto.insumo-rotulo" valor={rotulo} onChange={setRotulo} opcoes={opcoesInsumo(base, ['rotulo'])} />
        </div>
        {custoTotalPacote > 0 && <p className="cost-hint">Custo estimado: {formatBRL(custoTotalPacote)} · preço sugerido: {formatBRL(sugerido)}</p>}
        {sugerido > 0 && <button className="bt o" type="button" onClick={() => setPreco((sugerido / 100).toFixed(2))} data-testid="produto.usar-sugerido">Usar preço sugerido</button>}
        <button className="bt o" type="button" onClick={adicionar}
          disabled={!vn.trim() || !medidaValida || !(Number(preco) > 0)} data-testid="produto.adicionar-embalagem">
          {editandoLinha == null ? 'Adicionar variante' : 'Salvar variante'}
        </button>
        <button className="bt" disabled={!nome.trim() || !rec || linhas.length === 0} data-testid="produto.salvar" onClick={salvar}>
          {editando ? 'Salvar alterações' : 'Salvar produto'}
        </button>
        {editando && <button className="bt o" onClick={limpar}>Cancelar edição</button>}
      </div>
    </>
  )
}
