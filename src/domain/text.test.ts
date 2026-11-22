import { describe, expect, it } from 'vitest'
import { formatarTelefone } from './text'

describe('formatarTelefone', () => {
  it('formats 11 phone digits with DDD and ninth digit', () => {
    expect(formatarTelefone('54991977385')).toBe('(54) 99197-7385')
  })

  it('limits phone numbers to 11 digits', () => {
    expect(formatarTelefone('549919773851234')).toBe('(54) 99197-7385')
  })

  it('formats 8-digit mobile numbers beginning with 9 as a ninth-digit number', () => {
    expect(formatarTelefone('5491234567')).toBe('(54) 91234-567')
  })

  it('keeps 8-digit landline numbers in the 4-4 format', () => {
    expect(formatarTelefone('5432345678')).toBe('(54) 3234-5678')
  })
})
