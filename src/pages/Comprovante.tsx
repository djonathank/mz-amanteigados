import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { criarPdf } from '../data/pdf'
import { useDb } from '../data/DbContext'
import { buscarVenda } from '../data/repos'
import { formatBRL } from '../domain/money'
import { formatBRDate } from '../domain/date'
import { FecharModal } from './ui'

type Dados = Awaited<ReturnType<typeof buscarVenda>>

const nomeProdutoComprovante = (nome: string) => nome.trim().length > 28 ? `${nome.trim().slice(0, 28)}...` : nome.trim()
const formaPagamentoComprovante: Record<string, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  cartao_debito: 'Cartão de Débito',
  cartao_credito: 'Cartão de Crédito',
}

async function carregarLogoPdf() {
  const imagem = new Image()
  imagem.src = `${import.meta.env.BASE_URL}assets/logoapp.jpeg`
  await imagem.decode()
  const canvas = document.createElement('canvas')
  const largura = 96
  canvas.width = largura
  canvas.height = largura
  const contexto = canvas.getContext('2d', { willReadFrequently: true })
  if (!contexto) return undefined
  contexto.drawImage(imagem, 0, 0, largura, largura)
  const { data } = contexto.getImageData(0, 0, largura, largura)
  let pixelsHex = ''
  for (let index = 0; index < data.length; index += 4) {
    pixelsHex += data[index].toString(16).padStart(2, '0')
    pixelsHex += data[index + 1].toString(16).padStart(2, '0')
    pixelsHex += data[index + 2].toString(16).padStart(2, '0')
  }
  return { largura, altura: largura, pixelsHex }
}

export default function Comprovante() {
  const db = useDb()
  const { id = '' } = useParams()
  const [d, setD] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [opcoesPdf, setOpcoesPdf] = useState(false)
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
    ...d.itens.map((i) => `${i.quantidade}× ${nomeProdutoComprovante(i.nome)}: ${formatBRL(i.quantidade * i.preco_unit_cents)}`),
    ...(d.venda.desconto_cents ? [`Desconto: ${formatBRL(d.venda.desconto_cents)}`] : []),
    `Total: ${formatBRL(d.venda.total_cents)} (${d.venda.forma_pagamento})`, 'Feito com amor!',
  ].join('\n')
  const tituloComprovante = `Comprovante MZ - ${d.venda.cliente_nome || 'Cliente não informado'} - ${formatBRDate(d.venda.data)}`
  const nomeArquivoComprovante = `Comprovante MZ - ${d.venda.cliente_nome || 'Cliente não informado'} - ${formatBRDate(d.venda.data).replaceAll('/', '-')}.pdf`
  const compartilharPdf = async () => {
    setErro('')
    try {
      const arq = await criarArquivoPdf()
      if (navigator.canShare?.({ files: [arq] }) && navigator.share) {
        await navigator.share({ files: [arq], title: tituloComprovante })
      } else {
        throw new Error('O compartilhamento de arquivos não está disponível neste aparelho.')
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  const criarArquivoPdf = async () => {
    const logo = await carregarLogoPdf()
    const pdf = criarPdf({
      titulo: 'MZ Bolachas da Maquiele',
      data: formatBRDate(d.venda.data),
      cliente: d.venda.cliente_nome ?? undefined,
      pagamento: formaPagamentoComprovante[d.venda.forma_pagamento] ?? d.venda.forma_pagamento,
      itens: d.itens.map((item) => ({
        quantidade: item.quantidade,
        nome: nomeProdutoComprovante(item.nome),
        total: formatBRL(item.quantidade * item.preco_unit_cents),
      })),
      desconto: d.venda.desconto_cents > 0 ? formatBRL(d.venda.desconto_cents) : undefined,
      total: formatBRL(d.venda.total_cents),
      rodape: 'Feito com amor!',
      logo,
    })
    const buffer = new ArrayBuffer(pdf.byteLength)
    new Uint8Array(buffer).set(pdf)
    return new File([buffer], nomeArquivoComprovante, { type: 'application/pdf' })
  }

  const salvarPdf = async () => {
    setErro('')
    try {
      const arq = await criarArquivoPdf()
      const url = URL.createObjectURL(arq)
      const link = document.createElement('a')
      link.href = url
      link.download = arq.name
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <h1>Comprovante</h1>
      <p className="sb">Resumo da venda · {formatBRDate(d.venda.data)}</p>
      <div className="hero" style={{ textAlign: 'center' }}>
        <img className="receipt-logo" src="/assets/logoapp.jpeg" alt="MZ Bolachas da Maquiele" />
        <small>Venda concluída</small><b data-testid="comprovante.total">{formatBRL(d.venda.total_cents)}</b>
        <small>Pagamento: {formaPagamentoComprovante[d.venda.forma_pagamento] ?? d.venda.forma_pagamento}</small>
        {d.venda.cliente_nome && <small>Cliente: {d.venda.cliente_nome}</small>}
      </div>
      <div className="cd receipt-content">
        <h2>Itens</h2>
        <div className="receipt-items-header" aria-hidden="true"><span>Produto</span><span>Qtd.</span><span>Valor</span></div>
        {d.itens.map((i, n) => <div className="r receipt-item" key={n}>
          <div className="receipt-item-name" title={i.nome}>{i.quantidade}× {nomeProdutoComprovante(i.nome)}</div>
          <b className="receipt-item-total">{formatBRL(i.quantidade * i.preco_unit_cents)}</b>
        </div>)}
        {d.venda.desconto_cents > 0 && <div className="r receipt-summary-row"><div>Desconto</div><b>-{formatBRL(d.venda.desconto_cents)}</b></div>}
        <div className="r receipt-total-row"><div>Total</div><b>{formatBRL(d.venda.total_cents)}</b></div>
      </div>
      <div className="cd internal-summary"><div className="r"><div>Lucro estimado (interno)</div><b>{formatBRL(lucro)}</b></div></div>
      <button className="bt" data-testid="comprovante.salvar-compartilhar" onClick={() => setOpcoesPdf(true)}>Salvar/Compartilhar</button>
      {erro && <p className="notice error" role="alert">{erro}</p>}
      <p className="receipt-note">O comprovante compartilhado não inclui dados internos de custo ou lucro.</p>
      {opcoesPdf && <div className="alert-overlay">
        <section className="alert-dialog" role="alertdialog" aria-modal="true" aria-labelledby="comprovante-opcoes-title">
          <FecharModal onClick={() => setOpcoesPdf(false)} />
          <h2 id="comprovante-opcoes-title">Comprovante PDF</h2>
          <p>Escolha como deseja usar o comprovante.</p>
          <div className="alert-actions">
            <button className="bt o" type="button" onClick={() => { setOpcoesPdf(false); void salvarPdf() }}>Salvar</button>
            <button className="bt" type="button" onClick={() => { setOpcoesPdf(false); void compartilharPdf() }}>Compartilhar</button>
          </div>
          <button className="bt o" type="button" onClick={() => setOpcoesPdf(false)}>Cancelar</button>
        </section>
      </div>}
    </>
  )
}
