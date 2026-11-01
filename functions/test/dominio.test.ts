import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { criarAnimal, editarAnimal, alterarSituacaoAnimal } from "../src/dominio/animais.js";
import { corrigirPesagem, processarPesagem } from "../src/dominio/pesagens.js";

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Rode via `npm test` (usa o emulador).");
const PROJETO = "demo-boicontrol";
if (!getApps().length) initializeApp({ projectId: PROJETO });
const db = getFirestore();

const PID = "fazenda-1";
const FUSO = "America/Sao_Paulo";
let seq = 0;

async function limpar() {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJETO}/databases/(default)/documents`, {
    method: "DELETE",
  });
}

beforeEach(async () => {
  await limpar();
  await db.doc(`propriedades/${PID}`).set({ nome: "Fazenda Boa Vista", fuso: FUSO });
  await db.doc(`propriedades/${PID}/membros/admin`).set({ perfil: "ADMIN", ativo: true });
  await db.doc(`propriedades/${PID}/membros/operador`).set({ perfil: "OPERADOR", ativo: true });
  await db.doc(`propriedades/${PID}/categorias/garrote`).set({ nome: "Garrote", ativo: true });
  await db.doc(`propriedades/${PID}/categorias/antiga`).set({ nome: "Antiga", ativo: false });
});

async function novoAnimal(brinco = "A1") {
  return criarAnimal(db, "admin", PID, { brinco, categoriaId: "garrote", sexo: "M" });
}

/** Simula o app gravando uma pesagem (como as regras permitem) e a Function processando. */
async function registrar(animalId: string, pesoG: number, iso: string) {
  const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
  await db.doc(`propriedades/${PID}/pesagens/${id}`).create({
    animalId,
    pesoG,
    dataHoraPesagem: Timestamp.fromDate(new Date(iso)),
    fuso: FUSO,
    observacao: null,
    estado: "RECEBIDA",
    criadoPor: "operador",
    criadoEm: FieldValue.serverTimestamp(),
  });
  const resultado = await processarPesagem(db, PID, id, () => new Date("2026-11-01T12:00:00-03:00"));
  return { id, resultado };
}

const ler = async (caminho: string) => (await db.doc(caminho).get()).data()!;
const auditoria = async () => (await db.collection(`propriedades/${PID}/auditoria`).orderBy("em").get()).docs.map((d) => d.data());

describe("criarAnimal", () => {
  it("CA-01: cria com código interno sequencial, resumo vazio e auditoria", async () => {
    const a = await novoAnimal("ab-01");
    const b = await novoAnimal("AB-02");
    expect(a.codigoInterno).toBe("BC-0001");
    expect(b.codigoInterno).toBe("BC-0002");
    const animal = await ler(`propriedades/${PID}/animais/${a.id}`);
    expect(animal).toMatchObject({ brinco: "AB-01", situacao: "ATIVO", resumo: { pesoAtualG: null, totalPesagens: 0 } });
    expect(await ler(`propriedades/${PID}/brincos/AB-01`)).toEqual({ animalId: a.id });
    expect((await auditoria()).map((r) => r.acao)).toEqual(["CRIAR_ANIMAL", "CRIAR_ANIMAL"]);
  });

  it("CA-02: rejeita brinco duplicado na propriedade, mesmo com outra caixa e espaços", async () => {
    await novoAnimal("A1");
    await expect(novoAnimal(" a1 ")).rejects.toMatchObject({ codigo: "BRINCO_DUPLICADO" });
  });

  it("brincos concorrentes iguais: só um vence", async () => {
    const r = await Promise.allSettled([novoAnimal("X9"), novoAnimal("X9"), novoAnimal("X9")]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });

  it("exige ADMIN e categoria ativa", async () => {
    await expect(criarAnimal(db, "operador", PID, { brinco: "B1", categoriaId: "garrote", sexo: "F" })).rejects.toMatchObject({
      codigo: "SEM_PERMISSAO",
    });
    await expect(criarAnimal(db, undefined, PID, { brinco: "B1", categoriaId: "garrote", sexo: "F" })).rejects.toMatchObject({
      codigo: "NAO_AUTENTICADO",
    });
    await expect(criarAnimal(db, "admin", PID, { brinco: "B1", categoriaId: "antiga", sexo: "F" })).rejects.toMatchObject({
      codigo: "CATEGORIA_INVALIDA",
    });
  });
});

describe("editarAnimal e alterarSituacaoAnimal", () => {
  it("RF-04: troca de brinco libera o antigo, mantém o código e audita", async () => {
    const a = await novoAnimal("A1");
    await editarAnimal(db, "admin", PID, a.id, { brinco: "A2", codigoInterno: "X" } as never);
    const animal = await ler(`propriedades/${PID}/animais/${a.id}`);
    expect(animal).toMatchObject({ brinco: "A2", codigoInterno: "BC-0001" });
    expect((await db.doc(`propriedades/${PID}/brincos/A1`).get()).exists).toBe(false);
    await novoAnimal("A1");
    const ultima = (await auditoria()).find((r) => r.acao === "EDITAR_ANIMAL")!;
    expect(ultima).toMatchObject({ antes: { brinco: "A1" }, depois: { brinco: "A2" } });
  });

  it("não deixa trocar para brinco de outro animal", async () => {
    const a = await novoAnimal("A1");
    await novoAnimal("A2");
    await expect(editarAnimal(db, "admin", PID, a.id, { brinco: "A2" })).rejects.toMatchObject({ codigo: "BRINCO_DUPLICADO" });
  });

  it("RF-05: inativar exige motivo e audita", async () => {
    const a = await novoAnimal();
    await expect(alterarSituacaoAnimal(db, "admin", PID, a.id, "VENDIDO", "")).rejects.toMatchObject({
      codigo: "ARGUMENTO_INVALIDO",
    });
    await alterarSituacaoAnimal(db, "admin", PID, a.id, "VENDIDO", "Vendido em leilão");
    expect((await ler(`propriedades/${PID}/animais/${a.id}`)).situacao).toBe("VENDIDO");
    expect((await auditoria()).at(-1)).toMatchObject({ acao: "ALTERAR_SITUACAO", motivo: "Vendido em leilão" });
  });
});

describe("processarPesagem", () => {
  it("CA-04: valida, calcula variação e GMD e atualiza o resumo do animal", async () => {
    const { id: animalId } = await novoAnimal();
    await registrar(animalId, 320_000, "2026-09-01T08:00:00-03:00");
    const { id, resultado } = await registrar(animalId, 356_000, "2026-10-16T08:00:00-03:00");
    expect(resultado).toBe("VALIDA");
    const p = await ler(`propriedades/${PID}/pesagens/${id}`);
    expect(p).toMatchObject({ estado: "VALIDA", variacaoG: 36_000, diasPeriodo: 45 });
    expect(p.gmdKgDia).toBeCloseTo(0.8, 10);
    const animal = await ler(`propriedades/${PID}/animais/${animalId}`);
    expect(animal.resumo).toMatchObject({ pesoAtualG: 356_000, totalPesagens: 2 });
    expect(animal.resumo.gmdUltimoKgDia).toBeCloseTo(0.8, 10);
  });

  it("pesagem offline antiga que chega depois recalcula a série inteira", async () => {
    const { id: animalId } = await novoAnimal();
    const primeira = await registrar(animalId, 320_000, "2026-09-01T08:00:00-03:00");
    const terceira = await registrar(animalId, 356_000, "2026-10-16T08:00:00-03:00");
    const atrasada = await registrar(animalId, 340_000, "2026-10-01T08:00:00-03:00");
    expect(await ler(`propriedades/${PID}/pesagens/${atrasada.id}`)).toMatchObject({ variacaoG: 20_000, diasPeriodo: 30 });
    expect(await ler(`propriedades/${PID}/pesagens/${terceira.id}`)).toMatchObject({ variacaoG: 16_000, diasPeriodo: 15 });
    expect(await ler(`propriedades/${PID}/pesagens/${primeira.id}`)).toMatchObject({ variacaoG: null });
    const animal = await ler(`propriedades/${PID}/animais/${animalId}`);
    expect(animal.resumo.pesoAtualG).toBe(356_000);
  });

  it("CA-12: processar a mesma pesagem de novo não muda nada (idempotente)", async () => {
    const { id: animalId } = await novoAnimal();
    const { id } = await registrar(animalId, 320_000, "2026-09-01T08:00:00-03:00");
    expect(await processarPesagem(db, PID, id)).toBe("IGNORADA");
    expect((await ler(`propriedades/${PID}/animais/${animalId}`)).resumo.totalPesagens).toBe(1);
  });

  it.each([
    ["animal inexistente", "nao-existe", 300_000, "2026-10-01T08:00:00-03:00", "ANIMAL_INEXISTENTE"],
    ["peso zero", null, 0, "2026-10-01T08:00:00-03:00", "PESO_INVALIDO"],
    ["peso acima do máximo", null, 5_000_000, "2026-10-01T08:00:00-03:00", "PESO_INVALIDO"],
    ["data no futuro", null, 300_000, "2026-12-01T08:00:00-03:00", "DATA_NO_FUTURO"],
  ])("rejeita com motivo visível: %s", async (_, animalFixo, pesoG, iso, motivo) => {
    const animalId = animalFixo ?? (await novoAnimal()).id;
    const { id, resultado } = await registrar(animalId as string, pesoG as number, iso as string);
    expect(resultado).toBe("REJEITADA");
    expect(await ler(`propriedades/${PID}/pesagens/${id}`)).toMatchObject({ estado: "REJEITADA", motivo });
  });

  it("animal inativado enquanto a pesagem estava offline: rejeita para revisão, sem descartar", async () => {
    const { id: animalId } = await novoAnimal();
    await alterarSituacaoAnimal(db, "admin", PID, animalId, "VENDIDO", "venda");
    const { id } = await registrar(animalId, 300_000, "2026-10-01T08:00:00-03:00");
    expect(await ler(`propriedades/${PID}/pesagens/${id}`)).toMatchObject({ estado: "REJEITADA", motivo: "ANIMAL_INATIVO" });
  });
});

describe("corrigirPesagem (RF-09, CA-06)", () => {
  it("corrige com motivo, audita antes e depois e recalcula indicadores", async () => {
    const { id: animalId } = await novoAnimal();
    await registrar(animalId, 320_000, "2026-09-01T08:00:00-03:00");
    const { id } = await registrar(animalId, 365_000, "2026-10-16T08:00:00-03:00");
    await corrigirPesagem(db, "admin", { pid: PID, pesagemId: id, pesoG: 356_000, motivo: "Erro de digitação" });

    const p = await ler(`propriedades/${PID}/pesagens/${id}`);
    expect(p).toMatchObject({ estado: "VALIDA", pesoG: 356_000, variacaoG: 36_000, motivoCorrecao: "Erro de digitação" });
    expect((await ler(`propriedades/${PID}/animais/${animalId}`)).resumo.pesoAtualG).toBe(356_000);
    expect((await auditoria()).at(-1)).toMatchObject({
      acao: "CORRIGIR_PESAGEM",
      motivo: "Erro de digitação",
      antes: { pesoG: 365_000 },
      depois: { pesoG: 356_000 },
    });
  });

  it("anular tira a pesagem dos cálculos sem apagar", async () => {
    const { id: animalId } = await novoAnimal();
    await registrar(animalId, 320_000, "2026-09-01T08:00:00-03:00");
    const { id } = await registrar(animalId, 999_000, "2026-10-16T08:00:00-03:00");
    await corrigirPesagem(db, "admin", { pid: PID, pesagemId: id, motivo: "Balança descalibrada", anular: true });
    expect((await ler(`propriedades/${PID}/pesagens/${id}`)).estado).toBe("ANULADA");
    expect((await ler(`propriedades/${PID}/animais/${animalId}`)).resumo).toMatchObject({ pesoAtualG: 320_000, totalPesagens: 1 });
  });

  it("corrigir uma pesagem rejeitada a torna válida", async () => {
    const { id: animalId } = await novoAnimal();
    const { id } = await registrar(animalId, 5_000_000, "2026-10-01T08:00:00-03:00");
    await corrigirPesagem(db, "admin", { pid: PID, pesagemId: id, pesoG: 500_000, motivo: "Zero a mais" });
    expect((await ler(`propriedades/${PID}/pesagens/${id}`)).estado).toBe("VALIDA");
    expect((await ler(`propriedades/${PID}/animais/${animalId}`)).resumo.pesoAtualG).toBe(500_000);
  });

  it("exige ADMIN e motivo", async () => {
    const { id: animalId } = await novoAnimal();
    const { id } = await registrar(animalId, 320_000, "2026-09-01T08:00:00-03:00");
    await expect(corrigirPesagem(db, "operador", { pid: PID, pesagemId: id, pesoG: 1, motivo: "x" })).rejects.toMatchObject({
      codigo: "SEM_PERMISSAO",
    });
    await expect(corrigirPesagem(db, "admin", { pid: PID, pesagemId: id, pesoG: 330_000, motivo: " " })).rejects.toMatchObject({
      codigo: "ARGUMENTO_INVALIDO",
    });
  });
});
