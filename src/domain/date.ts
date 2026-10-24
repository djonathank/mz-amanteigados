const SOMENTE_DATA = /^\d{4}-\d{2}-\d{2}$/

export const localDateString = (date = new Date()): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const localDateStartIso = (value: string): string => {
  if (!SOMENTE_DATA.test(value)) throw new Error('Data inválida.')
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).toISOString()
}

export const localDateAfterIso = (value: string): string => {
  if (!SOMENTE_DATA.test(value)) throw new Error('Data inválida.')
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day + 1).toISOString()
}

export const formatBRDate = (value: string): string => {
  const date = new Date(SOMENTE_DATA.test(value) ? `${value}T12:00:00` : value)
  return date.toLocaleDateString('pt-BR')
}
