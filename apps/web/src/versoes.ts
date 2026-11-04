/**
 * Histórico de versões mostrado na tela Sobre.
 *
 * Ao publicar uma versão nova: acrescente a entrada no topo desta lista e
 * use o mesmo número em "version" de apps/web/package.json (o teste confere).
 * Versão MAIOR.MENOR.CORREÇÃO: MENOR para novidades, CORREÇÃO para ajustes.
 */
export interface Versao {
  versao: string;
  /** AAAA-MM-DD */
  data: string;
  titulo: string;
  novidades: string[];
}

export const VERSOES: Versao[] = [
  {
    versao: "0.18.0",
    data: "2026-11-04",
    titulo: "Cadastro de animal sem internet",
    novidades: [
      "O cadastro de animal funciona sem internet: o animal fica salvo no aparelho, já pode ser pesado e é enviado sozinho quando a conexão voltar.",
      "Sem internet, o app confere o brinco com os animais que já estão no aparelho e avisa na hora se ele já existe.",
      "Se outro celular cadastrar no meio tempo, o código interno é acertado sozinho ao sincronizar. Se o brinco já tiver sido usado, o Painel avisa e permite trocar o brinco ou descartar, sem perder as pesagens.",
      "A barra de sincronização e a lista de animais mostram os cadastros que ainda não foram enviados.",
    ],
  },
  {
    versao: "0.17.0",
    data: "2026-11-04",
    titulo: "Financeiro por lote",
    novidades: [
      "Despesas e receitas podem ser lançadas para um lote (ou ficar como gerais da fazenda).",
      "Novo quadro Por lote no Financeiro: receitas, gastos e saldo de cada lote no período.",
      "Compra e venda de animais entram no lote em que o animal está.",
      "A planilha do financeiro ganhou a coluna Lote.",
    ],
  },
  {
    versao: "0.16.0",
    data: "2026-11-04",
    titulo: "Vacinas em pesagens antigas",
    novidades: [
      "Na ficha do animal, o botão Vacinas em cada pesagem permite informar ou trocar as vacinas aplicadas naquela pesagem, inclusive nas antigas (só administrador, com internet).",
      "Carência, agenda sanitária e relatórios passam a considerar as vacinas informadas.",
      "O estoque acompanha a edição: incluir uma vacina dá baixa da dose e retirar devolve; pesagens anteriores ao controle do insumo não mexem no estoque.",
      "Cada alteração fica no Histórico de alterações, com as vacinas de antes e de depois.",
    ],
  },
  {
    versao: "0.15.0",
    data: "2026-11-04",
    titulo: "Reprodução",
    novidades: [
      "Nova tela Reprodução, aberta pelo Painel: registre cobertura (monta natural) ou inseminação, com o touro ou o sêmen.",
      "Diagnóstico de prenhez (prenhe ou vazia) com aviso das fêmeas que já passaram de 30 dias da cobertura.",
      "Previsão de parto (285 dias) e lista dos partos dos próximos 30 dias.",
      "No parto, o bezerro é cadastrado já ligado à mãe, com a data de nascimento e o lote dela.",
      "Ficha da fêmea mostra o histórico reprodutivo e as crias; a ficha do bezerro mostra a mãe.",
      "Taxa de prenhez dos últimos 12 meses.",
      "Cobertura, diagnóstico e parto sem bezerro funcionam sem internet.",
    ],
  },
  {
    versao: "0.14.0",
    data: "2026-11-04",
    titulo: "Pastos e piquetes",
    novidades: [
      "Nova tela Pastos e piquetes, com a área de cada pasto em hectares.",
      "Lotação de cada pasto em UA e UA/ha, pelo último peso dos animais dos lotes que estão nele.",
      "Mudança de lote de pasto com data, também sem internet.",
      "Histórico de rotação: quando cada lote entrou e saiu de cada pasto e quantos dias ficou.",
      "Dias de ocupação e de descanso de cada pasto.",
    ],
  },
  {
    versao: "0.13.0",
    data: "2026-11-04",
    titulo: "Estoque de insumos",
    novidades: [
      "Nova tela Estoque, no Painel: ração, sal, vacinas e medicamentos com o saldo de cada um.",
      "Entradas e saídas registradas pelo administrador ou operador, também sem internet.",
      "Vacina ligada a um insumo dá baixa sozinha quando é marcada na pesagem ou aplicada no lote; anular devolve a dose.",
      "Compra com valor entra como despesa no Financeiro, na categoria do insumo.",
      "Aviso de repor quando o saldo chega no estoque mínimo.",
    ],
  },
  {
    versao: "0.12.0",
    data: "2026-11-04",
    titulo: "Agenda sanitária",
    novidades: [
      "Vacinas e vermífugos com carência e intervalo de repetição, em Ajustes.",
      "Nova tela Agenda sanitária: doses atrasadas e que vencem nos próximos 7 dias, por lote.",
      "Registro de vacina ou vermífugo aplicado no lote inteiro, sem precisar pesar (funciona sem internet).",
      "Aviso de carência: lista dos animais que ainda não podem ir para o abate.",
      "A carência aparece na ficha do animal, ao marcar como vendido e na previsão de abate.",
      "Resumo da agenda sanitária no painel.",
    ],
  },
  {
    versao: "0.11.0",
    data: "2026-11-04",
    titulo: "Leitura do brinco pela câmera",
    novidades: [
      "Na pesagem, o botão Ler abre a câmera e lê o QR ou o código de barras do brinco.",
      "O animal lido já fica escolhido e o cursor vai direto para o peso.",
      "Aceita o brinco, o código BC e números com zeros à esquerda.",
      "Funciona sem internet; no celular com lanterna, dá para acendê-la na leitura.",
    ],
  },
  {
    versao: "0.10.0",
    data: "2026-11-04",
    titulo: "Relatório do lote em PDF",
    novidades: [
      "Na tela Animais, gere um relatório em PDF dos animais filtrados, por exemplo de um lote.",
      "O relatório traz peso de entrada e atual, ganho, ganho médio diário e vacinas aplicadas de cada animal, com o resumo do lote.",
      "No celular, o botão Enviar abre o WhatsApp, o e-mail e outros apps para mandar o PDF ao comprador ou ao frigorífico.",
      "Funciona sem internet e não mostra valores de compra ou venda.",
    ],
  },
  {
    versao: "0.9.0",
    data: "2026-11-04",
    titulo: "Chuva",
    novidades: [
      "Nova tela Chuva: anote a leitura do pluviômetro de cada dia, também sem internet.",
      "Total de chuva por mês e lista das leituras, com opção de corrigir ou apagar.",
      "Em Indicadores, gráfico da chuva de cada mês ao lado do ganho médio diário do rebanho.",
      "Indicação de quanto o ganho de peso acompanha a chuva do mês e a do mês anterior.",
    ],
  },
  {
    versao: "0.8.0",
    data: "2026-11-02",
    titulo: "Vacinas na pesagem",
    novidades: [
      "Cadastro de vacinas em Ajustes (criar, renomear e desativar).",
      "Na pesagem, marque uma ou mais vacinas aplicadas no animal.",
      "Na pesagem em sequência, as vacinas marcadas continuam para o próximo animal.",
      "Vacinas aplicadas aparecem no histórico do animal e na planilha de pesagens.",
    ],
  },
  {
    versao: "0.7.0",
    data: "2026-11-02",
    titulo: "Financeiro",
    novidades: [
      "Valor pago pelo animal no cadastro e na ficha.",
      "Valor e data de venda pedidos ao marcar o animal como vendido.",
      "Nova tela Financeiro: lançamento de despesas (ração, sal mineral, vacinas, mão de obra e outras) e receitas.",
      "Resumo do período com vendas, compras, despesas por tipo e resultado.",
      "Diferença entre o valor de venda e o valor pago de cada animal vendido.",
      "Planilha do financeiro para abrir no Excel.",
      "Mudar a situação do animal agora usa um formulário na própria tela.",
      "Valores só aparecem para administradores.",
    ],
  },
  {
    versao: "0.6.0",
    data: "2026-11-02",
    titulo: "Sobre e versões",
    novidades: [
      "Nova aba Sobre, com a versão instalada e o que mudou em cada versão.",
      "Aviso no app quando ele é atualizado para uma versão nova.",
    ],
  },
  {
    versao: "0.5.0",
    data: "2026-11-01",
    titulo: "Indicadores do rebanho",
    novidades: [
      "Previsão de abate: quando cada animal chega ao peso-alvo, também na ficha do animal.",
      "Peso de abate configurável em Ajustes (padrão de 540 kg).",
      "Ranking dos animais que mais e que menos ganham peso.",
      "Ganho médio diário por categoria e por sexo.",
      "Evolução do peso médio e do ganho diário mês a mês, com gráfico.",
      "Saídas do rebanho (vendidos, mortos e transferidos) e taxa de mortalidade.",
    ],
  },
  {
    versao: "0.4.0",
    data: "2026-11-01",
    titulo: "Mais praticidade no curral",
    novidades: [
      "Pesar por lote: o app passa para o próximo animal sozinho depois de salvar.",
      "Aviso quando o peso digitado é muito diferente da última pesagem.",
      "Planilhas de animais e de pesagens para abrir no Excel.",
      "Categorias e lotes (pastos) cadastrados pela tela.",
      "Alerta no painel para animais sem pesagem há muitos dias.",
      "Histórico de alterações: quem mudou o quê e quando.",
    ],
  },
  {
    versao: "0.3.0",
    data: "2026-11-01",
    titulo: "Ajustes da fazenda",
    novidades: [
      "Aba Ajustes para o administrador mudar o nome da fazenda.",
      "Convite de pessoas pelo e-mail do Google, com perfil de acesso.",
      "Botão para instalar o app no celular.",
    ],
  },
  {
    versao: "0.2.1",
    data: "2026-11-01",
    titulo: "Correção de acesso",
    novidades: ["Corrigido o erro \"Sua conta não está vinculada\" ao entrar com o Google."],
  },
  {
    versao: "0.2.0",
    data: "2026-11-01",
    titulo: "Entrar com o Google",
    novidades: ["Login com a conta do Gmail, além de e-mail e senha."],
  },
  {
    versao: "0.1.0",
    data: "2026-11-01",
    titulo: "Primeira versão",
    novidades: [
      "Cadastro de animais por brinco, com categoria, sexo e situação.",
      "Registro de pesagens com cálculo do ganho médio diário (GMD).",
      "Ficha do animal com gráfico de evolução do peso.",
      "Painel com resumo do rebanho e últimas pesagens.",
      "Funciona sem internet e sincroniza quando a conexão volta.",
      "Correção e anulação de pesagens com motivo registrado.",
    ],
  },
];

export const VERSAO_ATUAL = VERSOES[0]!.versao;

/** Compara "1.2.3" com "1.10.0" numericamente. */
export function compararVersoes(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Versões mais novas que `vista` (a última que o usuário já viu), da mais nova à mais antiga. */
export function novidadesDesde(vista: string | null): Versao[] {
  if (!vista) return [];
  return VERSOES.filter((v) => compararVersoes(v.versao, vista) > 0);
}
