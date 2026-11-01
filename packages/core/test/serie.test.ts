import { describe, expect, it } from "vitest";
import { calcularPorAnimal, calcularSerie, formatarGmd, resumirAnimal, type PesagemBase } from "../src/serie.js";

const FUSO = "America/Sao_Paulo";

function p(id: string, pesoG: number, iso: string, criadoEm = iso): PesagemBase {
  return { id, pesoG, dataHoraPesagem: new Date(iso), criadoEm: new Date(criadoEm) };
}

describe("calcularSerie", () => {
  it("CA-04: 320 kg para 356 kg em 45 dias produz 36 kg e 0,800 kg/dia", () => {
    const serie = calcularSerie(
      [p("a", 320_000, "2026-09-01T08:00:00-03:00"), p("b", 356_000, "2026-10-16T09:30:00-03:00")],
      FUSO,
    );
    expect(serie[0]).toMatchObject({ id: "a", variacaoG: null, gmdKgDia: null, diasPeriodo: null });
    expect(serie[1]).toMatchObject({ id: "b", variacaoG: 36_000, diasPeriodo: 45 });
    expect(serie[1]!.gmdKgDia).toBeCloseTo(0.8, 10);
    expect(formatarGmd(serie[1]!.gmdKgDia)).toBe("0,800 kg/dia");
  });

  it("CA-05: pesagem no mesmo dia preserva histórico e não calcula GMD", () => {
    const serie = calcularSerie(
      [p("a", 300_000, "2026-10-01T07:00:00-03:00"), p("b", 302_000, "2026-10-01T17:00:00-03:00")],
      FUSO,
    );
    expect(serie).toHaveLength(2);
    expect(serie[1]).toMatchObject({ variacaoG: 2_000, diasPeriodo: 0, gmdKgDia: null });
    expect(formatarGmd(serie[1]!.gmdKgDia)).toBe("—");
  });

  it("conta dias pelo calendário do fuso da propriedade, não por 24h corridas", () => {
    // 23:30 de um dia e 06:00 do dia seguinte em São Paulo = 1 dia
    const serie = calcularSerie(
      [p("a", 300_000, "2026-10-01T23:30:00-03:00"), p("b", 301_000, "2026-10-02T06:00:00-03:00")],
      FUSO,
    );
    expect(serie[1]).toMatchObject({ diasPeriodo: 1, gmdKgDia: 1 });
  });

  it("RN-10: perda de peso gera GMD negativo", () => {
    const serie = calcularSerie(
      [p("a", 400_000, "2026-10-01T08:00:00-03:00"), p("b", 390_000, "2026-10-11T08:00:00-03:00")],
      FUSO,
    );
    expect(serie[1]!.gmdKgDia).toBeCloseTo(-1, 10);
    expect(formatarGmd(serie[1]!.gmdKgDia)).toBe("-1,000 kg/dia");
  });

  it("ordena pela data da pesagem, não pela ordem de chegada (offline fora de ordem)", () => {
    const serie = calcularSerie(
      [
        p("nova", 356_000, "2026-10-16T08:00:00-03:00", "2026-10-16T08:00:00-03:00"),
        p("antiga-sincronizada-depois", 320_000, "2026-09-01T08:00:00-03:00", "2026-10-20T10:00:00-03:00"),
      ],
      FUSO,
    );
    expect(serie.map((s) => s.id)).toEqual(["antiga-sincronizada-depois", "nova"]);
    expect(serie[1]!.variacaoG).toBe(36_000);
  });

  it("RN-07: desempate estável por criadoEm e depois por id", () => {
    const mesmaHora = "2026-10-01T08:00:00-03:00";
    const serie = calcularSerie(
      [
        p("c", 303_000, mesmaHora, "2026-10-01T08:00:02-03:00"),
        p("b", 302_000, mesmaHora, "2026-10-01T08:00:01-03:00"),
        p("a", 301_000, mesmaHora, "2026-10-01T08:00:01-03:00"),
      ],
      FUSO,
    );
    expect(serie.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("não altera a entrada", () => {
    const entrada = [p("b", 2, "2026-10-02T00:00:00Z"), p("a", 1, "2026-10-01T00:00:00Z")];
    calcularSerie(entrada, FUSO);
    expect(entrada.map((e) => e.id)).toEqual(["b", "a"]);
  });
});

describe("resumirAnimal (RN-07)", () => {
  it("usa a pesagem mais recente pela data de ocorrência", () => {
    const serie = calcularSerie(
      [p("a", 320_000, "2026-09-01T08:00:00-03:00"), p("b", 356_000, "2026-10-16T08:00:00-03:00")],
      FUSO,
    );
    expect(resumirAnimal(serie)).toEqual({
      pesoAtualG: 356_000,
      dataUltimaPesagem: new Date("2026-10-16T08:00:00-03:00"),
      gmdUltimoKgDia: serie[1]!.gmdKgDia,
      totalPesagens: 2,
    });
  });

  it("animal sem pesagem tem resumo vazio", () => {
    expect(resumirAnimal([])).toEqual({
      pesoAtualG: null,
      dataUltimaPesagem: null,
      gmdUltimoKgDia: null,
      totalPesagens: 0,
    });
  });
});

describe("calcularPorAnimal", () => {
  it("agrupa por animal e ignora pesagens anuladas", () => {
    const base = (id: string, animalId: string, pesoG: number, iso: string, estado = "VALIDA") => ({
      ...p(id, pesoG, iso),
      animalId,
      estado,
    });
    const r = calcularPorAnimal(
      [
        base("a1", "boi-a", 320_000, "2026-09-01T08:00:00-03:00"),
        base("a2", "boi-a", 999_000, "2026-10-01T08:00:00-03:00", "ANULADA"),
        base("a3", "boi-a", 356_000, "2026-10-16T08:00:00-03:00"),
        base("b1", "boi-b", 200_000, "2026-10-01T08:00:00-03:00"),
      ],
      FUSO,
    );
    expect(r.get("boi-a")!.resumo).toMatchObject({ pesoAtualG: 356_000, totalPesagens: 2 });
    expect(r.get("boi-a")!.serie[1]).toMatchObject({ id: "a3", variacaoG: 36_000, diasPeriodo: 45 });
    expect(r.get("boi-b")!.resumo.pesoAtualG).toBe(200_000);
    expect(r.has("boi-c")).toBe(false);
  });
});
