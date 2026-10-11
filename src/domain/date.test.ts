import { describe, expect, it } from 'vitest'
import { formatBRDate } from './date'

describe('formatação de datas', () => {
  it('preserves calendar dates stored without a time', () => {
    expect(formatBRDate('2026-10-07')).toBe('07/10/2026')
  })
})
