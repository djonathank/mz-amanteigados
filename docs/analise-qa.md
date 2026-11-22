# Análise de QA e plano de cobertura — MZ Gestão

**Escopo analisado:** código e documentação presentes no repositório em 22/11/2026.  
**Objetivo:** orientar uma validação lenta, repetível e rastreável das funcionalidades existentes.  
**Estado desta análise:** rodada funcional e visual em andamento; registro atualizado em 22/11/2026.

## 1. Resumo executivo

O produto declara funcionalidades das Fases 1 a 4: cadastros e custos, vendas, estoque e produção, operação de encomendas/financeiro, relatórios, backup local e sincronização Google. Há testes Vitest de domínio e camada de dados, incluindo casos de custo/preço, compras, estoque, validação, CSV/PDF e merge de sincronização.

A cobertura atual não equivale a uma validação completa do produto. A documentação registra testes de operação com `Db` fake, ausência de testes de componentes e E2E, ausência de integração com SQLite real e falta de testes de chamadas Google sob falhas, quota, expiração e concorrência. Há ainda fluxos que dependem de configuração externa (OAuth/Drive/Sheets) e de dispositivos Android/iOS.

**Conclusão:** é possível iniciar por uma rodada controlada da web e pela expansão da automação, mas não há evidência no repositório para afirmar que todas as funcionalidades estão aprovadas em produção. As Fases 5 e 6 são backlog, não devem ser contadas como funcionalidade entregue.

## 2. Inventário funcional e risco inicial

| Área | Funcionalidades a validar | Risco | Observação de cobertura atual |
|---|---|---:|---|
| Primeiro acesso e conta | perfil local, login Google obrigatório quando configurado, logout, retorno à tela de acesso, navegação protegida | Crítico | UI/E2E pendentes; testar em navegador e Android |
| Insumos e compras | cadastro/edição/exclusão protegida, unidades, fornecedor, compra paga/a prazo, edição/cancelamento, histórico, custo médio e financeiro | Crítico | Diversos testes de repositório; SQLite real e interface pendentes |
| Receitas e custos | ingredientes e sub-receitas, ciclos, rendimento/perda, tempo, gás/mão de obra, edição e exclusão protegida | Crítico | Alguns testes de domínio/repositório; cobertura visual incompleta |
| Produtos e precificação | variantes por peso/volume/unidades, embalagem/rótulo, preço sugerido, margem/taxas, simulador | Alto | Testes de ouro e cálculos; fluxos de tela pendentes |
| Estoque e produção | mínimos, ajustes, perdas, justificativas, lotes/validade, baixa de insumos e entrada de variantes, alertas e lista de compras | Crítico | Testes de operações existentes; produção transacional/SQLite real pendente segundo a documentação |
| Venda e comprovante | carrinho, quantidade, desconto, 4 pagamentos à vista, cliente obrigatório, baixa FEFO, custo congelado, PDF/compartilhamento | Crítico | Regra de cliente e métodos de pagamento testados; fluxo integral UI/SQLite real pendente por falta de cliente de teste |
| Clientes e fornecedores | validações, edição, remoção/anonimização, vínculo com encomenda/compra | Alto | Cobertura parcial de validação/repositório; UI pendente |
| Encomendas | itens/sinal, transições, cancelamento, entrega convertida em venda, estoque e financeiro sem duplicidade | Crítico | Estado de domínio e parte dos dados cobertos; caminho completo precisa de integração real |
| Financeiro | lançamentos manuais, categorias, contas a pagar/receber, quitação e vínculo à origem, separação pessoal/negócio | Crítico | Cobertura parcial; reconciliação ponta a ponta pendente |
| Relatórios e exportação | período/fuso, totais, lucro, clientes/produtos, histórico, CSV e PDF | Alto | CSV/PDF possuem testes; validar totais de ponta a ponta e interface |
| Backup e restauração | exportação, arquivo inválido/limites, prévia, confirmação, substituição, compatibilidade de versões | Crítico | Validação fake parcial; restauração em SQLite real e recuperação após falha pendentes |
| Google Sheets | criar/localizar planilha, sync inicial, push/pull, merge, exclusões, offline/retomada, token, quota e conflito | Crítico | Merge/cabeçalhos testados; integração API e falhas de rede pendentes |
| Navegação/responsividade | rotas, botão voltar Android, estados vazios, erros, teclado, layout 320–1280 px e acessibilidade | Alto | Rotas web navegadas; largura testada em 320, 375, 768 e 1280 px sem overflow horizontal; Android e acessibilidade assistiva pendentes |

## 3. Plano de execução manual, lento e controlado

### Preparação e proteção de dados

1. Usar ambiente de homologação e conta Google de teste; nunca usar dados reais de clientes.
2. Registrar versão/build, navegador/OS, resolução, fuso, conectividade, configuração OAuth e estado inicial do banco.
3. Criar backup inicial e confirmar que é possível identificar/restaurar o arquivo antes de qualquer cenário destrutivo.
4. Usar um conjunto pequeno e determinístico: um fornecedor, um cliente, insumos secos e líquidos, receita simples e receita com sub-receita, variantes, lotes com validades distintas e categorias financeiras.
5. Para cada cenário, executar uma ação por vez; registrar pré-condição, dados, passos, resultado esperado/observado, evidência (captura/arquivo/log), severidade e resultado. Após cenário destrutivo, restaurar ou preparar dados novos.

### Sequência sugerida

1. **Acesso e navegação:** primeiro acesso local, login/logout Google conforme configuração, acesso direto a rotas protegidas, recarga, voltar do Android e sessão sem rede.
2. **Cadastros:** valores válidos, limites, campos obrigatórios, espaços/acentos, duplicidades, editar, cancelar formulário, excluir com e sem vínculos, estados vazios.
3. **Unidades e custos:** g/kg, ml/L, unidade, conversões, incompatibilidades, custo zero, centavos, perda, rendimento fracionário, sub-receitas aninhadas e ciclo inválido. Reconciliar valores manualmente com a fórmula documentada.
4. **Compra:** paga e a prazo, uma e várias linhas, unidades de compra diferentes, custo mais caro/mais barato, fornecedor ausente, datas inválidas, total divergente, edição e cancelamento. Conferir saldo, custo médio, histórico, movimento e lançamento financeiro após cada ação.
5. **Produção/estoque:** lote válido, perda, embalagens, validade, variantes, quantidade insuficiente, justificativa, erro no meio da operação e repetição após erro. Conferir atomicidade: ou todas as tabelas/saldos mudam, ou nenhuma muda.
6. **Venda:** cada pagamento à vista, várias variantes, desconto zero/máximo, cliente obrigatório, estoque insuficiente, lotes vencidos e FEFO. Conferir baixa, lote escolhido, custo congelado, lucro, comprovante PDF e compartilhamento. Fiado não faz parte do produto.
7. **Encomenda e financeiro:** criar sem/com sinal, editar antes de concluir, transições permitidas e proibidas, cancelamento, entrega após produção, pagamento do saldo. Conferir que sinal não duplica e que venda/estoque/lançamentos conciliam.
8. **Relatórios:** períodos com limites inclusivos, virada de mês/ano, fuso local, sem dados, dados pagos/pendentes, itens excluídos/anonimizados; comparar cada total com consulta/listagem de origem. Exportar CSV/PDF e inspecionar caracteres, acentos e valores.
9. **Backup:** exportar, validar arquivo íntegro, arquivo truncado, JSON malformado, tabela/campo ausente, limite de tamanho/linhas, prévia e cancelamento. Restaurar em ambiente descartável, comparar contagens e relações; simular falha e verificar integridade do banco.
10. **Sincronização:** sem credencial, conexão inicial, dois dispositivos, offline com alterações em ambos, reconexão, empate de timestamp, exclusão, token expirado, erro 429/5xx e planilha/schema antigo. Conferir resolução e preservar invariantes de estoque/financeiro.
11. **Compatibilidade e acessibilidade:** web em 320, 375, 768 e 1280 px; Android real/emulador, rotação, escala de fonte, teclado numérico, foco/teclado, rótulos de botões, contraste e alvos de toque.

## 4. Critérios transversais de aceite

- Nenhuma ação inválida grava parcialmente dados, movimentos ou lançamentos.
- Valores finais persistidos em centavos; conversões e arredondamentos reproduzíveis.
- Estoque, financeiro e documentos de origem conciliam após criar, editar, pagar, cancelar e restaurar.
- Operações locais principais funcionam sem rede; sincronização posterior não duplica nem perde registros.
- Erros orientam a correção, não expõem tokens ou dados sensíveis e permitem recuperação segura.
- Rotas e ações destrutivas respeitam autenticação/confirmação e não apagam o histórico necessário à auditoria.
- Resultado deve ser rastreável a requisito, caso, build e evidência; defeitos devem incluir passos mínimos de reprodução.

## 5. Lacunas prioritárias para automação

1. Adicionar suíte de componentes e E2E com seletores estáveis (`data-testid`), começando por login/navegação, compra → produção → venda, encomenda → entrega e backup.
2. Exercitar migrações e operações com SQLite real em memória; verificar transações, chaves estrangeiras, reabertura e restauração.
3. Criar testes de falha/repetição para sync e APIs simuladas: offline, timeout, 401, 403, 429, 5xx, payload malformado e conflito entre aparelhos.
4. Medir cobertura (linhas e branches) de `src/domain/` e definir metas explícitas; cobertura numérica não substitui testes de regras e cenários negativos.
5. Adicionar testes para datas/fuso, arredondamento monetário, limites, idempotência de ações repetidas e reconciliação entre estoque e ledger.
6. Rever a divergência documental do primeiro acesso/backup: a especificação antiga inclui seed demonstrativo e critérios de backup na Fase 1, enquanto as notas atuais descrevem fluxo local sem exigir Google e backup pela conta. Fixar o comportamento esperado antes do aceite.

## 6. Achados desta rodada

| ID | Severidade / estado | Evidência | Impacto e próximo passo |
|---|---|---|---|
| QA-01 | **Resolvido — código e recarga web validados** | `abrir()` não exclui o banco antes de `conn.open()`. O armazenamento IndexedDB é inicializado sem limpeza e as gravações são persistidas com `saveToStore()` ([db.ts](../src/data/db.ts#L62)). Após recarregar a rota `/mais`, dados locais existentes continuaram visíveis. | A exclusão automática identificada na rodada anterior não está mais presente. A validação confirmou a reabertura com os dados que já existiam no perfil de teste. |
| QA-02 | **Não reproduzido nesta validação; navegação funcional** | As 15 rotas renderizaram diretamente e não houve erro JavaScript de página nessa sequência. Houve uma espera inicial de alguns segundos durante abertura do banco. | A falha anterior não foi reproduzida, mas o carregamento inicial merece acompanhamento. `npm test` passou com 147 testes em 16 arquivos. Se o erro voltar, guardar stack trace e identificar o estado do HMR antes de atribuí-lo ao React ou ao app. |
| QA-03 | **Parcialmente mitigado; origem do 429 pendente** | `googleRequest()` repete até três vezes falhas de rede, HTTP 429 e 5xx, com espera crescente ([googleSheetsSync.ts](../src/data/googleSheetsSync.ts)). Não houve 429 durante esta validação; portanto, não foi possível associar o registro anterior a um endpoint específico. | O retry cobre a API Google Sheets usada por essa função. A URL/recurso das três respostas 429 originais continua desconhecida e deve ser coletada caso se repitam. |
| QA-04 | **Aviso persiste; persistência após recarga validada** | `npm run build` concluiu. Vite/Rolldown ainda informa que o módulo Node `crypto` foi externalizado para compatibilidade com navegador, importado por `jeep-sqlite`. A rota `/mais` reabriu com os dados locais existentes após recarga. | O aviso não impediu o build nem a reabertura observada. Backup exportar/restaurar não foi exercitado nesta rodada; validar esse fluxo separadamente antes de declarar todo o QA-04 concluído. |
| QA-05 | **Resolvido — venda exige cliente e não oferece Fiado** | A tela exibe “Cliente obrigatório”; o cliente é validado antes da transação. Vitest cobre Pix, dinheiro, débito e crédito sem cliente, e rejeita `fiado` como forma inválida ([sales.test.ts](../src/data/sales.test.ts)). | O requisito foi implementado na interface e na camada de dados. Não foi criada venda real porque o perfil aberto não tem cliente de teste disponível. |
| QA-06 | **Sem overflow nas larguras verificadas** | As 15 rotas principais carregaram no browser em 320, 375, 768 e 1280 px; `documentElement.scrollWidth` não ultrapassou `innerWidth`. Não surgiram erros JavaScript de página nessa varredura. | O teste mede largura e renderização, não substitui inspeção visual de cada estado nem valida leitor de tela, contraste, teclado físico ou Android/iOS. O botão central “Criar novo” tem 64×64 px e permanece dentro da navegação no viewport móvel verificado. |
| QA-07 | **Resolvido — taxa específica, sem fallback** | Débito consulta exclusivamente `taxa_cartao_debito` e crédito exclusivamente `taxa_cartao_credito`. O simulador não usa a chave genérica antiga nem substitui taxa ausente por 3,5%; mostra “Não configurada”. Testes cobrem taxas diferentes por modalidade e confirmam que a chave antiga não é consultada. | Evita registrar ou simular uma taxa diferente da definida para a modalidade. Criação de vendas reais foi evitada porque o perfil não tem cliente de teste. |

## 7. Limites desta análise

Foram percorridas as 15 rotas web principais, incluindo `/receitas`, `/vender`, `/estoque`, `/compra`, `/encomendas`, `/financeiro` e `/relatorios`; as telas responderam e a rota `/mais` reabriu com os dados existentes. O botão central abriu o fluxo de vendas; o modo agendado continuou exigindo cliente; nenhum dos modos apresentou Fiado. Foram verificados layouts em 320, 375, 768 e 1280 px. A suíte passou com 147 testes em 16 arquivos e `npm run build` concluiu com o aviso de `crypto` do `jeep-sqlite`. O fluxo completo de compra/produção/venda, edição de entidades, exportação/restauração, OAuth/Drive/Sheets, Android/iOS e ações que gravariam dados reais continuam pendentes. Sem um cadastro de cliente descartável no perfil, a venda não foi finalizada. Esta rodada amplia a cobertura web, mas não certifica toda a operação em produção.
