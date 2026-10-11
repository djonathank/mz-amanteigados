import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { criarPdf } from '../data/pdf'
import { useDb } from '../data/DbContext'
import { buscarVenda } from '../data/repos'
import { formatBRL } from '../domain/money'
import { formatBRDate } from '../domain/date'

type Dados = Awaited<ReturnType<typeof buscarVenda>>

export default function Comprovante() {
  const db = useDb()
  const { id = '' } = useParams()
  const [d, setD] = useState<Dados | null>(null)
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  useEffect(() => {
    let ativo = true
    setCarregando(true)
    void buscarVenda(db, id).then((dados) => {
      if (ativo) setD(dados)
    }).catch((e) => {
      if (ativo) setErro(e instanceof Error ? e.message : String(e))
    }).finally(() => {
      if (ativo) setCarregando(false)
    })
    return () => { ativo = false }
  }, [db, id])
  if (!d?.venda) {
    return (
      <>
        <h1>Comprovante</h1>
        {carregando
          ? <p className="notice" role="status">Carregando comprovante...</p>
          : erro
            ? <p className="notice error" role="alert">{erro}</p>
            : <p className="notice">Venda não encontrada.</p>}
        <Link className="bt o" to="/vender">Voltar para vendas</Link>
      </>
    )
  }

  const lucro = d.itens.reduce((s, i) => s + i.quantidade * (i.preco_unit_cents - i.custo_unit_cents), 0)
    - d.venda.desconto_cents
  const texto = [
    'MZ Bolachas da Maquiele', formatBRDate(d.venda.data),
    ...(d.venda.cliente_nome ? [`Cliente: ${d.venda.cliente_nome}`] : []),
    ...d.itens.map((i) => `${i.quantidade}× ${i.nome}: ${formatBRL(i.quantidade * i.preco_unit_cents)}`),
    ...(d.venda.desconto_cents ? [`Desconto: ${formatBRL(d.venda.desconto_cents)}`] : []),
    `Total: ${formatBRL(d.venda.total_cents)} (${d.venda.forma_pagamento})`, 'Feito com amor!',
  ].join('\n')
  const compartilhar = async () => {
    setErro('')
    try {
      if (navigator.share) await navigator.share({ text: texto })
      else if (navigator.clipboard) await navigator.clipboard.writeText(texto)
      else throw new Error('Este navegador não oferece compartilhamento nem acesso à área de transferência.')
      setMsg('Comprovante compartilhado.')
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  const baixarPdf = async () => {
    setErro('')
    try {
      const pdf = criarPdf(texto)
      const buffer = new ArrayBuffer(pdf.byteLength)
      new Uint8Array(buffer).set(pdf)
      const arq = new File([buffer], `comprovante-mz-${id.slice(0, 8)}.pdf`, { type: 'application/pdf' })
      if (navigator.canShare?.({ files: [arq] }) && navigator.share) {
        await navigator.share({ files: [arq], title: 'Comprovante MZ Gestão' })
        setMsg('Comprovante PDF compartilhado.')
        return
      }
      const url = URL.createObjectURL(arq)
      const link = document.createElement('a')
      link.href = url
      link.download = arq.name
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMsg('Comprovante PDF baixado.')
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <h1>Comprovante</h1>
      <p className="sb">Resumo da venda · {formatBRDate(d.venda.data)}</p>
      <div className="hero" style={{ textAlign: 'center' }}>
        <small>Venda concluída</small><b data-testid="comprovante.total">{formatBRL(d.venda.total_cents)}</b>
        <small>Pagamento: {d.venda.forma_pagamento}</small>
        {d.venda.cliente_nome && <small>Cliente: {d.venda.cliente_nome}</small>}
      </div>
      <div className="cd receipt-content">
        <h2>Itens</h2>
        {d.itens.map((i, n) => <div className="r" key={n}><div>{i.quantidade}× {i.nome}</div><b>{formatBRL(i.quantidade * i.preco_unit_cents)}</b></div>)}
        {d.venda.desconto_cents > 0 && <div className="r"><div>Desconto</div><b>-{formatBRL(d.venda.desconto_cents)}</b></div>}
        <div className="r"><div>Total</div><b>{formatBRL(d.venda.total_cents)}</b></div>
      </div>
      <div className="cd internal-summary"><div className="r"><div>Lucro estimado (interno)</div><b>{formatBRL(lucro)}</b></div></div>
      <button className="bt" data-testid="comprovante.compartilhar" onClick={compartilhar}>Compartilhar comprovante</button>
      <button className="bt o" data-testid="comprovante.pdf" onClick={baixarPdf}>Salvar / compartilhar PDF</button>
      {erro && <p className="notice error" role="alert">{erro}</p>}
      {msg && <p className="notice success" role="status">{msg}</p>}
      <Link className="bt o" to="/vender">Nova venda</Link>
      <p className="receipt-note">O comprovante compartilhado não inclui dados internos de custo ou lucro.</p>
    </>
  )
}
