export type OrderStatus = 'pedido' | 'pago' | 'produzindo' | 'pronto' | 'entregue' | 'cancelado'

const NEXT: Record<OrderStatus, OrderStatus[]> = {
  pedido: ['pago', 'produzindo', 'cancelado'],
  pago: [],
  produzindo: ['pronto', 'cancelado'],
  pronto: ['entregue', 'cancelado'],
  entregue: [],
  cancelado: [],
}

export const canTransition = (from: OrderStatus, to: OrderStatus): boolean => NEXT[from].includes(to)
