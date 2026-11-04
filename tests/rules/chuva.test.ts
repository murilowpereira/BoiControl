import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, waitForPendingWrites } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { excluirChuva, registrarChuva } from "../../apps/web/src/operacoes";
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
const caminho = (data: string) => `propriedades/${PID}/chuvas/${data}`;

/** Grava pelo app e devolve o erro do servidor, se houver. */
async function anotar(uid: string, data: string, decimosMm: number): Promise<unknown> {
  let erro: unknown = null;
  const banco = db(uid);
  registrarChuva(banco, PID, uid, { data, decimosMm }, (e) => (erro = e));
  await waitForPendingWrites(banco);
  await new Promise((r) => setTimeout(r, 50));
  return erro;
}

describe("chuva", () => {
  it("operador e ADMIN anotam; salvar de novo na mesma data substitui", async () => {
    expect(await anotar("operador", "2026-10-03", 125)).toBeNull();
    expect(await ler(caminho("2026-10-03"))).toMatchObject({ decimosMm: 125, registradoPor: "operador" });
    expect(await anotar("admin", "2026-10-03", 300)).toBeNull();
    expect(await ler(caminho("2026-10-03"))).toMatchObject({ decimosMm: 300, registradoPor: "admin" });
  });
  it("consulta lê mas não anota", async () => {
    await anotar("admin", "2026-10-04", 0);
    await assertSucceeds(getDoc(doc(db("consulta"), caminho("2026-10-04"))));
    await assertFails(
      setDoc(doc(db("consulta"), caminho("2026-10-05")), { decimosMm: 10, registradoPor: "consulta", registradoEm: serverTimestamp() }),
    );
  });
  it("recusa ID fora do formato de data, valor fora da faixa e campos extras", async () => {
    const banco = db("admin");
    const base = { registradoPor: "admin", registradoEm: serverTimestamp() };
    await assertFails(setDoc(doc(banco, caminho("ontem")), { ...base, decimosMm: 10 }));
    await assertFails(setDoc(doc(banco, caminho("2026-10-06")), { ...base, decimosMm: -1 }));
    await assertFails(setDoc(doc(banco, caminho("2026-10-06")), { ...base, decimosMm: 5001 }));
    await assertFails(setDoc(doc(banco, caminho("2026-10-06")), { ...base, decimosMm: 12.5 }));
    await assertFails(setDoc(doc(banco, caminho("2026-10-06")), { ...base, decimosMm: 10, obs: "x" }));
    await assertFails(setDoc(doc(banco, caminho("2026-10-06")), { decimosMm: 10, registradoPor: "outro", registradoEm: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(banco, caminho("2026-10-06")), { ...base, decimosMm: 5000 }));
  });
  it("o app valida antes de gravar", () => {
    expect(() => registrarChuva(db("admin"), PID, "admin", { data: "2026-10-07", decimosMm: 9999 }, () => undefined)).toThrow();
    expect(() => registrarChuva(db("admin"), PID, "admin", { data: "", decimosMm: 10 }, () => undefined)).toThrow();
  });
  it("operador apaga; consulta não", async () => {
    await anotar("admin", "2026-10-08", 50);
    await assertFails(deleteDoc(doc(db("consulta"), caminho("2026-10-08"))));
    let erro: unknown = null;
    const banco = db("operador");
    excluirChuva(banco, PID, "2026-10-08", (e) => (erro = e));
    await waitForPendingWrites(banco);
    expect(erro).toBeNull();
    expect(await ler(caminho("2026-10-08"))).toBeUndefined();
  });
});
