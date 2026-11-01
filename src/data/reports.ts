export interface RelatorioTabela {
  nome: string
  colunas: string[]
  linhas: (string | number)[][]
}

export interface CabecalhoCsv {
  titulo?: string
  periodo?: string
}

export function gerarCsv(tabelas: RelatorioTabela[], cabecalho?: CabecalhoCsv): string {
  const cabecalhoCsv = cabecalho ? [
    csvCell(cabecalho.titulo ?? 'MZ Gestão'),
    csvCell('RELATÓRIO DE DESEMPENHO'),
    ...(cabecalho.periodo ? [`${csvCell('PERÍODO')};${csvCell(cabecalho.periodo)}`] : []),
    '',
  ].join('\r\n') : ''
  const corpo = tabelas.map((table) => [
    csvCell(table.nome.toUpperCase()),
    ...(table.colunas.length ? [table.colunas.map(csvCell).join(';')] : []),
    ...table.linhas.map((row) => row.map(csvCell).join(';')),
  ].join('\r\n')).join('\r\n\r\n')
  return `\uFEFF${[cabecalhoCsv, corpo].filter(Boolean).join('\r\n\r\n')}`
}

function csvCell(value: string | number): string {
  let text = String(value)
  if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}
