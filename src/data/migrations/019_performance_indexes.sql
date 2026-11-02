CREATE INDEX IF NOT EXISTS idx_movimento_estoque_item ON movimento_estoque(item_tipo, item_id, data, sequencia);
CREATE INDEX IF NOT EXISTS idx_venda_data ON venda(data);
CREATE INDEX IF NOT EXISTS idx_compra_data ON compra(data);
CREATE INDEX IF NOT EXISTS idx_lancamento_data ON lancamento(data);
CREATE INDEX IF NOT EXISTS idx_receita_item_receita ON receita_item(receita_id);
CREATE INDEX IF NOT EXISTS idx_venda_item_venda ON venda_item(venda_id);
CREATE INDEX IF NOT EXISTS idx_compra_item_compra ON compra_item(compra_id);
