import { describe, expect, it } from "vitest";
import { avaliarNovoPeso, diasDesde, gerarCsv, resumirPorLote, semPesagemRecente } from "../src/index.js";

describe("avaliarNovoPeso", () => {
  it("sem pesagem anterior nunca é suspeito", () => {
    expect(avaliarNovoPeso(35000, null)).toEqual({ suspeito: false, variacaoRelativa: null });
  });
  it("35 kg no lugar de 350 kg é suspeito", () => {
    expect(avaliarNovoPeso(35000, 350000).suspeito).toBe(true);
    expect(avaliarNovoPeso(3560000 / 10, 35000).suspeito).toBe(true);
  });
  it("ganho normal entre pesagens não é suspeito", () => {
    const r = avaliarNovoPeso(356000, 320000);
    expect(r.suspeito).toBe(false);
    expect(r.variacaoRelativa).toBeCloseTo(0.1125);
  });
  it("limite de 25 %", () => {
    expect(avaliarNovoPeso(125000, 100000).suspeito).toBe(false);
    expect(avaliarNovoPeso(125010, 100000).suspeito).toBe(true);
    expect(avaliarNovoPeso(74990, 100000).suspeito).toBe(true);
  });
});

describe("semPesagemRecente", () => {
  const agora = new Date("2026-11-02T12:00:00-03:00");
  const dia = (d: string) => new Date(`${d}T09:00:00-03:00`);
  const animais = [
    { id: "a", situacao: "ATIVO" as const, resumo: { dataUltimaPesagem: dia("2026-10-25") } },
    { id: "b", situacao: "ATIVO" as const, resumo: { dataUltimaPesagem: dia("2026-09-01") } },
    { id: "c", situacao: "ATIVO" as const, resumo: { dataUltimaPesagem: null } },
    { id: "d", situacao: "VENDIDO" as const, resumo: { dataUltimaPesagem: null } },
  ];
  it("lista ativos atrasados e nunca pesados, mais atrasado primeiro", () => {
    expect(semPesagemRecente(animais, agora, 30).map((a) => a.id)).toEqual(["c", "b"]);
  });
  it("respeita o número de dias", () => {
    expect(semPesagemRecente(animais, agora, 5).map((a) => a.id)).toEqual(["c", "b", "a"]);
  });
  it("conta os dias", () => {
    expect(diasDesde(dia("2026-09-01"), agora)).toBe(62);
  });
});

describe("resumirPorLote", () => {
  it("média de peso e de GMD por lote, só ativos", () => {
    const r = resumirPorLote([
      { situacao: "ATIVO", loteId: "l1", resumo: { pesoAtualG: 300000, gmdUltimoKgDia: 0.8 } },
      { situacao: "ATIVO", loteId: "l1", resumo: { pesoAtualG: 400000, gmdUltimoKgDia: null } },
      { situacao: "ATIVO", loteId: "l1", resumo: { pesoAtualG: null, gmdUltimoKgDia: null } },
      { situacao: "ATIVO", loteId: null, resumo: { pesoAtualG: 200000, gmdUltimoKgDia: 0.5 } },
      { situacao: "MORTO", loteId: "l1", resumo: { pesoAtualG: 999000, gmdUltimoKgDia: 9 } },
    ]);
    expect(r.get("l1")).toEqual({ loteId: "l1", animais: 3, comPesagem: 2, pesoMedioG: 350000, gmdMedioKgDia: 0.8 });
    expect(r.get(null)?.pesoMedioG).toBe(200000);
  });
});

describe("gerarCsv", () => {
  it("formato do Excel brasileiro: ponto e vírgula, vírgula decimal e BOM", () => {
    const csv = gerarCsv(["Brinco", "Peso (kg)", "Obs"], [["A-1", 356.5, 'disse "ok"; depois'], ["B-2", null, "=SOMA(A1)"]]);
    expect(csv).toBe('﻿Brinco;Peso (kg);Obs\r\nA-1;356,5;"disse ""ok""; depois"\r\nB-2;;\'=SOMA(A1)\r\n');
  });
});
