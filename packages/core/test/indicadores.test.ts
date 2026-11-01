import { describe, expect, it } from "vitest";
import { calcularIndicadores } from "../src/indicadores.js";
import { formatarCodigo } from "../src/modelo.js";
import { normalizarBrinco } from "../src/brinco.js";

describe("calcularIndicadores (RF-10, RN-03, RN-12)", () => {
  it("conta só ativos, informa os sem peso e faz a média do último peso conhecido", () => {
    const ind = calcularIndicadores([
      { situacao: "ATIVO", resumo: { pesoAtualG: 300_000 } },
      { situacao: "ATIVO", resumo: { pesoAtualG: 351_000 } },
      { situacao: "ATIVO", resumo: { pesoAtualG: null } },
      { situacao: "VENDIDO", resumo: { pesoAtualG: 900_000 } },
    ]);
    expect(ind).toEqual({ ativos: 3, semPesagem: 1, comPesagem: 2, pesoMedioG: 325_500 });
  });

  it("sem pesagens a média é nula, não zero", () => {
    expect(calcularIndicadores([{ situacao: "ATIVO", resumo: { pesoAtualG: null } }]).pesoMedioG).toBeNull();
  });
});

describe("normalizarBrinco (RN-02)", () => {
  it("remove espaços e padroniza maiúsculas", () => {
    expect(normalizarBrinco("  ab-012 ")).toEqual({ ok: true, brinco: "AB-012" });
  });
  it.each(["", "   ", "a b", "x".repeat(31), "12/3"])("rejeita %j", (b) => {
    expect(normalizarBrinco(b).ok).toBe(false);
  });
});

describe("formatarCodigo (RN-01)", () => {
  it("formata com prefixo e quatro dígitos", () => {
    expect(formatarCodigo(1)).toBe("BC-0001");
    expect(formatarCodigo(12345)).toBe("BC-12345");
  });
});
