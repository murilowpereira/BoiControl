# BoiControl — Documento de design

Data: 2026-11-01 · Base: Especificação Técnica v1.0 (Escopo.tech, out/2026) · Status: aprovado por Murilo · Revisão 2: plano gratuito do Firebase (Spark), sem Cloud Functions

> **Revisão 2 (2026-11-01).** Murilo decidiu publicar no plano gratuito (Spark), que não permite Cloud Functions nem backup gerenciado. A seção 6 abaixo descreve o que mudou e substitui os trechos das seções 1 a 5 que falam em Functions, estados RECEBIDA/REJEITADA, resumo gravado no animal e backups nativos.

Este documento registra como o BoiControl será construído. Os requisitos funcionais (RF-01 a RF-18), regras de negócio (RN-01 a RN-18), requisitos não funcionais e critérios de aceite (CA-01 a CA-16) da especificação continuam valendo. As seções 6 (PostgreSQL), 7 (API REST) e partes das seções 3.1, 8.1 e 9.1 são substituídas pelo que está abaixo e precisam de aprovação do cliente.

## 1. Arquitetura

| Camada | Escolha |
|---|---|
| Front | PWA em React + Vite + TypeScript, publicada no Firebase Hosting |
| Login | Firebase Auth (e-mail e senha; hash, recuperação e limite de tentativas gerenciados) |
| Dados | Cloud Firestore com cache offline persistente (IndexedDB, multi-aba) |
| Servidor | ~~Cloud Functions~~ nenhum no plano Spark (ver seção 6) |
| Regras compartilhadas | Pacote `@boicontrol/core` (cálculos e validações), usado pelo app e pelas Functions |
| Ambientes | Emulator Suite (dev), projeto Firebase de homologação, projeto Firebase de produção |

Vite em vez de Next.js: o app é inteiramente do lado do cliente e precisa abrir sem rede.

## 2. Modelo de dados (Firestore)

Tudo fica sob `propriedades/{propriedadeId}`, substituindo `propriedade_id`.

| Caminho | Conteúdo | Quem escreve |
|---|---|---|
| `propriedades/{pid}` | nome, fuso horário, configurações | ADMIN |
| `…/membros/{uid}` | perfil (ADMIN, OPERADOR, CONSULTA), ativo, nome, e-mail | ADMIN |
| `…/categorias/{id}` | nome, ativo | ADMIN |
| `…/animais/{id}` | codigoInterno, brinco, categoriaId, sexo, situacao, `resumo` | Functions |
| `…/brincos/{brincoNormalizado}` | animalId | Functions (transação) |
| `…/pesagens/{uuid}` | animalId, pesoG, dataHoraPesagem, fuso, observacao, estado, motivo, criadoPor, criadoEm, variacaoG, gmdKgDia, diasPeriodo | cliente cria; Functions completam |
| `…/auditoria/{id}` | usuário, data, entidade, registro, ação, motivo, antes, depois | Functions |
| `…/contadores/animais` | próximo código interno | Functions |

- **Peso como inteiro em gramas** (`pesoG`). 356,00 kg = 356000. Substitui NUMERIC(8,2); o Firestore só tem ponto flutuante binário.
- **Resumo no animal** (`pesoAtualG`, `dataUltimaPesagem`, `gmdUltimoKgDia`, `totalPesagens`), mantido pelo servidor, para lista e dashboard lerem apenas os animais.
- **Offline:** com até 50 animais, o app mantém a propriedade inteira em cache (responde à decisão pendente nº 4).

## 3. Fluxo de pesagem e sincronização

1. O app gera um UUID e grava `pesagens/{uuid}` com `estado = RECEBIDA` sem esperar o servidor. O UUID como ID do documento torna o reenvio idempotente (RN-13).
2. Estados na interface:
   - **Pendente no aparelho** — `metadata.hasPendingWrites`.
   - **Processando** — no servidor, `estado = RECEBIDA`.
   - **Sincronizado** — `estado = VALIDA`.
   - **Erro** — `estado = REJEITADA`, com motivo e ação de correção.
3. A Function `onPesagemCriada` valida (animal existe e está ativo, faixa de peso, data coerente), **recalcula toda a série do animal** em ordem de data e atualiza o resumo. Isso trata pesagens offline que chegam fora de ordem.
4. A Function é idempotente: se o estado não for `RECEBIDA`, não faz nada.
5. Pesagem para animal inativado vira `REJEITADA` com motivo `ANIMAL_INATIVO`, para revisão do ADMIN.
6. As regras de segurança barram apenas acesso indevido e formato. Toda validação de negócio fica na Function, porque uma rejeição das regras após reabrir o app se perde sem aviso, e a rejeição da Function vira dado visível.

## 4. Segurança, auditoria e backup

**Permissões (Security Rules):**

| Perfil | Pode |
|---|---|
| CONSULTA | Ler |
| OPERADOR | Ler e criar pesagens (`estado = RECEBIDA`, `criadoPor = uid`, sem campos calculados) |
| ADMIN | O que o OPERADOR pode, mais gerenciar categorias, membros e a propriedade |

Nenhum cliente altera ou apaga pesagens, nem escreve em auditoria, brincos, contadores ou animais.

**Funções chamáveis (exigem conexão):**
- `criarAnimal`, `editarAnimal`, `alterarSituacaoAnimal`
- `corrigirPesagem` (ADMIN, motivo obrigatório)
- `exportarCsv`

**Proteções:** App Check; conta desativada no Auth e em `membros`; testes de regras no emulador (CA-14); aviso de pendências no logout.

**Backup:**
- Backups agendados nativos do Firestore (diários) e PITR de 7 dias.
- Export semanal para um bucket em outro projeto.
- Restauração testada em homologação e documentada (CA-16).

## 5. Mudanças na especificação e plano

**Mudanças a aprovar com o cliente:**
- Seção 6 → modelo Firestore acima.
- Seção 7 → Firestore direto + funções chamáveis.
- Seções 3.1/9.1 → Firebase Auth.
- Hospedagem → Firebase plano Blaze.
- Risco novo: dependência do Google, mitigada por export CSV e export completo do Firestore.

**Backlog revisado (1 dev, 4 a 5 semanas):**

| Épico | Entregas | Estimativa |
|---|---|---|
| E1 Fundação | projetos, Auth, membros, regras e testes de regras | 3–4 dias |
| E2 Animais | funções de cadastro, brinco único, busca, ficha | 3–4 dias |
| E3 Pesagens | registro, Function de cálculo, histórico, gráfico, dashboard | 4–5 dias |
| E4 Offline | cache persistente, estados na tela, testes de campo | 3–5 dias |
| E5 Qualidade | auditoria, CSV, backup e restauração, homologação | 3–5 dias |

**Pendentes para o kickoff:** formato do brinco (1), intervalo de alerta (2), categorias iniciais (3), navegadores suportados (5), lotes no primeiro contrato (7).

## 6. Revisão 2: plano Spark (sem Cloud Functions)

**Por quê:** o plano Spark não publica Cloud Functions e não tem backup agendado, PITR nem Cloud Storage. O Blaze, com as mesmas cotas grátis, foi recomendado, mas a decisão foi ficar no gratuito.

**Arquitetura:** Firebase Hosting + Auth + Firestore. Não há código de servidor. Toda regra de negócio que precisa ser garantida está nas Security Rules; o restante roda no app.

**Como cada garantia ficou:**

| Garantia da spec | Plano Blaze (antes) | Plano Spark (agora) |
|---|---|---|
| Brinco único (RN-02) | Transação na Function | `brincos/{brinco}` criado na mesma transação do animal; `create` falha se existir; regras exigem os dois juntos |
| Código interno sequencial e imutável (RN-01) | Contador na Function | `contadores/animais` só sobe de 1 em 1 e o animal precisa ter exatamente o novo valor; regras impedem alterar depois |
| Auditoria de alterações críticas (RF-17) | Function grava | Toda criação/edição de animal e correção de pesagem exige, na mesma gravação, `auditoria/{entidade}_{id}_v{versao}`; para pesagens, as regras conferem que `antes`/`depois` batem com os valores reais |
| Variação, GMD, peso atual (RN-07 a RN-10) | Function recalcula e grava | Calculados no aparelho a partir das pesagens em cache (`calcularPorAnimal`), inclusive offline |
| Pesagem de animal inativado / data no futuro | Function rejeita com motivo | Pesagem é aceita e a tela sinaliza para o ADMIN revisar (a spec pede sinalizar, não descartar) |
| Recusa visível (RF-16, RN-14) | Estado REJEITADA no documento | O app valida antes de gravar exatamente o que as regras verificam; se o servidor recusar com o app aberto, a pesagem fica guardada no aparelho com opção de tentar de novo |
| Backup e restauração (RF-18, CA-16) | Backup agendado + PITR + export | GitHub Actions diário gera JSON completo como artefato privado (90 dias); `scripts/restaurar.ts`; teste automatizado de restauração |

**Estados da pesagem:** `VALIDA` ou `ANULADA`. Na tela: *Pendente no aparelho*, *Sincronizado* ou *Anulada*, mais alertas de revisão.

**Risco aceito:** se uma pesagem feita offline for recusada pelas regras depois que o app foi fechado e reaberto, o SDK descarta a gravação sem aviso. Isso só acontece com perda de permissão do usuário enquanto estava offline ou com dado malformado, porque o app valida o mesmo formato antes de gravar. No Blaze esse caso virava um registro REJEITADA visível.

**Cadastro de animal sem internet (0.18.0):** com internet, o cadastro continua sendo uma transação. Sem internet, o app confere brinco, categoria e lote no cache (a fazenda inteira está no aparelho), usa o próximo código interno conhecido e grava animal, brinco, contador e auditoria numa gravação em lote, que o Firestore envia antes das pesagens feitas depois (a fila sai na ordem). As regras não mudaram: o servidor confere tudo de novo. Se outro aparelho tiver usado o mesmo código ou brinco no meio tempo, a gravação é recusada; o app guarda cada cadastro feito sem internet (e as pesagens do animal) no `localStorage` até o servidor confirmar, inclusive se o app for fechado, e então tenta de novo pela transação com o mesmo ID (código atualizado). Só um brinco repetido de verdade volta ao usuário no Painel, para trocar o brinco ou descartar. O cadastro do bezerro no parto segue exigindo internet.

**Testes:** as operações do app (`apps/web/src/operacoes.ts`) rodam contra as regras reais no emulador, inclusive tentativas de gravação forjada (pular código, animal sem brinco ou sem auditoria, auditoria com valores falsos).

**Migração futura para o Blaze:** possível sem mudar o modelo de dados; basta mover as operações sensíveis para Functions.
