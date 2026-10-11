import { describe, expect, it } from 'vitest'
import { gerarCsv } from './reports'

describe('CSV reports', () => {
  it('quotes values and neutralizes spreadsheet formulas', () => {
    const csv = gerarCsv([{
      nome: 'Clientes', colunas: ['Nome', 'Total'],
      linhas: [['=HYPERLINK("https://example.invalid")', 1250]],
    }])
    expect(csv).toContain(`"'=HYPERLINK(""https://example.invalid"")"`)
    expect(csv).toContain('"1250"')
    expect(csv.charCodeAt(0)).toBe(0xFEFF)
  })
})
