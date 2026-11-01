import { describe, expect, it } from "vitest";
import { alertasDaPesagem, estadoExibido, tempoDesde } from "./estado";

describe("estadoExibido", () => {
  it("pendência local tem prioridade (CA-09, CA-10)", () => {
    expect(estadoExibido("VALIDA", true)).toBe("PENDENTE");
  });
  it("confirmada pelo servidor (CA-11)", () => {
    expect(estadoExibido("VALIDA", false)).toBe("SINCRONIZADO");
    expect(estadoExibido("ANULADA", false)).toBe("ANULADA");
  });
});

describe("alertasDaPesagem", () => {
  const d = (iso: string) => new Date(iso);
  const pesagem = (iso: string, criado = "2026-10-20T10:00:00Z") => ({
    estado: "VALIDA" as const,
    dataHoraPesagem: d(iso),
    criadoEm: d(criado),
  });

  it("sinaliza pesagem feita depois da inativação do animal", () => {
    const vendido = { situacao: "VENDIDO", situacaoDesde: d("2026-10-10T00:00:00Z") };
    expect(alertasDaPesagem(pesagem("2026-10-15T08:00:00Z"), vendido)).toEqual(["ANIMAL_INATIVO"]);
    expect(alertasDaPesagem(pesagem("2026-10-05T08:00:00Z"), vendido)).toEqual([]);
  });
  it("sinaliza data no futuro em relação ao registro", () => {
    expect(alertasDaPesagem(pesagem("2026-10-21T10:00:00Z"), undefined)).toEqual(["DATA_NO_FUTURO"]);
    expect(alertasDaPesagem(pesagem("2026-10-20T10:05:00Z"), undefined)).toEqual([]);
  });
  it("pesagem anulada não gera alerta", () => {
    expect(alertasDaPesagem({ ...pesagem("2030-01-01T00:00:00Z"), estado: "ANULADA" }, undefined)).toEqual([]);
  });
});

describe("tempoDesde", () => {
  const agora = new Date("2026-11-01T12:00:00Z");
  it.each([
    [null, "nunca"],
    [new Date("2026-11-01T11:59:40Z"), "agora"],
    [new Date("2026-11-01T11:45:00Z"), "há 15 min"],
    [new Date("2026-11-01T09:00:00Z"), "há 3 h"],
    [new Date("2026-10-29T12:00:00Z"), "há 3 d"],
  ])("%s → %s", (d, esperado) => {
    expect(tempoDesde(d, agora)).toBe(esperado);
  });
});
