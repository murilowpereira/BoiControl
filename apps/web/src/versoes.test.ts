import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compararVersoes, novidadesDesde, VERSAO_ATUAL, VERSOES } from "./versoes";

describe("histórico de versões", () => {
  it("a versão mais nova é a do package.json", () => {
    const pacote = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(VERSAO_ATUAL).toBe(pacote.version);
  });
  it("está em ordem decrescente, sem repetir, com data e novidades", () => {
    for (let i = 1; i < VERSOES.length; i++) {
      expect(compararVersoes(VERSOES[i - 1]!.versao, VERSOES[i]!.versao)).toBeGreaterThan(0);
      expect(VERSOES[i - 1]!.data >= VERSOES[i]!.data).toBe(true);
    }
    for (const v of VERSOES) {
      expect(v.versao).toMatch(/^\d+\.\d+\.\d+$/);
      expect(v.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(v.novidades.length).toBeGreaterThan(0);
    }
  });
});

describe("compararVersoes e novidadesDesde", () => {
  it("compara números, não texto", () => {
    expect(compararVersoes("0.10.0", "0.9.0")).toBeGreaterThan(0);
    expect(compararVersoes("1.0.0", "1.0.0")).toBe(0);
  });
  it("mostra só o que veio depois da versão já vista", () => {
    expect(novidadesDesde(null)).toEqual([]);
    expect(novidadesDesde(VERSAO_ATUAL)).toEqual([]);
    expect(novidadesDesde("0.4.0").map((v) => v.versao)).toEqual(VERSOES.filter((v) => compararVersoes(v.versao, "0.4.0") > 0).map((v) => v.versao));
  });
});
