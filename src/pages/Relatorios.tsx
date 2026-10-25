import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDb } from '../data/DbContext'
import { criarPdf } from '../data/pdf'
import { gerarCsv, type RelatorioTabela } from '../data/reports'
import { formatBRL } from '../domain/money'
import { formatBRDate, localDateAfterIso, localDateStartIso, localDateString } from '../domain/date'
import { SeletorData } from './ui'

interface ResumoRow {
  vendas: number; total_cents: number; pagas_cents: number; pendentes_cents: number; lucro_cents: number
}
interface ProdutoRow { nome: string; unidades: number; faturamento_cents: number; lucro_cents: number }
interface ClienteRow { nome: string; vendas: number; faturamento_cents: number }
interface CustoRow { insumo: string; data: string; custo_por_base: number; unidade: string }

const primeiroDiaDoMes = () => {
  const today = new Date()
  return localDateString(new Date(today.getFullYear(), today.getMonth(), 1))
}
const hoje = () => localDateString()

function baixar(nome: string, conteudo: BlobPart, tipo: string) {
  const blob = new Blob([conteudo], { type: tipo })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nome
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function Relatorios() {
  const db = useDb()
  const [inicio, setInicio] = useState(primeiroDiaDoMes())
  const [fim, setFim] = useState(hoje())
  const [resumo, setResumo] = useState<ResumoRow | null>(null)
  const [produtos, setProdutos] = useState<ProdutoRow[]>([])
  const [clientes, setClientes] = useState<ClienteRow[]>([])
  const [custos, setCustos] = useState<CustoRow[]>([])
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [exportando, setExportando] = useState('')

  const consultar = async () => {
    if (!inicio || !fim || inicio > fim) {
      setErro('Informe um intervalo de datas válido.')
      return
    }
    setErro('')
    setCarregando(true)
    try {
      const from = localDateStartIso(inicio)
      const to = localDateAfterIso(fim)
      const [summaryRows, productRows, customerRows, costRows] = await Promise.all([
        db.query<ResumoRow>(
          `SELECT COUNT(*) AS vendas, COALESCE(SUM(v.total_cents),0) AS total_cents,
                  COALESCE(SUM(CASE WHEN v.status_pagamento='pago' THEN v.total_cents ELSE 0 END),0) AS pagas_cents,
                  COALESCE(SUM(CASE WHEN v.status_pagamento!='pago' THEN v.total_cents ELSE 0 END),0) AS pendentes_cents,
                  COALESCE((SELECT SUM(lucro_venda-desconto_cents) FROM (
                              SELECT v2.id, v2.desconto_cents,
                                     SUM(vi.quantidade*(vi.preco_unit_cents-vi.custo_unit_cents)) AS lucro_venda
                              FROM venda v2 JOIN venda_item vi ON vi.venda_id=v2.id
                              WHERE v2.deleted_at IS NULL AND vi.deleted_at IS NULL AND v2.data>=? AND v2.data<?
                              GROUP BY v2.id
                            )),0) AS lucro_cents
           FROM venda v WHERE v.deleted_at IS NULL AND v.data>=? AND v.data<?`,
          [from, to, from, to],
        ),
        db.query<ProdutoRow>(
          `SELECT p.nome || ' · ' || pv.nome AS nome, SUM(vi.quantidade) AS unidades,
                  SUM(vi.quantidade*vi.preco_unit_cents) AS faturamento_cents,
                  SUM(vi.quantidade*(vi.preco_unit_cents-vi.custo_unit_cents)) -
                    SUM(CASE WHEN v.total_cents+v.desconto_cents>0
                      THEN v.desconto_cents*(vi.quantidade*vi.preco_unit_cents*1.0)/(v.total_cents+v.desconto_cents)
                      ELSE 0 END) AS lucro_cents
           FROM venda_item vi JOIN venda v ON v.id=vi.venda_id
           JOIN produto_variante pv ON pv.id=vi.variante_id JOIN produto p ON p.id=pv.produto_id
           WHERE v.deleted_at IS NULL AND vi.deleted_at IS NULL AND v.data>=? AND v.data<?
           GROUP BY p.id, pv.id ORDER BY lucro_cents DESC`,
          [from, to],
        ),
        db.query<ClienteRow>(
          `SELECT COALESCE(c.nome, 'Sem cliente') AS nome, COUNT(DISTINCT v.id) AS vendas,
                  SUM(v.total_cents) AS faturamento_cents
           FROM venda v LEFT JOIN cliente c ON c.id=v.cliente_id
           WHERE v.deleted_at IS NULL AND v.data>=? AND v.data<?
           GROUP BY v.cliente_id ORDER BY faturamento_cents DESC LIMIT 20`,
          [from, to],
        ),
        db.query<CustoRow>(
          `SELECT i.nome AS insumo, h.data, h.custo_por_base, i.unidade_base AS unidade
           FROM historico_preco_insumo h JOIN insumo i ON i.id=h.insumo_id
           WHERE h.deleted_at IS NULL AND h.data>=? AND h.data<?
           ORDER BY h.data DESC, i.nome LIMIT 500`,
          [from, to],
        ),
      ])
      setResumo(summaryRows[0] ?? { vendas: 0, total_cents: 0, pagas_cents: 0, pendentes_cents: 0, lucro_cents: 0 })
      setProdutos(productRows)
      setClientes(customerRows)
      setCustos(costRows)
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    } finally {
      setCarregando(false)
    }
  }

  const tabelas: RelatorioTabela[] = [
    { nome: 'Resumo', colunas: ['Métrica', 'Valor'], linhas: resumo ? [
      ['Vendas', resumo.vendas], ['Faturamento', formatBRL(resumo.total_cents)],
      ['Recebido', formatBRL(resumo.pagas_cents)], ['A receber', formatBRL(resumo.pendentes_cents)],
      ['Lucro estimado', formatBRL(resumo.lucro_cents)],
    ] : [] },
    { nome: 'Lucro por produto', colunas: ['Produto', 'Unidades', 'Faturamento', 'Lucro estimado'],
      linhas: produtos.map((row) => [row.nome, row.unidades, formatBRL(row.faturamento_cents), formatBRL(row.lucro_cents)]) },
    { nome: 'Melhores clientes', colunas: ['Cliente', 'Vendas', 'Faturamento'],
      linhas: clientes.map((row) => [row.nome, row.vendas, formatBRL(row.faturamento_cents)]) },
    { nome: 'Histórico de custo de insumos', colunas: ['Insumo', 'Data', 'Custo por unidade-base', 'Unidade'],
      linhas: custos.map((row) => [row.insumo, formatBRDate(row.data), row.custo_por_base, row.unidade]) },
  ]

  const exportarCsv = () => {
    setExportando('csv')
    try {
      baixar(`mz-relatorios-${inicio}-${fim}.csv`, gerarCsv(tabelas), 'text/csv;charset=utf-8')
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    } finally {
      setExportando('')
    }
  }

  const exportarPdf = () => {
    setExportando('pdf')
    try {
      const lines = [
        `Relatórios MZ Gestão · ${inicio} a ${fim}`,
        ...(resumo ? [
          `Vendas: ${resumo.vendas}`, `Faturamento: ${formatBRL(resumo.total_cents)}`,
          `Recebido: ${formatBRL(resumo.pagas_cents)}`, `A receber: ${formatBRL(resumo.pendentes_cents)}`,
          `Lucro estimado: ${formatBRL(resumo.lucro_cents)}`,
        ] : ['Gere o relatório para visualizar resultados.']),
        '', 'Lucro por produto',
        ...produtos.map((row) => `${row.nome}: ${row.unidades} unidades · ${formatBRL(row.faturamento_cents)} · lucro ${formatBRL(row.lucro_cents)}`),
        '', 'Melhores clientes',
        ...clientes.map((row) => `${row.nome}: ${row.vendas} vendas · ${formatBRL(row.faturamento_cents)}`),
        '', 'Histórico de custo de insumos',
        ...custos.map((row) => `${row.insumo} · ${formatBRDate(row.data)} · ${formatBRL(row.custo_por_base)} por ${row.unidade}`),
      ]
      const pdf = criarPdf(lines.join('\n'))
      baixar(`mz-relatorios-${inicio}-${fim}.pdf`, new Uint8Array(pdf), 'application/pdf')
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    } finally {
      setExportando('')
    }
  }

  return (
    <>
      <Link className="back-link" to="/mais">‹ Mais</Link>
      <h1>Relatórios</h1>
      <p className="sb">Vendas, lucro estimado, clientes e evolução dos custos.</p>
      {erro && <p className="notice error" role="alert">{erro}</p>}
      <section className="cd">
        <div className="g">
          <SeletorData rotulo="De" id="relatorio.inicio" valor={inicio} onChange={setInicio} />
          <SeletorData rotulo="Até" id="relatorio.fim" valor={fim} onChange={setFim} />
        </div>
        <button className="bt" disabled={carregando} onClick={() => void consultar()} data-testid="relatorio.consultar">
          {carregando ? 'Consultando...' : 'Gerar relatório'}
        </button>
        {resumo && <>
          <div className="metric-grid">
            <div className="cd metric"><small>Vendas</small><b>{resumo.vendas}</b><span>no período</span></div>
            <div className="cd metric"><small>Faturamento</small><b>{formatBRL(resumo.total_cents)}</b><span>total</span></div>
            <div className="cd metric"><small>Lucro estimado</small><b>{formatBRL(resumo.lucro_cents)}</b><span>nas vendas</span></div>
            <div className="cd metric"><small>A receber</small><b>{formatBRL(resumo.pendentes_cents)}</b><span>pendente</span></div>
          </div>
          <div className="r"><button className="bt o" disabled={Boolean(exportando)} onClick={exportarCsv}>Exportar CSV</button>
            <button className="bt o" disabled={Boolean(exportando)} onClick={exportarPdf}>Exportar PDF</button></div>
        </>}
      </section>
      {resumo && <>
        <section className="cd"><h2>Lucro por produto</h2>
          {produtos.map((row) => <div className="r" key={row.nome}><span>{row.nome}<small>{row.unidades} unidades · vendas {formatBRL(row.faturamento_cents)}</small></span><b>{formatBRL(row.lucro_cents)}</b></div>)}
          {!produtos.length && <p className="notice">Não há vendas neste período.</p>}
        </section>
        <section className="cd"><h2>Melhores clientes</h2>
          {clientes.map((row) => <div className="r" key={row.nome}><span>{row.nome}<small>{row.vendas} vendas</small></span><b>{formatBRL(row.faturamento_cents)}</b></div>)}
          {!clientes.length && <p className="notice">Não há melhores clientes neste período</p>}
        </section>
        <section className="cd"><h2>Custo dos insumos</h2>
          {custos.map((row, index) => <div className="r" key={`${row.insumo}-${row.data}-${index}`}>
            <span>{row.insumo}<small>{formatBRDate(row.data)} · por {row.unidade}</small></span>
            <b>{formatBRL(row.custo_por_base)}</b>
          </div>)}
          {!custos.length && <p className="notice">Sem alterações de custo registradas.</p>}
        </section>
      </>}
    </>
  )
}
