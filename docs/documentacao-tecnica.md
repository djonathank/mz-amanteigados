# MZ Gestão — documentação técnica

**Produto:** aplicação de gestão da MZ Bolachas da Maquiele

**Plataformas configuradas:** web e Android via Capacitor; há suporte declarado no código para inicialização OAuth iOS, mas não existe diretório iOS neste checkout.

**Interface:** pt-BR; moeda em reais; quantidades em gramas, mililitros ou unidades.

**Versão observada:** pacote 0.3.0; esquema SQLite local versão 9; esquema Google Sheets versão 7.

**Referências:** [README](../README.md) e [galeria visual](./design-telas.html).

> Este documento descreve o código presente neste repositório. A galeria de telas é uma referência conceitual e inclui ideias que ainda não foram implementadas. As funcionalidades acessíveis, as telas com rota sem atalho e os itens somente planejados são identificados separadamente.

## 1. Resumo da aplicação

O app reúne cadastro e cálculo de custos de receitas e produtos, vendas, controle de estoque, compras, contatos, encomendas, financeiro e relatórios. O banco SQLite local alimenta as telas e permite registrar operações sem internet. A conexão Google é opcional e sincroniza dados com uma planilha no Drive do usuário.

Não há backend próprio. Emissão fiscal, integração bancária, loja virtual e controle de ponto não estão implementados.

## 2. Estado funcional observado

| Área | Situação no código |
|---|---|
| Início, navegação e perfil | Implementados. Nome do perfil fica em `config`; avatar fica no `localStorage` do navegador/WebView. |
| Insumos e estoque | Implementados: cadastro, estoque mínimo, movimentos, ajuste, perda, busca e alertas. Saldo inicial é zero nos registros novos. |
| Compras | Implementadas: entrada de saldo, custo médio ponderado, histórico de preço, fornecedor e lançamento financeiro. |
| Receitas e produtos | Implementados: sub-receitas, perda, etapas de preparo, variantes por unidade/peso/volume, embalagem e rótulo. |
| Precificação | Implementada: custo da variante, margem, taxas de pagamento, simulador de alta de insumo e gravação do preço sugerido. |
| Vendas | Implementadas: carrinho, cliente obrigatório na tela, Pix/dinheiro/cartão, desconto, baixa direta do saldo do produto e registro de comprovante. Pagamento fiado não é oferecido na interface atual. |
| Clientes e fornecedores | Cadastro, edição/listagem e remoção/anonimização implementados. |
| Encomendas | A criação ocorre pelo modo “Venda agendada” em Vendas; há edição enquanto agendada, finalização integrada à venda, pagamento e cancelamento. |
| Financeiro | Lançamentos manuais, contas automáticas de compras/vendas e ação para marcar pendências como pagas. Pagamento parcial não é oferecido. |
| Relatórios | Filtro por período, resumo de vendas/recebido/pendente/lucro estimado, produtos, clientes e histórico de custos; exportação CSV/PDF. |
| Google Sheets | Implementado e opcional. Requer configuração OAuth, rede e consentimento. Sincroniza tabelas de negócio e `config`. |
| Fases conceituais futuras | Alérgenos/nutrição de produto, preços por canal, kits, QR Pix, calendário, recompra automatizada e importação de pedido por WhatsApp não estão implementados. |

## 3. Stack e execução

### 3.1 Tecnologias

| Camada | Implementação |
|---|---|
| Interface | React 18, TypeScript, Vite, React Router 7 e CSS próprio |
| Aplicativo nativo | Capacitor 6; identificador `br.com.mzbolachas.gestao`; plugin SQLite e plugin Google Auth |
| Banco | SQLite com `@capacitor-community/sqlite`; Web usa `jeep-sqlite` e `sql.js` |
| Domínio | Funções puras em `src/domain/` e agregações/cálculos em `src/data/calculos.ts` |
| PDF e CSV | Gerador PDF local próprio e serializador CSV próprio |
| Sincronização | APIs Google Drive/Sheets chamadas diretamente pelo cliente |
| Testes | Vitest; cobertura atual inclui domínio, dados, cálculo, PDF, CSV e merge de sincronização |

Não estão instalados Ionic React, Zustand, React Hook Form, Zod, Recharts, Testing Library, Playwright ou Appium.

### 3.2 Comandos

```bash
npm install
npm run dev
npm run build
npm test
npm run cap:sync
```

Scripts disponíveis em `package.json`: `dev`, `build`, `preview`, `test`, `cap:sync` e `postinstall`. O `build` executa `tsc && vite build`; não existe script de lint. `postinstall` prepara o WASM e ajusta o Capacitor CLI.

Para APK Android de depuração, depois de `npm run cap:sync`, executar `.\gradlew.bat assembleDebug` dentro de `android/`. Não há configuração de assinatura de release documentada no repositório.

## 4. Arquitetura e organização

```text
src/main.tsx
  └─ src/App.tsx: provedores, autenticação opcional, rotas e navegação
      ├─ src/pages/: telas React
      ├─ src/data/: Db, repositórios, operações, sync, backup, relatórios e PDF
      │   └─ src/data/migrations/: SQL numerado (versões locais 1–8)
      └─ src/domain/: dinheiro, datas, unidades, custo, preço, pedidos e máscaras
```

As páginas acessam a interface `Db` por `DbContext`; os módulos de dados executam consultas e transações. `GoogleSyncContext` observa alterações no banco e agenda sincronização quando existe sessão Google válida. `src/domain/` concentra cálculos sem dependência da UI.

### 4.1 Rotas atuais

`/`, `/precificacao`, `/receitas`, `/estoque`, `/planejamento` (redireciona a `/compra`), `/relatorios`, `/clientes`, `/fornecedores`, `/encomendas`, `/financeiro`, `/vender`, `/venda/:id`, `/mais`, `/menu`, `/produtos`, `/compra`, `/custos` e `/primeiro-acesso`. O caminho antigo `/producao` redireciona para Mais.

A barra inferior contém Início, Receitas, ação central e Estoque, além de Mais. O menu Mais oferece Produtos, Vendas, Encomendas, Compras, Custos, Precificação, Clientes, Fornecedores, Financeiro e Relatórios. Conta/perfil e sincronização são acessados pelo avatar na tela inicial. `/planejamento` é um caminho legado para a tela de compras.

## 5. Persistência e esquema

### 5.1 SQLite local

O arquivo é aberto uma vez por sessão (`mzgestao`). No navegador, o componente `jeep-sqlite` inicializa o armazenamento persistente; no nativo, o plugin Capacitor abre SQLite. Chaves estrangeiras são habilitadas. `Db.transaction` agrupa alterações e persiste o armazenamento Web ao concluir.

Migrações locais ficam em `src/data/migrations/`: 001 inicializa o esquema, 002–006 adicionam campos e compatibilidade legada, 007 adiciona elementos de estoque e índices, 008 arquiva registros demonstrativos conhecidos e 009 converte estados antigos de pedidos para agendado. O esquema atual local é 9; tabelas antigas de lotes permanecem no banco para preservar dados existentes, mas não fazem parte dos fluxos atuais.

### 5.2 Entidades

| Grupo | Tabelas |
|---|---|
| Cadastros e composição | `insumo`, `fornecedor`, `cliente`, `receita`, `receita_item`, `produto`, `produto_variante` |
| Compras e estoque | `compra`, `compra_item`, `historico_preco_insumo`, `movimento_estoque` |
| Vendas e pedidos | `venda`, `venda_item`, `encomenda`, `encomenda_item` |
| Financeiro e configuração | `lancamento`, `config` |
| Infraestrutura local/legada | `lote`, `lote_saida`, `sync_outbox`, `sync_state`, `sheet_row_map`, `_migracoes` |

Convenções: IDs são texto; a maioria das entidades usa `created_at`, `updated_at`, `deleted_at` e `device_id`; exclusões são lógicas. Valores finais monetários usam colunas inteiras em centavos. `custo_medio` e custos por unidade-base podem ser `REAL` para preservar frações de centavo no cálculo. Quantidades usam unidade-base `g`, `ml` ou `un`; compras em kg/L são convertidas.

O esquema inclui colunas `alergenos`, `nutricional` e `tabela_preco_id`, além de `lote_id` em itens de venda. A presença da coluna não significa que as telas ou regras de alérgenos, nutrição ou canal estejam implementadas.

## 6. Regras de negócio implementadas

### 6.1 Unidades e custos

- Conversão de compra: kg → g e L → ml por fator 1000; unidades incompatíveis são rejeitadas.
- Cada compra calcula custo por unidade-base, registra histórico, soma o saldo e atualiza custo médio ponderado:

```text
custo_medio_novo = (saldo_antigo × custo_medio_antigo + custo_da_compra) / (saldo_antigo + quantidade_comprada)
```

- Bases legadas sem saldo não recebem quantidade presumida.
- Receita soma ingredientes e sub-receitas recursivamente, considera perda, mão de obra pelo tempo/minuto e valor/hora, gás, embalagem e rótulo. Detecção de ciclo/unidades incompatíveis impede cálculos inválidos.

### 6.2 Preço

`src/domain/pricing.ts` calcula preço sugerido com margem e taxa sobre o preço de venda. A tela usa a variante cadastrada ou permite simulação de custo do lote; o preço calculado pode ser salvo no produto.

### 6.3 Estoque

- Compras, vendas e movimentos manuais atualizam saldos e registram movimento.
- Ajustes e perdas exigem quantidades e motivo conforme operação. Se venda/ajuste resultar em saldo negativo, o fluxo exige justificativa.
- Vendas baixam diretamente o saldo do produto e registram o custo calculado pela receita e pelos insumos.
- Alertas consideram saldos nos limites mínimos de insumos e produtos.

### 6.4 Venda e encomenda

A tela permite venda imediata ou encomenda agendada, exige cliente, suporta Pix/dinheiro/cartão e desconto fixo limitado ao subtotal. Vendas registram itens, custo, baixa de estoque e lançamento financeiro. A forma `fiado` e status pendente existem no modelo/repositório, mas não estão oferecidos na interface de venda atual.

Encomendas registram cliente, data, itens, sinal, total e observações. São criadas pelo modo agendado do carrinho e podem ser editadas enquanto agendadas. A gestão permite finalizar com pagamento Pix/dinheiro/cartão ou cancelar. A finalização cria uma venda pelo saldo restante e remove a conta pendente original do pedido, sem duplicar o sinal.

### 6.5 Financeiro e relatórios

Compras e vendas criam lançamentos relacionados; a tela permite lançamento manual e baixa total de pendências. Relatórios filtram período e apresentam total vendido, recebido, pendente, lucro estimado, produtos, clientes e histórico de preço. Exportações PDF/CSV são geradas localmente. O CSV usa `;`, escapa aspas e neutraliza texto iniciado por fórmula.

## 7. Google Sheets opcional

SQLite continua sendo o banco de cada aparelho. Ao conectar Google, o app procura/cria `MZ Gestão - Dados` no Drive do usuário e sincroniza as tabelas de negócio listadas em `SYNC_TABLES` e `config`; tabelas internas de mapeamento/outbox não são a fonte remota do merge atual.

- OAuth solicita `openid`, `email`, `profile` e `drive.file`.
- Alterações locais são agrupadas por 1,5 s; sincroniza também quando a conexão retorna ou sob demanda.
- Merge usa chave (`id`, ou `chave` para `config`), `updated_at` e desempate por `device_id`; tombstones `deleted_at` são mantidos.
- Saldos de estoque são reconstruídos a partir dos movimentos mesclados.
- A planilha tem uma aba por tabela sincronizada e `_meta`; esquema remoto atual é 7. Versões antigas aceitas dependem de cabeçalho compatível como prefixo; versão futura e cabeçalhos incompatíveis produzem erro.
- A sincronização requer a mesma conta nos aparelhos; não compartilha a planilha com terceiros e edição manual não é suportada.
- O cliente não tem backend próprio. Na web, o token fica em memória e pode exigir novo consentimento após recarga/expiração. Localmente são guardados e-mail e ID de planilha para localizar a conta/arquivo; tokens não são persistidos no `localStorage`.

Configuração OAuth e build nativo estão descritos no [README](../README.md).

## 8. Conta, backup e privacidade

O primeiro acesso não exige Google: a tela local registra o nome do perfil e permite usar o aparelho. Google só é necessário para sincronizar. O avatar é armazenado localmente no `localStorage`.

O módulo `src/data/backup.ts` implementa um formato JSON versão 1, valida as tabelas/colunas e substitui os dados locais dentro de transação na restauração. Os controles estão ativos em `MenuUsuario.tsx`; o usuário pode exportar, validar e restaurar o arquivo. O conteúdo não é criptografado.

Dados pessoais de clientes ficam no banco local e, se o usuário conectar Google, na planilha do próprio Drive. A remoção do cliente anonimiza os campos pessoais e desvincula vendas/encomendas. Não há PIN/biometria, criptografia de backup, consentimento granular para telemetria nem backend de observabilidade implementados neste projeto. Compartilhamento de comprovante depende da API do sistema/navegador e PDF local.

## 9. Referência visual

`docs/design-telas.html` contém uma galeria navegável de telas de referência. Parte das imagens corresponde ao estado anterior ou a propostas; backup visível, conta Google dentro de Mais e funcionalidades das fases futuras devem ser lidos como conceituais. A aplicação usa CSS próprio em `src/styles.css`, componentes locais em `src/pages/ui.tsx` e ícones SVG inline. Não pressupor que gráficos/componentes citados na galeria sejam dependências instaladas.

## 10. Qualidade e limitações

O projeto tem testes Vitest unitários para regras de domínio, cálculo, persistência simulada, exportação PDF/CSV e merge Sheets. `npm run build` executa TypeScript e build Vite. Não há lint configurado, testes de componentes/E2E nem cobertura automatizada de SQLite nativo. A integração contra APIs Google reais e cenários concorrentes entre aparelhos também não têm teste automatizado descrito.

Pontos de atenção operacionais:

- Login/fiado, embora parte exista no domínio/banco, não está completo na UI.
- Google Sheets exige configuração externa, internet e consentimento.
- As telas são responsivas em CSS, mas não há automação visual/E2E configurada.

## 11. Histórico

- **2.1:** revisão de aderência ao repositório; documentados esquema local 8/remoto 7, acesso local sem Google, backup, rotas e lacunas entre a galeria conceitual e a UI atual.
- **2.2:** correção do fluxo de primeiro acesso local, ativação do backup JSON, acesso à produção, transições de encomenda, apresentação responsiva, datas locais, carrinho editável, estoque de variantes e simulação de aumento de custos.
