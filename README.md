# MZ Gestão

Aplicativo de gestão para a MZ Bolachas da Maquiele, feito com React, TypeScript, Vite, Capacitor e SQLite local. A referência visual é [docs/design-telas.html](docs/design-telas.html); as regras e o escopo estão em [docs/documentacao-tecnica.md](docs/documentacao-tecnica.md).

## Como executar

```bash
npm install
npm run dev
npm run build
npm test
```

O banco web usa `jeep-sqlite`; no Android/iOS, o app usa o plugin SQLite do Capacitor. O banco inicia sem cadastros demonstrativos; uma migração remove do uso os registros de exemplo das instalações existentes, preservando os demais dados.

## Modo local e sincronização Google

O acesso ao aplicativo exige uma conta Google. No primeiro acesso, entre com a conta que será usada para criar a planilha `MZ Gestão - Dados` no Drive. Para manter os dados iguais em outros aparelhos, entre com a mesma conta em cada um. O app sincroniza o SQLite local após alterações, ao voltar a ficar online e ao usar **Sincronizar agora**. Os dados também ficam salvos no aparelho. Conflitos são mesclados por registro usando `updated_at` (última gravação vence). Ao sair da conta, o app retorna à tela de login e exige autenticação Google para continuar.

Em **Mais → Conta Google e sincronização**, também é possível exportar um backup JSON e validar/restaurar um backup local. A restauração substitui os dados presentes no aparelho.

Antes de usar:

1. No Google Cloud Console, crie um projeto, configure a tela de consentimento OAuth e habilite **Google Drive API** e **Google Sheets API**. Para um app externo em teste, adicione as contas permitidas como test users.
2. Crie clientes OAuth para Web, Android e iOS. No cliente Android, use o package `br.com.mzbolachas.gestao` e o SHA-1 da chave de assinatura usada para compilar. Use os IDs públicos de cliente OAuth; **não** coloque client secrets no app.
3. Copie `.env.example` para `.env` e preencha `VITE_GOOGLE_WEB_CLIENT_ID`, `GOOGLE_WEB_CLIENT_ID` e `GOOGLE_IOS_CLIENT_ID`. No cliente OAuth Web, cadastre como origens JavaScript autorizadas as origens exatas usadas no navegador, sem caminho: por exemplo, `http://127.0.0.1:5173` para este servidor de desenvolvimento e o domínio HTTPS da versão publicada. `localhost` e `127.0.0.1` são origens diferentes. O erro `400: origin_mismatch` indica que a origem aberta não está cadastrada nesse cliente Web; corrija-a em **Google Cloud Console → APIs e serviços → Credenciais → cliente OAuth Web → Origens JavaScript autorizadas**. O ID Web também é usado como público do token no login nativo Android; o cliente OAuth Android é validado pelo package e SHA-1 registrados no Google Cloud. Os IDs são públicos; nenhum segredo OAuth deve ser incluído no app.
4. Gere as plataformas nativas se ainda não existirem (`npx cap add android` e, em um Mac, `npx cap add ios`), configure o URL scheme reverso do cliente iOS, depois rode `npm run cap:sync` com os IDs necessários disponíveis no ambiente.

A autorização pede o escopo restrito `drive.file`; os tokens não são gravados no SQLite nem no `localStorage`. Na web, o token fica em memória e pode ser necessário reconectar após expirar ou reabrir o navegador. As planilhas destinam-se ao mesmo usuário Google em todos os aparelhos; compartilhamento com outras contas não é feito automaticamente.

## Gerar APK Android

Com os IDs OAuth configurados no `.env`, gere o APK de depuração com:

```powershell
npm run cap:sync
Push-Location android
.\gradlew.bat assembleDebug
Pop-Location
```

O arquivo fica em `android/app/build/outputs/apk/debug/app-debug.apk`. Esse APK é assinado com a chave de depuração e serve para instalação/testes; para publicar na Play Store, configure uma chave de release e cadastre no Google Cloud o package `br.com.mzbolachas.gestao` com o SHA-1 da chave correspondente.

## Escopo implementado

| Área | Estado |
|---|---|
| Painel e navegação | Resumo de vendas, lucro estimado, contadores e ações rápidas; navegação com ícones SVG |
| Insumos e compra | Cadastro, edição, pesquisa, exclusão protegida por referências e atualização do último preço pago |
| Receitas | Cadastro e edição, perda, sub-receitas, tempo, modo e etapas de preparo; custos de ingredientes, gás e mão de obra |
| Produtos e variantes | Variações por unidades, peso em g ou volume em ml, embalagem, rótulo e preço; edição por variante |
| Precificação | Preço sugerido por produto/variante e simulador de aumento de custo dos insumos |
| Venda e comprovante | Carrinho, Pix/dinheiro/cartão/fiado, comprovante compartilhável e PDF local |
| Estoque e produção (Fase 2) | Saldo e mínimo de insumos/variantes, movimentos de compra, ajuste, perda, venda e produção; lotes, validade, custo médio ponderado, baixa FEFO e lista de compras por encomendas |
| Operação (Fase 3) | Clientes, fornecedores, encomendas com sinal e status, entrega integrada à venda, contas a pagar/receber e lançamentos manuais |
| Relatórios (Fase 4) | Vendas e lucro por período, produtos mais rentáveis, melhores clientes, histórico de custo e exportação CSV/PDF |
| Primeiro acesso e persistência | Login Google obrigatório, SQLite com migrações aditivas e sem dados demonstrativos |
| Login e sincronização Google | OAuth Capacitor/Web obrigatório, planilha criada no Drive do usuário, mesclagem por registro, sincronização automática online e migração de cabeçalhos da versão anterior |
| Backup local | Exportação e validação/restauração de backup JSON pela tela de conta |
| Apresentação | Componentes e cores alinhados à galeria de design; layout responsivo verificado entre 320 e 1280 px |

## Pendências conhecidas

- Rascunho automático de formulários e testes automatizados de interface, integração com SQLite real e E2E.
- CSV de backup geral e criptografia opcional do arquivo JSON.
- A galeria de design contém também telas de fases futuras (Fases 5 e 6), ainda fora do escopo implementado.

Os valores finais são armazenados em centavos. Compras atualizam o saldo e o custo médio ponderado; cadastros antigos sem saldo inicial não recebem estoque fictício durante a migração.
