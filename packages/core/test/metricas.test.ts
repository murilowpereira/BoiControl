import { describe, expect, it } from "vitest";
import { evolucaoMensal, gmdPorGrupo, mesNoFuso, preverAbate, rankingGmd, saidasNoPeriodo } from "../src/index.js";

const FUSO = "America/Sao_Paulo";
const dia = (d: string) => new Date(`${d}T09:00:00-03:00`);

describe("preverAbate", () => {
  const alvo = 540_000;
  it("calcula os dias a partir da última pesagem", () => {
    const r = preverAbate({ pesoAtualG: 440_000, gmdUltimoKgDia: 0.8, dataUltimaPesagem: dia("2026-11-01") }, alvo);
    expect(r).toEqual({ situacao: "PREVISTO", dias: 125, data: new Date(dia("2026-11-01").getTime() + 125 * 86_400_000) });
  });
  it("arredonda os dias para cima", () => {
    const r = preverAbate({ pesoAtualG: 539_000, gmdUltimoKgDia: 0.3, dataUltimaPesagem: dia("2026-11-01") }, alvo);
    expect(r).toMatchObject({ dias: 4 });
  });
  it("animal que já chegou ao peso", () => {
    expect(preverAbate({ pesoAtualG: 540_000, gmdUltimoKgDia: null, dataUltimaPesagem: dia("2026-11-01") }, alvo)).toEqual({ situacao: "ATINGIDO" });
  });
  it("sem GMD, GMD negativo ou sem pesagem não há previsão", () => {
    const sem = { situacao: "SEM_PREVISAO" };
    expect(preverAbate({ pesoAtualG: 400_000, gmdUltimoKgDia: null, dataUltimaPesagem: dia("2026-11-01") }, alvo)).toEqual(sem);
    expect(preverAbate({ pesoAtualG: 400_000, gmdUltimoKgDia: -0.2, dataUltimaPesagem: dia("2026-11-01") }, alvo)).toEqual(sem);
    expect(preverAbate({ pesoAtualG: 400_000, gmdUltimoKgDia: 0, dataUltimaPesagem: dia("2026-11-01") }, alvo)).toEqual(sem);
    expect(preverAbate({ pesoAtualG: null, gmdUltimoKgDia: null, dataUltimaPesagem: null }, alvo)).toEqual(sem);
  });
});

const animal = (id: string, gmd: number | null, extra: Record<string, unknown> = {}) => ({
  id,
  situacao: "ATIVO" as const,
  resumo: { gmdUltimoKgDia: gmd },
  ...extra,
});

describe("rankingGmd", () => {
  it("ordena e ignora inativos e quem não tem GMD", () => {
    const lista = [
      animal("a", 0.5),
      animal("b", 1.2),
      animal("c", null),
      { ...animal("d", 2), situacao: "VENDIDO" as const },
      animal("e", -0.1),
      animal("f", 0.9),
    ];
    const r = rankingGmd(lista, 2);
    expect(r.melhores.map((a) => a.id)).toEqual(["b", "f"]);
    expect(r.piores.map((a) => a.id)).toEqual(["e", "a"]);
  });
  it("com poucos animais não repete o mesmo nas duas listas", () => {
    const r = rankingGmd([animal("a", 0.5), animal("b", 1), animal("c", 0.2)], 5);
    expect(r.melhores.map((a) => a.id)).toEqual(["b", "a", "c"]);
    expect(r.piores).toEqual([]);
    const r2 = rankingGmd([animal("a", 0.5), animal("b", 1), animal("c", 0.2), animal("d", 0.1)], 3);
    expect(r2.melhores.map((a) => a.id)).toEqual(["b", "a", "c"]);
    expect(r2.piores.map((a) => a.id)).toEqual(["d"]);
  });
});

describe("gmdPorGrupo", () => {
  it("média por chave, só ativos, do maior para o menor", () => {
    const lista = [
      animal("a", 0.5, { sexo: "M" }),
      animal("b", 1.0, { sexo: "M" }),
      animal("c", null, { sexo: "M" }),
      animal("d", 0.4, { sexo: "F" }),
      { ...animal("e", 3, { sexo: "F" }), situacao: "MORTO" as const },
    ];
    expect(gmdPorGrupo(lista, (a) => a.sexo)).toEqual([
      { chave: "M", animais: 3, comGmd: 2, gmdMedioKgDia: 0.75 },
      { chave: "F", animais: 1, comGmd: 1, gmdMedioKgDia: 0.4 },
    ]);
  });
  it("grupo sem GMD vai para o fim", () => {
    const r = gmdPorGrupo([animal("a", null, { c: "x" }), animal("b", 0.1, { c: "y" })], (a) => a.c);
    expect(r.map((g) => g.chave)).toEqual(["y", "x"]);
    expect(r[1]!.gmdMedioKgDia).toBeNull();
  });
});

describe("evolucaoMensal", () => {
  it("usa o mês no fuso da fazenda", () => {
    // 31/10 às 23h em São Paulo já é 1º/11 em UTC.
    expect(mesNoFuso(new Date("2026-11-01T02:00:00Z"), FUSO)).toBe("2026-10");
  });
  it("último peso de cada animal no mês e média dos GMDs", () => {
    const p = (animalId: string, d: string, kg: number, gmd: number | null) => ({
      animalId,
      dataHoraPesagem: dia(d),
      pesoG: kg * 1000,
      gmdKgDia: gmd,
    });
    const r = evolucaoMensal(
      [
        p("a", "2026-09-05", 300, null),
        p("a", "2026-10-02", 320, 0.7),
        p("a", "2026-10-20", 330, 0.6),
        p("b", "2026-10-10", 400, 1.0),
      ],
      dia("2026-11-02"),
      FUSO,
      3,
    );
    expect(r.map((m) => m.mes)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(r[0]).toEqual({ mes: "2026-09", animais: 1, pesoMedioG: 300_000, gmdMedioKgDia: null });
    expect(r[1]!.animais).toBe(2);
    expect(r[1]!.pesoMedioG).toBe(365_000);
    expect(r[1]!.gmdMedioKgDia).toBeCloseTo(0.7667, 3);
    expect(r[2]).toEqual({ mes: "2026-11", animais: 0, pesoMedioG: null, gmdMedioKgDia: null });
  });
  it("atravessa a virada do ano", () => {
    expect(evolucaoMensal([], dia("2027-02-10"), FUSO, 4).map((m) => m.mes)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });
});

describe("saidasNoPeriodo", () => {
  it("conta saídas com data no período e calcula a mortalidade", () => {
    const a = (situacao: "ATIVO" | "VENDIDO" | "MORTO" | "TRANSFERIDO", d: string | null) => ({ situacao, situacaoDesde: d ? dia(d) : null });
    const r = saidasNoPeriodo(
      [
        a("ATIVO", "2025-01-01"),
        a("ATIVO", "2025-01-01"),
        a("ATIVO", null),
        a("VENDIDO", "2026-06-01"),
        a("VENDIDO", "2024-06-01"),
        a("MORTO", "2026-03-01"),
        a("TRANSFERIDO", "2026-10-01"),
      ],
      dia("2025-11-02"),
      dia("2026-11-02"),
    );
    expect(r).toEqual({ vendidos: 1, mortos: 1, transferidos: 1, mortalidade: 1 / 6 });
  });
  it("sem animais não há taxa", () => {
    expect(saidasNoPeriodo([], new Date(0), new Date()).mortalidade).toBeNull();
  });
});
