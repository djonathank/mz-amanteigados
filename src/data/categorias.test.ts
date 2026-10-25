import { describe, expect, it } from 'vitest'
import type { Db } from './db'
import {
  corCategoriaValida, excluirCategoriaFinanceira, listarCategoriasFinanceiras, salvarCategoriaFinanceira,
} from './categorias'

function fakeDb(rows: { id: string; nome: string; cor: string }[] = []) {
  const calls: { sql: string; params: unknown[] }[] = []
  const db: Db = {
    query: async <T,>(sql: string) => {
      if (sql.includes('lower(nome)=lower')) return [] as T[]
      if (sql.includes('SELECT id, nome FROM categoria_financeira')) {
        return [{ id: 'category-1', nome: 'Ingredientes' }] as T[]
      }
      return rows as T[]
    },
    run: async (sql, params = []) => { calls.push({ sql, params }) },
    transaction: async (operation) => operation(),
  }
  return { db, calls }
}

describe('financial categories', () => {
  it('rejects light colors and malformed color values', () => {
    expect(corCategoriaValida('#704214')).toBe(true)
    expect(corCategoriaValida('#ffffff')).toBe(false)
    expect(corCategoriaValida('#ffffaa')).toBe(false)
    expect(corCategoriaValida('brown')).toBe(false)
  })

  it('saves required category data and rejects special characters', async () => {
    const { db, calls } = fakeDb()
    await salvarCategoriaFinanceira(db, { nome: 'Ingredientes', cor: '#704214' })
    expect(calls[0].sql).toContain('INSERT INTO categoria_financeira')
    expect(calls[0].params.slice(1, 3)).toEqual(['Ingredientes', '#704214'])
    await expect(salvarCategoriaFinanceira(db, { nome: 'A& B', cor: '#704214' })).rejects.toThrow(/caracteres especiais/)
    await expect(salvarCategoriaFinanceira(db, { nome: 'A', cor: '#704214' })).rejects.toThrow(/2 a 60/)
    await expect(salvarCategoriaFinanceira(db, { nome: 'Vendas', cor: '#ffffff' })).rejects.toThrow(/contraste/)
  })

  it('sorts categories alphabetically', async () => {
    const { db } = fakeDb([
      { id: '2', nome: 'Vendas', cor: '#704214' },
      { id: '1', nome: 'Alimentos', cor: '#704214' },
    ])
    expect((await listarCategoriasFinanceiras(db)).map((category) => category.nome)).toEqual(['Alimentos', 'Vendas'])
  })

  it('soft deletes a category so sync can propagate its removal', async () => {
    const { db, calls } = fakeDb()
    await excluirCategoriaFinanceira(db, 'category-1')
    expect(calls[0].sql).toContain('UPDATE lancamento SET categoria')
    expect(calls[0].params[0]).toBe('Categoria excluída')
    expect(calls[0].params[2]).toBe('Ingredientes')
    expect(calls[1].sql).toContain('UPDATE categoria_financeira SET deleted_at')
    expect(calls[1].params[2]).toBe('category-1')
  })

  it('renames historical launch labels with a category rename', async () => {
    const { db, calls } = fakeDb()
    await salvarCategoriaFinanceira(db, { id: 'category-1', nome: 'Matéria prima', cor: '#704214' })
    expect(calls[0].sql).toContain('UPDATE lancamento SET categoria')
    expect(calls[0].params[0]).toBe('Matéria prima')
    expect(calls[0].params[2]).toBe('Ingredientes')
    expect(calls[1].sql).toContain('UPDATE categoria_financeira SET nome')
  })
})
