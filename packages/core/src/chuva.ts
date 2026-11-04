import type { Mes } from "./metricas.js";

// ------------------------------------------------------------- chuva (pluviômetro)

/** Maior leitura aceita num dia: 500 mm (guardada em décimos de milímetro). */
export const CHUVA_MAX_DECIMOS = 5000;

/** Leitura do pluviômetro de um dia. O ID do documento é a data "AAAA-MM-DD". */
export interface RegistroChuva {
  /** "AAAA-MM-DD" no fuso da fazenda. */
  data: string;
  /** Milímetros × 10 (inteiro), para guardar uma casa decimal sem arredondamento. */
  decimosMm: number;
}

/** Lê "12", "12,5" ou "12.5" mm e devolve décimos de mm, ou null se for inválido. */
export function lerChuvaMm(texto: string): number | null {
  const t = texto.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d)?$/.test(t)) return null;
  const decimos = Math.round(Number(t) * 10);
  return decimos <= CHUVA_MAX_DECIMOS ? decimos : null;
}

export function formatarChuva(decimosMm: number | null): string {
  if (decimosMm === null) return "—";
  return `${(decimosMm / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mm`;
}

export interface MesChuvaGmd {
  /** "2026-10" */
  mes: string;
  /** Total de chuva do mês em décimos de mm (null se nenhum dia foi registrado). */
  chuvaDecimos: number | null;
  /** Dias com leitura registrada (inclusive leituras de 0 mm). */
  diasRegistrados: number;
  gmdMedioKgDia: number | null;
  animais: number;
}

/** Junta a chuva total de cada mês com o GMD médio do rebanho no mesmo mês. */
export function chuvaComGmd(meses: readonly Mes[], registros: readonly RegistroChuva[]): MesChuvaGmd[] {
  const porMes = new Map<string, { total: number; dias: number }>();
  for (const r of registros) {
    const m = r.data.slice(0, 7);
    const g = porMes.get(m) ?? { total: 0, dias: 0 };
    g.total += r.decimosMm;
    g.dias++;
    porMes.set(m, g);
  }
  return meses.map((m) => {
    const c = porMes.get(m.mes);
    return {
      mes: m.mes,
      chuvaDecimos: c ? c.total : null,
      diasRegistrados: c?.dias ?? 0,
      gmdMedioKgDia: m.gmdMedioKgDia,
      animais: m.animais,
    };
  });
}

/** Correlação de Pearson; null com menos de 3 pares ou sem variação. */
export function correlacao(pares: readonly (readonly [number, number])[]): number | null {
  if (pares.length < 3) return null;
  const n = pares.length;
  const mx = pares.reduce((t, [x]) => t + x, 0) / n;
  const my = pares.reduce((t, [, y]) => t + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [x, y] of pares) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

export interface RelacaoChuvaGmd {
  /** Chuva do mês × GMD do mesmo mês. */
  mesmoMes: number | null;
  /** Chuva do mês anterior × GMD do mês (o pasto responde à chuva com atraso). */
  mesAnterior: number | null;
  /** Meses usados no cálculo do mesmo mês. */
  mesesComparados: number;
}

/** Quanto o GMD acompanha a chuva, considerando só meses com chuva registrada e GMD. */
export function relacaoChuvaGmd(linhas: readonly MesChuvaGmd[]): RelacaoChuvaGmd {
  const mesmo: [number, number][] = [];
  const anterior: [number, number][] = [];
  linhas.forEach((l, i) => {
    if (l.gmdMedioKgDia === null) return;
    if (l.chuvaDecimos !== null) mesmo.push([l.chuvaDecimos, l.gmdMedioKgDia]);
    const ant = linhas[i - 1];
    if (ant && ant.chuvaDecimos !== null) anterior.push([ant.chuvaDecimos, l.gmdMedioKgDia]);
  });
  return { mesmoMes: correlacao(mesmo), mesAnterior: correlacao(anterior), mesesComparados: mesmo.length };
}

/** Frase curta para a correlação, em linguagem do dia a dia. */
export function descreverCorrelacao(r: number | null): string {
  if (r === null) return "ainda sem dados suficientes";
  const a = Math.abs(r);
  if (a < 0.3) return "pouca relação";
  const forca = a < 0.6 ? "relação moderada" : "relação forte";
  return r > 0 ? `${forca}: mais chuva, mais ganho` : `${forca}: mais chuva, menos ganho`;
}
