// Valores em centavos inteiros, como o peso em gramas: sem erro de arredondamento.

/** Até R$ 100 milhões por valor. */
export const VALOR_MAXIMO_CENTAVOS = 10_000_000_000;

/**
 * Lê um valor em reais digitado no formato brasileiro ("1.234,56", "1234,5",
 * "R$ 850") e devolve centavos. null quando não é um valor válido e positivo.
 */
export function lerReais(texto: string): number | null {
  let t = texto.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!t) return null;
  if (t.includes(",")) {
    // vírgula decimal; pontos são separador de milhar
    if (!/^\d{1,3}(\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(t)) return null;
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, ""); // "1.500" = mil e quinhentos
  } else if (!/^\d+(\.\d{1,2})?$/.test(t)) {
    return null;
  }
  const centavos = Math.round(Number(t) * 100);
  if (!Number.isSafeInteger(centavos) || centavos <= 0 || centavos > VALOR_MAXIMO_CENTAVOS) return null;
  return centavos;
}

const FORMATO_REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatarReais(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return "—";
  return FORMATO_REAIS.format(centavos / 100).replace(/ /g, " ");
}

/** Para preencher um campo de edição: 123456 → "1234,56". */
export function centavosParaTexto(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return "";
  return (centavos / 100).toFixed(2).replace(".", ",");
}

// ------------------------------------------------------------- lançamentos

export type TipoLancamento = "DESPESA" | "RECEITA";

export const CATEGORIAS_FINANCEIRAS = [
  { id: "RACAO", nome: "Ração e suplemento", tipo: "DESPESA" },
  { id: "SAL_MINERAL", nome: "Sal mineral", tipo: "DESPESA" },
  { id: "SANIDADE", nome: "Vacinas e medicamentos", tipo: "DESPESA" },
  { id: "PASTAGEM", nome: "Pasto e arrendamento", tipo: "DESPESA" },
  { id: "MAO_DE_OBRA", nome: "Mão de obra", tipo: "DESPESA" },
  { id: "COMBUSTIVEL", nome: "Combustível e frete", tipo: "DESPESA" },
  { id: "MANUTENCAO", nome: "Manutenção e equipamentos", tipo: "DESPESA" },
  { id: "OUTRAS_DESPESAS", nome: "Outras despesas", tipo: "DESPESA" },
  { id: "OUTRAS_RECEITAS", nome: "Outras receitas", tipo: "RECEITA" },
] as const satisfies readonly { id: string; nome: string; tipo: TipoLancamento }[];

export type CategoriaFinanceira = (typeof CATEGORIAS_FINANCEIRAS)[number]["id"];

export function nomeCategoriaFinanceira(id: string): string {
  return CATEGORIAS_FINANCEIRAS.find((c) => c.id === id)?.nome ?? id;
}

export function tipoDaCategoria(id: string): TipoLancamento | null {
  return CATEGORIAS_FINANCEIRAS.find((c) => c.id === id)?.tipo ?? null;
}

export interface LancamentoBase {
  categoria: string;
  valorCentavos: number;
  /** AAAA-MM-DD */
  data: string;
}

export interface ValoresAnimalBase {
  compraCentavos: number | null;
  dataCompra: string | null;
  vendaCentavos: number | null;
  dataVenda: string | null;
}

export interface ResumoFinanceiro {
  comprasAnimais: number;
  animaisComprados: number;
  vendasAnimais: number;
  animaisVendidos: number;
  outrasReceitas: number;
  despesas: number;
  /** Despesas por categoria, da maior para a menor. */
  despesasPorCategoria: { categoria: string; centavos: number }[];
  /** Vendas + outras receitas − compras − despesas. */
  resultado: number;
}

/** Datas "AAAA-MM-DD" comparam certo como texto. `inicio`/`fim` null = sem limite. */
function noPeriodo(data: string | null, inicio: string | null, fim: string | null): data is string {
  return data !== null && (inicio === null || data >= inicio) && (fim === null || data <= fim);
}

export function resumirFinanceiro(
  lancamentos: readonly LancamentoBase[],
  valores: readonly ValoresAnimalBase[],
  inicio: string | null,
  fim: string | null,
): ResumoFinanceiro {
  let comprasAnimais = 0;
  let animaisComprados = 0;
  let vendasAnimais = 0;
  let animaisVendidos = 0;
  for (const v of valores) {
    if (v.compraCentavos !== null && noPeriodo(v.dataCompra, inicio, fim)) {
      comprasAnimais += v.compraCentavos;
      animaisComprados++;
    }
    if (v.vendaCentavos !== null && noPeriodo(v.dataVenda, inicio, fim)) {
      vendasAnimais += v.vendaCentavos;
      animaisVendidos++;
    }
  }
  let outrasReceitas = 0;
  let despesas = 0;
  const porCategoria = new Map<string, number>();
  for (const l of lancamentos) {
    if (!noPeriodo(l.data, inicio, fim)) continue;
    if (tipoDaCategoria(l.categoria) === "RECEITA") {
      outrasReceitas += l.valorCentavos;
    } else {
      despesas += l.valorCentavos;
      porCategoria.set(l.categoria, (porCategoria.get(l.categoria) ?? 0) + l.valorCentavos);
    }
  }
  return {
    comprasAnimais,
    animaisComprados,
    vendasAnimais,
    animaisVendidos,
    outrasReceitas,
    despesas,
    despesasPorCategoria: [...porCategoria]
      .map(([categoria, centavos]) => ({ categoria, centavos }))
      .sort((a, b) => b.centavos - a.centavos),
    resultado: vendasAnimais + outrasReceitas - comprasAnimais - despesas,
  };
}

/** Diferença entre venda e compra de um animal vendido; null se faltar algum dos dois valores. */
export function margemDoAnimal(v: ValoresAnimalBase): number | null {
  return v.vendaCentavos !== null && v.compraCentavos !== null ? v.vendaCentavos - v.compraCentavos : null;
}

/** Data "AAAA-MM-DD" do instante no fuso da propriedade (para preencher campos de data). */
export function dataIsoNoFuso(d: Date, fuso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
