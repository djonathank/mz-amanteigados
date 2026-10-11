import { describe, expect, it } from 'vitest'
import { custoDaVariante, type Base } from './calculos'

describe('custos de variantes', () => {
  it('uses millilitres from a liquid recipe as the package amount', () => {
    const base: Base = {
      insumos: [
        { id: 'water', nome: 'Base líquida', tipo: 'ingrediente', unidade_base: 'ml', unidade_compra: 'l', fator_compra: 1000, custo_medio: 0.2 },
        { id: 'package', nome: 'Embalagem', tipo: 'embalagem', unidade_base: 'un', unidade_compra: 'un', fator_compra: 1, custo_medio: 25 },
      ],
      receitas: [
        { id: 'recipe', nome: 'Xarope', rendimento_qtd: 1000, rendimento_unidade: 'ml', perda_pct: 0, tempo_min: 0, modo_preparo: null, passos_preparo: null },
      ],
      itens: [{ id: 'item', receita_id: 'recipe', insumo_id: 'water', subreceita_id: null, quantidade_base: 1000 }],
      variantes: [],
      config: {},
    }
    const variante = {
      id: 'variant', produto_id: 'product', produto_nome: 'Xarope', receita_id: 'recipe',
      nome: '250 ml', peso_g: null, volume_ml: 250, unidades_por_pacote: 1,
      embalagem_insumo_id: 'package', rotulo_insumo_id: null, preco_cents: 100,
    }

    expect(custoDaVariante(variante, base)).toBe(75)
  })

  it('keeps liquid quantities from backups created before the volume column', () => {
    const base: Base = {
      insumos: [{ id: 'base', nome: 'Base', tipo: 'ingrediente', unidade_base: 'ml', unidade_compra: 'ml', fator_compra: 1, custo_medio: 0.2 }],
      receitas: [{ id: 'recipe', nome: 'Xarope', rendimento_qtd: 1000, rendimento_unidade: 'ml', perda_pct: 0, tempo_min: 0, modo_preparo: null, passos_preparo: null }],
      itens: [{ id: 'item', receita_id: 'recipe', insumo_id: 'base', subreceita_id: null, quantidade_base: 1000 }],
      variantes: [],
      config: {},
    }
    const variante = {
      id: 'legacy', produto_id: 'product', produto_nome: 'Xarope', receita_id: 'recipe',
      nome: '250 ml', peso_g: 250, volume_ml: null, unidades_por_pacote: 1,
      embalagem_insumo_id: null, rotulo_insumo_id: null, preco_cents: 500,
    }

    expect(custoDaVariante(variante, base)).toBe(50)
  })
})
