const SOMENTE_DATA = /^\d{4}-\d{2}-\d{2}$/

export const formatBRDate = (value: string): string => {
  const date = new Date(SOMENTE_DATA.test(value) ? `${value}T12:00:00` : value)
  return date.toLocaleDateString('pt-BR')
}
