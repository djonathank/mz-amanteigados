CREATE TABLE IF NOT EXISTS historico_edicao_compra (
  id TEXT PRIMARY KEY,
  compra_id TEXT NOT NULL REFERENCES compra(id),
  motivo TEXT NOT NULL,
  dados_anteriores TEXT NOT NULL,
  dados_novos TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  device_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_historico_edicao_compra
  ON historico_edicao_compra(compra_id, created_at);
