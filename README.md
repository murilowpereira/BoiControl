# BoiControl

MVP de gestão pecuária da Escopo.tech: controle individual de animais por brinco e histórico de pesagens, com registro offline.

Roda no plano gratuito do Firebase (Spark): Hosting, Auth e Firestore, sem Cloud Functions. O design aprovado está em [`docs/plans/2026-11-01-boicontrol-design.md`](docs/plans/2026-11-01-boicontrol-design.md).

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `packages/core` | Regras compartilhadas: peso em gramas, variação, GMD, indicadores, brinco |
| `apps/web` | PWA React + Vite; `src/operacoes.ts` tem todas as gravações |
| `firestore.rules` | Regras de segurança (acesso por propriedade e perfil) |
| `tests/rules` | Regras e operações do app contra o emulador, inclusive gravações forjadas |
| `tests/backup` | Backup e restauração (CA-16) |
| `tests/e2e` | Teste ponta a ponta do fluxo offline no navegador |
| `scripts` | Implantação inicial, membros, backup e restauração |
| `.github/workflows` | Testes em cada PR e backup diário |

## Desenvolvimento

Requisitos: Node 22 e Java 21 (para os emuladores do Firebase).

```bash
npm install
npm run emuladores          # Auth e Firestore locais (UI em http://127.0.0.1:4000)

# em outro terminal: cria a propriedade de teste e o ADMIN
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  npx tsx scripts/criar-propriedade.ts --projeto demo-boicontrol --id fazenda-teste \
  --nome "Fazenda Boa Vista" --email admin@teste.com --senha senha123

cp apps/web/.env.example apps/web/.env.local   # VITE_USAR_EMULADORES=true
npm run dev -w @boicontrol/web
```

## Testes

```bash
npm test                 # cálculos e estados (CA-03, CA-04, CA-05)
npm run test:rules       # regras e operações (CA-01, CA-02, CA-06, CA-07, CA-12, CA-14)
npm run test:backup      # backup e restauração (CA-16)
npm run test:e2e         # fluxo offline no navegador (CA-08 a CA-11); requer Playwright + Chromium
```

## Implantação (plano Spark, sem custo)

1. Criar dois projetos Firebase (homologação e produção) no plano Spark, com Firestore em `southamerica-east1`.
2. Ativar Authentication (e-mail/senha e Google) e App Check com reCAPTCHA v3.
3. Preencher `apps/web/.env.local` com a configuração do projeto (Console > Configurações do projeto).
4. `npm run build -w @boicontrol/web && npx firebase deploy --only hosting,firestore --project <id>`.
5. Gerar uma chave de conta de serviço e rodar `scripts/criar-propriedade.ts` para criar a propriedade e o primeiro ADMIN. Depois disso, o ADMIN adiciona pessoas e renomeia a fazenda pela tela **Ajustes** (convite por e-mail: a pessoa entra com o Google usando esse e-mail). Outros usuários: `scripts/adicionar-membro.ts` (também desativa com `--desativar`). Sem `--senha`, a conta é criada sem senha e a pessoa entra com "Entrar com Google" usando o mesmo e-mail (o uid é mantido, então o vínculo vale).
6. Backup: no GitHub, criar os secrets `FIREBASE_SERVICE_ACCOUNT` (JSON da conta de serviço) e `BACKUP_SENHA`, e a variável `FIREBASE_PROJECT_ID`. O workflow roda todo dia às 06:00 e guarda o arquivo criptografado por 90 dias. Para abrir: `gpg --decrypt arquivo.json.gpg > backup.json`. Teste a restauração em homologação com `scripts/restaurar.ts`.
