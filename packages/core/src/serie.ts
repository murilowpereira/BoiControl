export interface PesagemBase {
  id: string;
  pesoG: number;
  /** Quando o animal foi pesado (RN-05). */
  dataHoraPesagem: Date;
  /** Quando o registro foi criado; usado só para desempate (RN-07). */
  criadoEm: Date;
}

export interface PesagemCalculada extends PesagemBase {
  /** Diferença para a pesagem válida anterior, em gramas (RN-08). */
  variacaoG: number | null;
  /** Dias de calendário, no fuso da propriedade, desde a pesagem anterior. */
  diasPeriodo: number | null;
  /** Ganho médio diário em kg/dia, precisão completa (RN-09, RN-10). */
  gmdKgDia: number | null;
}

export interface ResumoAnimal {
  pesoAtualG: number | null;
  dataUltimaPesagem: Date | null;
  gmdUltimoKgDia: number | null;
  totalPesagens: number;
}

/** Ordem cronológica estável: data da pesagem, depois criação, depois id. */
export function compararPesagens(a: PesagemBase, b: PesagemBase): number {
  return (
    a.dataHoraPesagem.getTime() - b.dataHoraPesagem.getTime() ||
    a.criadoEm.getTime() - b.criadoEm.getTime() ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

const formatadores = new Map<string, Intl.DateTimeFormat>();

/** Número do dia de calendário (dias desde 1970-01-01) da data no fuso informado. */
export function diaNoFuso(data: Date, fuso: string): number {
  let fmt = formatadores.get(fuso);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" });
    formatadores.set(fuso, fmt);
  }
  const [ano, mes, dia] = fmt.format(data).split("-").map(Number);
  return Date.UTC(ano!, mes! - 1, dia!) / 86_400_000;
}

/**
 * Recebe as pesagens válidas de um animal, em qualquer ordem, e devolve a série
 * ordenada com variação e GMD. Pesagens no mesmo dia não geram GMD (CA-05).
 */
export function calcularSerie(pesagens: readonly PesagemBase[], fuso: string): PesagemCalculada[] {
  const ordenadas = [...pesagens].sort(compararPesagens);
  return ordenadas.map((atual, i) => {
    const anterior = i > 0 ? ordenadas[i - 1]! : null;
    if (!anterior) return { ...atual, variacaoG: null, diasPeriodo: null, gmdKgDia: null };
    const variacaoG = atual.pesoG - anterior.pesoG;
    const diasPeriodo = diaNoFuso(atual.dataHoraPesagem, fuso) - diaNoFuso(anterior.dataHoraPesagem, fuso);
    const gmdKgDia = diasPeriodo > 0 ? variacaoG / 1000 / diasPeriodo : null;
    return { ...atual, variacaoG, diasPeriodo, gmdKgDia };
  });
}

export function resumirAnimal(serie: readonly PesagemCalculada[]): ResumoAnimal {
  const ultima = serie.at(-1);
  if (!ultima) return { pesoAtualG: null, dataUltimaPesagem: null, gmdUltimoKgDia: null, totalPesagens: 0 };
  return {
    pesoAtualG: ultima.pesoG,
    dataUltimaPesagem: ultima.dataHoraPesagem,
    gmdUltimoKgDia: ultima.gmdKgDia,
    totalPesagens: serie.length,
  };
}

const FORMATO_GMD = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** GMD com três casas decimais (seção 5.1). */
export function formatarGmd(gmdKgDia: number | null): string {
  if (gmdKgDia === null) return "—";
  return `${FORMATO_GMD.format(gmdKgDia)} kg/dia`;
}
