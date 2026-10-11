/** Contrato de acesso a dados. O adaptador SQLite (Capacitor) implementa esta interface. */
export interface Repository<T extends { id: string }> {
  list(): Promise<T[]>
  get(id: string): Promise<T | undefined>
  save(item: T): Promise<void>
  remove(id: string): Promise<void> // no SQLite: exclusão lógica (deleted_at)
}

/** Implementação em memória, para desenvolvimento e testes. */
export class MemoryRepository<T extends { id: string }> implements Repository<T> {
  private items = new Map<string, T>()
  async list() { return [...this.items.values()] }
  async get(id: string) { return this.items.get(id) }
  async save(item: T) { this.items.set(item.id, item) }
  async remove(id: string) { this.items.delete(id) }
}
