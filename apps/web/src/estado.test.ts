import { describe, expect, it } from "vitest";
import { estadoExibido, tempoDesde } from "./estado";

describe("estadoExibido", () => {
  it("pendência local tem prioridade (CA-09, CA-10)", () => {
    expect(estadoExibido("RECEBIDA", true)).toBe("PENDENTE");
    expect(estadoExibido(undefined, true)).toBe("PENDENTE");
  });
  it("mapeia estados do servidor (CA-11)", () => {
    expect(estadoExibido("RECEBIDA", false)).toBe("PROCESSANDO");
    expect(estadoExibido("VALIDA", false)).toBe("SINCRONIZADO");
    expect(estadoExibido("REJEITADA", false)).toBe("ERRO");
    expect(estadoExibido("ANULADA", false)).toBe("ANULADA");
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
