import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarAnimal, editarAnimal, salvarDiasAlerta, salvarGrupo, salvarPesoAbate } from "../../apps/web/src/operacoes";
import { criarAmbiente, dbDe, PID, semear } from "./ambiente";

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
const ler = async (caminho: string) => {
  let dados: Record<string, unknown> | undefined;
  await env.withSecurityRulesDisabled(async (ctx) => {
    dados = (await getDoc(doc(ctx.firestore(), caminho))).data();
  });
  return dados;
};

describe("categorias e lotes pela tela", () => {
  it("ADMIN cria, renomeia e desativa; operador não", async () => {
    const id = await salvarGrupo(db("admin"), PID, "lotes", { nome: "Pasto da Represa", ativo: true }, []);
    expect(id).toBe("pasto-da-represa");
    await assertSucceeds(salvarGrupo(db("admin"), PID, "lotes", { id, nome: "Represa", ativo: false }, [id]));
    expect(await ler(`propriedades/${PID}/lotes/${id}`)).toEqual({ nome: "Represa", ativo: false });
    await assertFails(salvarGrupo(db("operador"), PID, "lotes", { nome: "X", ativo: true }, []));
    await assertFails(salvarGrupo(db("operador"), PID, "categorias", { nome: "X", ativo: true }, []));
    await assertSucceeds(salvarGrupo(db("admin"), PID, "categorias", { nome: "Novilha prenha", ativo: true }, []));
  });
  it("nome repetido ganha outro id", async () => {
    expect(await salvarGrupo(db("admin"), PID, "categorias", { nome: "Garrote", ativo: true }, ["garrote"])).toBe("garrote-2");
  });
  it("lote não aceita campos extras", async () => {
    await assertFails(setDoc(doc(db("admin"), `propriedades/${PID}/lotes/l1`), { nome: "L", ativo: true, x: 1 }));
  });
});

describe("animal no lote", () => {
  beforeEach(async () => {
    await salvarGrupo(db("admin"), PID, "lotes", { nome: "Lote 1", ativo: true }, []);
    await salvarGrupo(db("admin"), PID, "lotes", { nome: "Antigo", ativo: false }, []);
  });
  it("cadastra já no lote e muda de lote com auditoria", async () => {
    const { id } = await criarAnimal(db("admin"), PID, "admin", { brinco: "L1", categoriaId: "garrote", sexo: "M", loteId: "lote-1" });
    expect((await ler(`propriedades/${PID}/animais/${id}`))?.loteId).toBe("lote-1");
    await assertSucceeds(editarAnimal(db("admin"), PID, "admin", id, { loteId: null }));
    const a = await ler(`propriedades/${PID}/animais/${id}`);
    expect(a?.loteId).toBeNull();
    expect((await ler(`propriedades/${PID}/auditoria/animal_${id}_v1`))?.depois).toEqual({ loteId: null });
  });
  it("não aceita lote inativo ou inexistente", async () => {
    await expect(
      criarAnimal(db("admin"), PID, "admin", { brinco: "L2", categoriaId: "garrote", sexo: "M", loteId: "antigo" }),
    ).rejects.toMatchObject({ codigo: "LOTE_INVALIDO" });
    const { id } = await criarAnimal(db("admin"), PID, "admin", { brinco: "L3", categoriaId: "garrote", sexo: "M" });
    await expect(editarAnimal(db("admin"), PID, "admin", id, { loteId: "nao-existe" })).rejects.toMatchObject({ codigo: "LOTE_INVALIDO" });
    // Forjado, sem passar pelo app: as regras recusam.
    await assertFails(updateDoc(doc(db("admin"), `propriedades/${PID}/animais/${id}`), { loteId: "antigo" }));
  });
  it("operador não muda o lote", async () => {
    const { id } = await criarAnimal(db("admin"), PID, "admin", { brinco: "L4", categoriaId: "garrote", sexo: "M" });
    await assertFails(editarAnimal(db("operador"), PID, "operador", id, { loteId: "lote-1" }));
  });
});

describe("dias do alerta de pesagem", () => {
  it("ADMIN configura entre 1 e 365", async () => {
    await assertSucceeds(salvarDiasAlerta(db("admin"), PID, 45));
    expect((await ler(`propriedades/${PID}`))?.configuracoes).toEqual({ diasAlertaPesagem: 45 });
    await expect(salvarDiasAlerta(db("admin"), PID, 0)).rejects.toMatchObject({ codigo: "DATA_INVALIDA" });
    await assertFails(updateDoc(doc(db("admin"), `propriedades/${PID}`), { "configuracoes.diasAlertaPesagem": 1000 }));
    await assertFails(updateDoc(doc(db("admin"), `propriedades/${PID}`), { "configuracoes.outra": true }));
    await assertFails(salvarDiasAlerta(db("operador"), PID, 10));
  });
});

describe("peso-alvo de abate", () => {
  it("ADMIN configura um peso inteiro entre 100 e 1500 kg", async () => {
    await assertSucceeds(salvarDiasAlerta(db("admin"), PID, 45));
    await assertSucceeds(salvarPesoAbate(db("admin"), PID, 510));
    expect((await ler(`propriedades/${PID}`))?.configuracoes).toEqual({ diasAlertaPesagem: 45, pesoAbateKg: 510 });
    await expect(salvarPesoAbate(db("admin"), PID, 50)).rejects.toMatchObject({ codigo: "PESO_INVALIDO" });
    await assertFails(updateDoc(doc(db("admin"), `propriedades/${PID}`), { "configuracoes.pesoAbateKg": 2000 }));
    await assertFails(updateDoc(doc(db("admin"), `propriedades/${PID}`), { "configuracoes.pesoAbateKg": 500.5 }));
    await assertFails(salvarPesoAbate(db("operador"), PID, 500));
  });
});
