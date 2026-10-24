# MZ Gestão

Aplicativo de gestão para a MZ Bolachas da Maquiele. Reúne cadastro de insumos e receitas, custos e precificação, vendas, estoque, encomendas, clientes e fornecedores, financeiro e relatórios. A interface é feita em React e TypeScript e usa SQLite local; opcionalmente, os dados podem ser espelhados em uma planilha Google Sheets da própria conta.

## Documentação

- [Documentação técnica](docs/documentacao-tecnica.md): arquitetura, banco, regras de negócio, funcionalidades disponíveis e limitações conhecidas.
- [Galeria de telas](docs/design-telas.html): referência visual explorável; inclui propostas que ainda não existem na aplicação.

## Requisitos e comandos

Use Node.js compatível com as versões atuais do Vite e Capacitor e npm.

```bash
npm install
npm run dev
npm run build
npm test
```

O Vite imprime o endereço local ao iniciar. O banco web usa `jeep-sqlite` e `sql.js`; Android/iOS usam `@capacitor-community/sqlite`. As migrações locais vão até a versão 9. Instalações novas não recebem cadastros demonstrativos e a migração 008 arquiva os dados de demonstração conhecidos em bases existentes.

## Plataformas nativas

O Capacitor está configurado com o identificador Android `br.com.mzbolachas.gestao`. Para preparar ou atualizar as plataformas nativas:

```bash
npx cap add android
# Em um Mac com Xcode:
npx cap add ios
npm run cap:sync
```

`cap:sync` executa o build web e sincroniza os arquivos e plugins nativos. Para gerar APK Android de depuração:

```powershell
npm run cap:sync
Push-Location android
.\gradlew.bat assembleDebug
Pop-Location
```

O APK fica em `android/app/build/outputs/apk/debug/app-debug.apk`. Ele usa a chave de depuração; publicação exige assinatura de release e configuração das credenciais correspondentes.

## Uso local e Google Sheets opcional

O primeiro acesso pode ser feito **somente neste aparelho**, informando o nome do perfil. Não é necessário entrar com Google para usar as telas, registrar operações ou guardar dados locais. O SQLite local é a fonte dos dados exibidos; a sincronização Google é opcional e requer conexão à internet.

No perfil, acessado pelo avatar na tela inicial, conecte uma conta Google para criar/localizar a planilha `MZ Gestão - Dados` no Drive dessa conta. Use a mesma conta nos aparelhos que devem compartilhar os dados. O app sincroniza após alterações locais (agrupadas por 1,5 s), quando a conexão volta e sob demanda. Registros são mesclados por chave e `updated_at`; saldos de estoque são reconstruídos pelos movimentos sincronizados. A edição manual da planilha não é suportada.

Para habilitar o OAuth e a sincronização:

1. No Google Cloud Console, crie um projeto, configure o consentimento OAuth e habilite Google Drive API e Google Sheets API. Em modo de teste externo, cadastre os usuários autorizados.
2. Configure clientes OAuth para Web e Android (e iOS se a plataforma for usada). No cliente Android, registre o package `br.com.mzbolachas.gestao` e o SHA-1 da chave de assinatura. Use IDs públicos de cliente OAuth; não inclua client secrets no aplicativo.
3. Copie `.env.example` para `.env` e preencha `VITE_GOOGLE_WEB_CLIENT_ID`, `GOOGLE_WEB_CLIENT_ID` e, quando necessário, `GOOGLE_IOS_CLIENT_ID`. No cliente Web, autorize as origens exatas do navegador (por exemplo `http://127.0.0.1:5173`); `localhost` e `127.0.0.1` são origens distintas.
4. Para iOS, configure também o URL scheme reverso do cliente conforme a configuração do plugin Google Auth.

O app solicita `drive.file`. Tokens de acesso ficam em memória, não no SQLite nem no `localStorage`; o e-mail e o ID da planilha são usados localmente para lembrar a conta/arquivo. Na web, pode ser necessário reconectar após expiração ou recarregar a página. Não há backend próprio nem compartilhamento automático da planilha com outras contas.

## Funcionalidades disponíveis

| Área | O que existe na aplicação |
|---|---|
| Início e navegação | Resumo do mês e do dia; barra inferior para Início, Receitas, ação central, Estoque e Mais |
| Insumos e compras | Cadastro, busca, edição, estoque mínimo, movimentos/ajustes/perdas e compra com fornecedor, saldo e custo médio ponderado |
| Receitas e produtos | Receitas com sub-receitas, perda, modo e etapas; produtos com variantes por unidades, peso ou volume e embalagem/rótulo |
| Custos e precificação | Custo de ingredientes, mão de obra, gás, embalagem e rótulo; preço sugerido, margem, taxa de pagamento e simulação de aumento de insumo |
| Vendas e comprovante | Carrinho, cliente, Pix/dinheiro/cartão, desconto, baixa de estoque, justificativa para saldo negativo, compartilhamento de texto e PDF |
| Estoque | Saldos de insumos e produtos, alertas, ajustes, perdas e movimentos de estoque |
| Clientes, fornecedores e encomendas | Cadastro de contatos, pedidos agendados, finalização, pagamento na entrega e cancelamento |
| Financeiro e relatórios | Lançamentos, contas a pagar/receber, resumo por período, lucro estimado, clientes/produtos e exportação CSV/PDF de relatórios |
| Conta | Nome e avatar de perfil local; conexão e sincronização Google opcionais |

## Limitações conhecidas

- A galeria visual contém telas conceituais para alérgenos, nutricional, kits/canais, calendário e outros recursos ainda não implementados.
- Não há testes de interface/E2E nem integração automatizada com SQLite nativo ou APIs reais do Google.

## Notas de dados

Valores monetários finais são persistidos em centavos; quantidades são armazenadas na unidade base (`g`, `ml` ou `un`). Migrações legadas não inventam saldos iniciais. Compras futuras atualizam o custo médio com base no saldo conhecido.
