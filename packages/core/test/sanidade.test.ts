import { describe, expect, it } from "vitest";
import {
  agendaSanitaria,
  carenciasAtivas,
  pendenciasAgenda,
  type AnimalSanidade,
  type ProdutoSanitario,
} from "../src/index.js";

const dia = (s: string) => new Date(`${s}T12:00:00-03:00`);
const agora = dia("2026-11-04");

const produtos: ProdutoSanitario[] = [
  { id: "ivermectina", nome: "Ivermectina", ativo: true, tipo: "VERMIFUGO", carenciaDias: 35, intervaloDias: 90 },
  { id: "aftosa", nome: "Aftosa", ativo: true, tipo: "VACINA", carenciaDias: null, intervaloDias: 180 },
  { id: "raiva", nome: "Raiva", ativo: true, tipo: "VACINA" },
  { id: "antiga", nome: "Antiga", ativo: false, carenciaDias: 10, intervaloDias: 30 },
];

const animais: AnimalSanidade[] = [
  { id: "a1", situacao: "ATIVO", loteId: "represa" },
  { id: "a2", situacao: "ATIVO", loteId: "represa" },
  { id: "a3", situacao: "ATIVO", loteId: "represa" },
  { id: "b1", situacao: "ATIVO", loteId: null },
  { id: "v1", situacao: "VENDIDO", loteId: "represa" },
];

describe("carenciasAtivas", () => {
  it("animal fica em carência até a data da aplicação mais os dias do produto", () => {
    const r = carenciasAtivas([{ animalId: "a1", produtoId: "ivermectina", data: dia("2026-10-20") }], produtos, agora);
    expect(r.get("a1")?.ate).toEqual(dia("2026-11-24"));
    expect(r.get("a1")?.produtoId).toBe("ivermectina");
  });
  it("carência vencida ou produto sem carência não conta", () => {
    const r = carenciasAtivas(
      [
        { animalId: "a1", produtoId: "ivermectina", data: dia("2026-09-01") },
        { animalId: "a2", produtoId: "aftosa", data: dia("2026-11-03") },
        { animalId: "a3", produtoId: "raiva", data: dia("2026-11-03") },
      ],
      produtos,
      agora,
    );
    expect(r.size).toBe(0);
  });
  it("vale a carência que termina mais tarde, mesmo de produto desativado", () => {
    const r = carenciasAtivas(
      [
        { animalId: "a1", produtoId: "ivermectina", data: dia("2026-10-01") },
        { animalId: "a1", produtoId: "antiga", data: dia("2026-11-03") },
        { animalId: "a1", produtoId: "ivermectina", data: dia("2026-10-25") },
      ],
      produtos,
      agora,
    );
    expect(r.get("a1")).toEqual({ ate: dia("2026-11-29"), produtoId: "ivermectina", aplicadoEm: dia("2026-10-25") });
  });
});

describe("agendaSanitaria", () => {
  it("separa atrasados, próximos e sem registro por lote", () => {
    const itens = agendaSanitaria(
      animais,
      produtos,
      [
        { animalId: "a1", produtoId: "ivermectina", data: dia("2026-07-01") }, // venceu 29/09
        { animalId: "a2", produtoId: "ivermectina", data: dia("2026-08-10") }, // vence 08/11
        { animalId: "a2", produtoId: "ivermectina", data: dia("2026-05-01") }, // antiga, ignorada
        { animalId: "v1", produtoId: "ivermectina", data: dia("2026-01-01") }, // vendido
      ],
      agora,
    );
    expect(itens).toHaveLength(1);
    const [i] = itens;
    expect(i).toMatchObject({ loteId: "represa", produtoId: "ivermectina", semRegistro: ["a3"], proximaData: null });
    expect(i!.atrasados).toEqual([{ animalId: "a1", vence: dia("2026-09-29") }]);
    expect(i!.proximos).toEqual([{ animalId: "a2", vence: dia("2026-11-08") }]);
    expect(pendenciasAgenda(itens)).toBe(2);
  });
  it("lote em dia mostra a próxima dose e vem depois dos que precisam de ação", () => {
    const itens = agendaSanitaria(
      animais,
      produtos,
      [
        { animalId: "b1", produtoId: "aftosa", data: dia("2026-10-01") },
        { animalId: "a1", produtoId: "ivermectina", data: dia("2026-07-01") },
      ],
      agora,
    );
    expect(itens.map((i) => i.produtoId)).toEqual(["ivermectina", "aftosa"]);
    expect(itens[1]).toMatchObject({ loteId: null, atrasados: [], proximos: [], semRegistro: [], proximaData: dia("2027-03-30") });
  });
  it("ignora produto sem intervalo ou desativado e lote que nunca usou o produto", () => {
    const itens = agendaSanitaria(
      animais,
      produtos,
      [
        { animalId: "a1", produtoId: "raiva", data: dia("2025-01-01") },
        { animalId: "a1", produtoId: "antiga", data: dia("2025-01-01") },
      ],
      agora,
    );
    expect(itens).toEqual([]);
  });
});
