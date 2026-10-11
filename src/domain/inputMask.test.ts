import { describe, expect, it } from 'vitest'
import { formatarNumeroMascarado, normalizarDinheiroInterativo, normalizarNumeroDigitado } from './inputMask'

describe('máscaras de campos numéricos', () => {
  it('normalizes Brazilian and international decimal input to the stored format', () => {
    expect(normalizarNumeroDigitado('R$\u00a01.234,56', 'dinheiro')).toBe('1234.56')
    expect(normalizarNumeroDigitado('R$\u00a01.000', 'dinheiro')).toBe('1000')
    expect(normalizarNumeroDigitado('1.250', 'quantidade')).toBe('1250')
    expect(normalizarNumeroDigitado('1,25', 'quantidade')).toBe('1.25')
    expect(normalizarNumeroDigitado('1.234,5%', 'percentual')).toBe('1234.5')
  })

  it('limits money, percentage, and integer precision', () => {
    expect(normalizarNumeroDigitado('12,345', 'dinheiro')).toBe('12.34')
    expect(normalizarNumeroDigitado('12,345', 'percentual')).toBe('12.34')
    expect(normalizarNumeroDigitado('12,9', 'inteiro')).toBe('12')
  })

  it('formats currency and percent while keeping quantities unit-free', () => {
    expect(formatarNumeroMascarado('1234.5', 'dinheiro', false)).toBe('R$\u00a01.234,50')
    expect(formatarNumeroMascarado('12.5', 'percentual', true)).toBe('12,5%')
    expect(formatarNumeroMascarado('1250.25', 'quantidade', true)).toBe('1250,25')
  })

  it('preserves a decimal separator while the user is still typing', () => {
    expect(formatarNumeroMascarado('12.', 'dinheiro', true)).toBe('R$\u00a012,')
  })

  it('turns successive money keystrokes into cents', () => {
    expect(normalizarDinheiroInterativo('1')).toBe('0.01')
    expect(normalizarDinheiroInterativo('12')).toBe('0.12')
    expect(normalizarDinheiroInterativo('123')).toBe('1.23')
    expect(formatarNumeroMascarado(normalizarDinheiroInterativo('123'), 'dinheiro', true)).toBe('R$\u00a01,23')
  })

  it('supports clearing money and returning to zero while deleting', () => {
    expect(normalizarDinheiroInterativo('')).toBe('')
    expect(normalizarDinheiroInterativo('R$\u00a00,0')).toBe('0.00')
    expect(normalizarDinheiroInterativo('R$\u00a00,00')).toBe('0.00')
  })

  it('does not insert thousands separators while quantity is being typed', () => {
    expect(formatarNumeroMascarado('1000', 'quantidade', true)).toBe('1000')
    expect(formatarNumeroMascarado('1000', 'quantidade', false)).toBe('1.000')
  })
})
