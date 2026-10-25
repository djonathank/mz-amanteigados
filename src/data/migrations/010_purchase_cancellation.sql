-- Preserve cancelled purchases for audit while allowing their stock and ledger effects to be reversed.
ALTER TABLE compra ADD COLUMN cancelada_em TEXT;
ALTER TABLE compra ADD COLUMN motivo_cancelamento TEXT;
ALTER TABLE historico_preco_insumo ADD COLUMN compra_id TEXT;
UPDATE historico_preco_insumo
SET compra_id=(
  SELECT m.origem_id FROM movimento_estoque m
  JOIN compra c ON c.id=m.origem_id
  WHERE m.item_tipo='insumo' AND m.tipo='compra' AND m.deleted_at IS NULL
    AND m.item_id=historico_preco_insumo.insumo_id
    AND m.created_at=historico_preco_insumo.created_at
    AND ABS(m.custo_unit-historico_preco_insumo.custo_por_base)<0.0000001
  ORDER BY m.id LIMIT 1
), updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE compra_id IS NULL
  AND EXISTS (
    SELECT 1 FROM movimento_estoque m
    WHERE m.item_tipo='insumo' AND m.tipo='compra' AND m.deleted_at IS NULL
      AND m.item_id=historico_preco_insumo.insumo_id
      AND m.created_at=historico_preco_insumo.created_at
      AND ABS(m.custo_unit-historico_preco_insumo.custo_por_base)<0.0000001
  );
CREATE INDEX IF NOT EXISTS idx_compra_data_fornecedor
  ON compra(data, fornecedor_id, cancelada_em);
CREATE INDEX IF NOT EXISTS idx_historico_preco_compra
  ON historico_preco_insumo(compra_id, deleted_at);
