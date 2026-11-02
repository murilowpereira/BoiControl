import { describe, expect, it } from "vitest";
import { centavosParaTexto, formatarReais, lerReais, margemDoAnimal, resumirFinanceiro } from "../src/index.js";

describe("lerReais", () => {
  it.each([
    ["2.850,00", 285000],
    ["2850,5", 285050],
    ["2850", 285000],
    ["R$ 1.500", 150000],
    ["1.234.567,89", 123456789],
    ["12.5", 1250],
    [" 0,99 ", 99],
  ])("%s → %d centavos", (texto, centavos) => {
    expect(lerReais(texto)).toBe(centavos);
  });
  it.each(["", "abc", "0", "0,00", "-10", "1,234", "12,345", "1.23,00", "200000000,01"])("recusa %s", (texto) => {
    expect(lerReais(texto)).toBeNull();
  });
});

describe("formatação", () => {
  it("mostra em reais", () => {
    expect(formatarReais(285050)).toBe("R$ 2.850,50");
    expect(formatarReais(null)).toBe("—");
    expect(formatarReais(-1000)).toMatch(/10,00/);
  });
  it("texto para edição", () => {
    expect(centavosParaTexto(285050)).toBe("2850,50");
    expect(centavosParaTexto(null)).toBe("");
  });
});

describe("resumirFinanceiro", () => {
  const valores = [
    { compraCentavos: 200000, dataCompra: "2026-01-10", vendaCentavos: 450000, dataVenda: "2026-10-05" },
    { compraCentavos: 180000, dataCompra: "2026-10-01", vendaCentavos: null, dataVenda: null },
    { compraCentavos: null, dataCompra: null, vendaCentavos: 300000, dataVenda: "2026-10-20" },
  ];
  const lancamentos = [
    { categoria: "RACAO", valorCentavos: 50000, data: "2026-10-02" },
    { categoria: "SANIDADE", valorCentavos: 8000, data: "2026-10-15" },
    { categoria: "RACAO", valorCentavos: 30000, data: "2026-10-30" },
    { categoria: "OUTRAS_RECEITAS", valorCentavos: 10000, data: "2026-10-12" },
    { categoria: "RACAO", valorCentavos: 99999, data: "2026-09-30" },
  ];

  it("soma só o que está no período", () => {
    const r = resumirFinanceiro(lancamentos, valores, "2026-10-01", "2026-10-31");
    expect(r).toEqual({
      comprasAnimais: 180000,
      animaisComprados: 1,
      vendasAnimais: 750000,
      animaisVendidos: 2,
      outrasReceitas: 10000,
      despesas: 88000,
      despesasPorCategoria: [
        { categoria: "RACAO", centavos: 80000 },
        { categoria: "SANIDADE", centavos: 8000 },
      ],
      resultado: 750000 + 10000 - 180000 - 88000,
    });
  });
  it("sem limites considera tudo", () => {
    const r = resumirFinanceiro(lancamentos, valores, null, null);
    expect(r.comprasAnimais).toBe(380000);
    expect(r.despesas).toBe(187999);
  });
  it("margem do animal precisa de compra e venda", () => {
    expect(margemDoAnimal(valores[0]!)).toBe(250000);
    expect(margemDoAnimal(valores[1]!)).toBeNull();
    expect(margemDoAnimal(valores[2]!)).toBeNull();
  });
});
