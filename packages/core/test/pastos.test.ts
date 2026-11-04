import { describe, expect, it } from "vitest";
import {
  calcularLotacao,
  diasEntreDatas,
  formatarHectares,
  hectaresParaTexto,
  historicoRotacao,
  lerHectares,
  ocupacaoAtualPorLote,
} from "../src/index.js";

describe("lerHectares", () => {
  it("lê hectares no formato brasileiro e devolve m²", () => {
    expect(lerHectares("12,5")).toBe(125_000);
    expect(lerHectares("3")).toBe(30_000);
    expect(lerHectares("1.200")).toBe(12_000_000);
    expect(lerHectares("0,25 ha")).toBe(2_500);
    expect(lerHectares("4.5")).toBe(45_000);
  });
  it("recusa vazio, zero, negativo e texto", () => {
    for (const t of ["", "0", "-2", "abc", "1,2,3", "200000"]) expect(lerHectares(t)).toBeNull();
  });
  it("formata e volta para o campo", () => {
    expect(formatarHectares(125_000)).toBe("12,5 ha");
    expect(formatarHectares(null)).toBe("—");
    expect(hectaresParaTexto(125_000)).toBe("12,5");
    expect(lerHectares(hectaresParaTexto(12_345_678))).toBe(12_345_678);
  });
});

describe("diasEntreDatas", () => {
  it("conta os dias corridos", () => {
    expect(diasEntreDatas("2026-10-01", "2026-11-04")).toBe(34);
    expect(diasEntreDatas("2026-11-04", "2026-11-04")).toBe(0);
  });
});

const pastos = [
  { id: "p1", nome: "Pasto 1", areaM2: 100_000, ativo: true },
  { id: "p2", nome: "Pasto 2", areaM2: 50_000, ativo: true },
  { id: "p3", nome: "Pasto 3", areaM2: 80_000, ativo: true },
];
const ocupacoes = [
  { id: "o1", loteId: "l1", pastoId: "p2", entrada: "2026-09-01", saida: "2026-10-01" },
  { id: "o2", loteId: "l1", pastoId: "p1", entrada: "2026-10-01", saida: null },
  { id: "o3", loteId: "l2", pastoId: "p1", entrada: "2026-10-20", saida: null },
];
const animal = (loteId: string | null, pesoAtualG: number | null, situacao: "ATIVO" | "VENDIDO" = "ATIVO") => ({
  situacao,
  loteId,
  resumo: { pesoAtualG },
});

describe("calcularLotacao", () => {
  const animais = [
    animal("l1", 450_000),
    animal("l1", 450_000),
    animal("l2", 225_000),
    animal("l2", null),
    animal("l2", 500_000, "VENDIDO"),
    animal(null, 400_000),
  ];
  const r = calcularLotacao(pastos, ocupacoes, animais, "2026-11-04");

  it("soma o peso vivo dos animais ativos dos lotes que estão no pasto", () => {
    const p1 = r.get("p1")!;
    expect(p1.animais).toBe(4);
    expect(p1.semPeso).toBe(1);
    expect(p1.pesoTotalG).toBe(1_125_000);
    expect(p1.ua).toBeCloseTo(2.5);
    expect(p1.uaPorHa).toBeCloseTo(0.25);
    expect(p1.diasOcupado).toBe(34);
    expect(p1.diasDescanso).toBeNull();
  });
  it("pasto vazio mostra os dias de descanso desde a última saída", () => {
    const p2 = r.get("p2")!;
    expect(p2.animais).toBe(0);
    expect(p2.ua).toBe(0);
    expect(p2.diasOcupado).toBeNull();
    expect(p2.diasDescanso).toBe(34);
  });
  it("pasto nunca usado não tem ocupação nem descanso", () => {
    expect(r.get("p3")).toMatchObject({ animais: 0, diasOcupado: null, diasDescanso: null });
  });
});

describe("rotação", () => {
  it("ocupação atual de cada lote", () => {
    const m = ocupacaoAtualPorLote(ocupacoes);
    expect(m.get("l1")?.id).toBe("o2");
    expect(m.get("l2")?.id).toBe("o3");
  });
  it("histórico do lote, mais recente primeiro, com duração", () => {
    const h = historicoRotacao(ocupacoes, { loteId: "l1" }, "2026-11-04");
    expect(h.map((o) => [o.id, o.dias])).toEqual([
      ["o2", 34],
      ["o1", 30],
    ]);
  });
  it("histórico do pasto", () => {
    expect(historicoRotacao(ocupacoes, { pastoId: "p1" }, "2026-11-04").map((o) => o.id)).toEqual(["o3", "o2"]);
  });
});
