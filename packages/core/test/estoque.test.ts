import { describe, expect, it } from "vitest";
import { calcularSaldos, categoriaFinanceiraDoInsumo, formatarQuantidade, lerQuantidade, quantidadeParaTexto, type InsumoBase } from "../src/index.js";

describe("lerQuantidade", () => {
  it.each([
    ["25", 25000],
    ["2,5", 2500],
    ["2.5", 2500],
    ["0,125", 125],
    ["0.125", 125],
    ["1.500", 1500000],
    ["1.500,25", 1500250],
    [" 10 ", 10000],
  ])("%s → %d milésimos", (texto, mil) => {
    expect(lerQuantidade(texto)).toBe(mil);
  });
  it.each(["", "abc", "0", "0,000", "-1", "1,2345", "1.23,0", "2000000000"])("recusa %s", (texto) => {
    expect(lerQuantidade(texto)).toBeNull();
  });
});

describe("formatação", () => {
  it("mostra sem zeros sobrando", () => {
    expect(formatarQuantidade(2500, "kg")).toBe("2,5 kg");
    expect(formatarQuantidade(1500000, "dose")).toBe("1.500 dose");
    expect(formatarQuantidade(-3000)).toBe("-3");
    expect(formatarQuantidade(null)).toBe("—");
    expect(quantidadeParaTexto(2500)).toBe("2,5");
  });
  it("compra entra na categoria certa do financeiro", () => {
    expect(categoriaFinanceiraDoInsumo("SAL")).toBe("SAL_MINERAL");
    expect(categoriaFinanceiraDoInsumo("VACINA")).toBe("SANIDADE");
    expect(categoriaFinanceiraDoInsumo("xyz")).toBe("OUTRAS_DESPESAS");
  });
});

describe("calcularSaldos", () => {
  const racao: InsumoBase = { id: "racao", minimoMil: 50000, vacinaId: null, doseMil: null, vacinaDesde: null };
  const aftosa: InsumoBase = { id: "aftosa", minimoMil: null, vacinaId: "vac-aftosa", doseMil: 5000, vacinaDesde: new Date("2026-11-01T00:00:00Z") };
  const pesagem = (data: string, vacinas?: string[], estado = "VALIDA") => ({ estado, criadoEm: new Date(data), vacinas });

  it("soma entradas e tira saídas", () => {
    const s = calcularSaldos(
      [racao],
      [
        { insumoId: "racao", tipo: "ENTRADA", quantidadeMil: 100000 },
        { insumoId: "racao", tipo: "SAIDA", quantidadeMil: 30000 },
        { insumoId: "outro", tipo: "ENTRADA", quantidadeMil: 1 },
      ],
      [],
    ).get("racao")!;
    expect(s.saldoMil).toBe(70000);
    expect(s.abaixoDoMinimo).toBe(false);
  });

  it("alerta quando chega no mínimo", () => {
    const s = calcularSaldos([racao], [{ insumoId: "racao", tipo: "ENTRADA", quantidadeMil: 50000 }], []).get("racao")!;
    expect(s.abaixoDoMinimo).toBe(true);
  });

  it("dá baixa da dose em cada pesagem válida com a vacina, a partir do vínculo", () => {
    const s = calcularSaldos(
      [aftosa],
      [{ insumoId: "aftosa", tipo: "ENTRADA", quantidadeMil: 50000 }],
      [
        pesagem("2026-11-02T10:00:00Z", ["vac-aftosa", "vac-raiva"]),
        pesagem("2026-11-02T10:05:00Z", ["vac-aftosa"]),
        pesagem("2026-11-02T10:10:00Z", ["vac-aftosa"], "ANULADA"),
        pesagem("2026-10-20T10:00:00Z", ["vac-aftosa"]),
        pesagem("2026-11-03T10:00:00Z"),
      ],
    ).get("aftosa")!;
    expect(s.aplicacoes).toBe(2);
    expect(s.usoPesagensMil).toBe(10000);
    expect(s.saldoMil).toBe(40000);
    expect(s.abaixoDoMinimo).toBe(false);
  });

  it("sem mínimo, alerta só com saldo negativo", () => {
    const s = calcularSaldos([aftosa], [], [pesagem("2026-11-02T10:00:00Z", ["vac-aftosa"])]).get("aftosa")!;
    expect(s.saldoMil).toBe(-5000);
    expect(s.abaixoDoMinimo).toBe(true);
  });
});
