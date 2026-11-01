import { describe, expect, it } from 'vitest'
import { formatarTelefone } from './text'

describe('formatarTelefone', () => {
  it('formats 11 phone digits with DDD and ninth digit', () => {
    expect(formatarTelefone('54991977385')).toBe('(54) 99197-7385')
  })

  it('limits phone numbers to 11 digits', () => {
    expect(formatarTelefone('549919773851234')).toBe('(54) 99197-7385')
  })
})
