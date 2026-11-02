import type { SituacaoAnimal } from "./indicadores.js";

// --------------------------------------------------------- previsão de abate

/** Peso vivo padrão para abate: 540 kg (cerca de 18 @ de carcaça com 50 % de rendimento). */
export const PESO_ABATE_PADRAO_KG = 540;
export const PESO_ABATE_MIN_KG = 100;
export const PESO_ABATE_MAX_KG = 1500;

export type PrevisaoAbate =
  | { situacao: "ATINGIDO" }
  | { situacao: "PREVISTO"; dias: number; data: Date }
  /** Sem pesagem, sem GMD (menos de duas pesagens) ou GMD zero/negativo. */
  | { situacao: "SEM_PREVISAO" };

/**
 * Estima quando o animal chega ao peso-alvo mantendo o último GMD, contando a
 * partir da data da última pesagem.
 */
export function preverAbate(
  resumo: { pesoAtualG: number | null; gmdUltimoKgDia: number | null; dataUltimaPesagem: Date | null },
  pesoAlvoG: number,
): PrevisaoAbate {
  const { pesoAtualG, gmdUltimoKgDia, dataUltimaPesagem } = resumo;
  if (pesoAtualG === null || dataUltimaPesagem === null) return { situacao: "SEM_PREVISAO" };
  if (pesoAtualG >= pesoAlvoG) return { situacao: "ATINGIDO" };
  if (gmdUltimoKgDia === null || gmdUltimoKgDia <= 0) return { situacao: "SEM_PREVISAO" };
  const dias = Math.ceil((pesoAlvoG - pesoAtualG) / 1000 / gmdUltimoKgDia);
  return { situacao: "PREVISTO", dias, data: new Date(dataUltimaPesagem.getTime() + dias * 86_400_000) };
}

// ------------------------------------------------------------ ranking de GMD

export interface AnimalComGmd {
  situacao: SituacaoAnimal;
  resumo: { gmdUltimoKgDia: number | null };
}

/** Os `n` ativos que mais ganham e os `n` que menos ganham (sem repetir o mesmo animal nas duas listas). */
export function rankingGmd<T extends AnimalComGmd>(animais: readonly T[], n = 5): { melhores: T[]; piores: T[] } {
  const comGmd = animais
    .filter((a) => a.situacao === "ATIVO" && a.resumo.gmdUltimoKgDia !== null)
    .sort((a, b) => b.resumo.gmdUltimoKgDia! - a.resumo.gmdUltimoKgDia!);
  const melhores = comGmd.slice(0, n);
  const piores = comGmd.slice(Math.max(melhores.length, comGmd.length - n)).reverse();
  return { melhores, piores };
}

// ---------------------------------------------------------- GMD por grupo

export interface ResumoGrupo {
  chave: string;
  animais: number;
  /** Quantos têm GMD (pelo menos duas pesagens em dias diferentes). */
  comGmd: number;
  gmdMedioKgDia: number | null;
}

/** GMD médio dos animais ativos agrupados pela chave (categoria, sexo...), do maior GMD ao menor. */
export function gmdPorGrupo<T extends AnimalComGmd>(animais: readonly T[], chave: (a: T) => string): ResumoGrupo[] {
  const grupos = new Map<string, { animais: number; gmds: number[] }>();
  for (const a of animais) {
    if (a.situacao !== "ATIVO") continue;
    const k = chave(a);
    const g = grupos.get(k) ?? { animais: 0, gmds: [] };
    g.animais++;
    if (a.resumo.gmdUltimoKgDia !== null) g.gmds.push(a.resumo.gmdUltimoKgDia);
    grupos.set(k, g);
  }
  return [...grupos]
    .map(([k, g]) => ({
      chave: k,
      animais: g.animais,
      comGmd: g.gmds.length,
      gmdMedioKgDia: g.gmds.length ? g.gmds.reduce((t, x) => t + x, 0) / g.gmds.length : null,
    }))
    .sort((a, b) => (b.gmdMedioKgDia ?? -Infinity) - (a.gmdMedioKgDia ?? -Infinity) || a.chave.localeCompare(b.chave));
}

// ------------------------------------------------------- evolução mensal

export interface PesagemParaMes {
  animalId: string;
  dataHoraPesagem: Date;
  pesoG: number;
  gmdKgDia: number | null;
}

export interface Mes {
  /** "2026-10" */
  mes: string;
  /** Animais pesados no mês. */
  animais: number;
  /** Média do último peso de cada animal pesado no mês. */
  pesoMedioG: number | null;
  /** Média do GMD das pesagens do mês que têm GMD. */
  gmdMedioKgDia: number | null;
}

const formatosMes = new Map<string, Intl.DateTimeFormat>();

/** Ano e mês ("2026-10") da data no fuso da propriedade. */
export function mesNoFuso(data: Date, fuso: string): string {
  let f = formatosMes.get(fuso);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit" });
    formatosMes.set(fuso, f);
  }
  return f.format(data).slice(0, 7);
}

function mesesAte(ultimo: string, quantidade: number): string[] {
  const [ano, mes] = ultimo.split("-").map(Number) as [number, number];
  const lista: string[] = [];
  for (let i = quantidade - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(ano, mes - 1 - i, 1));
    lista.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return lista;
}

/**
 * Peso médio e GMD médio do rebanho mês a mês, dos últimos `meses` meses até o
 * mês de `agora` (meses sem pesagem aparecem vazios). Recebe só pesagens válidas.
 */
export function evolucaoMensal(pesagens: readonly PesagemParaMes[], agora: Date, fuso: string, meses = 12): Mes[] {
  const porMes = new Map<string, { ultimoPorAnimal: Map<string, PesagemParaMes>; gmds: number[] }>();
  for (const p of pesagens) {
    const m = mesNoFuso(p.dataHoraPesagem, fuso);
    const g = porMes.get(m) ?? { ultimoPorAnimal: new Map<string, PesagemParaMes>(), gmds: [] as number[] };
    const anterior = g.ultimoPorAnimal.get(p.animalId);
    if (!anterior || anterior.dataHoraPesagem <= p.dataHoraPesagem) g.ultimoPorAnimal.set(p.animalId, p);
    if (p.gmdKgDia !== null) g.gmds.push(p.gmdKgDia);
    porMes.set(m, g);
  }
  return mesesAte(mesNoFuso(agora, fuso), meses).map((mes) => {
    const g = porMes.get(mes);
    const pesos = g ? [...g.ultimoPorAnimal.values()].map((p) => p.pesoG) : [];
    return {
      mes,
      animais: pesos.length,
      pesoMedioG: pesos.length ? Math.round(pesos.reduce((t, x) => t + x, 0) / pesos.length) : null,
      gmdMedioKgDia: g?.gmds.length ? g.gmds.reduce((t, x) => t + x, 0) / g.gmds.length : null,
    };
  });
}

// ------------------------------------------------------ saídas do rebanho

export interface AnimalParaSaida {
  situacao: SituacaoAnimal;
  /** Quando a situação atual começou. */
  situacaoDesde: Date | null;
}

export interface Saidas {
  vendidos: number;
  mortos: number;
  transferidos: number;
  /**
   * Mortos ÷ (ativos hoje + saídas no período). É uma aproximação do rebanho
   * do período, porque o app não registra entradas e saídas separadamente.
   */
  mortalidade: number | null;
}

/** Vendas, mortes e transferências com data no intervalo [inicio, fim]. */
export function saidasNoPeriodo(animais: readonly AnimalParaSaida[], inicio: Date, fim: Date): Saidas {
  const dentro = (a: AnimalParaSaida) => a.situacaoDesde !== null && a.situacaoDesde >= inicio && a.situacaoDesde <= fim;
  const conta = (s: SituacaoAnimal) => animais.filter((a) => a.situacao === s && dentro(a)).length;
  const vendidos = conta("VENDIDO");
  const mortos = conta("MORTO");
  const transferidos = conta("TRANSFERIDO");
  const base = animais.filter((a) => a.situacao === "ATIVO").length + vendidos + mortos + transferidos;
  return { vendidos, mortos, transferidos, mortalidade: base ? mortos / base : null };
}
