ALTER TABLE movimento_estoque ADD COLUMN sequencia INTEGER;

WITH movimentos_ordenados AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY rowid) AS ordem
  FROM movimento_estoque
)
UPDATE movimento_estoque
SET sequencia = (SELECT ordem FROM movimentos_ordenados WHERE movimentos_ordenados.id = movimento_estoque.id);

CREATE INDEX IF NOT EXISTS idx_movimento_estoque_data_sequencia
  ON movimento_estoque(item_tipo, item_id, data, sequencia);
