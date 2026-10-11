# MZ Gestão — Documentação Técnica

**Produto:** aplicativo híbrido de gestão para a MZ Bolachas da Maquiele
**Plataformas:** Android, iOS e web (um único código)
**Idioma e formatos:** pt-BR, moeda R$, datas dd/mm/aaaa, unidades g, kg, ml, L e un
**Referência visual:** galeria de 23 telas (22 aprovadas + sincronização) (mesmo link do design)
**Versão do documento:** 2.0 (Fases 1 a 4: operação local + espelho em Google Sheets)

---

## 1. Visão geral

O MZ Gestão ajuda um casal de confeiteiros a saber **quanto custa e quanto lucra cada receita**, controlar **estoque, produção, vendas, encomendas e finanças** e se relacionar com **clientes e fornecedores**, tudo pelo celular, com ou sem internet.

### Princípios de produto

1. **Preço certo primeiro.** A precificação é o coração do app; todo o resto alimenta ou consome esse cálculo.
2. **Uso na cozinha.** Botões grandes, poucos toques por tarefa, funciona com as mãos sujas.
3. **Offline-first.** Nada depende de internet para registrar uma venda ou uma receita.
4. **Crescer sem refazer.** Novos produtos (milho, nata...), embalagens e canais entram por cadastro, sem mudar código.
5. **Dados seus.** Backup e exportação sempre disponíveis.

### Fora do escopo

Emissão de nota fiscal, integração bancária, loja online própria e controle de ponto de funcionários.

---

## 2. Escopo por fases

| Fase | Conteúdo | Resultado para o usuário |
|---|---|---|
| **1 (V1)** | Insumos, receitas, produtos à venda, custos, precificação, venda rápida, comprovante, backup | Sabe o preço e o lucro de cada pacote e registra vendas |
| **2** | Estoque (insumos e produtos acabados), compras com custo médio, produção por lote e lista de reposição | Baixa automática de insumos e controle de validade |
| **3** | Clientes, fornecedores, encomendas com sinal e financeiro integrado | Operação completa do dia a dia |
| **4** | Relatórios por período, exportação CSV/PDF e espelho no Google Sheets | Visão gerencial e sincronização entre aparelhos |
| **5** | Preços por canal, kits, rendimento real, recompra, custo de entrega/feira, controle de faturamento | Evolução do negócio |
| **6** | Alérgenos e tabela nutricional, QR Pix, rastreabilidade por lote, calendário, pedido por WhatsApp, ficha de produção | Qualidade e operação |

**Regra de modelagem:** o banco já nasce com campos das Fases 5 e 6 (alérgenos no insumo, lote ligado à venda, tabela de preço por canal), mesmo que as telas venham depois.

---

## 3. Stack e arquitetura

### 3.1 Tecnologias

| Camada | Escolha | Motivo |
|---|---|---|
| Camada | Implementação atual | Observação |
|---|---|---|
| UI | React 18 + TypeScript + Vite + React Router | CSS próprio; layout fluido e ícones SVG inline |
| Estado e formulários | Hooks do React e campos HTML nativos | Validação no domínio/repositórios e mensagens em pt-BR; React Hook Form/Zod não estão instalados |
| Banco local | SQLite (`@capacitor-community/sqlite`; web via `jeep-sqlite`) | A camada `Db` adapta consultas, gravações e transações |
| Cálculos | Funções puras em `src/domain/` e agregação em `src/data/calculos.ts` | Cobrem unidade, custo, preço, margem e variantes |
| PDF | Gerador local em `src/data/pdf.ts` | Sem dependência de rede ou biblioteca PDF |
| Relatórios e exportação | Consultas SQLite, CSV próprio e gerador PDF local | Sem dependência de internet ou biblioteca externa |
| Nuvem | Espelho Google Sheets via Drive/Sheets APIs | Sync em lote e mesclagem por registro com `updated_at` |
| Testes | Vitest | Testes de domínio, dados, cálculos, PDF, estoque, exportação e merge; UI/E2E pendentes |

O projeto ainda não usa Ionic React, Zustand, React Hook Form, Zod, Recharts, Testing Library, Playwright ou Appium em produção. Esses itens não devem ser tratados como dependências implementadas.

### 3.2 Camadas

```
Páginas React (src/pages/)
  └── Operações/repos/consultas SQLite (src/data/repos.ts, phase2.ts, phase3.ts, reports.ts, db.ts)
        └── Funções de domínio (src/domain/) e agregações (src/data/calculos.ts)
```

- As funções em `src/domain/` não conhecem UI nem banco e são testáveis isoladamente.
- A camada SQLite e os módulos de operação são usados diretamente pelas telas. A sincronização Sheets é executada pelo contexto Google; os relatórios são consultas locais.

### 3.3 Estrutura de pastas

```
src/
  App.tsx                 rotas e navegação
  pages/                  telas e componentes visuais
  data/                   db.ts, repos.ts, cálculos, backup, PDF, migrações
    phase2.ts             estoque, movimentos, lotes, FEFO e lista de compras
    phase3.ts             clientes, fornecedores, encomendas e financeiro
    reports.ts            exportação CSV
  domain/                 unidades, custo, preço e regras puras
  pages/                  telas de operação, relatórios e gestão
```

O avatar da tela inicial abre `MenuUsuario`, onde o nome do perfil é salvo na tabela `config` e ficam as ações da conta Google e sincronização. A imagem de perfil escolhida pelo usuário fica local no aparelho; o ícone de marca do aplicativo e a arte quadrada para a Play Store são arquivos separados.

Estoque/produção, cadastros e encomendas, financeiro e relatórios estão integrados à navegação em `Mais`; a sincronização Google fica no contexto de conta.

---

## 4. Modelo de dados

### 4.1 Convenções

- **Dinheiro:** inteiros em centavos (`*_cents`). Nunca ponto flutuante para valores finais.
- **Quantidades:** na **unidade base** do item (`g`, `ml` ou `un`). A unidade de compra (kg, L) é convertida na entrada.
- **IDs:** UUID em texto (`crypto.randomUUID()`).
- **Colunas comuns às entidades:** em geral `created_at`, `updated_at`, `deleted_at` e `device_id`; a tabela de configuração usa chave/valor.
- **Datas:** texto ISO 8601, exibidas em dd/mm/aaaa.

### 4.2 Tabelas principais (esquema resumido)

```sql
-- Cadastros
insumo(id, nome, tipo,            -- 'ingrediente' | 'embalagem' | 'rotulo'
  unidade_base,                   -- 'g' | 'ml' | 'un'
  unidade_compra, fator_compra,   -- ex.: 'kg', 1000
  custo_medio,                    -- centavos por unidade base (REAL)
  estoque_atual, estoque_minimo,
  alergenos,                      -- JSON ["leite","gluten"]  (Fase 6)
  nutricional,                    -- JSON por 100 g, opcional  (Fase 6)
  fornecedor_id, ativo)

fornecedor(id, nome, contato, observacoes)
cliente(id, nome, whatsapp, endereco, aniversario, observacoes, tipo_preco_id)

-- Receitas e produtos
receita(id, nome, rendimento_qtd, rendimento_unidade, perda_pct, tempo_min, modo_preparo)
receita_item(id, receita_id, insumo_id, subreceita_id, quantidade_base)
  -- exatamente um entre insumo_id e subreceita_id

produto(id, nome, receita_id, ativo)
produto_variante(id, produto_id, nome,  -- ex.: 'Pacote 150 g'
  peso_g, volume_ml, unidades_por_pacote,
  embalagem_insumo_id, rotulo_insumo_id,
  preco_cents, estoque_atual, estoque_minimo)

-- Compras, estoque e produção
compra(id, fornecedor_id, data, total_cents, pago, forma_pagamento)
compra_item(id, compra_id, insumo_id, quantidade_base, total_cents)
historico_preco_insumo(id, insumo_id, data, custo_por_base)
movimento_estoque(id, item_tipo, item_id,  -- 'insumo' | 'variante'
  tipo,                           -- compra | producao | venda | ajuste | perda
  quantidade, custo_unit, origem_id, data, motivo)

lote(id, codigo, receita_id, data_fabricacao, data_validade,
  qtd_prevista, qtd_real, custo_total_cents)
lote_saida(id, lote_id, variante_id, quantidade_pacotes)

-- Vendas e encomendas
venda(id, cliente_id, encomenda_id, data, desconto_cents, total_cents,
  forma_pagamento,                -- pix | dinheiro | cartao | fiado
  status_pagamento,               -- pago | pendente
  tabela_preco_id)                -- Fase 5
venda_item(id, venda_id, variante_id, lote_id, quantidade,
  preco_unit_cents, custo_unit_cents)   -- custo congelado no momento da venda

encomenda(id, cliente_id, data_entrega, status,
  sinal_cents, total_cents, observacoes)
encomenda_item(id, encomenda_id, variante_id, quantidade, preco_unit_cents)

-- Financeiro e configuração
lancamento(id, tipo, categoria, valor_cents, data, vencimento, pago,
  negocio,                        -- 1 = negócio, 0 = pessoal
  origem_tipo, origem_id)         -- venda | compra | encomenda | manual
config(chave, valor)              -- hora de trabalho, taxas, margem padrão, chave Pix...

-- Sincronização com o Google Sheets (Fase 4)
sync_outbox(id, tabela, registro_id, operacao, payload, tentativas, criado_em)
sync_state(tabela, ultimo_pull, ultimo_push, max_updated_at_remoto)
sheet_row_map(tabela, registro_id, linha)   -- id do registro → linha na aba
```

O esquema de produção é aplicado pela migração `007_phase2_4.sql` (versão local 7). Ela adiciona justificativa aos movimentos, estoque mínimo às variantes e índices de consulta. Dados existentes sem saldo não recebem saldo inicial presumido; compras posteriores iniciam o saldo e o custo médio ponderado.

### 4.3 Entidades previstas para as Fases 5 e 6

`tabela_preco` e `tabela_preco_item` (canais), `kit` e `kit_item`, `custo_entrega` (feira, combustível, horas), `pedido_whatsapp_rascunho`. Não criar as tabelas antes da fase, mas manter `tabela_preco_id` em `venda` e `lote_id` em `venda_item` desde a V1.

---

## 5. Regras de negócio e fórmulas

### 5.1 Unidades e custo dos insumos

- Conversões automáticas: 1 kg = 1000 g, 1 L = 1000 ml. Unidades incompatíveis (g ↔ ml) exigem fator de densidade informado.
- **Custo médio ponderado** na entrada de compra:
  `novo_custo_medio = (estoque_atual × custo_medio + qtd_comprada × custo_da_compra) / (estoque_atual + qtd_comprada)`
- Cada compra grava um ponto em `historico_preco_insumo` (base do alerta de margem e do gráfico de custo).
- Na V1, sem controle de estoque, o custo acompanhava o **último preço pago**. Desde a Fase 2, novas compras atualizam o custo médio ponderado sobre o saldo registrado; um banco antigo sem saldo mantém saldo inicial zero, sem inventar quantidade nem recalcular preços até novas compras.

### 5.2 Custo da receita

```
custo_ingredientes = Σ (quantidade_base × custo_do_insumo)       # sub-receitas somadas recursivamente
unidades_boas      = rendimento × (1 − perda_pct)
custo_lote         = custo_ingredientes + embalagem + mao_de_obra + indiretos + rateio_fixos
mao_de_obra        = tempo_min / 60 × valor_hora
```

### 5.3 Precificação

Margem e taxas são calculadas **sobre o preço de venda**:

```
custo_variante = custo_lote × (peso_da_variante / peso_total_do_lote)   # ou por nº de pacotes
preco_sugerido = custo_variante / (1 − margem − taxa_pagamento)
preco_final    = arredondar(preco_sugerido, passo)                      # passo configurável: R$ 0,50
lucro_rs       = preco_final × (1 − taxa_pagamento) − custo_variante
margem_real    = lucro_rs / preco_final
```

**Exemplo de conferência** (usado como teste de ouro): lote de R$ 60,20 que rende 8 pacotes de 150 g, margem de 40% e taxa 0%.
`custo_variante = 7,525` → `preço = 7,525 / 0,60 = 12,54` → arredondado para **R$ 12,50**, lucro **R$ 4,97**, margem real **39,8%**.

**Simulador:** recalcula o custo com uma variação percentual em um insumo e mostra a nova margem e os produtos que ficam abaixo da margem mínima.

**Ponto de equilíbrio:** `custos_fixos_mensais / margem_de_contribuição_média`.

### 5.4 Produção e estoque

- Salvar lote (transação única): cria `lote`, gera `lote_saida`, baixa insumos pela receita (com perda), soma pacotes ao estoque da variante, grava `movimento_estoque`.
- Estoque não fica negativo sem aviso: se uma produção, venda ou ajuste resultar em saldo negativo, o app informa a falta e exige justificativa.
- Compras, produção, vendas, perdas e ajustes registram movimentos com data, quantidade, origem e justificativa quando aplicável. Produção, saídas de lote e atualizações de saldo ocorrem na mesma transação.
- Alertas destacam saldo ≤ mínimo e lotes vencidos ou com validade nos próximos sete dias. Mínimos são configuráveis para insumos e variantes.
- Venda baixa o estoque da variante, alocando lotes pela validade mais próxima (FEFO) e preserva o `lote_id`; custo unitário de produção é congelado no item da venda.

### 5.5 Vendas e fiado

- Formas de pagamento: Pix, dinheiro, cartão, fiado.
- Pagamento "pendente" (fiado) exige cliente e cria uma conta a receber no financeiro; marcar a conta como paga atualiza o status da venda.
- Desconto informado em valor fixo, limitado ao subtotal. O lucro reportado desconta esse valor uma única vez.

### 5.6 Encomendas

Máquina de estados: `pedido → produzindo → pronto → entregue` (e `cancelado` a partir de qualquer estado antes de entregue).

- Sinal pago gera lançamento de entrada parcial.
- O sinal gera uma entrada e o restante uma conta a receber. Ao entregar uma encomenda pronta, o app registra a venda, baixa o estoque e substitui a conta a receber do pedido pela do saldo de venda, sem duplicar o sinal.
- O planejador soma itens de encomendas abertas por variante, desconta o estoque acabado disponível e compara as necessidades de insumos com o estoque para produzir a lista de compras.

### 5.7 Financeiro (lançamentos automáticos)

| Evento | Lançamento |
|---|---|
| Venda paga | Entrada |
| Venda no fiado | Conta a receber |
| Sinal de encomenda | Entrada parcial |
| Compra de insumo paga | Saída financeira registrada automaticamente |
| Compra a prazo | Conta a pagar; quitar também atualiza o estado da compra |
| Lançamento manual | Receita ou despesa, paga ou pendente |

Cada lançamento tem o marcador `negocio` (1/0) para separar gastos pessoais dos do negócio nos relatórios.

---

## 6. Mapa das telas

Numeração igual à da galeria de design (23 telas, numeradas de 0 a 22).

| # | Tela | Módulo | Principais entidades | Fase |
|---|---|---|---|---|
| 0 | Início | Painel | venda, lancamento, insumo | 1 (simples) |
| 1 | Estoque | Estoque | insumo, produto_variante | 2 |
| 2 | Receita (detalhe) | Receitas | receita, receita_item | 1 |
| 3 | Precificação | Precificação | receita, produto_variante, config | 1 |
| 4 | Novo lote | Produção | lote, lote_saida | 2 |
| 5 | Venda rápida | Vendas | venda, venda_item | 1 |
| 6 | Encomendas | Encomendas | encomenda | 3 |
| 7 | Contatos | Clientes e fornecedores | cliente, fornecedor | 3 |
| 8 | Financeiro | Financeiro | lancamento | 3 |
| 9 | Relatórios | Relatórios | consultas agregadas | 4 |
| 10 | Mais | Navegação | n/a | 1 |
| 11 | Novo insumo | Insumos | insumo | 1 |
| 12 | Receitas (lista) | Receitas | receita | 1 |
| 13 | Editar receita | Receitas | receita, receita_item | 1 |
| 14 | Produto à venda | Produtos | produto, produto_variante | 1 |
| 15 | Custos | Configuração | config | 1 |
| 16 | Compra de insumo | Compras | compra, compra_item | 1 (preço) e 2 (estoque) |
| 17 | Nova encomenda | Encomendas | encomenda, encomenda_item | 3 |
| 18 | Comprovante | Vendas | venda | 1 |
| 19 | Cliente (detalhe) | Clientes | cliente, venda | 3 |
| 20 | Novo lançamento | Financeiro | lancamento | 3 |
| 21 | Primeiro acesso | Conta | config, usuário | 1 (local) e 4 (sincronização) |
| 22 | Sincronização | Conta | sync_outbox, sync_state | 4 |

**Cobertura visual:** as telas das Fases 5 e 6 e o detalhe dedicado do fornecedor não estão desenhados; os fluxos de cadastro/listagem de fornecedor da Fase 3 estão implementados.

### Navegação

Barra inferior flutuante com 4 destinos mais o botão central:
Início · Receitas · **(+) Venda rápida** · Estoque · Mais (menu com Financeiro, Relatórios, Contatos, Encomendas, Produção, Produtos, Custos, Sincronização e Conta).

Rotas sugeridas: `/` (Início), `/precificacao`, `/receitas`, `/receitas/:id`, `/receitas/:id/editar`, `/vender`, `/venda/:id`, `/estoque`, `/insumos/novo`, `/compras/nova`, `/producao/novo`, `/produtos/:id`, `/encomendas`, `/encomendas/nova`, `/contatos`, `/clientes/:id`, `/financeiro`, `/financeiro/novo`, `/relatorios`, `/custos`, `/conta`.

---

## 7. Design system

### 7.1 Tokens

| Token | Claro | Escuro |
|---|---|---|
| `--bg` fundo | `#F6EEE0` | `#1B120C` |
| `--card` | `#FFFDF8` | `#2A1D14` |
| `--ink` texto | `#3B2111` | `#F5E9D5` |
| `--muted` | `#80664F` (ajustado para contraste AA) | `#BFA98C` |
| `--gold` | `#B98A3E` | igual |
| `--gold-light` | `#E8C98A` | igual |
| `--brown` | `#5A2F17` | `#E3C28A` (em títulos) |
| `--ok` / `--warn` | `#4F8A4B` / `#D2762B` | iguais |

**Tipografia:** títulos em *Playfair Display* (600 e 700), corpo em *Plus Jakarta Sans* (400, 600, 700), com fontes do sistema como alternativa.
**Forma:** cartões com raio de 22 px, botões com 18 px, sombras suaves de cor marrom, cartão de destaque (hero) com gradiente chocolate e brilho dourado.

### 7.2 Componentes base

Os componentes implementados incluem `Campo`, `Selecao`, `Icon`, `AlertaConclusao`, cartões/listas estilizados por CSS, navegação inferior, carrinho e resumo de métricas. O item inicial dos dropdowns usa o texto `Selecione`; placeholders de campos de texto e busca continuam sendo dicas de preenchimento. Os nomes `HeroCard`, `DonutChart` e `BarChart` na galeria são referências visuais, não componentes React instalados.

### 7.3 Acessibilidade e usabilidade

- Alvos de toque de no mínimo 44 × 44 px; texto mínimo de 13 px.
- Contraste mínimo AA em ambos os temas; estado nunca só por cor (sempre texto na pílula).
- Rótulos de acessibilidade em todos os botões de ícone; suporte a fonte ampliada do sistema.
- Teclado numérico para quantidades e valores; máscara de moeda R$.
- Estados vazios com orientação ("Cadastre seu primeiro insumo") e confirmação antes de ações destrutivas.

---

## 8. Offline, sincronização e backup

### 8.1 Offline-first

Todas as operações gravam primeiro no SQLite local. A interface nunca espera a rede.

### 8.2 Espelho em Google Sheets (disponível, requer configuração OAuth)

Cada aparelho continua usando o SQLite local como fonte das telas e dos cálculos. Após conectar a conta Google em **Mais → Conta Google e sincronização**, o app cria ou localiza `MZ Gestão - Dados` no Drive da mesma conta e sincroniza tabelas de negócio e configurações. As plataformas precisam de clientes OAuth configurados no Google Cloud; o escopo solicitado é `drive.file`.

- O app agenda sincronização após gravações locais (agrupadas por 1,5 s), ao voltar à rede e oferece sincronização manual.
- A planilha tem uma aba por tabela sincronizada, cabeçalho baseado no esquema SQLite e `_meta` com versão do esquema e horário da última sincronização.
- O recebimento e o envio são em lote. Registros mesclam por chave primária e `updated_at`; empate usa `device_id`. Exclusões lógicas são sincronizadas por `deleted_at`.
- A versão atual do esquema remoto é 7. O app aceita cabeçalhos das versões anteriores como prefixo, preenche os campos novos com seus defaults e reescreve a planilha na versão atual. Versões futuras, colunas desconhecidas/reordenadas e edição manual continuam incompatíveis; erros são exibidos ao usuário.
- Offline, as gravações ficam no banco local. No Android/iOS o app tenta recuperar a sessão OAuth ao abrir. Na web os tokens ficam só em memória e, por segurança, pode ser necessário reconectar após expiração ou recarregar o navegador.
- A sincronização atual é para aparelhos conectados à mesma conta Google. Compartilhamento da planilha com outra conta e escolha por Google Picker ainda não estão implementados.

A planilha criada no Drive da conta do usuário é acessada diretamente pelas APIs Google Drive/Sheets; o app não tem backend próprio. A configuração de consentimento, APIs habilitadas, domínios autorizados, IDs de cliente por plataforma e detalhes nativos estão no README.

### 8.3 Backup e exportações

- A Fase 4 disponibiliza relatórios com filtro de período e exportação local em PDF ou CSV. O CSV usa separador `;`, escapa aspas e neutraliza valores de texto iniciados por fórmulas de planilha.
- O backup JSON versionado pode ser exportado, validado e restaurado pela tela de conta. Lembrete automático, CSV de backup geral e proteção do backup por senha continuam pendentes.
- A planilha espelhada funciona como cópia remota contínua quando a conta Google está conectada. A sincronização entre aparelhos é opcional; o banco local permanece disponível sem Google.

---

## 9. Segurança e privacidade (LGPD)

- Dados pessoais de clientes (nome, WhatsApp, endereço) ficam no aparelho e, se a sincronização estiver ligada, na planilha do **próprio Drive do usuário**. O compartilhamento com outros usuários não é configurado pelo app.
- No Android/iOS a autenticação usa o plugin Google nativo; na web o token de acesso fica apenas em memória. Desconectar remove a sessão local e, na web, revoga o token atual.
- Bloqueio opcional do app por PIN ou biometria (plugin Capacitor).
- Backup com senha opcional (criptografia AES no arquivo exportado).
- Nenhum dado enviado a terceiros sem ação do usuário; compartilhar no WhatsApp usa o menu do sistema ou `wa.me`.
- Registro mínimo: coletar apenas o necessário. Remover cliente apaga seus dados pessoais e desvincula o cadastro, preservando vendas e registros financeiros anonimizados para auditoria.

---

## 10. Funcionalidades das Fases 5 e 6: notas técnicas

| Funcionalidade | Notas de implementação |
|---|---|
| Preços por canal | `tabela_preco` com margem própria; a venda escolhe a tabela pelo `tipo_preco_id` do cliente; alerta se `margem_real` < mínimo |
| Kits e combos | `kit_item` referencia variantes; custo = soma dos custos congelados; baixa de estoque item a item |
| Rendimento real | Comparar `qtd_real` com `qtd_prevista` do lote; recalcular custo unitário real e sugerir ajuste da receita |
| Recompra | Consulta de última venda por cliente; notificação local; mensagem pronta via `wa.me` |
| Custo de entrega/feira | Lançamento com tipo "custo de canal", rateado nas vendas do dia |
| Controle de faturamento | Soma anual das vendas pagas versus limite configurável; alertas em 80% e 100% |
| Alérgenos e nutrição | Herança da receita (união dos alérgenos dos insumos); tabela por porção = soma ponderada por 100 g; texto "Contém: ..." na etiqueta |
| QR Pix | Gerar o BR Code estático (payload EMV do Banco Central com CRC16-CCITT) localmente, com valor e chave configurados; renderizar QR e "copia e cola" offline |
| Rastreabilidade | `venda_item.lote_id`; consulta inversa lote → clientes |
| Calendário | Visão semanal/mensal sobre `encomenda`, com carga de produção por dia e capacidade diária configurável |
| Pedido por WhatsApp | Texto colado → extração de itens, quantidades e data por regras (com IA opcional); **sempre** exige confirmação antes de criar |
| Ficha de produção | Receita escalada para a quantidade do dia, em gramas, exportada em PDF |

---

## 11. Qualidade e testes

### 11.1 Pirâmide

1. **Unitários (Vitest):** domínio de unidades, custo, preço, margem, transição de encomendas, exportação CSV, compatibilidade de cabeçalhos Sheets e operações de estoque com banco fake. Os valores da seção 5.3 são testes de ouro.
2. **Integração com SQLite real (pendente):** compra/custo médio, produção transacional, venda FEFO e fiado ainda precisam de testes que abram SQLite em memória; os testes atuais de operações usam um `Db` fake.
3. **Componentes (Testing Library) e E2E (Playwright/Appium):** ainda não configurados.
4. **Sincronização:** há testes unitários para merge por `updated_at`, empate de `device_id` e compatibilidade de cabeçalho antigo; chamadas reais/fake à API, erro 429, expiração de token e concorrência entre aparelhos ainda requerem testes.

### 11.2 Fluxos E2E críticos

1. Cadastrar insumo/receita/produto → registrar compra → conferir custo médio ponderado e saldo.
2. Produzir lote com embalagem e perda → conferir baixa de insumos, entrada de produto e validade.
3. Registrar venda com estoque disponível → conferir baixa FEFO e lote/custo congelados.
4. Tentar produzir/vender sem saldo → conferir aviso e obrigatoriedade da justificativa.
5. Criar cliente e encomenda com sinal → transitar estados → entregar e conferir venda/financeiro sem duplicar o sinal.
6. Conferir relatórios por período e exportações PDF/CSV; testar sincronização offline e retomada em aparelhos autorizados.

### 11.3 Convenção de identificadores de teste

Todo elemento interativo recebe `data-testid` e rótulo de acessibilidade no formato `tela.elemento`, por exemplo `venda.finalizar`, `insumo.preco`, `receita.adicionar-ingrediente`, `nav.fab-venda`. Esses IDs são parte do contrato e não mudam com o visual.

### 11.4 Critérios gerais de aceite

- Valores financeiros persistidos em centavos; a cobertura de 100% de `domain/` é meta ainda não medida.
- Abertura do app em menos de 2 s em aparelho modesto e telas principais em menos de 100 ms após dados locais.
- Telas operacionais utilizáveis offline. Rascunho automático ainda não está implementado; portanto, formularios fechados antes do salvamento não têm garantia de recuperação.

---

## 12. Critérios de aceite por fase

**Fase 1 (V1)**
- Cadastrar insumos, receitas (com sub-receita e perda) e produtos com variantes 150 g e 300 g.
- Definir custos (hora, gás/energia, taxas, margem) e obter custo por unidade e preço sugerido conforme a seção 5.3.
- Registrar compra de insumo atualizando o preço, e ver o impacto no simulador.
- Venda rápida com as quatro formas de pagamento, comprovante em PDF e compartilhamento.
- Backup e restauração funcionando; dados de exemplo na primeira abertura.

### Auditoria de implementação

| Critério da Fase 1 | Situação |
|---|---|
| Insumos, receitas, sub-receitas, perda, produtos e variantes | Implementado; peso e volume têm colunas separadas. A migração 003 preenche `volume_ml` para receitas líquidas existentes. |
| Custo por unidade e preço sugerido | Implementado, incluindo ingredientes, perda, gás, mão de obra, embalagem e rótulo. Custos fracionários de centavo são mantidos até o custo final do pacote. |
| Compra e impacto da alta de insumo | Implementado: saldo e custo médio ponderado são atualizados, com histórico de custo; o simulador recalcula preços. |
| Venda, pagamentos, comprovante e PDF | Implementado: associação opcional de cliente, fiado vinculado a cliente, desconto fixo, baixa de estoque FEFO, custo congelado e comprovante. |
| Backup JSON e restauração | Exportação e restauração pela tela de conta; o arquivo é validado e pré-visualizado antes da confirmação que substitui os dados locais. |
| Seed demonstrativo | Criado somente quando todas as tabelas estão vazias; os registros incluem “(exemplo)” no nome. O aviso no painel está comentado e não é exibido. |
| Primeiro acesso e nome do usuário | Implementado: é possível continuar somente no aparelho e conectar Google depois; o nome permanece editável no perfil. |
| Validação visual e automatizada | CSS responsivo existente; testes automatizados de UI, integração real com SQLite, E2E e cobertura integral de domínio continuam pendentes. |

### Fase 2 — estoque e produção

| Critério | Situação |
|---|---|
| Saldo e mínimo de insumos e variantes | Implementado, sem inventar saldo inicial em banco legado; mínimo editável e filtro de reposição para insumos. |
| Compra/custo médio e histórico | Implementado com fórmula ponderada, entrada de estoque, fornecedor, estado de pagamento e movimentação. |
| Produção de lote | Implementada com cálculo recursivo de sub-receitas/perda, baixa de insumos e embalagens, entrada de variantes e criação de lote/saídas/movimentos dentro de uma transação. |
| Venda e rastreabilidade FEFO | Implementada: lotes ordenados por validade; itens registram `lote_id` e custo unitário congelado. |
| Perdas, ajustes e justificativas | Implementados; movimento guarda tipo e motivo. Operações que deixam saldo negativo exigem justificativa. |
| Validade e lista de compras | Lotes vencidos/próximos de vencer aparecem na tela de produção; lista soma encomendas abertas, desconta estoque acabado e apresenta falta por insumo. |

### Fase 3 — clientes, encomendas e financeiro

| Critério | Situação |
|---|---|
| Clientes e fornecedores | Cadastro, edição e remoção/anonimização de dados pessoais; fornecedores são vinculáveis a compras. |
| Encomendas | Cadastro com itens, data, sinal, observações e estados pedido → produzindo → pronto → entregue/cancelado; edição antes da conclusão. |
| Entrega e venda | A entrega de pedido pronto registra venda e baixa de estoque, preserva o sinal já pago e substitui somente o saldo pendente. |
| Financeiro | Receitas/despesas manuais, entradas de venda/sinal, contas a receber do fiado, contas a pagar de compra e baixa de pagamento com atualização do documento de origem. |
| Limitações | O financeiro não oferece pagamento parcial; edição de lançamentos automáticos não é permitida. |

### Fase 4 — relatórios e sincronização

| Critério | Situação |
|---|---|
| Relatórios | Filtro por período; vendas, faturamento, recebido, pendências, lucro por produto, melhores clientes e histórico de custo. |
| PDF/CSV | Exportação local de relatórios; CSV escapa conteúdo e neutraliza fórmulas de planilha. |
| Google Sheets | Espelho em lote já existente; esquema 7 aceita versões remotas anteriores com colunas antigas como prefixo, completa defaults e reescreve os cabeçalhos na versão atual. |
| Confiabilidade | Merge por chave e `updated_at`, desempate determinístico e gravação local offline; teste de API real, falhas de rede, quota e conflito concorrente entre aparelhos ainda pendente. |

**Resultado:** os fluxos funcionais das Fases 1 a 4 estão presentes no front e na camada SQLite. Ainda faltam automação UI/E2E, teste da integração com as APIs Google em ambiente autorizado e rascunho automático de formulários; estes itens não são declarados como concluídos.

**Fases 5 e 6:** conforme a seção 10, continuam no backlog e fora do escopo implementado.

---

## 13. Build, entrega e operação

- **Ambientes:** desenvolvimento (web via `vite`), homologação (APK/TestFlight) e produção.
- **Comandos-base:** `npm run dev`, `npm run build`, `npx cap sync`, `npx cap open android|ios`.
- **Android:** build assinado (AAB) para a Google Play, com APK para distribuição interna.
- **iOS:** exige Mac, Xcode e conta de desenvolvedor Apple; começar por TestFlight.
- **PWA:** versão web instalável planejada como alternativa enquanto as lojas não estiverem prontas.
- **CI planejada (GitHub Actions):** lint, testes unitários e de integração a cada push; E2E web a cada pull request; build de APK de homologação a cada tag.
- **Migrações de banco:** arquivos numerados em `data/migrations/`, aplicados na abertura do app após verificar versão e colunas existentes; o fluxo atual não agrupa todas as migrações em uma transação única.
- **Versionamento:** versão semântica do app e `schema_version` do banco/backup.
- **Observabilidade:** registro local de erros, com envio opcional (Sentry) apenas se o usuário permitir.

---

## 14. Riscos e decisões em aberto

| Tema | Risco ou dúvida | Sugestão |
|---|---|---|
| Publicação iOS | Custo e exigência de Mac | Começar por Android e PWA; iOS via TestFlight |
| Cotas do Google Sheets | 60 leituras e 60 gravações por minuto por usuário | Sincronizar em lote, uma chamada por ciclo; meta de até 20 chamadas por minuto |
| OAuth Google | O consentimento externo pode exigir usuários de teste ou verificação para publicação ampla | Configurar os clientes OAuth e as APIs Drive/Sheets; reconectar tokens expirados |
| Conflito entre dois aparelhos | Mesmo cadastro alterado nos dois | Última escrita vence; saldos de estoque são reconstruídos pela soma dos movimentos mesclados; testes de concorrência ainda necessários |
| Edição manual da planilha | Linhas apagadas ou alteradas à mão | Abas protegidas e validação no recebimento; edição manual não suportada |
| Precificação | Rateio de custos fixos é subjetivo | Parâmetro simples (valor mensal ÷ lotes estimados) editável |
| Alérgenos e nutrição | Informação com implicação legal em rótulo | Tratar como apoio; revisar com responsável técnico antes de imprimir |
| QR Pix | Detalhes do padrão do Banco Central | Validar a geração com leitores de bancos diferentes |
| Pedido por WhatsApp com IA | Custo, privacidade e erros de interpretação | Começar por regras simples; IA opcional com confirmação |
| Nota fiscal | Varia por cidade e regime | Fora do escopo; avaliar integração depois |

### Próximos passos recomendados

1. Aumentar testes automatizados de interface e integração com SQLite; medir a cobertura do domínio e testar o sync com falhas/quota.
2. Implementar rascunho automático e conectar exportação/restauração JSON ao menu; avaliar lembrete e senha opcional.
3. Validar os novos fluxos em web e Android, incluindo atualização/migração das planilhas v6 para v7.
4. Planejar entrega PWA/Android/iOS e CI depois de definir o ambiente de publicação.
5. Configurar e validar consentimento OAuth e APIs do Google Cloud antes do uso diário em produção.

---

## 15. Histórico de versões

- **1.0:** documento inicial (banco local, com nuvem opcional).
- **1.1:** sincronização definida como espelho em Google Sheets (banco local continua sendo a fonte de dados do aparelho); atualizadas as seções 2, 3, 4, 6, 8, 9, 11, 12 e 14.
- **1.2:** registrada a auditoria da Fase 1, a distinção entre custo da V1 e estoque da Fase 2, e a coluna de volume para variantes líquidas.
- **2.0:** documentadas as Fases 2–4 implementadas, custo médio e movimentos de estoque, operações de clientes/encomendas/financeiro, relatórios e reconstrução de saldos no sync; registrado o texto padrão `Selecione` dos dropdowns.
