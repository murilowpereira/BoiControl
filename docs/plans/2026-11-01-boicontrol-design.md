# BoiControl — Documento de design

Data: 2026-11-01 · Base: Especificação Técnica v1.0 (Escopo.tech, out/2026) · Status: aprovado por Murilo

Este documento registra como o BoiControl será construído. Os requisitos funcionais (RF-01 a RF-18), regras de negócio (RN-01 a RN-18), requisitos não funcionais e critérios de aceite (CA-01 a CA-16) da especificação continuam valendo. As seções 6 (PostgreSQL), 7 (API REST) e partes das seções 3.1, 8.1 e 9.1 são substituídas pelo que está abaixo e precisam de aprovação do cliente.

## 1. Arquitetura

| Camada | Escolha |
|---|---|
| Front | PWA em React + Vite + TypeScript, publicada no Firebase Hosting |
| Login | Firebase Auth (e-mail e senha; hash, recuperação e limite de tentativas gerenciados) |
| Dados | Cloud Firestore com cache offline persistente (IndexedDB, multi-aba) |
| Servidor | Cloud Functions (2ª geração) em Node/TypeScript |
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
