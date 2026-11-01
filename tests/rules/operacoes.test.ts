/**
 * As operações do app (apps/web/src/operacoes.ts) rodando contra as regras reais
 * no emulador. Substituem os testes das Cloud Functions do plano Blaze e mostram
 * que as garantias da spec valem sem servidor, inclusive contra gravações forjadas.
 */
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  alterarSituacaoAnimal,
  corrigirPesagem,
  criarAnimal,
  editarAnimal,
  idAuditoria,
} from "../../apps/web/src/operacoes";
import { criarAmbiente, dadosPesagem, dbDe, PID, semear } from "./ambiente";

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await criarAmbiente();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await semear(env);
});

const db = (uid: string) => dbDe(env, uid);
const admin = () => db("admin");
const novoAnimal = (brinco = "A1") => criarAnimal(admin(), PID, "admin", { brinco, categoriaId: "garrote", sexo: "M" });

async function ler(caminho: string) {
  let dados: Record<string, unknown> | undefined;
  await env.withSecurityRulesDisabled(async (ctx) => {
    dados = (await getDoc(doc(ctx.firestore(), caminho))).data();
  });
  return dados;
}

async function auditoria() {
  let lista: Record<string, unknown>[] = [];
  await env.withSecurityRulesDisabled(async (ctx) => {
    lista = (await getDocs(collection(ctx.firestore(), `propriedades/${PID}/auditoria`))).docs.map((d) => ({ id: d.id, ...d.data() }));
  });
  return lista;
}

async function pesagemValida(animalId: string, pesoG = 320_000) {
  const id = crypto.randomUUID();
  await assertSucceeds(
    setDoc(doc(db("operador"), `propriedades/${PID}/pesagens/${id}`), dadosPesagem("operador", animalId, { pesoG })),
  );
  return id;
}

describe("criarAnimal (RF-03, RN-01, RN-02)", () => {
  it("CA-01: cria com código sequencial e auditoria", async () => {
    const a = await novoAnimal("ab-01");
    const b = await novoAnimal("AB-02");
    expect([a.codigoNumero, b.codigoNumero]).toEqual([1, 2]);
    expect(await ler(`propriedades/${PID}/animais/${a.id}`)).toMatchObject({ brinco: "AB-01", situacao: "ATIVO", versao: 0 });
    expect(await ler(`propriedades/${PID}/brincos/AB-01`)).toEqual({ animalId: a.id });
    expect((await auditoria()).map((r) => r.id).sort()).toEqual([idAuditoria("animal", a.id, 0), idAuditoria("animal", b.id, 0)].sort());
  });

  it("CA-02: brinco duplicado é recusado pelo app, mesmo com outra caixa e espaços", async () => {
    await novoAnimal("A1");
    await expect(novoAnimal(" a1 ")).rejects.toMatchObject({ codigo: "BRINCO_DUPLICADO" });
  });

  it("brincos iguais em paralelo: só um vence", async () => {
    const r = await Promise.allSettled([novoAnimal("X9"), novoAnimal("X9"), novoAnimal("X9")]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });

  it("códigos internos em paralelo nunca se repetem (quem perde a disputa recebe erro e tenta de novo)", async () => {
    const r = await Promise.allSettled(["P1", "P2", "P3"].map((b) => novoAnimal(b)));
    const codigos = r.flatMap((x) => (x.status === "fulfilled" ? [x.value.codigoNumero] : []));
    expect(codigos.length).toBeGreaterThan(0);
    expect(new Set(codigos).size).toBe(codigos.length);
    const depois = await novoAnimal("P4");
    expect(codigos).not.toContain(depois.codigoNumero);
  });

  it("exige ADMIN e categoria ativa", async () => {
    await assertFails(criarAnimal(db("operador"), PID, "operador", { brinco: "B1", categoriaId: "garrote", sexo: "F" }));
    await expect(criarAnimal(admin(), PID, "admin", { brinco: "B1", categoriaId: "antiga", sexo: "F" })).rejects.toMatchObject({
      codigo: "CATEGORIA_INVALIDA",
    });
  });

  describe("gravações forjadas (sem passar pelo app)", () => {
    const animalForjado = (extra: Record<string, unknown> = {}) => ({
      codigoNumero: 1,
      brinco: "F1",
      categoriaId: "garrote",
      sexo: "M",
      nome: null,
      dataNascimento: null,
      observacao: null,
      situacao: "ATIVO",
      situacaoDesde: serverTimestamp(),
      versao: 0,
      criadoPor: "admin",
      criadoEm: serverTimestamp(),
      ...extra,
    });
    const auditoriaCriacao = (id: string) => ({
      usuarioId: "admin",
      entidade: "animal",
      registroId: id,
      versao: 0,
      acao: "CRIAR_ANIMAL",
      motivo: null,
      antes: null,
      depois: null,
      em: serverTimestamp(),
    });

    it("animal sem o documento de brinco é recusado", async () => {
      const id = crypto.randomUUID();
      const fs = admin();
      const b = writeBatch(fs);
      b.set(doc(fs, `propriedades/${PID}/contadores/animais`), { ultimo: 1 });
      b.set(doc(fs, `propriedades/${PID}/animais/${id}`), animalForjado());
      b.set(doc(fs, `propriedades/${PID}/auditoria/animal_${id}_v0`), auditoriaCriacao(id));
      await assertFails(b.commit());
    });

    it("animal sem auditoria é recusado", async () => {
      const id = crypto.randomUUID();
      const fs = admin();
      const b = writeBatch(fs);
      b.set(doc(fs, `propriedades/${PID}/contadores/animais`), { ultimo: 1 });
      b.set(doc(fs, `propriedades/${PID}/animais/${id}`), animalForjado());
      b.set(doc(fs, `propriedades/${PID}/brincos/F1`), { animalId: id });
      await assertFails(b.commit());
    });

    it("pular o código interno é recusado", async () => {
      const id = crypto.randomUUID();
      const fs = admin();
      const b = writeBatch(fs);
      b.set(doc(fs, `propriedades/${PID}/contadores/animais`), { ultimo: 7 });
      b.set(doc(fs, `propriedades/${PID}/animais/${id}`), animalForjado({ codigoNumero: 7 }));
      b.set(doc(fs, `propriedades/${PID}/brincos/F1`), { animalId: id });
      b.set(doc(fs, `propriedades/${PID}/auditoria/animal_${id}_v0`), auditoriaCriacao(id));
      await assertFails(b.commit());
    });

    it("a mesma gravação completa e correta passa (controle do teste)", async () => {
      const id = crypto.randomUUID();
      const fs = admin();
      const b = writeBatch(fs);
      b.set(doc(fs, `propriedades/${PID}/contadores/animais`), { ultimo: 1 });
      b.set(doc(fs, `propriedades/${PID}/animais/${id}`), animalForjado());
      b.set(doc(fs, `propriedades/${PID}/brincos/F1`), { animalId: id });
      b.set(doc(fs, `propriedades/${PID}/auditoria/animal_${id}_v0`), auditoriaCriacao(id));
      await assertSucceeds(b.commit());
    });

    it("roubar o brinco de outro animal é recusado", async () => {
      const a = await novoAnimal("A1");
      const outro = await novoAnimal("A2");
      await assertFails(setDoc(doc(admin(), `propriedades/${PID}/brincos/A1`), { animalId: outro.id }));
      await assertFails(updateDoc(doc(admin(), `propriedades/${PID}/brincos/A1`), { animalId: outro.id }));
      expect(await ler(`propriedades/${PID}/brincos/A1`)).toEqual({ animalId: a.id });
    });

    it("editar animal sem auditoria ou mudando o código interno é recusado", async () => {
      const a = await novoAnimal();
      const ref = doc(admin(), `propriedades/${PID}/animais/${a.id}`);
      await assertFails(updateDoc(ref, { nome: "Mimoso", versao: 1, atualizadoPor: "admin", atualizadoEm: serverTimestamp() }));
      await assertFails(updateDoc(ref, { codigoNumero: 99 }));
    });
  });
});

describe("editarAnimal e alterarSituacaoAnimal (RF-04, RF-05)", () => {
  it("troca de brinco libera o antigo, mantém o código e audita antes/depois", async () => {
    const a = await novoAnimal("A1");
    await editarAnimal(admin(), PID, "admin", a.id, { brinco: "A2", nome: "Mimoso" });
    expect(await ler(`propriedades/${PID}/animais/${a.id}`)).toMatchObject({ brinco: "A2", nome: "Mimoso", codigoNumero: 1, versao: 1 });
    expect(await ler(`propriedades/${PID}/brincos/A1`)).toBeUndefined();
    expect(await ler(`propriedades/${PID}/auditoria/${idAuditoria("animal", a.id, 1)}`)).toMatchObject({
      acao: "EDITAR_ANIMAL",
      antes: { brinco: "A1", nome: null },
      depois: { brinco: "A2", nome: "Mimoso" },
    });
    await novoAnimal("A1");
  });

  it("não troca para brinco de outro animal", async () => {
    const a = await novoAnimal("A1");
    await novoAnimal("A2");
    await expect(editarAnimal(admin(), PID, "admin", a.id, { brinco: "A2" })).rejects.toMatchObject({ codigo: "BRINCO_DUPLICADO" });
  });

  it("OPERADOR não edita animal", async () => {
    const a = await novoAnimal();
    await assertFails(editarAnimal(db("operador"), PID, "operador", a.id, { nome: "X" }));
  });

  it("CA-07: inativar exige motivo, registra a data e audita; histórico continua", async () => {
    const a = await novoAnimal();
    const p = await pesagemValida(a.id);
    await expect(alterarSituacaoAnimal(admin(), PID, "admin", a.id, "VENDIDO", " ")).rejects.toMatchObject({
      codigo: "MOTIVO_OBRIGATORIO",
    });
    await alterarSituacaoAnimal(admin(), PID, "admin", a.id, "VENDIDO", "Vendido em leilão");
    const animal = await ler(`propriedades/${PID}/animais/${a.id}`);
    expect(animal).toMatchObject({ situacao: "VENDIDO", versao: 1 });
    expect(animal!.situacaoDesde).toBeInstanceOf(Timestamp);
    expect(await ler(`propriedades/${PID}/auditoria/${idAuditoria("animal", a.id, 1)}`)).toMatchObject({
      acao: "ALTERAR_SITUACAO",
      motivo: "Vendido em leilão",
    });
    await assertSucceeds(getDoc(doc(db("consulta"), `propriedades/${PID}/pesagens/${p}`)));
  });
});

describe("corrigirPesagem (RF-09, RN-11, CA-06)", () => {
  it("corrige com motivo e audita antes e depois", async () => {
    const a = await novoAnimal();
    const p = await pesagemValida(a.id, 365_000);
    await corrigirPesagem(admin(), PID, "admin", { pesagemId: p, pesoG: 356_000, motivo: "Erro de digitação" });
    expect(await ler(`propriedades/${PID}/pesagens/${p}`)).toMatchObject({
      estado: "VALIDA",
      pesoG: 356_000,
      versao: 1,
      motivoCorrecao: "Erro de digitação",
    });
    expect(await ler(`propriedades/${PID}/auditoria/${idAuditoria("pesagem", p, 1)}`)).toMatchObject({
      acao: "CORRIGIR_PESAGEM",
      motivo: "Erro de digitação",
      antes: { pesoG: 365_000 },
      depois: { pesoG: 356_000 },
    });
  });

  it("anular mantém o registro e impede nova correção", async () => {
    const a = await novoAnimal();
    const p = await pesagemValida(a.id);
    await corrigirPesagem(admin(), PID, "admin", { pesagemId: p, motivo: "Balança descalibrada", anular: true });
    expect(await ler(`propriedades/${PID}/pesagens/${p}`)).toMatchObject({ estado: "ANULADA", pesoG: 320_000 });
    await expect(corrigirPesagem(admin(), PID, "admin", { pesagemId: p, pesoG: 1000, motivo: "x" })).rejects.toMatchObject({
      codigo: "NAO_PERMITIDO",
    });
  });

  it("exige ADMIN e motivo", async () => {
    const a = await novoAnimal();
    const p = await pesagemValida(a.id);
    await assertFails(corrigirPesagem(db("operador"), PID, "operador", { pesagemId: p, pesoG: 330_000, motivo: "x" }));
    await expect(corrigirPesagem(admin(), PID, "admin", { pesagemId: p, pesoG: 330_000, motivo: "" })).rejects.toMatchObject({
      codigo: "MOTIVO_OBRIGATORIO",
    });
  });

  describe("gravações forjadas", () => {
    it("correção sem auditoria é recusada", async () => {
      const a = await novoAnimal();
      const p = await pesagemValida(a.id);
      await assertFails(
        updateDoc(doc(admin(), `propriedades/${PID}/pesagens/${p}`), {
          pesoG: 300_000,
          motivoCorrecao: "x",
          versao: 1,
          atualizadoPor: "admin",
          atualizadoEm: serverTimestamp(),
        }),
      );
    });

    it("auditoria com valores antigos falsos é recusada", async () => {
      const a = await novoAnimal();
      const p = await pesagemValida(a.id, 320_000);
      const fs = admin();
      const b = writeBatch(fs);
      const data = Timestamp.fromDate(new Date("2026-10-28T09:15:00-03:00"));
      b.update(doc(fs, `propriedades/${PID}/pesagens/${p}`), {
        pesoG: 300_000,
        motivoCorrecao: "ajuste",
        versao: 1,
        atualizadoPor: "admin",
        atualizadoEm: serverTimestamp(),
      });
      b.set(doc(fs, `propriedades/${PID}/auditoria/${idAuditoria("pesagem", p, 1)}`), {
        usuarioId: "admin",
        entidade: "pesagem",
        registroId: p,
        versao: 1,
        acao: "CORRIGIR_PESAGEM",
        motivo: "ajuste",
        antes: { pesoG: 999_000, dataHoraPesagem: data, estado: "VALIDA" },
        depois: { pesoG: 300_000, dataHoraPesagem: data, estado: "VALIDA" },
        em: serverTimestamp(),
      });
      await assertFails(b.commit());
    });

    it("auditoria não pode ser criada solta nem reescrita", async () => {
      const a = await novoAnimal();
      const id = idAuditoria("animal", a.id, 0);
      await assertFails(
        setDoc(doc(admin(), `propriedades/${PID}/auditoria/${id}`), {
          usuarioId: "admin",
          entidade: "animal",
          registroId: a.id,
          versao: 0,
          acao: "APAGAR_RASTRO",
          motivo: null,
          antes: null,
          depois: null,
          em: serverTimestamp(),
        }),
      );
      await assertFails(updateDoc(doc(admin(), `propriedades/${PID}/auditoria/${id}`), { acao: "X" }));
    });
  });
});
