ALTER TABLE produto_variante ADD COLUMN volume_ml REAL;

UPDATE produto_variante
SET volume_ml = peso_g
WHERE volume_ml IS NULL
  AND peso_g IS NOT NULL
  AND produto_id IN (
    SELECT p.id
    FROM produto p
    JOIN receita r ON r.id = p.receita_id
    WHERE r.rendimento_unidade = 'ml'
  );
