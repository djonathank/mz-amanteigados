import { describe, expect, it } from 'vitest'
import type { Db } from './db'
import { salvarCliente, salvarEncomenda, salvarFornecedor } from './phase3'

describe('salvarFornecedor', () => {
  it('persists the supplier address on create and edit', async () => {
    const calls: { sql: string; params: unknown[] }[] = []
    const db: Db = {
      query: async <T,>(sql: string) =>
        (sql.includes('SELECT id FROM fornecedor') ? [{ id: 'supplier-1' }] : []) as T[],
      run: async (sql, params = []) => { calls.push({ sql, params }) },
      transaction: async (operation) => operation(),
    }
    const supplier = {
      nome: 'ANA SOUZA',
      contato: '11999999999',
      endereco: 'Rua das Flores 100',
      observacoes: '',
    }

    await salvarFornecedor(db, supplier)
    await salvarFornecedor(db, { ...supplier, id: 'supplier-1' })

    expect(calls[0].sql).toContain('(id, nome, contato, endereco, observacoes')
    expect(calls[0].params).toContain(supplier.endereco)
    expect(calls[0].params[1]).toBe('Ana souza')
    expect(calls[0].params[2]).toBe('(11) 99999-9999')
    expect(calls[1].sql).toContain('contato=?, endereco=?, observacoes=?')
    expect(calls[1].params).toContain(supplier.endereco)
    expect(calls[1].params[0]).toBe('Ana souza')
  })

  it('normalizes the customer name when creating and editing', async () => {
    const calls: { sql: string; params: unknown[] }[] = []
    const db: Db = {
      query: async <T,>(sql: string) =>
        (sql.includes('SELECT id FROM cliente') ? [{ id: 'customer-1' }] : []) as T[],
      run: async (sql, params = []) => { calls.push({ sql, params }) },
      transaction: async (operation) => operation(),
    }
    const customer = {
      nome: 'ana souza',
      whatsapp: '1199999999',
      endereco: null,
      aniversario: null,
      observacoes: null,
    }

    await salvarCliente(db, customer)
    await salvarCliente(db, { ...customer, id: 'customer-1', nome: 'ANA SOUZA' })

    expect(calls[0].params[1]).toBe('Ana souza')
    expect(calls[0].params[2]).toBe('(11) 9999-9999')
    expect(calls[1].params[0]).toBe('Ana souza')
  })

  it('rejects invalid customer phone numbers, special characters, and future birth dates', async () => {
    const db: Db = {
      query: async () => [],
      run: async () => {},
      transaction: async (operation) => operation(),
    }
    const customer = {
      nome: 'Ana Souza',
      whatsapp: '123456789',
      endereco: '',
      aniversario: '',
      observacoes: '',
    }
    await expect(salvarCliente(db, customer)).rejects.toThrow(/10 a 11 números/)
    await expect(salvarCliente(db, { ...customer, whatsapp: '11999999999', nome: 'Ana-Souza' })).rejects.toThrow(/caracteres especiais/)
    await expect(salvarCliente(db, { ...customer, whatsapp: '11999999999', aniversario: '2099-01-01' })).rejects.toThrow(/anterior a hoje/)
    await expect(salvarCliente(db, { ...customer, whatsapp: '11999999999', endereco: 'Rua A, 12' })).rejects.toThrow(/caracteres especiais/)
  })

  describe('salvarEncomenda', () => {
    it('creates an order without a deposit field or a deposit payment', async () => {
      const calls: { sql: string; params: unknown[] }[] = []
      const db: Db = {
        query: async () => [],
        run: async (sql, params = []) => { calls.push({ sql, params }) },
        transaction: async (operation) => operation(),
        clearData: async () => {},
      }

      await salvarEncomenda(db, {
        dataEntrega: '2026-11-01',
        itens: [{ varianteId: 'variant-1', quantidade: 2, precoUnitCents: 1500 }],
      })

      const orderInsert = calls.find(({ sql }) => sql.includes('INSERT INTO encomenda'))
      expect(orderInsert?.sql).not.toContain('sinal_cents')
      expect(calls.some(({ sql, params }) => sql.includes('INSERT INTO lancamento') && params.includes('Sinal de encomenda'))).toBe(false)
      expect(calls.some(({ sql, params }) => sql.includes('INSERT INTO lancamento') && params.includes(3000))).toBe(true)
    })
  })
})
