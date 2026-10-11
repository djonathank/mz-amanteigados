-- Estoque e movimentações das fases 2 a 4.
ALTER TABLE movimento_estoque ADD COLUMN motivo TEXT;
ALTER TABLE produto_variante ADD COLUMN estoque_minimo REAL NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_movimento_estoque_item_data
  ON movimento_estoque(item_tipo, item_id, data);
CREATE INDEX IF NOT EXISTS idx_lote_validade
  ON lote(data_validade);
CREATE INDEX IF NOT EXISTS idx_venda_data_status
  ON venda(data, status_pagamento);
CREATE INDEX IF NOT EXISTS idx_lancamento_data_pago
  ON lancamento(data, pago, tipo);
