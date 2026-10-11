UPDATE receita_item
SET deleted_at = COALESCE(deleted_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'demo-receita-item-v1'
   OR receita_id IN (
     SELECT id FROM receita
     WHERE id = 'demo-receita-massa-v1' OR nome = 'Massa básica (exemplo)'
   );

UPDATE produto_variante
SET deleted_at = COALESCE(deleted_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'demo-variante-100g-v1'
   OR produto_id IN (
     SELECT id FROM produto
     WHERE id = 'demo-produto-v1' OR nome = 'Produto demonstrativo'
   );

UPDATE produto
SET deleted_at = COALESCE(deleted_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'demo-produto-v1' OR nome = 'Produto demonstrativo';

UPDATE receita
SET deleted_at = COALESCE(deleted_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'demo-receita-massa-v1' OR nome = 'Massa básica (exemplo)';

UPDATE insumo
SET deleted_at = COALESCE(deleted_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'demo-insumo-farinha-v1' OR nome = 'Farinha de trigo (exemplo)';
