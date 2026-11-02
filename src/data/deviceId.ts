const STORAGE_KEY = 'mz-gestao-device-id'

export function obterIdDispositivo(): string {
  let id = localStorage.getItem(STORAGE_KEY)?.trim()
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(STORAGE_KEY, id)
  }
  return id
}
