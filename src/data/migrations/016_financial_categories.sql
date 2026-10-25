CREATE TABLE IF NOT EXISTS categoria_financeira (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  cor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  device_id TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_categoria_financeira_nome
  ON categoria_financeira(lower(nome))
  WHERE deleted_at IS NULL;

INSERT OR IGNORE INTO categoria_financeira (id, nome, cor, created_at, updated_at)
SELECT lower(hex(randomblob(16))), trim(categoria), '#704214', datetime('now'), datetime('now')
FROM lancamento
WHERE categoria IS NOT NULL AND trim(categoria) <> ''
GROUP BY lower(trim(categoria));
