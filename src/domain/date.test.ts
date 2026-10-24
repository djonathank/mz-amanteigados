import { describe, expect, it } from 'vitest'
import { formatBRDate, localDateAfterIso, localDateStartIso, localDateString } from './date'

describe('formatação de datas', () => {
  it('preserves calendar dates stored without a time', () => {
    expect(formatBRDate('2026-10-07')).toBe('07/10/2026')
  })

  it('formats calendar dates in the local timezone', () => {
    const date = new Date(2026, 0, 2, 1)
    expect(localDateString(date)).toBe('2026-01-02')
  })

  it('builds local report boundaries without adding a fixed 24-hour offset', () => {
    expect(localDateStartIso('2026-10-07')).toBe(new Date(2026, 9, 7).toISOString())
    expect(localDateAfterIso('2026-10-07')).toBe(new Date(2026, 9, 8).toISOString())
  })
})
