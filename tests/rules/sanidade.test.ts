import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc, waitForPendingWrites } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anularAplicacao, registrarAplicacao, salvarGrupo, salvarProtocolo } from "../../apps/web/src/operacoes";
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
  await salvarGrupo(db("admin"), PID, "vacinas", { nome: "Ivermectina", ativo: true }, []);
});
const db = (uid: string) => dbDe(env, uid);
const ler = async (caminho: string) => {
  let dados: Record<string, unknown> | undefined;
  await env.withSecurityRulesDisabled(async (ctx) => {
    dados = (await getDoc(doc(ctx.firestore(), caminho))).data();
  });
  return dados;
};
const VACINA = `propriedades/${PID}/vacinas/ivermectina`;
const falhar = (e: unknown) => {
  throw e;
};
const aplicacao = (uid: string, extra: Record<string, unknown> = {}) => ({
  vacinaId: "ivermectina",
  data: Timestamp.fromDate(new Date("2026-11-01T09:00:00-03:00")),
  animalIds: ["a1", "a2"],
  loteId: null,
  observacao: null,
  criadoPor: uid,
  criadoEm: serverTimestamp(),
  ...extra,
});
const refAplicacao = (uid: string) => doc(db(uid), `propriedades/${PID}/aplicacoes/${crypto.randomUUID()}`);

describe("carência e repetição do produto", () => {
  it("ADMIN grava tipo, carência e intervalo; renomear não apaga", async () => {
    await assertSucceeds(salvarProtocolo(db("admin"), PID, "ivermectina", { tipo: "VERMIFUGO", carenciaDias: 35, intervaloDias: 90 }));
    await salvarGrupo(db("admin"), PID, "vacinas", { id: "ivermectina", nome: "Ivomec", ativo: true }, ["ivermectina"]);
    expect(await ler(VACINA)).toEqual({ nome: "Ivomec", ativo: true, tipo: "VERMIFUGO", carenciaDias: 35, intervaloDias: 90 });
    await assertSucceeds(salvarProtocolo(db("admin"), PID, "ivermectina", { tipo: null, carenciaDias: null, intervaloDias: null }));
  });
  it("operador não altera; valores fora do limite são recusados", async () => {
    await assertFails(salvarProtocolo(db("operador"), PID, "ivermectina", { tipo: "VACINA", carenciaDias: 10, intervaloDias: null }));
    await assertFails(updateDoc(doc(db("admin"), VACINA), { carenciaDias: 0 }));
    await assertFails(updateDoc(doc(db("admin"), VACINA), { carenciaDias: 366 }));
    await assertFails(updateDoc(doc(db("admin"), VACINA), { intervaloDias: 1.5 }));
    await assertFails(updateDoc(doc(db("admin"), VACINA), { tipo: "SORO" }));
    await expect(salvarProtocolo(db("admin"), PID, "ivermectina", { tipo: null, carenciaDias: 0, intervaloDias: null })).rejects.toThrow(
      /Carência/,
    );
  });
});

describe("aplicação no lote", () => {
  it("operador registra pelo app, sem repetir animais", async () => {
    const banco = db("operador");
    const id = registrarAplicacao(
      banco,
      { pid: PID, uid: "operador", vacinaId: "ivermectina", data: new Date(), animalIds: ["a1", "a2", "a1"], loteId: "represa", observacao: " " },
      falhar,
    );
    await waitForPendingWrites(banco);
    const a = await ler(`propriedades/${PID}/aplicacoes/${id}`);
    expect(a).toMatchObject({ vacinaId: "ivermectina", animalIds: ["a1", "a2"], loteId: "represa", observacao: null, criadoPor: "operador" });
  });
  it("consulta não registra; formato é conferido", async () => {
    await assertFails(setDoc(refAplicacao("consulta"), aplicacao("consulta")));
    await assertFails(setDoc(refAplicacao("operador"), aplicacao("admin")));
    await assertFails(setDoc(refAplicacao("operador"), aplicacao("operador", { animalIds: [] })));
    await assertFails(setDoc(refAplicacao("operador"), aplicacao("operador", { anulada: true })));
    await assertFails(setDoc(doc(db("operador"), `propriedades/${PID}/aplicacoes/abc`), aplicacao("operador")));
    expect(() =>
      registrarAplicacao(db("operador"), { pid: PID, uid: "operador", vacinaId: "ivermectina", data: new Date(), animalIds: [], loteId: null }, falhar),
    ).toThrow(/pelo menos um animal/);
  });
  it("só o ADMIN anula, uma vez; ninguém apaga nem edita", async () => {
    const ref = refAplicacao("operador");
    await assertSucceeds(setDoc(ref, aplicacao("operador")));
    await assertFails(updateDoc(doc(db("admin"), ref.path), { animalIds: ["a3"] }));
    await assertFails(anularAplicacao(db("operador"), PID, "operador", ref.id));
    await assertSucceeds(anularAplicacao(db("admin"), PID, "admin", ref.id));
    expect((await ler(ref.path))?.anulada).toBe(true);
    await assertFails(anularAplicacao(db("admin"), PID, "admin", ref.id));
  });
  it("todos os membros leem", async () => {
    const ref = refAplicacao("operador");
    await assertSucceeds(setDoc(ref, aplicacao("operador")));
    for (const uid of ["admin", "operador", "consulta"]) await assertSucceeds(getDoc(doc(db(uid), ref.path)));
    await assertFails(getDoc(doc(db("estranho"), ref.path)));
  });
});
