-- MZ Gestão: esquema inicial (ver docs/documentacao-tecnica.md, seção 4)
PRAGMA foreign_keys = ON;

CREATE TABLE insumo (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'ingrediente', unidade_base TEXT NOT NULL, unidade_compra TEXT, fator_compra REAL DEFAULT 1, custo_medio REAL NOT NULL DEFAULT 0, estoque_atual REAL NOT NULL DEFAULT 0, estoque_minimo REAL NOT NULL DEFAULT 0, alergenos TEXT, nutricional TEXT, fornecedor_id TEXT, ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT, device_id TEXT, quantidade_cadastro REAL
);
CREATE TABLE fornecedor (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL, contato TEXT, observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT, device_id TEXT
);
CREATE TABLE cliente (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL, whatsapp TEXT, endereco TEXT, aniversario TEXT, observacoes TEXT, tipo_preco_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT, device_id TEXT
);
CREATE TABLE receita (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL, rendimento_qtd REAL NOT NULL, rendimento_unidade TEXT, perda_pct REAL NOT NULL DEFAULT 0, tempo_min INTEGER, modo_preparo TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT, device_id TEXT
);
CREATE TABLE receita_item (
  id TEXT PRIMARY KEY,
  receita_id TEXT NOT NULL REFERENCES receita(id), insumo_id TEXT REFERENCES insumo(id), subreceita_id TEXT REFERENCES receita(id), quantidade_base REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT, device_id TEXT,
  CHECK ((insumo_id IS NULL) <> (subreceita_id IS NULL))
);
CREATE TABLE produto (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL, receita_id TEXT REFERENCES receita(id), ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT, device_id TEXT
);
CREATE TABLE produto_variante (
  id TEXT PRIMARY KEY,
  produto_id TEXT NOT NULL REFERENCES produto(id), nome TEXT NOT NULL, peso_g REAL, unidades_por_pacote INTEGER, embalagem_insumo_id TEXT, rotulo_insumo_id TEXT, preco_cents INTEGER NOT NULL DEFAULT 0, estoque_atual REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT, device_id TEXT
);
CREATE TABLE compra (
  id TEXT PRIMARY KEY,
  fornecedor_id TEXT, data TEXT NOT NULL, total_cents INTEGER NOT NULL, pago INTEGER NOT NULL DEFAULT 1, forma_pagamento TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT, device_id TEXT
);
CREATE TABLE compra_item (
  id TEXT PRIMARY KEY,
  compra_id TEXT NOT NULL REFERENCES compra(id), insumo_id TEXT NOT NULL REFERENCES insumo(id), quantidade_base REAL NOT NULL, total_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT, device_id TEXT
);
CREATE TABLE historico_preco_insumo (
  id TEXT PRIMARY KEY,
  insumo_id TEXT NOT NULL REFERENCES insumo(id), data TEXT NOT NULL, custo_por_base REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT, device_id TEXT
);
CREATE TABLE movimento_estoque (
  id TEXT PRIMARY KEY,
  item_tipo TEXT NOT NULL, item_id TEXT NOT NULL, tipo TEXT NOT NULL, quantidade REAL NOT NULL, custo_unit REAL, origem_id TEXT, data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT, device_id TEXT
);
CREATE TABLE venda (
  id TEXT PRIMARY KEY,
  cliente_id TEXT, encomenda_id TEXT, data TEXT NOT NULL, desconto_cents INTEGER NOT NULL DEFAULT 0, total_cents INTEGER NOT NULL, forma_pagamento TEXT NOT NULL, status_pagamento TEXT NOT NULL DEFAULT 'pago', tabela_preco_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT, device_id TEXT
);
CREATE TABLE venda_item (
  id TEXT PRIMARY KEY,
  venda_id TEXT NOT NULL REFERENCES venda(id), variante_id TEXT NOT NULL REFERENCES produto_variante(id), lote_id TEXT, quantidade REAL NOT NULL, preco_unit_cents INTEGER NOT NULL, custo_unit_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT, device_id TEXT
);
CREATE TABLE encomenda (
  id TEXT PRIMARY KEY,
  cliente_id TEXT, data_entrega TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pedido', total_cents INTEGER NOT NULL, observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT, device_id TEXT
);
CREATE TABLE encomenda_item (
  id TEXT PRIMARY KEY,
  encomenda_id TEXT NOT NULL REFERENCES encomenda(id), variante_id TEXT NOT NULL REFERENCES produto_variante(id), quantidade REAL NOT NULL, preco_unit_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT, device_id TEXT
);
CREATE TABLE lancamento (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL, categoria TEXT, valor_cents INTEGER NOT NULL, data TEXT NOT NULL, vencimento TEXT, pago INTEGER NOT NULL DEFAULT 1, negocio INTEGER NOT NULL DEFAULT 1, origem_tipo TEXT, origem_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT, device_id TEXT
);
CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
