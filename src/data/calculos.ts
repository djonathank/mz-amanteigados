import { recipeBatchCost, usableUnits } from '../domain/cost'
import type { Receita } from '../domain/types'
import type { Db } from './db'
import {
  lerConfig, listarInsumos, listarReceitas, listarVariantes, todosItens,
  type InsumoRow, type ItemRow, type ReceitaRow, type VarianteRow,
} from './repos'

export interface Base {
  insumos: InsumoRow[]; receitas: ReceitaRow[]; itens: ItemRow[]
  variantes: VarianteRow[]; config: Record<string, string>
}

export const carregarBase = async (db: Db): Promise<Base> => {
  const [insumos, receitas, itens, variantes, config] = await Promise.all([
    listarInsumos(db), listarReceitas(db), todosItens(db), listarVariantes(db), lerConfig(db),
  ])
  return { insumos, receitas, itens, variantes, config }
}

/** Custo em centavos de uma unidade da receita: ingredientes + gás/energia do lote, sobre as unidades úteis. */
export function custoPorUnidade(r: ReceitaRow, b: Base): number {
  const custos = Object.fromEntries(b.insumos.map((i) => [i.id, i.custo_medio]))
  const recipes = new Map(b.receitas.map((recipe) => [recipe.id, recipe]))
  const itens = new Map<string, ItemRow[]>()
  for (const item of b.itens) itens.set(item.receita_id, [...(itens.get(item.receita_id) ?? []), item])
  const visit = (recipe: ReceitaRow, stack: Set<string>): Receita => {
    if (stack.has(recipe.id)) throw new Error(`Ciclo de sub-receitas detectado: ${[...stack, recipe.id].join(' -> ')}`)
    const next = new Set(stack).add(recipe.id)
    const children = (itens.get(recipe.id) ?? []).map((item) => {
      if (item.subreceita_id) {
        const child = recipes.get(item.subreceita_id)
        if (!child) throw new Error(`Sub-receita não encontrada: ${item.subreceita_id}`)
        return { subReceita: visit(child, next), quantidadeBase: item.quantidade_base }
      }
      if (!item.insumo_id) throw new Error(`Item sem insumo ou sub-receita na receita: ${recipe.nome}`)
      return { insumoId: item.insumo_id, quantidadeBase: item.quantidade_base }
    })
    const gas = b.config.gas_lote_cents !== undefined
      ? Number(b.config.gas_lote_cents)
      : Number(b.config.gas_lote ?? 0) * 100
    if (!Number.isFinite(gas) || gas < 0) throw new Error('Custo de gás por lote inválido')
    return {
      id: recipe.id, nome: recipe.nome, rendimentoQtd: recipe.rendimento_qtd,
      perdaPct: recipe.perda_pct, itens: children, tempoMin: recipe.tempo_min ?? 0,
      gasCents: gas,
    }
  }
  const custoHoraConfigurado = b.config.valor_hora_cents ?? b.config.hora_trabalho_cents
  const valorHoraCents = custoHoraConfigurado !== undefined
    ? Number(custoHoraConfigurado)
    : Number(b.config.hora_trabalho ?? b.config.valor_hora ?? 0) * 100
  if (!Number.isFinite(valorHoraCents) || valorHoraCents < 0) throw new Error('Valor por hora inválido')
  const receita = visit(r, new Set())
  return recipeBatchCost(receita, custos, valorHoraCents) / usableUnits(receita)
}

export const custoDaVariante = (v: VarianteRow, b: Base): number => {
  const r = b.receitas.find((x) => x.id === v.receita_id)
  if (!r) throw new Error(`Receita não encontrada para a variante: ${v.id}`)
  const custos = new Map(b.insumos.map((i) => [i.id, i.custo_medio]))
  const embalagem = [v.embalagem_insumo_id, v.rotulo_insumo_id]
    .filter((id): id is string => !!id)
    .reduce((sum, id) => {
      const cost = custos.get(id)
      if (cost === undefined) throw new Error(`Insumo de embalagem sem custo: ${id}`)
      return sum + cost
    }, 0)
  const unidades = r.rendimento_unidade === 'ml'
    ? v.volume_ml ?? v.peso_g ?? v.unidades_por_pacote
    : v.peso_g != null && r.rendimento_unidade === 'kg'
      ? v.peso_g / 1000
      : v.peso_g != null && r.rendimento_unidade === 'g'
        ? v.peso_g
        : v.unidades_por_pacote
  return Math.round(custoPorUnidade(r, b) * unidades + embalagem)
}
