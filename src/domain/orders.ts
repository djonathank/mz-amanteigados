export type OrderStatus = 'agendado' | 'finalizado' | 'cancelado'

const NEXT: Record<OrderStatus, OrderStatus[]> = {
  agendado: ['finalizado', 'cancelado'],
  finalizado: [],
  cancelado: [],
}

export const canTransition = (from: OrderStatus, to: OrderStatus): boolean => NEXT[from].includes(to)
