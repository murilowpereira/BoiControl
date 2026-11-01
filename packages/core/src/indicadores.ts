export type SituacaoAnimal = "ATIVO" | "VENDIDO" | "MORTO" | "TRANSFERIDO";

export interface AnimalParaIndicador {
  situacao: SituacaoAnimal;
  resumo: { pesoAtualG: number | null };
}

export interface Indicadores {
  ativos: number;
  comPesagem: number;
  semPesagem: number;
  /** Média do último peso conhecido dos ativos com pesagem (RN-12). */
  pesoMedioG: number | null;
}

export function calcularIndicadores(animais: readonly AnimalParaIndicador[]): Indicadores {
  const ativos = animais.filter((a) => a.situacao === "ATIVO");
  const pesos = ativos.map((a) => a.resumo.pesoAtualG).filter((p): p is number => p !== null);
  const soma = pesos.reduce((t, p) => t + p, 0);
  return {
    ativos: ativos.length,
    comPesagem: pesos.length,
    semPesagem: ativos.length - pesos.length,
    pesoMedioG: pesos.length ? Math.round(soma / pesos.length) : null,
  };
}
