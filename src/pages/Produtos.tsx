import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useDb } from '../data/DbContext'
import { carregarBase, custoPorUnidade, type Base } from '../data/calculos'
import { excluirProduto, salvarProduto, type VarianteRow } from '../data/repos'
import { formatBRL } from '../domain/money'
import { suggestedPrice } from '../domain/pricing'
import { filtrarNumeroSemMascara } from '../domain/inputMask'
import { ajustarEstoque } from '../data/phase2'
import { AlertaConclusao, Campo, ConfirmacaoAcao, FecharModal, focarCampo, Icon, Selecao, useModalAcessivel } from './ui'

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
  const location = useLocation()
  const navigate = useNavigate()
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
  const [formAberto, setFormAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [acoesEstoqueAbertas, setAcoesEstoqueAbertas] = useState<string | null>(null)
  const [produtoPendente, setProdutoPendente] = useState<{ id: string; nome: string } | null>(null)
  const [movimentoPendente, setMovimentoPendente] = useState<{ variante: VarianteRow; perda: boolean } | null>(null)
  const [quantidadeMovimento, setQuantidadeMovimento] = useState('')
  const [motivoMovimento, setMotivoMovimento] = useState('')

  const carregar = useCallback(async () => {
    const b = await carregarBase(db)
    setBase(b)
  }, [db])
  useEffect(() => {
    void carregar().catch((e) => setErro(e instanceof Error ? e.message : String(e)))
  }, [carregar])
  useEffect(() => { if (location.hash === '#produto-form') setFormAberto(true) }, [location.hash])
  useModalAcessivel(Boolean(produtoPendente), () => setProdutoPendente(null), '#produto-confirmar-exclusao')
  useModalAcessivel(Boolean(movimentoPendente), () => setMovimentoPendente(null), '#produto-movimento-dialog')
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
    setFormAberto(false)
    if (location.hash === '#produto-form') navigate(`${location.pathname}${location.search}`, { replace: true })
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
    setFormAberto(true)
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
    const medidaValida = Boolean(receita) && (receita?.rendimento_unidade === 'g'
      ? Number(peso) > 0
      : receita?.rendimento_unidade === 'ml'
        ? Number(volume) > 0
        : true)
    if (!vn.trim() || vn.trim().length > 200 || !medidaValida || !(Number(preco) > 0)) return
    const pesoNumero = Number(peso)
    const volumeNumero = Number(volume)
    const variante: Linha = {
      nome: vn.trim(),
      unidades: Number.isInteger(Number(un)) && Number(un) > 0 ? Number(un) : 1,
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
    if (!nome.trim() || !rec || !linhas.length || salvando) return
    const atualizando = Boolean(editando)
    setSalvando(true)
    setErro('')
    try {
      await salvarProduto(db, {
        id: editando ?? undefined,
        nome,
        receitaId: rec,
        variantes: linhas,
      })
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      return
    } finally {
      setSalvando(false)
    }
    limpar()
    setConfirmacao(atualizando ? 'Produto atualizado.' : 'Produto salvo.')
    try {
      await carregar()
    } catch (e) {
      setErro(`Produto salvo, mas não foi possível atualizar a lista: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const produtos = Array.from(new Map(base.variantes.map((v) => [
    v.produto_id,
    { id: v.produto_id, nome: v.produto_nome, receitaId: v.receita_id, variantes: base.variantes.filter((item) => item.produto_id === v.produto_id) },
  ])).values())
  const medidaValida = Boolean(receita) && (receita?.rendimento_unidade === 'g'
    ? Number(peso) > 0
    : receita?.rendimento_unidade === 'ml'
      ? Number(volume) > 0
      : true)
  const abrirMovimento = (variant: VarianteRow, perda = false) => {
    setAcoesEstoqueAbertas(null)
    setMovimentoPendente({ variante: variant, perda })
    setQuantidadeMovimento('')
    setMotivoMovimento('')
    setErro('')
  }

  const fecharMovimento = () => {
    setMovimentoPendente(null)
    setQuantidadeMovimento('')
    setMotivoMovimento('')
  }

  const ajustarVariante = async () => {
    if (!movimentoPendente) return
    const { variante, perda } = movimentoPendente
    if (Number(variante.estoque_atual ?? 0) < 0) {
      setErro('O saldo atual deve ser ajustado para zero antes de registrar movimentações.')
      return
    }
    const amount = Number(quantidadeMovimento.replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0) {
      setErro('Informe uma quantidade maior que zero.')
      return
    }
    if (!Number.isInteger(amount) || amount > 999999) {
      setErro('Informe uma quantidade inteira de até 999999.')
      return
    }
    if (perda && amount > Number(variante.estoque_atual ?? 0)) {
      setErro('A perda não pode ser maior que o saldo atual.')
      return
    }
    const quantity = perda ? -amount : amount
    const reason = motivoMovimento.trim()
    if (!reason) {
      setErro('Informe o motivo da movimentação.')
      return
    }
    try {
      await ajustarEstoque(db, {
        tipo: 'variante', id: variante.id, quantidade: quantity, motivo: reason,
        operacao: perda ? 'perda' : 'ajuste',
      })
      fecharMovimento()
      await carregar()
      setErro('')
      setConfirmacao(perda ? 'Perda registrada.' : 'Estoque atualizado.')
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    }
  }

  const quantidadeMovimentoNumero = Number(quantidadeMovimento.replace(',', '.'))
  const quantidadeMovimentoValida = quantidadeMovimento.trim()
    && Number.isFinite(quantidadeMovimentoNumero)
    && Number.isInteger(quantidadeMovimentoNumero)
    && quantidadeMovimentoNumero > 0
    && quantidadeMovimentoNumero <= 999999
  const saldoAtualMovimento = Number(movimentoPendente?.variante.estoque_atual ?? 0)
  const saldoProjetadoMovimento = movimentoPendente
    ? saldoAtualMovimento + (movimentoPendente.perda ? -quantidadeMovimentoNumero : quantidadeMovimentoNumero)
    : Number.NaN
  const perdaValida = !movimentoPendente?.perda || quantidadeMovimentoNumero <= saldoAtualMovimento

  const excluir = async () => {
    if (!produtoPendente) return
    const selecionado = produtoPendente
    setProdutoPendente(null)
    try {
      await excluirProduto(db, selecionado.id)
      await carregar()
      if (editando === selecionado.id) limpar()
      setErro('')
      setConfirmacao('Produto excluído.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <Link className="back-link" to="/mais">‹ Mais</Link>
      <h1>Produtos à venda</h1>
      <p className="sb">Ligue cada receita às embalagens, rótulos e preços</p>
      <div className="cd">
        <div className="section-heading"><h2>Seus produtos</h2><span className="pl">{produtos.length} cadastrados</span></div>
        {!produtos.length && <p className="notice">Nenhum produto cadastrado. Cadastre uma receita antes de criar produtos.</p>}
        {produtos.map((produto) => (
          <div className="product-row" key={produto.id}>
            <span className="ic" aria-hidden="true"><Icon name="box" /></span>
            <div className="product-row-content"><b className="product-name" title={produto.nome}>{produto.nome}</b>{produto.variantes.map((variant) => (
              <div className="variant-stock" key={variant.id}>
                <small>{variant.nome} · {formatBRL(variant.preco_cents)} · saldo {variant.estoque_atual ?? 0}</small>
              </div>
            ))}</div>
            <div className="product-row-actions">
            <button className="lk icon-action" aria-label={`Editar ${produto.nome}`} onClick={() => editar(produto)}><Icon name="edit" /></button>
            <button className="lk icon-action" aria-label={`Excluir ${produto.nome}`} onClick={() => setProdutoPendente({ id: produto.id, nome: produto.nome })}><Icon name="trash" /></button>
            <button className="lk icon-action product-stock-toggle" type="button" aria-label={`Mais ações de estoque para ${produto.nome}`} title="Ações de estoque"
              aria-expanded={acoesEstoqueAbertas === produto.id}
              onClick={() => setAcoesEstoqueAbertas((aberta) => aberta === produto.id ? null : produto.id)}>
              <Icon name="add" />
            </button>
            </div>
            {acoesEstoqueAbertas === produto.id && <div className="stock-extra-actions product-stock-extra-actions">
              {produto.variantes.map((variant) => <div className="product-stock-action-group" key={variant.id}>
                <button className="stock-extra-action" type="button" aria-label={`Ajustar estoque de ${variant.nome}`} onClick={() => abrirMovimento(variant)}>
                  <span className="stock-extra-action-icon"><Icon name="stock" /></span>
                  <span><b>Ajustar</b><small>Adicionar quantidade ao saldo</small></span>
                </button>
                <button className="stock-extra-action" type="button" aria-label={`Registrar perda de ${variant.nome}`} onClick={() => abrirMovimento(variant, true)}>
                  <span className="stock-extra-action-icon"><Icon name="trash" /></span>
                  <span><b>Registrar perda</b><small>Descontar quantidade perdida</small></span>
                </button>
              </div>)}
            </div>}
          </div>
        ))}
      </div>
      <AlertaConclusao mensagem={confirmacao} onConcluir={() => setConfirmacao('')} />
      {produtoPendente && <ConfirmacaoAcao
        id="produto-confirmar-exclusao"
        titulo="Excluir produto?"
        mensagem={`Tem certeza que deseja excluir o produto ${produtoPendente.nome} e suas variantes?`}
        confirmar="Excluir"
        perigosa
        onCancelar={() => setProdutoPendente(null)}
        onConfirmar={() => void excluir()}
      />}
      {movimentoPendente && <div className="alert-overlay" onMouseDown={(event) => {
        if (event.target === event.currentTarget) fecharMovimento()
      }}>
        <section id="produto-movimento-dialog" className="alert-dialog stock-modal" role="dialog" aria-modal="true" aria-labelledby="produto-movimento-title" tabIndex={-1}>
          <FecharModal onClick={fecharMovimento} />
          <span className="alert-icon"><Icon name={movimentoPendente.perda ? 'trash' : 'stock'} size={26} /></span>
          <h2 id="produto-movimento-title">{movimentoPendente.perda ? 'Registrar perda' : 'Adicionar quantidade'}</h2>
          <p><b>{movimentoPendente.variante.nome}</b><br />Saldo atual: {movimentoPendente.variante.estoque_atual ?? 0} pacote(s)</p>
          <label className="stock-modal-field">
            <span>Quantidade</span>
            <input autoFocus type="text" inputMode="numeric" value={quantidadeMovimento} maxLength={6} onChange={(event) => {
              setQuantidadeMovimento(filtrarNumeroSemMascara(event.target.value, false, 6))
              setErro('')
            }} />
          </label>
          <label className="stock-modal-field">
            <span>Motivo</span>
            <input type="text" value={motivoMovimento} maxLength={100} onChange={(event) => setMotivoMovimento(event.target.value)} placeholder={movimentoPendente.perda ? 'Ex.: produto vencido' : 'Ex.: reposição de estoque'} />
          </label>
          <p id="produto-saldo-previsto" className={`stock-balance-preview${perdaValida ? '' : ' error'}`}>
            Saldo atual: <b>{saldoAtualMovimento}</b>{quantidadeMovimentoValida ? <>
              {' '}{movimentoPendente.perda ? '-' : '+'}{' '}<b>{quantidadeMovimentoNumero}</b>{' = '}<b>{saldoProjetadoMovimento}</b> pacote(s)
            </> : ' pacote(s)'}
          </p>
          {saldoAtualMovimento < 0 && <p className="notice error" role="alert">O saldo atual deve ser zero antes de adicionar ou registrar perda.</p>}
          {saldoAtualMovimento >= 0 && movimentoPendente.perda && quantidadeMovimentoValida && !perdaValida &&
            <p className="notice error" role="alert">A perda não pode deixar o saldo menor que zero.</p>}
          {erro && <p className="notice error" role="alert">{erro}</p>}
          <div className="alert-actions">
            <button className="bt o" type="button" onClick={fecharMovimento}>Cancelar</button>
            <button className="bt" type="button" disabled={saldoAtualMovimento < 0 || !quantidadeMovimentoValida || !motivoMovimento.trim() || !perdaValida} onClick={() => void ajustarVariante()}>
              {movimentoPendente.perda ? 'Registrar perda' : 'Adicionar'}
            </button>
          </div>
        </section>
      </div>}
      {formAberto && <div className="alert-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) limpar() }}><section className="add-dialog form-dialog" id="produto-form" role="dialog" aria-modal="true" aria-labelledby="produto-form-title">
        <FecharModal onClick={limpar} />
        <h2 id="produto-form-title">{editando ? 'Editar produto' : 'Novo produto'}</h2>
        {erro && <p className="notice error" role="alert">{erro}</p>}
        <Campo rotulo="Nome do produto" id="produto.nome" valor={nome} onChange={setNome} placeholder="Ex.: Amanteigado de chocolate 100g" limite={200} minLength={1} required />
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
            setUn('1')
            setRec(id)
          }} opcoes={base.receitas.map((r) => [r.id, `${r.nome} · ${r.rendimento_qtd} ${r.rendimento_unidade}`])} required />}
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
        <Campo rotulo="Nome da embalagem / variante" id="produto.variante" valor={vn} onChange={setVn} placeholder="Ex.: Pacote com 10 unidades" limite={200} minLength={1} required />
        <div className="g">
          {receita?.rendimento_unidade === 'g' && <Campo rotulo="Peso da receita no pacote (g)" id="produto.peso" valor={peso} onChange={setPeso} mascara="quantidade" />}
          {receita?.rendimento_unidade === 'ml' && <Campo rotulo="Volume da receita no pacote (ml)" id="produto.volume" valor={volume} onChange={setVolume} mascara="quantidade" />}
          <Campo rotulo="Preço de venda (R$)" id="produto.preco" valor={preco} onChange={setPreco} mascara="dinheiro" />
        </div>
        <div className="g">
          <Selecao rotulo="Embalagem (opcional)" id="produto.insumo-embalagem" valor={embalagem} onChange={setEmbalagem} opcoes={opcoesInsumo(base, ['embalagem'])} />
          <Selecao rotulo="Rótulo (opcional)" id="produto.insumo-rotulo" valor={rotulo} onChange={setRotulo} opcoes={opcoesInsumo(base, ['rotulo'])} />
        </div>
        {custoTotalPacote > 0 && <p className="cost-hint">Custo estimado: {formatBRL(custoTotalPacote)} · preço sugerido: {formatBRL(sugerido)}</p>}
        {sugerido > 0 && <button className="bt o" type="button" onClick={() => setPreco((sugerido / 100).toFixed(2))} data-testid="produto.usar-sugerido">Usar preço sugerido</button>}
        <button className="bt o" type="button" onClick={adicionar}
          disabled={!vn.trim() || vn.trim().length > 200 || !medidaValida || !(Number(preco) > 0)} data-testid="produto.adicionar-embalagem">
          {editandoLinha == null ? 'Adicionar variante' : 'Salvar variante'}
        </button>
        <button className="bt" disabled={!nome.trim() || nome.trim().length > 200 || !rec || linhas.length === 0 || salvando} data-testid="produto.salvar" onClick={salvar}>
          {salvando ? 'Salvando...' : editando ? 'Salvar' : 'Salvar'}
        </button>
        {editando && <button className="bt o" onClick={limpar}>Cancelar</button>}
      </section></div>}
    </>
  )
}
