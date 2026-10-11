INSERT OR IGNORE INTO insumo (
  id, nome, tipo, unidade_base, unidade_compra, fator_compra, custo_medio, estoque_atual, estoque_minimo,
  alergenos, nutricional, fornecedor_id, ativo, created_at, updated_at, deleted_at, device_id
)
SELECT 'demo-insumo-farinha-v1', nome, tipo, unidade_base, unidade_compra, fator_compra, custo_medio, estoque_atual,
       estoque_minimo, alergenos, nutricional, fornecedor_id, ativo, created_at, updated_at, deleted_at, device_id
FROM insumo WHERE nome = 'Farinha de trigo (exemplo)' ORDER BY id LIMIT 1;

INSERT OR IGNORE INTO receita (
  id, nome, rendimento_qtd, rendimento_unidade, perda_pct, tempo_min, modo_preparo, created_at, updated_at,
  deleted_at, device_id, passos_preparo
)
SELECT 'demo-receita-massa-v1', nome, rendimento_qtd, rendimento_unidade, perda_pct, tempo_min, modo_preparo,
       created_at, updated_at, deleted_at, device_id, passos_preparo
FROM receita WHERE nome = 'Massa básica (exemplo)' ORDER BY id LIMIT 1;

INSERT OR IGNORE INTO produto (id, nome, receita_id, ativo, created_at, updated_at, deleted_at, device_id)
SELECT 'demo-produto-v1', nome, 'demo-receita-massa-v1', ativo, created_at, updated_at, deleted_at, device_id
FROM produto WHERE nome = 'Produto demonstrativo' ORDER BY id LIMIT 1;

INSERT OR IGNORE INTO produto_variante (
  id, produto_id, nome, peso_g, unidades_por_pacote, embalagem_insumo_id, rotulo_insumo_id, preco_cents,
  estoque_atual, created_at, updated_at, deleted_at, device_id, volume_ml
)
SELECT 'demo-variante-100g-v1', 'demo-produto-v1', nome, peso_g, unidades_por_pacote, embalagem_insumo_id,
       rotulo_insumo_id, preco_cents, estoque_atual, created_at, updated_at, deleted_at, device_id, volume_ml
FROM produto_variante WHERE produto_id IN (SELECT id FROM produto WHERE nome = 'Produto demonstrativo')
ORDER BY id LIMIT 1;

UPDATE receita_item SET insumo_id = 'demo-insumo-farinha-v1'
WHERE insumo_id IN (SELECT id FROM insumo WHERE nome = 'Farinha de trigo (exemplo)')
  AND insumo_id <> 'demo-insumo-farinha-v1';
UPDATE compra_item SET insumo_id = 'demo-insumo-farinha-v1'
WHERE insumo_id IN (SELECT id FROM insumo WHERE nome = 'Farinha de trigo (exemplo)')
  AND insumo_id <> 'demo-insumo-farinha-v1';
UPDATE historico_preco_insumo SET insumo_id = 'demo-insumo-farinha-v1'
WHERE insumo_id IN (SELECT id FROM insumo WHERE nome = 'Farinha de trigo (exemplo)')
  AND insumo_id <> 'demo-insumo-farinha-v1';
UPDATE produto_variante SET embalagem_insumo_id = 'demo-insumo-farinha-v1'
WHERE embalagem_insumo_id IN (SELECT id FROM insumo WHERE nome = 'Farinha de trigo (exemplo)');
UPDATE produto_variante SET rotulo_insumo_id = 'demo-insumo-farinha-v1'
WHERE rotulo_insumo_id IN (SELECT id FROM insumo WHERE nome = 'Farinha de trigo (exemplo)');
UPDATE movimento_estoque SET item_id = 'demo-insumo-farinha-v1'
WHERE item_tipo = 'insumo' AND item_id IN (SELECT id FROM insumo WHERE nome = 'Farinha de trigo (exemplo)');
UPDATE insumo
SET deleted_at = COALESCE(deleted_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE nome = 'Farinha de trigo (exemplo)' AND id <> 'demo-insumo-farinha-v1';

UPDATE receita_item SET receita_id = 'demo-receita-massa-v1'
WHERE receita_id IN (SELECT id FROM receita WHERE nome = 'Massa básica (exemplo)')
  AND receita_id <> 'demo-receita-massa-v1';
UPDATE receita_item SET subreceita_id = 'demo-receita-massa-v1'
WHERE subreceita_id IN (SELECT id FROM receita WHERE nome = 'Massa básica (exemplo)')
  AND subreceita_id <> 'demo-receita-massa-v1';
UPDATE produto SET receita_id = 'demo-receita-massa-v1'
WHERE receita_id IN (SELECT id FROM receita WHERE nome = 'Massa básica (exemplo)');
UPDATE lote SET receita_id = 'demo-receita-massa-v1'
WHERE receita_id IN (SELECT id FROM receita WHERE nome = 'Massa básica (exemplo)');
UPDATE receita
SET deleted_at = COALESCE(deleted_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE nome = 'Massa básica (exemplo)' AND id <> 'demo-receita-massa-v1';

INSERT OR IGNORE INTO receita_item (
  id, receita_id, insumo_id, subreceita_id, quantidade_base, created_at, updated_at, deleted_at, device_id
)
SELECT 'demo-receita-item-v1', 'demo-receita-massa-v1', 'demo-insumo-farinha-v1', NULL,
       quantidade_base, created_at, updated_at, deleted_at, device_id
FROM receita_item
WHERE receita_id = 'demo-receita-massa-v1' AND insumo_id = 'demo-insumo-farinha-v1'
ORDER BY id LIMIT 1;
UPDATE receita_item
SET deleted_at = COALESCE(deleted_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE receita_id = 'demo-receita-massa-v1' AND insumo_id = 'demo-insumo-farinha-v1'
  AND id <> 'demo-receita-item-v1';

UPDATE produto_variante SET produto_id = 'demo-produto-v1'
WHERE produto_id IN (SELECT id FROM produto WHERE nome = 'Produto demonstrativo')
  AND produto_id <> 'demo-produto-v1';
UPDATE produto
SET deleted_at = COALESCE(deleted_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE nome = 'Produto demonstrativo' AND id <> 'demo-produto-v1';

UPDATE lote_saida SET variante_id = 'demo-variante-100g-v1'
WHERE variante_id IN (
  SELECT id FROM produto_variante WHERE nome = 'Pacote 100 g'
    AND produto_id = 'demo-produto-v1'
);
UPDATE venda_item SET variante_id = 'demo-variante-100g-v1'
WHERE variante_id IN (
  SELECT id FROM produto_variante WHERE nome = 'Pacote 100 g'
    AND produto_id = 'demo-produto-v1'
);
UPDATE encomenda_item SET variante_id = 'demo-variante-100g-v1'
WHERE variante_id IN (
  SELECT id FROM produto_variante WHERE nome = 'Pacote 100 g'
    AND produto_id = 'demo-produto-v1'
);
UPDATE movimento_estoque SET item_id = 'demo-variante-100g-v1'
WHERE item_tipo = 'produto_variante' AND item_id IN (
  SELECT id FROM produto_variante WHERE nome = 'Pacote 100 g'
    AND produto_id = 'demo-produto-v1'
);
UPDATE produto_variante
SET deleted_at = COALESCE(deleted_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE nome = 'Pacote 100 g' AND produto_id = 'demo-produto-v1'
  AND id <> 'demo-variante-100g-v1';
