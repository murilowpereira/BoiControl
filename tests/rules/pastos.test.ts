import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ErroOperacao, excluirOcupacao, moverLote, salvarGrupo, salvarPasto } from "../../apps/web/src/operacoes";
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
  await salvarGrupo(db("admin"), PID, "lotes", { nome: "Engorda", ativo: true }, []);
  await salvarPasto(db("admin"), PID, { nome: "Pasto 1", areaM2: 100_000, ativo: true }, []);
  await salvarPasto(db("admin"), PID, { nome: "Pasto 2", areaM2: 50_000, ativo: true }, ["pasto-1"]);
});
const db = (uid: string) => dbDe(env, uid);
const ler = async (caminho: string) => {
  let dados: Record<string, unknown> | undefined;
  await env.withSecurityRulesDisabled(async (ctx) => {
    dados = (await getDoc(doc(ctx.firestore(), caminho))).data();
  });
  return dados;
};
const ocupacao = (uid: string, extra: Record<string, unknown> = {}) => ({
  loteId: "engorda",
  pastoId: "pasto-1",
  entrada: "2026-10-01",
  saida: null,
  criadoPor: uid,
  criadoEm: serverTimestamp(),
  ...extra,
});

describe("cadastro de pastos", () => {
  it("ADMIN cria e altera área; operador e consulta não", async () => {
    expect(await ler(`propriedades/${PID}/pastos/pasto-1`)).toEqual({ nome: "Pasto 1", areaM2: 100_000, ativo: true });
    await assertSucceeds(salvarPasto(db("admin"), PID, { id: "pasto-1", nome: "Piquete 1", areaM2: 125_000, ativo: false }, []));
    await assertFails(salvarPasto(db("operador"), PID, { nome: "Novo", areaM2: 10_000, ativo: true }, []));
    await assertFails(salvarPasto(db("consulta"), PID, { nome: "Novo", areaM2: 10_000, ativo: true }, []));
  });
  it("todos os membros leem os pastos", async () => {
    for (const uid of ["admin", "operador", "consulta"]) {
      await assertSucceeds(getDoc(doc(db(uid), `propriedades/${PID}/pastos/pasto-1`)));
    }
    await assertFails(getDoc(doc(db("estranho"), `propriedades/${PID}/pastos/pasto-1`)));
  });
  it("área precisa ser inteira e positiva, sem campos extras", async () => {
    const ref = doc(db("admin"), `propriedades/${PID}/pastos/x`);
    await assertFails(setDoc(ref, { nome: "X", areaM2: 0, ativo: true }));
    await assertFails(setDoc(ref, { nome: "X", areaM2: 10.5, ativo: true }));
    await assertFails(setDoc(ref, { nome: "X", ativo: true }));
    await assertFails(setDoc(ref, { nome: "X", areaM2: 1000, ativo: true, capim: "braquiária" }));
    await expect(salvarPasto(db("admin"), PID, { nome: "X", areaM2: 0, ativo: true }, [])).rejects.toBeInstanceOf(ErroOperacao);
  });
});

describe("rotação de lotes", () => {
  it("operador põe o lote no pasto e depois muda de pasto", async () => {
    const banco = db("operador");
    const primeira = moverLote(banco, PID, "operador", { loteId: "engorda", pastoId: "pasto-1", data: "2026-10-01" });
    await assertSucceeds(primeira.gravado);
    const segunda = moverLote(banco, PID, "operador", {
      loteId: "engorda",
      pastoId: "pasto-2",
      data: "2026-11-01",
      atual: { id: primeira.novaId!, pastoId: "pasto-1", entrada: "2026-10-01" },
    });
    await assertSucceeds(segunda.gravado);
    expect(await ler(`propriedades/${PID}/ocupacoes/${primeira.novaId}`)).toMatchObject({ saida: "2026-11-01" });
    expect(await ler(`propriedades/${PID}/ocupacoes/${segunda.novaId}`)).toMatchObject({
      pastoId: "pasto-2",
      entrada: "2026-11-01",
      saida: null,
    });
  });
  it("tirar o lote do pasto só fecha a ocupação", async () => {
    const { novaId, gravado } = moverLote(db("admin"), PID, "admin", { loteId: "engorda", pastoId: "pasto-1", data: "2026-10-01" });
    await gravado;
    const r = moverLote(db("admin"), PID, "admin", {
      loteId: "engorda",
      pastoId: null,
      data: "2026-10-15",
      atual: { id: novaId!, pastoId: "pasto-1", entrada: "2026-10-01" },
    });
    expect(r.novaId).toBeNull();
    await assertSucceeds(r.gravado);
  });
  it("consulta não muda lote de pasto", async () => {
    await assertFails(setDoc(doc(db("consulta"), `propriedades/${PID}/ocupacoes/o1`), ocupacao("consulta")));
  });
  it("recusa lote ou pasto inexistente, pasto desativado, autor falso e já fechada", async () => {
    const ref = (id: string) => doc(db("operador"), `propriedades/${PID}/ocupacoes/${id}`);
    await assertFails(setDoc(ref("a"), ocupacao("operador", { loteId: "nao-existe" })));
    await assertFails(setDoc(ref("b"), ocupacao("operador", { pastoId: "nao-existe" })));
    await assertFails(setDoc(ref("c"), ocupacao("admin")));
    await assertFails(setDoc(ref("d"), ocupacao("operador", { saida: "2026-10-02" })));
    await salvarPasto(db("admin"), PID, { id: "pasto-2", nome: "Pasto 2", areaM2: 50_000, ativo: false }, []);
    await assertFails(setDoc(ref("e"), ocupacao("operador", { pastoId: "pasto-2" })));
  });
  it("saída não pode ser antes da entrada nem mudar outros campos", async () => {
    const ref = doc(db("operador"), `propriedades/${PID}/ocupacoes/o1`);
    await assertSucceeds(setDoc(ref, ocupacao("operador")));
    await assertFails(updateDoc(ref, { saida: "2026-09-30" }));
    await assertFails(updateDoc(ref, { saida: "2026-10-05", pastoId: "pasto-2" }));
    await assertSucceeds(updateDoc(ref, { saida: "2026-10-05" }));
    await assertFails(updateDoc(ref, { saida: "2026-10-06" }));
    expect(() =>
      moverLote(db("operador"), PID, "operador", {
        loteId: "engorda",
        pastoId: "pasto-2",
        data: "2026-09-01",
        atual: { id: "o1", pastoId: "pasto-1", entrada: "2026-10-01" },
      }),
    ).toThrow(ErroOperacao);
  });
  it("só o ADMIN apaga um registro de rotação", async () => {
    await setDoc(doc(db("operador"), `propriedades/${PID}/ocupacoes/o1`), ocupacao("operador"));
    await assertFails(deleteDoc(doc(db("operador"), `propriedades/${PID}/ocupacoes/o1`)));
    await assertSucceeds(excluirOcupacao(db("admin"), PID, "o1"));
  });
});
