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
