import { describe, expect, it } from "vitest";
import { montarRelatorio, type AnimalParaRelatorio, type PesagemParaRelatorio } from "../src/index.js";

const FUSO = "America/Sao_Paulo";
const animal = (id: string, brinco: string): AnimalParaRelatorio => ({ id, brinco, codigoNumero: 1, categoria: "Garrote", sexo: "M" });
let n = 0;
const pes = (animalId: string, dia: string, kg: number, extra: Partial<PesagemParaRelatorio> = {}): PesagemParaRelatorio => ({
  id: `p${++n}`,
  animalId,
  pesoG: kg * 1000,
  dataHoraPesagem: new Date(`${dia}T10:00:00-03:00`),
  criadoEm: new Date(`${dia}T10:00:00-03:00`),
  estado: "VALIDA",
  ...extra,
});
const nomes: Record<string, string> = { af: "Aftosa", br: "Brucelose" };
const nome = (id: string) => nomes[id] ?? id;

describe("montarRelatorio", () => {
  it("calcula entrada, atual, ganho e GMD do período", () => {
    const r = montarRelatorio(
      [animal("a", "10"), animal("b", "2")],
      [pes("a", "2026-01-01", 300), pes("a", "2026-03-02", 360), pes("a", "2026-02-01", 330), pes("b", "2026-01-01", 250)],
      nome,
      FUSO,
    );
    expect(r.linhas.map((l) => l.animal.brinco)).toEqual(["2", "10"]);
    const a = r.linhas[1]!;
    expect(a.pesoInicialG).toBe(300_000);
    expect(a.pesoAtualG).toBe(360_000);
    expect(a.ganhoG).toBe(60_000);
    expect(a.dias).toBe(60);
    expect(a.gmdPeriodoKgDia).toBeCloseTo(1, 6);
    const b = r.linhas[0]!;
    expect(b.ganhoG).toBeNull();
    expect(b.gmdPeriodoKgDia).toBeNull();
    expect(r.pesoTotalG).toBe(610_000);
    expect(r.pesoMedioG).toBe(305_000);
    expect(r.gmdMedioKgDia).toBeCloseTo(1, 6);
    expect(r.ganhoMedioG).toBe(60_000);
  });

  it("ignora anuladas e animais fora da lista", () => {
    const r = montarRelatorio(
      [animal("a", "1")],
      [pes("a", "2026-01-01", 300), pes("a", "2026-01-10", 999, { estado: "ANULADA" }), pes("x", "2026-01-01", 500)],
      nome,
      FUSO,
    );
    expect(r.linhas[0]!.pesoAtualG).toBe(300_000);
    expect(r.pesoTotalG).toBe(300_000);
  });

  it("lista vacinas por animal e resume no lote", () => {
    const r = montarRelatorio(
      [animal("a", "1"), animal("b", "2"), animal("c", "3")],
      [
        pes("a", "2026-01-01", 300, { vacinas: ["af"] }),
        pes("a", "2026-05-01", 350, { vacinas: ["af", "br"] }),
        pes("b", "2026-02-01", 280, { vacinas: ["af"] }),
        pes("c", "2026-02-01", 280),
      ],
      nome,
      FUSO,
    );
    expect(r.linhas[0]!.vacinas.map((v) => v.nome)).toEqual(["Aftosa", "Brucelose"]);
    expect(r.linhas[0]!.vacinas[0]!.data.toISOString().slice(0, 10)).toBe("2026-05-01");
    expect(r.linhas[2]!.vacinas).toEqual([]);
    expect(r.vacinas.map((v) => [v.nome, v.animais])).toEqual([
      ["Aftosa", 2],
      ["Brucelose", 1],
    ]);
    expect(r.vacinas[0]!.primeira.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(r.vacinas[0]!.ultima.toISOString().slice(0, 10)).toBe("2026-05-01");
  });

  it("lote vazio", () => {
    const r = montarRelatorio([], [], nome, FUSO);
    expect(r).toMatchObject({ animais: 0, comPesagem: 0, pesoTotalG: 0, pesoMedioG: null, gmdMedioKgDia: null, vacinas: [] });
  });
});
