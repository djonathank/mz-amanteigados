import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listarReceitas, listarVariantes } from '../data/repos'
import { listarAlertasEstoque, listarLotes, registrarProducao, type BatchRow } from '../data/phase2'
import { useDb } from '../data/DbContext'
import type { ReceitaRow, VarianteRow } from '../data/repos'
import { AlertaConclusao, Campo, Selecao } from './ui'

interface Saida { varianteId: string; quantidade: string }

export default function Producao() {
  const db = useDb()
  const [receitas, setReceitas] = useState<ReceitaRow[]>([])
  const [variantes, setVariantes] = useState<VarianteRow[]>([])
  const [lotes, setLotes] = useState<BatchRow[]>([])
  const [alertas, setAlertas] = useState<{ nome: string; saldo: number; minimo: number; unidade: string }[]>([])
  const [receitaId, setReceitaId] = useState('')
  const [prevista, setPrevista] = useState('')
  const [fabricacao, setFabricacao] = useState(new Date().toISOString().slice(0, 10))
  const [validade, setValidade] = useState('')
  const [saidas, setSaidas] = useState<Saida[]>([{ varianteId: '', quantidade: '' }])
  const [erro, setErro] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    const [recipes, variants, batches, warnings] = await Promise.all([
      listarReceitas(db), listarVariantes(db), listarLotes(db), listarAlertasEstoque(db),
    ])
    setReceitas(recipes)
    setVariantes(variants)
    setLotes(batches)
    setAlertas(warnings)
  }, [db])

  useEffect(() => {
    void carregar().catch((error) => setErro(error instanceof Error ? error.message : String(error)))
  }, [carregar])

  const receita = receitas.find((row) => row.id === receitaId)
  const variantesDisponiveis = useMemo(
    () => variantes.filter((row) => row.receita_id === receitaId),
    [variantes, receitaId],
  )

  const finalizar = async (motivoEstoqueNegativo?: string) => {
    setSalvando(true)
    setErro('')
    try {
      await registrarProducao(db, {
        receitaId,
        quantidadePrevista: Number(prevista),
        dataFabricacao: fabricacao,
        dataValidade: validade || undefined,
        saidas: saidas.map((saida) => ({ varianteId: saida.varianteId, quantidade: Number(saida.quantidade) })),
        motivoEstoqueNegativo,
      })
      setConfirmacao('Lote registrado; os insumos foram baixados e os produtos adicionados ao estoque.')
      setPrevista('')
      setValidade('')
      setSaidas([{ varianteId: '', quantidade: '' }])
      await carregar()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!motivoEstoqueNegativo && message.includes('Informe o motivo para confirmar saldo negativo')) {
        const reason = window.prompt(`${message}\n\nDescreva o motivo para continuar:`)?.trim()
        if (reason) return finalizar(reason)
        setErro('Produção cancelada. Informe um motivo para registrar saldo negativo.')
      } else setErro(message)
    } finally {
      setSalvando(false)
    }
  }

  const podeSalvar = Boolean(receitaId && Number(prevista) > 0 && fabricacao
    && saidas.length > 0 && saidas.every((saida) => saida.varianteId && Number(saida.quantidade) > 0))

  return (
    <>
      <AlertaConclusao mensagem={confirmacao} onConcluir={() => setConfirmacao('')} />
      <Link className="back-link" to="/mais">‹ Mais</Link>
      <h1>Produção por lote</h1>
      <p className="sb">Registre a fabricação para atualizar o estoque e rastrear a validade.</p>
      {erro && <p className="notice error" role="alert">{erro}</p>}
      {alertas.length > 0 && (
        <section className="notice" role="status">
          <b>Estoque baixo</b>
          {alertas.map((warning) => (
            <p key={`${warning.nome}-${warning.unidade}`}>{warning.nome}: {warning.saldo} {warning.unidade} (mínimo {warning.minimo})</p>
          ))}
        </section>
      )}
      <section className="cd">
        <h2>Novo lote</h2>
        <Selecao rotulo="Receita" id="producao.receita" valor={receitaId}
          onChange={(value) => { setReceitaId(value); setSaidas([{ varianteId: '', quantidade: '' }]) }}
          opcoes={receitas.map((row) => [row.id, `${row.nome} · ${row.rendimento_unidade}`])} />
        <div className="g">
          <Campo rotulo={`Quantidade prevista${receita ? ` (${receita.rendimento_unidade})` : ''}`}
            id="producao.prevista" valor={prevista} onChange={setPrevista} mascara="quantidade" />
          <Campo rotulo="Data de fabricação" id="producao.fabricacao" tipo="date" valor={fabricacao} onChange={setFabricacao} />
          <Campo rotulo="Data de validade" id="producao.validade" tipo="date" valor={validade} onChange={setValidade} />
        </div>
        <h2>Produtos produzidos</h2>
        {saidas.map((saida, index) => (
          <div className="g" key={index}>
            <Selecao rotulo="Variante" id={`producao.variante.${index}`} valor={saida.varianteId}
              onChange={(value) => setSaidas((rows) => rows.map((row, i) => i === index ? { ...row, varianteId: value } : row))}
              opcoes={variantesDisponiveis.map((variant) => [variant.id, `${variant.produto_nome} · ${variant.nome}`])} />
            <Campo rotulo="Pacotes produzidos" id={`producao.quantidade.${index}`} valor={saida.quantidade}
              onChange={(value) => setSaidas((rows) => rows.map((row, i) => i === index ? { ...row, quantidade: value } : row))}
              mascara="inteiro" />
            {saidas.length > 1 && <button className="bt o" type="button"
              onClick={() => setSaidas((rows) => rows.filter((_, i) => i !== index))}>Remover linha</button>}
          </div>
        ))}
        <button className="bt o" type="button" disabled={!variantesDisponiveis.length}
          onClick={() => setSaidas((rows) => [...rows, { varianteId: '', quantidade: '' }])}>Adicionar variante</button>
        {receita && variantesDisponiveis.length === 0 && <p className="notice">Cadastre um produto para esta receita antes de registrar a produção.</p>}
        <button className="bt" disabled={!podeSalvar || salvando} data-testid="producao.salvar"
          onClick={() => void finalizar()}>{salvando ? 'Salvando...' : 'Registrar lote'}</button>
      </section>
      <section className="cd">
        <h2>Lotes disponíveis</h2>
        {!lotes.length && <p className="notice">Nenhum lote com saldo disponível.</p>}
        {lotes.map((lot) => {
          const expirado = lot.data_validade && lot.data_validade < new Date().toISOString().slice(0, 10)
          const proximo = lot.data_validade && !expirado
            && (new Date(`${lot.data_validade}T00:00:00`).getTime() - Date.now()) / 86400000 <= 7
          return <div className="r" key={`${lot.id}-${lot.variante_nome}`}>
            <span>{lot.codigo}<small>{lot.produto_nome} · {lot.variante_nome} · saldo {lot.saldo}</small></span>
            <b>{expirado ? 'Vencido' : proximo ? 'Vence em breve' : lot.data_validade || 'Sem validade'}</b>
          </div>
        })}
      </section>
    </>
  )
}
