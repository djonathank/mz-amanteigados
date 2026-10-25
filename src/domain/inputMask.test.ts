import { describe, expect, it } from 'vitest'
import { filtrarEntradaNumerica, filtrarNumeroSemMascara, formatarNumeroMascarado, limitarDigitos, normalizarDinheiroInterativo, normalizarNumeroDigitado } from './inputMask'

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

  it('filters movement and stock minimum input to valid numeric characters', () => {
    expect(filtrarEntradaNumerica('-2,5abc!', { negativo: true })).toBe('-2.5')
    expect(filtrarEntradaNumerica('--2-.5', { negativo: true })).toBe('-2.5')
    expect(filtrarEntradaNumerica('1.2,3', { decimal: true })).toBe('1.23')
    expect(filtrarEntradaNumerica('1.2,3', { decimal: false })).toBe('123')
    expect(filtrarEntradaNumerica('-2', { negativo: false })).toBe('2')
  })

  it('keeps large stock and quantity values unmasked and limited to ten digits', () => {
    expect(filtrarNumeroSemMascara('14000')).toBe('14000')
    expect(filtrarNumeroSemMascara('12345678901')).toBe('1234567890')
    expect(filtrarNumeroSemMascara('1234567890.5')).toBe('1234567890')
    expect(filtrarNumeroSemMascara('12,5')).toBe('12.5')
    expect(filtrarNumeroSemMascara('14.000', false)).toBe('14000')
    expect(filtrarNumeroSemMascara('-12', false)).toBe('12')
  })

  it('limits numeric input by digit count without counting mask punctuation', () => {
    expect(limitarDigitos('1.234.567.890,12%', 10)).toBe('1.234.567.890,%')
    expect(limitarDigitos('12345678901', 10)).toBe('1234567890')
  })

  it('formats currency and percent while keeping quantities unit-free', () => {
    expect(formatarNumeroMascarado('1234.5', 'dinheiro', false)).toBe('R$\u00a01.234,50')
    expect(formatarNumeroMascarado('12.5', 'percentual', true)).toBe('12,5%')
    expect(formatarNumeroMascarado('1250.25', 'quantidade', true)).toBe('1.250,25')
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

  it('inserts thousands separators while quantity is being typed', () => {
    expect(formatarNumeroMascarado('1000', 'quantidade', true)).toBe('1.000')
    expect(formatarNumeroMascarado('1000', 'quantidade', false)).toBe('1.000')
  })
})
