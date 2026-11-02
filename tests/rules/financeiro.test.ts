import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, collection, setDoc, serverTimestamp } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  alterarSituacaoAnimal,
  criarAnimal,
  excluirLancamento,
  salvarLancamento,
  salvarValoresAnimal,
} from "../../apps/web/src/operacoes";
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

describe("valor de compra e de venda do animal", () => {
  it("compra gravada no cadastro e venda ao marcar como vendido", async () => {
    const { id } = await criarAnimal(db("admin"), PID, "admin", {
      brinco: "F1",
      categoriaId: "garrote",
      sexo: "M",
      compra: { centavos: 285000, data: "2026-10-01" },
    });
    expect(await ler(`propriedades/${PID}/valoresAnimais/${id}`)).toMatchObject({
      compraCentavos: 285000,
      dataCompra: "2026-10-01",
      vendaCentavos: null,
      dataVenda: null,
      atualizadoPor: "admin",
    });
    await alterarSituacaoAnimal(db("admin"), PID, "admin", id, "VENDIDO", "Vendido ao frigorífico", { centavos: 520000, data: "2026-11-01" });
    expect(await ler(`propriedades/${PID}/valoresAnimais/${id}`)).toMatchObject({
      compraCentavos: 285000,
      vendaCentavos: 520000,
      dataVenda: "2026-11-01",
    });
    expect((await ler(`propriedades/${PID}/animais/${id}`))?.situacao).toBe("VENDIDO");
  });

  it("venda sem compra registrada também funciona", async () => {
    const { id } = await criarAnimal(db("admin"), PID, "admin", { brinco: "F2", categoriaId: "garrote", sexo: "F" });
    expect(await ler(`propriedades/${PID}/valoresAnimais/${id}`)).toBeUndefined();
    await alterarSituacaoAnimal(db("admin"), PID, "admin", id, "VENDIDO", "Venda", { centavos: 400000, data: "2026-11-01" });
    expect(await ler(`propriedades/${PID}/valoresAnimais/${id}`)).toMatchObject({ compraCentavos: null, vendaCentavos: 400000 });
  });

  it("só o ADMIN vê e altera valores", async () => {
    const { id } = await criarAnimal(db("admin"), PID, "admin", {
      brinco: "F3",
      categoriaId: "garrote",
      sexo: "M",
      compra: { centavos: 100000, data: "2026-10-01" },
    });
    await assertFails(getDoc(doc(db("operador"), `propriedades/${PID}/valoresAnimais/${id}`)));
    await assertFails(getDoc(doc(db("consulta"), `propriedades/${PID}/valoresAnimais/${id}`)));
    await assertFails(getDocs(collection(db("operador"), `propriedades/${PID}/valoresAnimais`)));
    await assertFails(
      salvarValoresAnimal(db("operador"), PID, "operador", id, { compraCentavos: 1, dataCompra: null, vendaCentavos: null, dataVenda: null }),
    );
    // O animal continua visível para o operador.
    await assertSucceeds(getDoc(doc(db("operador"), `propriedades/${PID}/animais/${id}`)));
    await assertSucceeds(
      salvarValoresAnimal(db("admin"), PID, "admin", id, { compraCentavos: 110000, dataCompra: "2026-09-30", vendaCentavos: null, dataVenda: null }),
    );
  });

  it("recusa valores inválidos e animal inexistente", async () => {
    const { id } = await criarAnimal(db("admin"), PID, "admin", { brinco: "F4", categoriaId: "garrote", sexo: "M" });
    const base = { dataCompra: null, vendaCentavos: null, dataVenda: null, atualizadoPor: "admin", atualizadoEm: serverTimestamp() };
    const caminho = `propriedades/${PID}/valoresAnimais/${id}`;
    await assertFails(setDoc(doc(db("admin"), caminho), { ...base, compraCentavos: 10.5 }));
    await assertFails(setDoc(doc(db("admin"), caminho), { ...base, compraCentavos: -100 }));
    await assertFails(setDoc(doc(db("admin"), caminho), { ...base, compraCentavos: 100, extra: 1 }));
    await assertFails(setDoc(doc(db("admin"), `propriedades/${PID}/valoresAnimais/nao-existe`), { ...base, compraCentavos: 100 }));
    await expect(
      salvarValoresAnimal(db("admin"), PID, "admin", id, { compraCentavos: 0, dataCompra: null, vendaCentavos: null, dataVenda: null }),
    ).rejects.toMatchObject({ codigo: "VALOR_INVALIDO" });
  });
});

describe("lançamentos financeiros", () => {
  it("ADMIN cria, altera e exclui; os outros nem leem", async () => {
    const id = await salvarLancamento(db("admin"), PID, "admin", {
      categoria: "RACAO",
      descricao: "10 sacos de ração",
      valorCentavos: 95000,
      data: "2026-10-20",
    });
    expect(await ler(`propriedades/${PID}/lancamentos/${id}`)).toMatchObject({ categoria: "RACAO", valorCentavos: 95000, criadoPor: "admin" });
    await assertSucceeds(salvarLancamento(db("admin"), PID, "admin", { id, categoria: "RACAO", valorCentavos: 99000, data: "2026-10-20" }));
    expect((await ler(`propriedades/${PID}/lancamentos/${id}`))?.valorCentavos).toBe(99000);

    await assertFails(getDocs(collection(db("operador"), `propriedades/${PID}/lancamentos`)));
    await assertFails(getDocs(collection(db("consulta"), `propriedades/${PID}/lancamentos`)));
    await assertFails(salvarLancamento(db("operador"), PID, "operador", { categoria: "RACAO", valorCentavos: 1, data: "2026-10-20" }));
    await assertFails(excluirLancamento(db("operador"), PID, id));
    await assertSucceeds(excluirLancamento(db("admin"), PID, id));
    expect(await ler(`propriedades/${PID}/lancamentos/${id}`)).toBeUndefined();
  });

  it("valida categoria, valor, data e autoria", async () => {
    const ok = { categoria: "SANIDADE", descricao: null, valorCentavos: 1000, data: "2026-10-01", criadoPor: "admin", criadoEm: serverTimestamp() };
    const c = (id: string) => doc(db("admin"), `propriedades/${PID}/lancamentos/${id}`);
    await assertSucceeds(setDoc(c("a"), ok));
    await assertFails(setDoc(c("b"), { ...ok, categoria: "QUALQUER" }));
    await assertFails(setDoc(c("c"), { ...ok, valorCentavos: 0 }));
    await assertFails(setDoc(c("d"), { ...ok, valorCentavos: 10.5 }));
    await assertFails(setDoc(c("e"), { ...ok, data: "01/10/2026" }));
    await assertFails(setDoc(c("f"), { ...ok, criadoPor: "outro" }));
    await assertFails(setDoc(c("g"), { ...ok, x: 1 }));
    await expect(salvarLancamento(db("admin"), PID, "admin", { categoria: "RACAO", valorCentavos: 100, data: "" })).rejects.toMatchObject({
      codigo: "DATA_INVALIDA",
    });
  });
});
