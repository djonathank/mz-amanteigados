export interface RelatorioTabela {
  nome: string
  colunas: string[]
  linhas: (string | number)[][]
}

export function gerarCsv(tabelas: RelatorioTabela[]): string {
  return `\uFEFF${tabelas.map((table) => [
    csvCell(table.nome),
    table.colunas.map(csvCell).join(';'),
    ...table.linhas.map((row) => row.map(csvCell).join(';')),
  ].join('\r\n')).join('\r\n\r\n')}`
}

function csvCell(value: string | number): string {
  let text = String(value)
  if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}
