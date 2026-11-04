import { describe, expect, it } from "vitest";
import { chuvaComGmd, correlacao, descreverCorrelacao, formatarChuva, lerChuvaMm, relacaoChuvaGmd, type Mes } from "../src/index.js";

const mes = (m: string, gmd: number | null, animais = 3): Mes => ({ mes: m, animais, pesoMedioG: null, gmdMedioKgDia: gmd });

describe("lerChuvaMm", () => {
  it("aceita inteiro, vírgula e ponto com uma casa", () => {
    expect(lerChuvaMm("12")).toBe(120);
    expect(lerChuvaMm(" 12,5 ")).toBe(125);
    expect(lerChuvaMm("0.4")).toBe(4);
    expect(lerChuvaMm("0")).toBe(0);
    expect(lerChuvaMm("500")).toBe(5000);
  });
  it("recusa vazio, negativo, duas casas e acima de 500 mm", () => {
    for (const t of ["", "-3", "1,25", "501", "abc", "1.000"]) expect(lerChuvaMm(t)).toBeNull();
  });
  it("formata em mm", () => {
    expect(formatarChuva(125)).toBe("12,5 mm");
    expect(formatarChuva(1200)).toBe("120 mm");
    expect(formatarChuva(null)).toBe("—");
  });
});

describe("chuvaComGmd", () => {
  it("soma a chuva de cada mês e junta com o GMD", () => {
    const linhas = chuvaComGmd(
      [mes("2026-09", 0.4), mes("2026-10", 0.7), mes("2026-11", null, 0)],
      [
        { data: "2026-10-03", decimosMm: 125 },
        { data: "2026-10-20", decimosMm: 300 },
        { data: "2026-09-15", decimosMm: 0 },
        { data: "2026-08-01", decimosMm: 999 },
      ],
    );
    expect(linhas).toEqual([
      { mes: "2026-09", chuvaDecimos: 0, diasRegistrados: 1, gmdMedioKgDia: 0.4, animais: 3 },
      { mes: "2026-10", chuvaDecimos: 425, diasRegistrados: 2, gmdMedioKgDia: 0.7, animais: 3 },
      { mes: "2026-11", chuvaDecimos: null, diasRegistrados: 0, gmdMedioKgDia: null, animais: 0 },
    ]);
  });
});

describe("correlacao", () => {
  it("1 para relação perfeita, -1 para inversa", () => {
    expect(correlacao([[1, 2], [2, 4], [3, 6]])).toBeCloseTo(1);
    expect(correlacao([[1, 6], [2, 4], [3, 2]])).toBeCloseTo(-1);
  });
  it("null com menos de 3 pares ou sem variação", () => {
    expect(correlacao([[1, 2], [2, 3]])).toBeNull();
    expect(correlacao([[1, 2], [1, 3], [1, 4]])).toBeNull();
  });
  it("descreve em palavras", () => {
    expect(descreverCorrelacao(null)).toBe("ainda sem dados suficientes");
    expect(descreverCorrelacao(0.1)).toBe("pouca relação");
    expect(descreverCorrelacao(0.5)).toBe("relação moderada: mais chuva, mais ganho");
    expect(descreverCorrelacao(-0.8)).toBe("relação forte: mais chuva, menos ganho");
  });
});

describe("relacaoChuvaGmd", () => {
  it("compara a chuva do mesmo mês e a do mês anterior com o GMD", () => {
    const linhas = chuvaComGmd(
      [mes("2026-06", 0.2), mes("2026-07", 0.3), mes("2026-08", 0.5), mes("2026-09", 0.9), mes("2026-10", null, 0)],
      [
        { data: "2026-06-10", decimosMm: 100 },
        { data: "2026-07-10", decimosMm: 400 },
        { data: "2026-08-10", decimosMm: 800 },
        { data: "2026-09-10", decimosMm: 1600 },
        { data: "2026-10-10", decimosMm: 2000 },
      ],
    );
    const r = relacaoChuvaGmd(linhas);
    expect(r.mesesComparados).toBe(4);
    expect(r.mesmoMes).toBeGreaterThan(0.9);
    expect(r.mesAnterior).toBeGreaterThan(0.9);
  });
  it("meses sem chuva registrada ficam de fora", () => {
    const linhas = chuvaComGmd([mes("2026-08", 0.5), mes("2026-09", 0.6), mes("2026-10", 0.7)], [{ data: "2026-09-01", decimosMm: 10 }]);
    expect(relacaoChuvaGmd(linhas)).toEqual({ mesmoMes: null, mesAnterior: null, mesesComparados: 1 });
  });
});
