function pdfText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '')
}

function escaparPdf(texto: string): string {
  return pdfText(texto).replace(/([\\()])/g, '\\$1')
}

function linhaPdf(texto: string, largura = 76): string[] {
  const words = pdfText(texto).split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let atual = ''
  for (const word of words) {
    if (atual && `${atual} ${word}`.length > largura) {
      lines.push(atual)
      atual = word
    } else {
      atual = atual ? `${atual} ${word}` : word
    }
  }
  if (atual) lines.push(atual)
  return lines.length ? lines : ['']
}

/** Creates a small printable PDF using built-in Helvetica, with no network or font dependency. */
export interface DadosPdfComprovante {
  titulo: string
  data: string
  cliente?: string
  pagamento: string
  itens: { quantidade: number; nome: string; total: string }[]
  desconto?: string
  total: string
  rodape?: string
  logo?: { largura: number; altura: number; pixelsHex: string }
}

export interface DadosPdfRelatorio {
  inicio: string
  fim: string
  logo?: { largura: number; altura: number; pixelsHex: string }
  resumo: { label: string; valor: string }[]
  secoes: {
    titulo: string
    colunas: string[]
    linhas: string[][]
  }[]
}

function comandoTexto(texto: string, x: number, y: number, tamanho = 11, negrito = false) {
  const fonte = negrito ? 'F2' : 'F1'
  return `BT /${fonte} ${tamanho} Tf 1 0 0 1 ${x} ${y} Tm (${escaparPdf(texto)}) Tj ET`
}

function xAlinhadoDireita(texto: string, tamanho = 11, margemDireita = 547) {
  return Math.max(300, margemDireita - texto.length * tamanho * 0.55)
}

function criarPdfComprovante(dados: DadosPdfComprovante): Uint8Array {
  const comandos: string[] = [
    '0.42 0.16 0.08 rg 48 704 499 88 re f',
    dados.logo ? 'q 58 0 0 58 58 718 cm /Im3 Do Q' : '',
    '1 0.95 0.82 rg',
    comandoTexto(dados.titulo, dados.logo ? 132 : 72, 756, 19, true),
    comandoTexto('COMPROVANTE DE VENDA', dados.logo ? 132 : 72, 727, 10, true),
    comandoTexto(dados.data, 438, 756, 10),
    '0.62 0.45 0.30 RG 48 688 499 0 re S',
    '0.20 0.13 0.08 rg',
    comandoTexto(dados.cliente ? `Cliente: ${dados.cliente}` : 'Cliente nao informado', 48, 662, 10),
    comandoTexto(`Pagamento: ${dados.pagamento}`, 48, 642, 10),
    '0.42 0.16 0.08 rg 48 592 499 30 re f',
    '1 0.95 0.82 rg',
    comandoTexto('Item', 62, 603, 10, true),
    comandoTexto('Qtd.', 418, 603, 10, true),
    comandoTexto('Valor', 485, 603, 10, true),
  ]

  let y = 572
  comandos.push('0.20 0.13 0.08 rg')
  dados.itens.forEach((item) => {
    comandos.push(comandoTexto(nomeCurto(item.nome, 28), 62, y, 10))
    comandos.push(comandoTexto(`x ${item.quantidade}`, 418, y, 10))
    comandos.push(comandoTexto(item.total, 485, y, 10, true))
    y -= 26
  })

  y = Math.min(y - 4, 430)
  comandos.push('0.62 0.45 0.30 RG 48 ' + y + ' 499 0 re S')
  y -= 28
  if (dados.desconto) {
    comandos.push(comandoTexto('Desconto', 62, y, 11))
    comandos.push(comandoTexto(`- ${dados.desconto}`, 485, y, 11))
    y -= 24
  }
  const faixaTotalY = y - 8
  comandos.push('0.42 0.16 0.08 rg 48 ' + faixaTotalY + ' 499 52 re f')
  comandos.push('1 0.95 0.82 rg')
  comandos.push(comandoTexto('TOTAL', 62, y + 9, 12, true))
  comandos.push(comandoTexto(dados.total, xAlinhadoDireita(dados.total, 14), y + 9, 14, true))
  comandos.push('0.42 0.16 0.08 rg')
  comandos.push(comandoTexto(dados.rodape ?? 'Feito com amor!', 48, 110, 10, true))
  comandos.push(comandoTexto('MZ Bolachas da Maquiele', 48, 90, 9))

  const pageId = 3
  const streamId = 4
  const regularId = 5
  const boldId = 6
  const logoId = 7
  const objetos: string[] = []
  objetos[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objetos[2] = `<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`
  const stream = comandos.join('\n')
  const xobject = dados.logo ? `/XObject << /Im3 ${logoId} 0 R >>` : ''
  objetos[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${regularId} 0 R /F2 ${boldId} 0 R >> ${xobject} >> /Contents ${streamId} 0 R >>`
  objetos[streamId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  objetos[regularId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  objetos[boldId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  if (dados.logo) {
    objetos[logoId] = `<< /Type /XObject /Subtype /Image /Width ${dados.logo.largura} /Height ${dados.logo.altura} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${dados.logo.pixelsHex.length + 1} >>\nstream\n${dados.logo.pixelsHex}>\nendstream`
  }
  return montarPdf(objetos)
}

function nomeCurto(nome: string, limite: number) {
  return nome.length > limite ? `${nome.slice(0, limite)}...` : nome
}

function criarPdfRelatorio(dados: DadosPdfRelatorio): Uint8Array {
  const comandos: string[] = [
    '0.42 0.16 0.08 rg 0 758 595 84 re f',
    dados.logo ? 'q 54 0 0 54 32 772 cm /Im3 Do Q' : '1 1 1 rg 32 775 50 50 re f',
    dados.logo ? '' : '0.42 0.16 0.08 rg',
    dados.logo ? '' : comandoTexto('MZ', 43, 792, 17, true),
    '1 0.95 0.82 rg',
    comandoTexto('MZ GESTAO', 96, 812, 15, true),
    comandoTexto('RELATORIO DE DESEMPENHO', 96, 790, 10, true),
    comandoTexto(`${dados.inicio} a ${dados.fim}`, 436, 800, 10),
  ]

  let y = 730
  comandos.push('0.42 0.16 0.08 rg')
  comandos.push(comandoTexto('RESUMO DO PERIODO', 48, y, 12, true))
  y -= 18
  const largura = 120
  dados.resumo.forEach((item, index) => {
    const x = 48 + (index % 4) * 128
    const linha = Math.floor(index / 4)
    const cardY = y - linha * 70
    comandos.push('0.96 0.94 0.89 rg', `${x} ${cardY - 40} ${largura} 52 re f`)
    comandos.push('0.62 0.45 0.30 RG', `${x} ${cardY - 40} ${largura} 52 re S`)
    comandos.push('0.42 0.16 0.08 rg')
    comandos.push(comandoTexto(nomeCurto(item.label, 18), x + 9, cardY - 2, 8, true))
    comandos.push(comandoTexto(nomeCurto(item.valor, 18), x + 9, cardY - 24, 11, true))
  })
  const linhasResumo = Math.ceil(dados.resumo.length / 4)
  y -= 48 + Math.max(0, linhasResumo - 1) * 70 + 24

  dados.secoes.forEach((secao) => {
    if (y < 150) {
      comandos.push('0.42 0.16 0.08 rg')
      comandos.push(comandoTexto('MZ Gestao', 48, 55, 9, true))
      y = 730
    }
    comandos.push('0.42 0.16 0.08 rg')
    comandos.push(comandoTexto(secao.titulo, 48, y, 12, true))
    y -= 18

    const colunas = secao.colunas.length
    const larguraColuna = colunas ? 499 / colunas : 499
    comandos.push('0.42 0.16 0.08 rg 48 ' + (y - 9) + ' 499 24 re f')
    comandos.push('1 0.95 0.82 rg')
    secao.colunas.forEach((coluna, index) => {
      comandos.push(comandoTexto(nomeCurto(coluna, 22), 56 + index * larguraColuna, y, 8, true))
    })
    y -= 30

    if (!secao.linhas.length) {
      comandos.push('0.20 0.13 0.08 rg')
      comandos.push(comandoTexto('Sem registros neste periodo.', 48, y, 9))
      y -= 30
      return
    }

    secao.linhas.forEach((linha, linhaIndex) => {
      if (y < 80) return
      if ((linhaIndex % 2) === 1) comandos.push('0.97 0.96 0.93 rg 48 ' + (y - 8) + ' 499 22 re f')
      comandos.push('0.20 0.13 0.08 rg')
      linha.forEach((valor, index) => {
        comandos.push(comandoTexto(nomeCurto(valor, 22), 56 + index * larguraColuna, y, 8, index === 0))
      })
      y -= 22
    })
    y -= 18
  })

  comandos.push('0.62 0.45 0.30 RG 48 44 499 0 re S')
  comandos.push('0.42 0.16 0.08 rg')
  comandos.push(comandoTexto('Gerado por MZ Gestao', 48, 28, 8, true))

  const pageId = 3
  const streamId = 4
  const regularId = 5
  const boldId = 6
  const logoId = 7
  const objetos: string[] = []
  objetos[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objetos[2] = `<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`
  const stream = comandos.join('\n')
  const xobject = dados.logo ? `/XObject << /Im3 ${logoId} 0 R >>` : ''
  objetos[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${regularId} 0 R /F2 ${boldId} 0 R >> ${xobject} >> /Contents ${streamId} 0 R >>`
  objetos[streamId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  objetos[regularId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  objetos[boldId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  if (dados.logo) {
    objetos[logoId] = `<< /Type /XObject /Subtype /Image /Width ${dados.logo.largura} /Height ${dados.logo.altura} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${dados.logo.pixelsHex.length + 1} >>\nstream\n${dados.logo.pixelsHex}>\nendstream`
  }
  return montarPdf(objetos)
}

function montarPdf(objetos: string[]): Uint8Array {
  let documento = '%PDF-1.4\n'
  const offsets = [0]
  for (let id = 1; id < objetos.length; id++) {
    offsets[id] = documento.length
    documento += `${id} 0 obj\n${objetos[id]}\nendobj\n`
  }
  const xref = documento.length
  documento += `xref\n0 ${objetos.length}\n0000000000 65535 f \n`
  for (let id = 1; id < objetos.length; id++) documento += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  documento += `trailer\n<< /Size ${objetos.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new TextEncoder().encode(documento)
}

export function criarPdf(texto: string | DadosPdfComprovante | DadosPdfRelatorio): Uint8Array {
  if (typeof texto === 'object' && 'resumo' in texto && 'secoes' in texto) return criarPdfRelatorio(texto)
  if (typeof texto !== 'string') return criarPdfComprovante(texto)
  const linhas = texto.split(/\r?\n/).flatMap((linha) => linhaPdf(linha))
  const paginas: string[][] = []
  for (let i = 0; i < linhas.length; i += 48) paginas.push(linhas.slice(i, i + 48))
  if (!paginas.length) paginas.push([''])

  const pageIds = paginas.map((_, index) => 3 + index * 2)
  const fontId = 3 + paginas.length * 2
  const objetos: string[] = []
  objetos[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objetos[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${paginas.length} >>`

  paginas.forEach((pagina, index) => {
    const pageId = pageIds[index]
    const streamId = pageId + 1
    const commands = [
      'BT',
      '/F1 11 Tf',
      '48 790 Td',
      '14 TL',
      ...pagina.map((linha) => `(${escaparPdf(linha)}) Tj T*`),
      'ET',
    ].join('\n')
    objetos[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${streamId} 0 R >>`
    objetos[streamId] = `<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`
  })
  objetos[fontId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'

  let documento = '%PDF-1.4\n'
  const offsets = [0]
  for (let id = 1; id < objetos.length; id++) {
    offsets[id] = documento.length
    documento += `${id} 0 obj\n${objetos[id]}\nendobj\n`
  }
  const xref = documento.length
  documento += `xref\n0 ${objetos.length}\n0000000000 65535 f \n`
  for (let id = 1; id < objetos.length; id++) documento += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  documento += `trailer\n<< /Size ${objetos.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new TextEncoder().encode(documento)
}
