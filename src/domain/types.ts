import type { BaseUnit } from './units'

export interface Insumo {
  id: string
  nome: string
  unidadeBase: BaseUnit
  custoMedio: number // centavos por unidade base
  estoqueAtual: number
  estoqueMinimo: number
}

export interface ReceitaItem {
  insumoId?: string
  subReceita?: Receita
  quantidadeBase: number
}

export interface Receita {
  id: string
  nome: string
  rendimentoQtd: number
  perdaPct: number // 0 a 1
  itens: ReceitaItem[]
  tempoMin?: number
  gasCents?: number
}

export interface VarianteFisica {
  pesoG?: number | null
  embalagemInsumoId?: string | null
  rotuloInsumoId?: string | null
}
