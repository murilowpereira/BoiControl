// Estoque de insumos (ração, sal, vacinas e medicamentos).
//
// Quantidades em milésimos inteiros da unidade do insumo (1 kg = 1000), como o
// peso em gramas: sem erro de arredondamento ao somar entradas e saídas.
//
// Sem Cloud Functions, o saldo não fica gravado: é calculado no aparelho a
// partir das entradas, das saídas e das pesagens que aplicaram a vacina ligada
// ao insumo (baixa automática). Anular uma pesagem devolve a dose ao estoque.

/** Até 1 bilhão de unidades por movimento. */
export const QUANTIDADE_MAXIMA_MIL = 1_000_000_000_000;

export const TIPOS_INSUMO = [
  { id: "RACAO", nome: "Ração e suplemento", categoriaFinanceira: "RACAO" },
  { id: "SAL", nome: "Sal mineral", categoriaFinanceira: "SAL_MINERAL" },
  { id: "VACINA", nome: "Vacina", categoriaFinanceira: "SANIDADE" },
  { id: "MEDICAMENTO", nome: "Medicamento", categoriaFinanceira: "SANIDADE" },
  { id: "OUTRO", nome: "Outro", categoriaFinanceira: "OUTRAS_DESPESAS" },
] as const;

export type TipoInsumo = (typeof TIPOS_INSUMO)[number]["id"];

export const UNIDADES_INSUMO = ["kg", "saco", "L", "mL", "dose", "frasco", "unidade"] as const;
export type UnidadeInsumo = (typeof UNIDADES_INSUMO)[number];

export type TipoMovimento = "ENTRADA" | "SAIDA";

export function nomeTipoInsumo(id: string): string {
  return TIPOS_INSUMO.find((t) => t.id === id)?.nome ?? id;
}

/** Categoria do financeiro em que a compra do insumo entra como despesa. */
export function categoriaFinanceiraDoInsumo(tipo: string): string {
  return TIPOS_INSUMO.find((t) => t.id === tipo)?.categoriaFinanceira ?? "OUTRAS_DESPESAS";
}

/**
 * Lê uma quantidade digitada ("25", "2,5", "1.500", "0,125") e devolve milésimos.
 * Aceita até 3 casas decimais. null quando não é um número positivo válido.
 */
export function lerQuantidade(texto: string): number | null {
  let t = texto.trim().replace(/\s/g, "");
  if (!t) return null;
  if (t.includes(",")) {
    if (!/^\d{1,3}(\.\d{3})*,\d{1,3}$|^\d+,\d{1,3}$/.test(t)) return null;
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, ""); // "1.500" = mil e quinhentos
  } else if (!/^\d+(\.\d{1,3})?$/.test(t)) {
    return null;
  }
  const mil = Math.round(Number(t) * 1000);
  if (!Number.isSafeInteger(mil) || mil <= 0 || mil > QUANTIDADE_MAXIMA_MIL) return null;
  return mil;
}

const FORMATO_QTD = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

/** 2500 → "2,5"; com unidade: "2,5 kg". */
export function formatarQuantidade(mil: number | null | undefined, unidade?: string): string {
  if (mil === null || mil === undefined) return "—";
  const n = FORMATO_QTD.format(mil / 1000);
  return unidade ? `${n} ${unidade}` : n;
}

/** Para preencher um campo de edição: 2500 → "2,5". */
export function quantidadeParaTexto(mil: number | null | undefined): string {
  if (mil === null || mil === undefined) return "";
  return String(mil / 1000).replace(".", ",");
}

export interface InsumoBase {
  id: string;
  /** Estoque mínimo; abaixo dele o insumo aparece no alerta. */
  minimoMil: number | null;
  /** Vacina cadastrada cujas aplicações na pesagem dão baixa neste insumo. */
  vacinaId: string | null;
  /** Quanto sai do estoque por animal vacinado. */
  doseMil: number | null;
  /** Só as pesagens registradas a partir deste instante dão baixa (as antigas já foram contadas fora do app). */
  vacinaDesde: Date | null;
}

export interface MovimentoBase {
  insumoId: string;
  tipo: TipoMovimento;
  quantidadeMil: number;
}

export interface PesagemComVacinas {
  estado: string;
  /** Quando a pesagem foi registrada no app (não a data informada da pesagem). */
  criadoEm: Date;
  vacinas?: readonly string[];
}

export interface SaldoInsumo {
  entradasMil: number;
  saidasMil: number;
  /** Baixas automáticas das vacinas aplicadas na pesagem. */
  usoPesagensMil: number;
  /** Quantos animais receberam a vacina ligada ao insumo. */
  aplicacoes: number;
  saldoMil: number;
  /** Saldo no mínimo ou abaixo dele (ou negativo, quando não há mínimo). */
  abaixoDoMinimo: boolean;
}

export function calcularSaldos(
  insumos: readonly InsumoBase[],
  movimentos: readonly MovimentoBase[],
  pesagens: readonly PesagemComVacinas[],
): Map<string, SaldoInsumo> {
  const saldos = new Map<string, SaldoInsumo>();
  for (const i of insumos) {
    saldos.set(i.id, { entradasMil: 0, saidasMil: 0, usoPesagensMil: 0, aplicacoes: 0, saldoMil: 0, abaixoDoMinimo: false });
  }
  for (const m of movimentos) {
    const s = saldos.get(m.insumoId);
    if (!s) continue;
    if (m.tipo === "ENTRADA") s.entradasMil += m.quantidadeMil;
    else s.saidasMil += m.quantidadeMil;
  }
  const ligados = insumos.filter((i) => i.vacinaId && i.doseMil && i.doseMil > 0);
  if (ligados.length > 0) {
    for (const p of pesagens) {
      if (p.estado !== "VALIDA" || !p.vacinas?.length) continue;
      for (const i of ligados) {
        if (!p.vacinas.includes(i.vacinaId!)) continue;
        if (i.vacinaDesde && p.criadoEm < i.vacinaDesde) continue;
        const s = saldos.get(i.id)!;
        s.aplicacoes++;
        s.usoPesagensMil += i.doseMil!;
      }
    }
  }
  for (const i of insumos) {
    const s = saldos.get(i.id)!;
    s.saldoMil = s.entradasMil - s.saidasMil - s.usoPesagensMil;
    s.abaixoDoMinimo = i.minimoMil !== null ? s.saldoMil <= i.minimoMil : s.saldoMil < 0;
  }
  return saldos;
}
