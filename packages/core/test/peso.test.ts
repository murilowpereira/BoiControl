import { describe, expect, it } from "vitest";
import { formatarPesoKg, lerPesoKg, PESO_MAXIMO_G } from "../src/peso.js";

describe("lerPesoKg (RN-04, CA-03)", () => {
  it.each([
    ["356", 356_000],
    ["356,5", 356_500],
    ["356.50", 356_500],
    [" 1.234,56 ", 1_234_560],
    ["0,01", 10],
  ])("aceita %s", (entrada, esperado) => {
    expect(lerPesoKg(entrada)).toEqual({ ok: true, pesoG: esperado });
  });

  it.each(["", "   ", "0", "0,00", "-10", "abc", "12kg", "356,555", "1,2,3"])(
    "rejeita %j",
    (entrada) => {
      expect(lerPesoKg(entrada).ok).toBe(false);
    },
  );

  it("rejeita acima do máximo", () => {
    const r = lerPesoKg(String(PESO_MAXIMO_G / 1000 + 1));
    expect(r).toEqual({ ok: false, erro: "ACIMA_DO_MAXIMO" });
  });

  it("aceita número já convertido", () => {
    expect(lerPesoKg(320)).toEqual({ ok: true, pesoG: 320_000 });
    expect(lerPesoKg(0.1 + 0.2)).toEqual({ ok: false, erro: "FORMATO_INVALIDO" });
  });
});

describe("formatarPesoKg", () => {
  it("formata com duas casas e vírgula", () => {
    expect(formatarPesoKg(356_000)).toBe("356,00 kg");
    expect(formatarPesoKg(1_234_560)).toBe("1.234,56 kg");
  });
});
