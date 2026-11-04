import { diaNoFuso, type PesagemDoAnimal } from "./serie.js";

/**
 * Relatório do lote para o comprador ou o frigorífico: peso de entrada e atual,
 * ganho e GMD do período de cada animal, e vacinas aplicadas.
 * Só pesagens válidas entram; não mostra valores (preço é assunto do ADMIN).
 */

export interface AnimalParaRelatorio {
  id: string;
  brinco: string;
  codigoNumero: number;
  categoria: string;
  sexo: "M" | "F";
}

export interface PesagemParaRelatorio extends PesagemDoAnimal {
  vacinas?: string[];
}

export interface VacinaNoAnimal {
  nome: string;
  /** Data da pesagem em que foi aplicada (a mais recente, se repetida). */
  data: Date;
}

export interface LinhaRelatorio {
  animal: AnimalParaRelatorio;
  pesagens: number;
  pesoInicialG: number | null;
  dataInicial: Date | null;
  pesoAtualG: number | null;
  dataAtual: Date | null;
  /** Peso atual menos o de entrada; null com menos de duas pesagens. */
  ganhoG: number | null;
  /** Dias de calendário entre a primeira e a última pesagem. */
  dias: number | null;
  /** Ganho dividido pelos dias (GMD do período todo); null sem dias. */
  gmdPeriodoKgDia: number | null;
  vacinas: VacinaNoAnimal[];
}

export interface VacinaNoLote {
  nome: string;
  animais: number;
  primeira: Date;
  ultima: Date;
}

export interface Relatorio {
  linhas: LinhaRelatorio[];
  animais: number;
  comPesagem: number;
  pesoTotalG: number;
  pesoMedioG: number | null;
  /** Média do GMD do período dos animais que têm pelo menos dois dias entre pesagens. */
  gmdMedioKgDia: number | null;
  ganhoMedioG: number | null;
  vacinas: VacinaNoLote[];
}

export function montarRelatorio(
  animais: readonly AnimalParaRelatorio[],
  pesagens: readonly PesagemParaRelatorio[],
  nomeVacina: (id: string) => string,
  fuso: string,
): Relatorio {
  const ids = new Set(animais.map((a) => a.id));
  const porAnimal = new Map<string, PesagemParaRelatorio[]>();
  for (const p of pesagens) {
    if (p.estado !== "VALIDA" || !ids.has(p.animalId)) continue;
    const g = porAnimal.get(p.animalId);
    if (g) g.push(p);
    else porAnimal.set(p.animalId, [p]);
  }

  const vacinasLote = new Map<string, { nome: string; animais: Set<string>; primeira: Date; ultima: Date }>();

  const linhas = [...animais]
    .sort((a, b) => a.brinco.localeCompare(b.brinco, "pt-BR", { numeric: true }))
    .map((animal): LinhaRelatorio => {
      const lista = (porAnimal.get(animal.id) ?? []).sort(
        (a, b) => a.dataHoraPesagem.getTime() - b.dataHoraPesagem.getTime() || a.criadoEm.getTime() - b.criadoEm.getTime(),
      );
      const primeira = lista[0];
      const ultima = lista.at(-1);
      const dias = primeira && ultima ? diaNoFuso(ultima.dataHoraPesagem, fuso) - diaNoFuso(primeira.dataHoraPesagem, fuso) : null;
      const ganhoG = primeira && ultima && lista.length > 1 ? ultima.pesoG - primeira.pesoG : null;

      const vacinas = new Map<string, Date>();
      for (const p of lista) {
        for (const vid of p.vacinas ?? []) {
          vacinas.set(vid, p.dataHoraPesagem);
          const nome = nomeVacina(vid);
          const v = vacinasLote.get(vid);
          if (!v) vacinasLote.set(vid, { nome, animais: new Set([animal.id]), primeira: p.dataHoraPesagem, ultima: p.dataHoraPesagem });
          else {
            v.animais.add(animal.id);
            if (p.dataHoraPesagem < v.primeira) v.primeira = p.dataHoraPesagem;
            if (p.dataHoraPesagem > v.ultima) v.ultima = p.dataHoraPesagem;
          }
        }
      }

      return {
        animal,
        pesagens: lista.length,
        pesoInicialG: primeira?.pesoG ?? null,
        dataInicial: primeira?.dataHoraPesagem ?? null,
        pesoAtualG: ultima?.pesoG ?? null,
        dataAtual: ultima?.dataHoraPesagem ?? null,
        ganhoG,
        dias,
        gmdPeriodoKgDia: ganhoG !== null && dias ? ganhoG / 1000 / dias : null,
        vacinas: [...vacinas].map(([vid, data]) => ({ nome: nomeVacina(vid), data })).sort((a, b) => a.data.getTime() - b.data.getTime()),
      };
    });

  const media = (v: number[]) => (v.length ? v.reduce((t, x) => t + x, 0) / v.length : null);
  const pesos = linhas.map((l) => l.pesoAtualG).filter((p): p is number => p !== null);
  const pesoTotalG = pesos.reduce((t, p) => t + p, 0);
  const pm = media(pesos);
  const gm = media(linhas.map((l) => l.ganhoG).filter((g): g is number => g !== null));

  return {
    linhas,
    animais: linhas.length,
    comPesagem: pesos.length,
    pesoTotalG,
    pesoMedioG: pm === null ? null : Math.round(pm),
    gmdMedioKgDia: media(linhas.map((l) => l.gmdPeriodoKgDia).filter((g): g is number => g !== null)),
    ganhoMedioG: gm === null ? null : Math.round(gm),
    vacinas: [...vacinasLote.values()]
      .map((v) => ({ nome: v.nome, animais: v.animais.size, primeira: v.primeira, ultima: v.ultima }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  };
}
