import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDb } from '../data/DbContext'
import {
  corCategoriaValida, excluirCategoriaFinanceira, listarCategoriasFinanceiras,
  salvarCategoriaFinanceira, type CategoriaFinanceira,
} from '../data/categorias'
import { ConfirmacaoAcao, FecharModal, Icon, MensagemModal, useModalAcessivel } from './ui'

const COR_PADRAO = '#704214'
const normalizarNome = (valor: string) => valor.replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').slice(0, 60)

export default function Categorias() {
  const db = useDb()
  const [categorias, setCategorias] = useState<CategoriaFinanceira[]>([])
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState(COR_PADRAO)
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

  const nomeValido = nome.trim().length >= 2 && nome.trim().length <= 60
    && normalizarNome(nome.trim()) === nome.trim()
  const alterado = editando ? nome.trim() !== editando.nome || cor !== editando.cor : nome.trim().length > 0
  const formularioValido = nomeValido && corCategoriaValida(cor) && alterado

  const limpar = () => {
    setNome('')
    setCor(COR_PADRAO)
    setEditando(null)
  }

  const abrirEdicao = (categoria: CategoriaFinanceira) => {
    setEditando(categoria)
    setNome(categoria.nome)
    setCor(categoria.cor)
    setErro('')
  }

  const salvar = async () => {
    if (!formularioValido || salvando) return
    setSalvando(true)
    setErro('')
    try {
      const nomeSalvo = nome.trim()
      await salvarCategoriaFinanceira(db, { id: editando?.id, nome: nomeSalvo, cor })
      await carregar()
      setMensagem(`Categoria ${nomeSalvo} ${editando ? 'atualizada' : 'cadastrada'} com sucesso!`)
      limpar()
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

  useModalAcessivel(Boolean(editando) || (!editando && nome !== ''), limpar, '#categoria-form')
  useModalAcessivel(Boolean(excluir), () => setExcluir(null), '#categoria-excluir')

  return (
    <>
      <Link className="back-link" to="/mais">‹ Mais</Link>
      <h1>Categorias</h1>
      <p className="sb">Organize as categorias de receitas e despesas</p>

      <section className="cd">
        <div className="section-heading">
          <h2>Categorias financeiras</h2>
          <button className="bt o" type="button" onClick={() => {
            limpar()
            setNome(' ')
            requestAnimationFrame(() => document.getElementById('categoria.nome')?.focus())
          }}><Icon name="add" /> Nova categoria</button>
        </div>
        {carregando && <p className="notice" role="status">Carregando categorias...</p>}
        {!carregando && !categorias.length && <p className="notice">Nenhuma categoria cadastrada. Crie uma para usar em receitas ou despesas.</p>}
        {categorias.map((categoria) => (
          <div className="r category-row" key={categoria.id}>
            <span className="category-name">
              <i className="category-color-dot" style={{ backgroundColor: categoria.cor }} aria-hidden="true" />
              {categoria.nome}
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

      {(!editando && nome !== '') || editando ? (
        <div className="alert-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) limpar() }}>
          <section id="categoria-form" className="cd add-dialog form-dialog" role="dialog" aria-modal="true" aria-labelledby="categoria-form-title">
            <FecharModal onClick={limpar} />
            <h2 id="categoria-form-title">{editando ? 'Editar categoria' : 'Nova categoria'}</h2>
            <label className="fl" htmlFor="categoria.nome">
              <small>Nome da categoria</small>
              <input id="categoria.nome" type="text" value={nome.trim()} minLength={2} maxLength={60} required
                placeholder="Ex.: Ingredientes" onChange={(event) => setNome(normalizarNome(event.currentTarget.value))} />
            </label>
            <label className="fl color-picker-field" htmlFor="categoria.cor">
              <small>Cor da categoria</small>
              <input id="categoria.cor" type="color" value={cor}
                onChange={(event) => setCor(event.currentTarget.value)} />
              {!corCategoriaValida(cor) && <span className="helper">Escolha uma cor mais escura para manter o contraste.</span>}
            </label>
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
        mensagem={`Tem certeza que deseja excluir a categoria ${excluir.nome}? Os lançamentos existentes passarão a exibir “Categoria excluída”.`}
        confirmar="Excluir"
        perigosa
        onCancelar={() => setExcluir(null)}
        onConfirmar={() => void confirmarExclusao()}
      />}
      <MensagemModal tipo="sucesso" mensagem={mensagem} onFechar={() => setMensagem('')} />
      <MensagemModal tipo="erro" mensagem={erro} onFechar={() => setErro('')} />
    </>
  )
}
