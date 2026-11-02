import type { SituacaoAnimal } from "./indicadores.js";

// ------------------------------------------------------------------ pesagem

/** Variação acima disso em relação ao último peso pede confirmação (ex.: 35 kg digitado no lugar de 350 kg). */
export const LIMITE_VARIACAO_SUSPEITA = 0.25;

export interface AvaliacaoPeso {
  suspeito: boolean;
  /** Variação relativa ao último peso (0,1 = 10 %); null sem pesagem anterior. */
  variacaoRelativa: number | null;
}

/** Sinaliza um peso muito diferente do último registrado, que provavelmente foi digitado errado. */
export function avaliarNovoPeso(novoG: number, anteriorG: number | null): AvaliacaoPeso {
  if (anteriorG === null || anteriorG <= 0) return { suspeito: false, variacaoRelativa: null };
  const variacaoRelativa = (novoG - anteriorG) / anteriorG;
  return { suspeito: Math.abs(variacaoRelativa) > LIMITE_VARIACAO_SUSPEITA, variacaoRelativa };
}

// ------------------------------------------------------------ sem pesagem

export const DIAS_ALERTA_PADRAO = 30;

export interface AnimalParaAlerta {
  situacao: SituacaoAnimal;
  resumo: { dataUltimaPesagem: Date | null };
}

/** Animais ativos sem pesagem há mais de `dias` dias (ou nunca pesados), do mais atrasado ao menos. */
export function semPesagemRecente<T extends AnimalParaAlerta>(animais: readonly T[], agora: Date, dias: number): T[] {
  const limite = agora.getTime() - dias * 86_400_000;
  return animais
    .filter((a) => a.situacao === "ATIVO")
    .filter((a) => a.resumo.dataUltimaPesagem === null || a.resumo.dataUltimaPesagem.getTime() < limite)
    .sort((a, b) => (a.resumo.dataUltimaPesagem?.getTime() ?? 0) - (b.resumo.dataUltimaPesagem?.getTime() ?? 0));
}

/** Dias inteiros desde a data (para mostrar "há 42 dias"). */
export function diasDesde(data: Date, agora: Date): number {
  return Math.floor((agora.getTime() - data.getTime()) / 86_400_000);
}

// ------------------------------------------------------------------- lotes

export interface AnimalParaLote {
  situacao: SituacaoAnimal;
  loteId?: string | null;
  resumo: { pesoAtualG: number | null; gmdUltimoKgDia: number | null };
}

export interface ResumoLote {
  loteId: string | null;
  animais: number;
  comPesagem: number;
  pesoMedioG: number | null;
  /** Média do último GMD dos animais que têm pelo menos duas pesagens. */
  gmdMedioKgDia: number | null;
}

/** Peso médio e GMD médio dos animais ativos por lote (null = sem lote). */
export function resumirPorLote(animais: readonly AnimalParaLote[]): Map<string | null, ResumoLote> {
  const grupos = new Map<string | null, AnimalParaLote[]>();
  for (const a of animais) {
    if (a.situacao !== "ATIVO") continue;
    const id = a.loteId ?? null;
    const g = grupos.get(id);
    if (g) g.push(a);
    else grupos.set(id, [a]);
  }
  const media = (v: number[]) => (v.length ? v.reduce((t, x) => t + x, 0) / v.length : null);
  const resultado = new Map<string | null, ResumoLote>();
  for (const [loteId, lista] of grupos) {
    const pesos = lista.map((a) => a.resumo.pesoAtualG).filter((p): p is number => p !== null);
    const gmds = lista.map((a) => a.resumo.gmdUltimoKgDia).filter((g): g is number => g !== null);
    const pm = media(pesos);
    resultado.set(loteId, {
      loteId,
      animais: lista.length,
      comPesagem: pesos.length,
      pesoMedioG: pm === null ? null : Math.round(pm),
      gmdMedioKgDia: media(gmds),
    });
  }
  return resultado;
}

// --------------------------------------------------------------------- CSV

export type ValorCsv = string | number | null | undefined;

const FORMATO_DECIMAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3, useGrouping: false });

function celula(v: ValorCsv): string {
  if (v === null || v === undefined) return "";
  const texto = typeof v === "number" ? FORMATO_DECIMAL.format(v) : v;
  // Evita que o Excel interprete o texto como fórmula.
  const seguro = /^[=+\-@]/.test(texto) && typeof v === "string" ? `'${texto}` : texto;
  return /[";\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

/**
 * CSV no formato que o Excel em português abre direto: ponto e vírgula como
 * separador, vírgula decimal e BOM para os acentos (RF-12).
 */
export function gerarCsv(cabecalho: readonly string[], linhas: readonly (readonly ValorCsv[])[]): string {
  return "﻿" + [cabecalho, ...linhas].map((l) => l.map(celula).join(";")).join("\r\n") + "\r\n";
}
