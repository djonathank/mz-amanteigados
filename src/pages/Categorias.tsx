import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useDb } from '../data/DbContext'
import {
  corCategoriaValida, excluirCategoriaFinanceira, listarCategoriasFinanceiras,
  salvarCategoriaFinanceira, type CategoriaFinanceira,
} from '../data/categorias'
import { ConfirmacaoAcao, FecharModal, Icon, MensagemModal, useModalAcessivel } from './ui'

const COR_PADRAO = '#704214'
const CORES_INICIAIS = [
  '#704214', '#8A3A2A', '#9A5B13', '#8B6B1F', '#3F6B3B', '#256D78',
  '#315A8A', '#584A8A', '#7A3F74', '#8A3F55', '#4F5963', '#795548',
  '#A54B24', '#B56A2A',
]
const CORES_EXTRAS = [
  '#6D5A24', '#526F2F', '#2D766B', '#356B8A', '#3F5E9B', '#65588F',
  '#914E86', '#A44A68', '#44505A', '#69483D', '#364C59', '#6B7F3A',
  '#775C8B', '#3F7260',
]
const CORES_DISPONIVEIS = [...CORES_INICIAIS, ...CORES_EXTRAS]
const normalizarNome = (valor: string) => valor.replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').slice(0, 20)
const resumirNome = (nome: string) => Array.from(nome).length > 20 ? `${Array.from(nome).slice(0, 17).join('')}...` : nome

export default function Categorias() {
  const db = useDb()
  const location = useLocation()
  const [formularioAberto, setFormularioAberto] = useState(false)
  const [categorias, setCategorias] = useState<CategoriaFinanceira[]>([])
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState(COR_PADRAO)
  const [coresAdicionais, setCoresAdicionais] = useState<string[]>([])
  const [mostrarCoresAdicionais, setMostrarCoresAdicionais] = useState(false)
  const [editando, setEditando] = useState<CategoriaFinanceira | null>(null)
  const [excluir, setExcluir] = useState<CategoriaFinanceira | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')

  const carregar = useCallback(async () => {
    setCategorias(await listarCategoriasFinanceiras(db))
  }, [db])

  useEffect(() => {
    let ativo = true
    void listarCategoriasFinanceiras(db).then((lista) => {
      if (ativo) setCategorias(lista)
    }).catch((error) => {
      if (ativo) setErro(error instanceof Error ? error.message : String(error))
    }).finally(() => {
      if (ativo) setCarregando(false)
    })
    return () => { ativo = false }
  }, [db])

  const nomeValido = nome.trim().length >= 3 && nome.trim().length <= 20
    && normalizarNome(nome.trim()) === nome.trim()
  const alterado = editando
    ? nome.trim() !== editando.nome || cor !== editando.cor || JSON.stringify(coresAdicionais) !== JSON.stringify(editando.coresAdicionais ?? [])
    : nome.trim().length > 0
  const formularioValido = nomeValido && corCategoriaValida(cor) && alterado

  const limpar = () => {
    setNome('')
    setCor(COR_PADRAO)
    setCoresAdicionais([])
    setMostrarCoresAdicionais(false)
    setEditando(null)
    setFormularioAberto(false)
    if (window.location.hash === '#categoria-form') {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    }
  }

  const abrirEdicao = (categoria: CategoriaFinanceira) => {
    setEditando(categoria)
    setNome(categoria.nome)
    setCor(categoria.cor)
    setCoresAdicionais(categoria.coresAdicionais ?? [])
    setErro('')
    setFormularioAberto(true)
  }

  useEffect(() => {
    if (window.location.hash === '#categoria-form' && !editando) {
      setFormularioAberto(true)
      const coresUsadas = new Set(categorias.map((categoria) => categoria.cor.toLowerCase()))
      const corDisponivel = CORES_DISPONIVEIS.find((corOpcao) => !coresUsadas.has(corOpcao.toLowerCase()))
      setCor(corDisponivel ?? CORES_DISPONIVEIS[0])
      requestAnimationFrame(() => document.getElementById('categoria.nome')?.focus())
    } else if (window.location.hash !== '#categoria-form') {
      setFormularioAberto(false)
    }
  }, [categorias, editando, location.hash])

  const salvar = async () => {
    if (!formularioValido || salvando) return
    setSalvando(true)
    setErro('')
    try {
      const nomeSalvo = nome.trim()
      await salvarCategoriaFinanceira(db, { id: editando?.id, nome: nomeSalvo, cor, coresAdicionais })
      await carregar()
      limpar()
      setMensagem(`Categoria ${nomeSalvo} ${editando ? 'atualizada' : 'cadastrada'} com sucesso!`)
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    } finally {
      setSalvando(false)
    }
  }

  const confirmarExclusao = async () => {
    if (!excluir) return
    const selecionada = excluir
    setExcluir(null)
    setErro('')
    try {
      await excluirCategoriaFinanceira(db, selecionada.id)
      await carregar()
      setMensagem(`Categoria ${selecionada.nome} excluída com sucesso!`)
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    }
  }

  useModalAcessivel(formularioAberto, limpar, '#categoria-form')
  useModalAcessivel(Boolean(excluir), () => setExcluir(null), '#categoria-excluir')

  return (
    <>
      <Link className="back-link" to="/mais">‹ Mais</Link>
      <h1>Categorias</h1>
      <p className="sb">Organize as categorias de receitas e despesas</p>

      <section className="cd">
        <div className="section-heading">
          <h2>Categorias financeiras</h2>
        </div>
        {carregando && <p className="notice" role="status">Carregando categorias...</p>}
        {!carregando && !categorias.length && <p className="notice">Nenhuma categoria cadastrada. Crie uma para usar em receitas ou despesas.</p>}
        {categorias.map((categoria) => (
          <div className="r category-row" key={categoria.id}>
            <span className="category-name">
              <i className="category-color-dot" style={{ backgroundColor: categoria.cor }} aria-hidden="true" />
              <span className="category-name-text" title={categoria.nome}>{resumirNome(categoria.nome)}</span>
            </span>
            <div className="row-actions">
              <button className="lk icon-action" type="button" aria-label={`Editar ${categoria.nome}`} title="Editar"
                onClick={() => abrirEdicao(categoria)}><Icon name="edit" /></button>
              <button className="lk icon-action" type="button" aria-label={`Excluir ${categoria.nome}`} title="Excluir"
                onClick={() => setExcluir(categoria)}><Icon name="trash" /></button>
            </div>
          </div>
        ))}
      </section>

      {formularioAberto ? (
        <div className="alert-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) limpar() }}>
          <section id="categoria-form" className="cd add-dialog form-dialog category-form-dialog" role="dialog" aria-modal="true" aria-labelledby="categoria-form-title">
            <FecharModal onClick={limpar} />
            <h2 id="categoria-form-title">{editando ? 'Editar categoria' : 'Nova categoria'}</h2>
            <label className="fl" htmlFor="categoria.nome">
              <small>Nome da categoria</small>
              <input id="categoria.nome" type="text" value={nome} minLength={3} maxLength={20} required
                placeholder="Ex.: Ingredientes" onChange={(event) => setNome(normalizarNome(event.currentTarget.value))} />
            </label>
            <div className="fl color-picker-field">
              <small>Cor da categoria</small>
              <div className="category-color-options" aria-label="Cores disponíveis">
                {CORES_INICIAIS.filter((corOpcao) => !categorias.some((categoria) =>
                  categoria.id !== editando?.id && [categoria.cor, ...(categoria.coresAdicionais ?? [])]
                    .some((corUsada) => corUsada.toLowerCase() === corOpcao.toLowerCase()))).map((corOpcao) => (
                  <button key={corOpcao} type="button" className={`category-color-option${cor === corOpcao ? ' selected' : ''}`}
                    style={{ backgroundColor: corOpcao }} aria-label={`Selecionar cor ${corOpcao}`}
                    aria-pressed={cor === corOpcao} onClick={() => {
                      setCor(corOpcao)
                      setCoresAdicionais((atuais) => atuais.filter((item) => item !== corOpcao))
                    }} />
                ))}
              </div>
            </div>
            <button className="category-more-colors" type="button"
              aria-expanded={mostrarCoresAdicionais} aria-controls="categoria-cores-adicionais"
              onClick={() => setMostrarCoresAdicionais((aberto) => !aberto)}>
              <span>{mostrarCoresAdicionais ? 'Ocultar cores adicionais' : 'Mais cores'}</span>
              <span aria-hidden="true">{mostrarCoresAdicionais ? '−' : '+'}</span>
            </button>
            {mostrarCoresAdicionais && (
              <div id="categoria-cores-adicionais" className="fl category-additional-colors">
                <small>Cores adicionais da categoria</small>
                <div className="category-color-options" aria-label="Selecionar cores adicionais">
                  {CORES_EXTRAS.filter((corOpcao) => corOpcao !== cor && !categorias.some((categoria) =>
                    categoria.id !== editando?.id && [categoria.cor, ...(categoria.coresAdicionais ?? [])]
                      .some((corUsada) => corUsada.toLowerCase() === corOpcao.toLowerCase()))).map((corOpcao) => {
                    const selecionada = coresAdicionais.includes(corOpcao)
                    return (
                      <button key={corOpcao} type="button"
                        className={`category-color-option additional${selecionada ? ' selected' : ''}`}
                        style={{ backgroundColor: corOpcao }} aria-label={`${selecionada ? 'Remover' : 'Adicionar'} cor adicional ${corOpcao}`}
                        aria-pressed={selecionada}
                        onClick={() => setCoresAdicionais((atuais) => atuais.includes(corOpcao)
                          ? atuais.filter((item) => item !== corOpcao)
                          : [...atuais, corOpcao])} />
                    )
                  })}
                </div>
              </div>
            )}
            <div className="form-actions">
              <button className="bt o" type="button" disabled={salvando} onClick={limpar}>Cancelar</button>
              <button className="bt" type="button" disabled={!formularioValido || salvando} onClick={() => void salvar()}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {excluir && <ConfirmacaoAcao
        id="categoria-excluir"
        titulo="Excluir categoria?"
        mensagem={<>
          <span>Tem certeza que deseja excluir a categoria {excluir.nome}? Os lançamentos existentes passarão a exibir </span>
          <span className="category-color-dot category-color-deleted category-deletion-modal-icon" role="img" aria-label="Categoria excluída" title="Categoria excluída">
            <Icon name="lock" size={13} />
          </span>
          <span>.</span>
        </>}
        confirmar="Sim"
        perigosa
        onCancelar={() => setExcluir(null)}
        onConfirmar={() => void confirmarExclusao()}
      />}
      <MensagemModal tipo="sucesso" mensagem={mensagem} onFechar={() => setMensagem('')} />
      <MensagemModal tipo="erro" mensagem={erro} onFechar={() => setErro('')} />
    </>
  )
}
