import { describe, expect, it } from "vitest";
import {
  acompanharReproducao,
  dataIsoValida,
  diasEntre,
  previsaoParto,
  resumirReproducao,
  situacaoReproducao,
  somarDias,
  validarReproducao,
  type ReproducaoBase,
} from "../src/index.js";

const base = (extra: Partial<ReproducaoBase> = {}): ReproducaoBase => ({
  femeaId: "f1",
  tipo: "IA",
  dataServico: "2026-01-10",
  diagnostico: null,
  dataDiagnostico: null,
  dataParto: null,
  bezerroId: null,
  ...extra,
});

describe("datas", () => {
  it("soma dias atravessando mês, ano e fevereiro bissexto", () => {
    expect(somarDias("2026-12-20", 15)).toBe("2027-01-04");
    expect(somarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(diasEntre("2026-01-10", "2026-02-09")).toBe(30);
    expect(diasEntre("2026-02-09", "2026-01-10")).toBe(-30);
  });
  it("previsão de parto em 285 dias", () => {
    expect(previsaoParto("2026-01-10")).toBe("2026-10-22");
  });
  it("reconhece datas inexistentes", () => {
    expect(dataIsoValida("2026-02-30")).toBe(false);
    expect(dataIsoValida("2026-2-3")).toBe(false);
    expect(dataIsoValida("2026-02-28")).toBe(true);
  });
});

describe("situação", () => {
  it("segue serviço, diagnóstico e parto", () => {
    expect(situacaoReproducao(base())).toBe("AGUARDANDO_DIAGNOSTICO");
    expect(situacaoReproducao(base({ diagnostico: "PRENHE", dataDiagnostico: "2026-02-20" }))).toBe("PRENHE");
    expect(situacaoReproducao(base({ diagnostico: "VAZIA", dataDiagnostico: "2026-02-20" }))).toBe("VAZIA");
    expect(situacaoReproducao(base({ diagnostico: "PRENHE", dataDiagnostico: "2026-02-20", dataParto: "2026-10-20" }))).toBe("PARIU");
  });
});

describe("validação", () => {
  const hoje = "2026-11-04";
  it("aceita um registro completo", () => {
    expect(validarReproducao(base({ diagnostico: "PRENHE", dataDiagnostico: "2026-02-20", dataParto: "2026-10-20" }), hoje)).toBeNull();
  });
  it("recusa datas fora de ordem ou no futuro", () => {
    expect(validarReproducao(base({ dataServico: "2026-11-05" }), hoje)).toBe("DATA_FUTURA");
    expect(validarReproducao(base({ diagnostico: "VAZIA", dataDiagnostico: "2026-01-01" }), hoje)).toBe("DIAGNOSTICO_ANTES_DO_SERVICO");
    expect(validarReproducao(base({ diagnostico: "PRENHE", dataDiagnostico: "2026-02-01", dataParto: "2026-01-01" }), hoje)).toBe("PARTO_ANTES_DO_SERVICO");
    expect(validarReproducao(base({ diagnostico: "VAZIA", dataDiagnostico: "2026-02-01", dataParto: "2026-10-01" }), hoje)).toBe("PARTO_DE_VAZIA");
    expect(validarReproducao(base({ dataDiagnostico: "2026-02-01" }), hoje)).toBe("DATA_INVALIDA");
  });
});

describe("acompanhamento", () => {
  it("ordena prenhes pelo parto e conta partos próximos e diagnósticos pendentes", () => {
    const hoje = "2026-11-04";
    const r = acompanharReproducao(
      [
        base({ femeaId: "a", dataServico: "2026-02-01", diagnostico: "PRENHE", dataDiagnostico: "2026-03-10" }), // parto 2026-11-13
        base({ femeaId: "b", dataServico: "2026-06-01", diagnostico: "PRENHE", dataDiagnostico: "2026-07-10" }), // parto 2027-03-13
        base({ femeaId: "c", dataServico: "2026-09-01" }), // 64 dias: pronta
        base({ femeaId: "d", dataServico: "2026-10-20" }), // 15 dias
        base({ femeaId: "e", dataServico: "2026-01-01", diagnostico: "VAZIA", dataDiagnostico: "2026-02-10" }),
      ],
      hoje,
    );
    expect(r.prenhes.map((p) => p.registro.femeaId)).toEqual(["a", "b"]);
    expect(r.prenhes[0]).toMatchObject({ previsao: "2026-11-13", diasParaParto: 9 });
    expect(r.partosProximos).toBe(1);
    expect(r.aguardando.map((a) => [a.registro.femeaId, a.pronto])).toEqual([
      ["c", true],
      ["d", false],
    ]);
    expect(r.diagnosticosPendentes).toBe(1);
  });
  it("taxa de prenhez conta quem já pariu", () => {
    const r = resumirReproducao([
      base({ diagnostico: "PRENHE", dataDiagnostico: "2026-02-20", dataParto: "2026-10-20" }),
      base({ diagnostico: "PRENHE", dataDiagnostico: "2026-02-20" }),
      base({ diagnostico: "VAZIA", dataDiagnostico: "2026-02-20" }),
      base(),
    ]);
    expect(r).toEqual({ servicos: 4, diagnosticadas: 3, prenhes: 2, taxaPrenhez: 2 / 3, partos: 1 });
  });
});
