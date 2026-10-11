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
export function criarPdf(texto: string): Uint8Array {
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
