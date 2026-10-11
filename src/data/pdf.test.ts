import { describe, expect, it } from 'vitest'
import { criarPdf } from './pdf'

describe('comprovante PDF', () => {
  it('creates a valid single-page PDF with escaped printable text', () => {
    const pdf = new TextDecoder().decode(criarPdf('MZ Gestão\nTotal: (R$ 12,50)'))

    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf).toContain('(MZ Gestao) Tj T*')
    expect(pdf).toContain('(Total: \\(R$ 12,50\\)) Tj T*')
    expect(pdf).toContain('/Count 1')
    expect(pdf.endsWith('%%EOF')).toBe(true)
    expect(pdf).toMatch(/startxref\n\d+\n%%EOF$/)
  })

  it('splits long receipts into pages', () => {
    const lines = Array.from({ length: 50 }, (_, index) => `Item ${index + 1}`).join('\n')
    const pdf = new TextDecoder().decode(criarPdf(lines))

    expect(pdf).toContain('/Count 2')
    expect((pdf.match(/\/Type \/Page\b/g) ?? [])).toHaveLength(2)
  })
})
