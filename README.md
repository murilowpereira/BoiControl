# BoiControl

MVP de gestão pecuária da Escopo.tech: controle individual de animais por brinco e histórico de pesagens, com registro offline.

O design aprovado está em [`docs/plans/2026-11-01-boicontrol-design.md`](docs/plans/2026-11-01-boicontrol-design.md).

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `packages/core` | Regras compartilhadas: peso em gramas, variação, GMD, indicadores, brinco |
| `functions` | Cloud Functions: processamento de pesagens, cadastro de animais, correções, auditoria |
| `apps/web` | PWA React + Vite |
| `firestore.rules` | Regras de segurança (acesso por propriedade e perfil) |
| `tests/rules` | Testes das regras no emulador |
| `tests/e2e` | Teste ponta a ponta do fluxo offline no navegador |
| `scripts` | Implantação inicial (propriedade, ADMIN e categorias) |

## Desenvolvimento

Requisitos: Node 22 e Java 21 (para os emuladores do Firebase).

```bash
npm install
npm run emuladores          # Auth, Firestore e Functions locais (UI em http://127.0.0.1:4000)

# em outro terminal: cria a propriedade de teste e o ADMIN
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  npx tsx scripts/criar-propriedade.ts --projeto demo-boicontrol --id fazenda-teste \
  --nome "Fazenda Boa Vista" --email admin@teste.com --senha senha123

cp apps/web/.env.example apps/web/.env.local   # VITE_USAR_EMULADORES=true
npm run dev -w @boicontrol/web
```

## Testes

```bash
npm test -w @boicontrol/core          # cálculos (CA-03, CA-04, CA-05)
npm test -w @boicontrol/web           # estados exibidos
npm run test:rules                    # regras de segurança (CA-14)
npm test -w boicontrol-functions      # Functions no emulador (CA-01, CA-02, CA-06, CA-12)
npm run test:e2e                      # fluxo offline no navegador (CA-09 a CA-11); requer Playwright + Chromium
```

## Implantação (resumo)

1. Criar dois projetos Firebase (homologação e produção) no plano Blaze, Firestore em `southamerica-east1`.
2. Ativar Authentication (e-mail/senha) e App Check (reCAPTCHA Enterprise).
3. Preencher `apps/web/.env.local` (ou variáveis do CI) com a configuração do projeto.
4. `npm run build -w @boicontrol/web && firebase deploy --project <id>`.
5. Rodar `scripts/criar-propriedade.ts` com credenciais de serviço para criar a propriedade e o ADMIN.
6. Configurar backup agendado do Firestore, PITR e export semanal para bucket em outro projeto (design, seção 4).
