import type { SituacaoAnimal } from "./indicadores.js";

// Área em metros quadrados inteiros, como o peso em gramas: 1 ha = 10.000 m².

export const M2_POR_HA = 10_000;
/** Até 100 mil hectares por pasto. */
export const AREA_MAXIMA_M2 = 100_000 * M2_POR_HA;
/** Unidade animal: 450 kg de peso vivo. */
export const UA_KG = 450;

/**
 * Lê uma área em hectares no formato brasileiro ("12,5", "1.200", "3") e
 * devolve m² inteiros. null quando não é uma área válida e positiva.
 */
export function lerHectares(texto: string): number | null {
  let t = texto.trim().replace(/\s*ha$/i, "").replace(/\s/g, "");
  if (!t) return null;
  if (t.includes(",")) {
    if (!/^\d{1,3}(\.\d{3})*,\d{1,4}$|^\d+,\d{1,4}$/.test(t)) return null;
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, "");
  } else if (!/^\d+(\.\d{1,4})?$/.test(t)) {
    return null;
  }
  const m2 = Math.round(Number(t) * M2_POR_HA);
  if (!Number.isSafeInteger(m2) || m2 <= 0 || m2 > AREA_MAXIMA_M2) return null;
  return m2;
}

/** 125000 → "12,5 ha". */
export function formatarHectares(m2: number | null | undefined): string {
  if (m2 === null || m2 === undefined) return "—";
  return `${(m2 / M2_POR_HA).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha`;
}

/** Para preencher o campo de edição: 125000 → "12,5". */
export function hectaresParaTexto(m2: number | null | undefined): string {
  if (m2 === null || m2 === undefined) return "";
  return (m2 / M2_POR_HA).toLocaleString("pt-BR", { maximumFractionDigits: 4, useGrouping: false });
}

/** Dias entre duas datas "AAAA-MM-DD" (fim − início). */
export function diasEntreDatas(inicio: string, fim: string): number {
  return Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86_400_000);
}

// ---------------------------------------------------------------- lotação

export interface PastoBase {
  id: string;
  nome: string;
  areaM2: number;
  ativo: boolean;
}

/** Um lote dentro de um pasto, de `entrada` até `saida` (null = ainda está lá). */
export interface OcupacaoBase {
  id: string;
  loteId: string;
  pastoId: string;
  entrada: string;
  saida: string | null;
}

export interface AnimalParaLotacao {
  situacao: SituacaoAnimal;
  loteId?: string | null;
  resumo: { pesoAtualG: number | null };
}

export interface LotacaoPasto {
  pastoId: string;
  /** Ocupações em aberto (lotes que estão no pasto agora). */
  atuais: OcupacaoBase[];
  animais: number;
  /** Animais ativos dos lotes no pasto que ainda não foram pesados (não entram na UA). */
  semPeso: number;
  pesoTotalG: number;
  ua: number;
  /** null quando o pasto não tem área. */
  uaPorHa: number | null;
  /** Dias desde a entrada mais antiga em aberto (pasto ocupado). */
  diasOcupado: number | null;
  /** Dias desde a última saída (pasto vazio já usado antes). */
  diasDescanso: number | null;
}

/** Ocupação em aberto de cada lote (a de entrada mais recente, se houver mais de uma). */
export function ocupacaoAtualPorLote<T extends OcupacaoBase>(ocupacoes: readonly T[]): Map<string, T> {
  const atual = new Map<string, T>();
  for (const o of ocupacoes) {
    if (o.saida !== null) continue;
    const ja = atual.get(o.loteId);
    if (!ja || o.entrada > ja.entrada) atual.set(o.loteId, o);
  }
  return atual;
}

/**
 * Lotação de cada pasto hoje: animais ativos dos lotes que estão nele, peso
 * vivo pelo último peso de cada animal, UA (450 kg) e UA por hectare.
 */
export function calcularLotacao(
  pastos: readonly PastoBase[],
  ocupacoes: readonly OcupacaoBase[],
  animais: readonly AnimalParaLotacao[],
  hoje: string,
): Map<string, LotacaoPasto> {
  const atuais = [...ocupacaoAtualPorLote(ocupacoes).values()];
  const ativosPorLote = new Map<string, AnimalParaLotacao[]>();
  for (const a of animais) {
    if (a.situacao !== "ATIVO" || !a.loteId) continue;
    const g = ativosPorLote.get(a.loteId);
    if (g) g.push(a);
    else ativosPorLote.set(a.loteId, [a]);
  }
  const resultado = new Map<string, LotacaoPasto>();
  for (const pasto of pastos) {
    const noPasto = atuais.filter((o) => o.pastoId === pasto.id);
    let qtd = 0;
    let semPeso = 0;
    let pesoTotalG = 0;
    for (const o of noPasto) {
      for (const a of ativosPorLote.get(o.loteId) ?? []) {
        qtd++;
        if (a.resumo.pesoAtualG === null) semPeso++;
        else pesoTotalG += a.resumo.pesoAtualG;
      }
    }
    const ua = pesoTotalG / 1000 / UA_KG;
    const entradas = noPasto.map((o) => o.entrada).sort();
    const saidas = ocupacoes
      .filter((o) => o.pastoId === pasto.id && o.saida !== null)
      .map((o) => o.saida!)
      .sort();
    resultado.set(pasto.id, {
      pastoId: pasto.id,
      atuais: noPasto,
      animais: qtd,
      semPeso,
      pesoTotalG,
      ua,
      uaPorHa: pasto.areaM2 > 0 ? ua / (pasto.areaM2 / M2_POR_HA) : null,
      diasOcupado: entradas.length ? Math.max(0, diasEntreDatas(entradas[0]!, hoje)) : null,
      diasDescanso:
        noPasto.length === 0 && saidas.length ? Math.max(0, diasEntreDatas(saidas[saidas.length - 1]!, hoje)) : null,
    });
  }
  return resultado;
}

/** Histórico de um pasto ou de um lote, do mais recente ao mais antigo, com a duração em dias. */
export function historicoRotacao<T extends OcupacaoBase>(
  ocupacoes: readonly T[],
  filtro: { pastoId?: string; loteId?: string },
  hoje: string,
): (T & { dias: number })[] {
  return ocupacoes
    .filter((o) => (filtro.pastoId === undefined || o.pastoId === filtro.pastoId) && (filtro.loteId === undefined || o.loteId === filtro.loteId))
    .map((o) => ({ ...o, dias: Math.max(0, diasEntreDatas(o.entrada, o.saida ?? hoje)) }))
    .sort((a, b) => b.entrada.localeCompare(a.entrada) || (a.saida === null ? -1 : b.saida === null ? 1 : b.saida.localeCompare(a.saida)));
}
