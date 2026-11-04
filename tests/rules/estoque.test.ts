import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc, waitForPendingWrites, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { excluirMovimento, registrarMovimento, salvarGrupo, salvarInsumo, type NovoMovimento } from "../../apps/web/src/operacoes";
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

const RACAO = { nome: "Ração engorda", tipo: "RACAO", unidade: "kg", ativo: true, minimoMil: 100000, vacinaId: null, doseMil: null };

/** Grava e espera o servidor responder; rejeita se as regras recusarem. */
async function movimentar(banco: Firestore, m: Partial<NovoMovimento> & { uid: string; insumoId: string }) {
  let falha: unknown = null;
  const id = registrarMovimento(
    banco,
    {
      pid: PID,
      nomeInsumo: "Ração engorda",
      tipoInsumo: "RACAO",
      unidade: "kg",
      tipo: "ENTRADA",
      quantidadeMil: 500000,
      data: "2026-11-03",
      observacao: "",
      ...m,
    },
    (e) => {
      falha = e;
    },
  );
  await waitForPendingWrites(banco).catch(() => undefined);
  await new Promise((r) => setTimeout(r, 50));
  if (falha) throw falha;
  return id;
}

describe("cadastro de insumos", () => {
  it("ADMIN cria e altera; operador e consulta não", async () => {
    const id = await salvarInsumo(db("admin"), PID, RACAO, null, []);
    expect(id).toBe("racao-engorda");
    expect(await ler(`propriedades/${PID}/insumos/${id}`)).toMatchObject({ nome: "Ração engorda", minimoMil: 100000, vacinaId: null });
    await assertSucceeds(salvarInsumo(db("admin"), PID, { ...RACAO, ativo: false }, { id, vacinaId: null, vacinaDesde: null }, [id]));
    await assertFails(salvarInsumo(db("operador"), PID, RACAO, null, []));
    await assertFails(salvarInsumo(db("consulta"), PID, RACAO, null, []));
  });

  it("todos os membros leem", async () => {
    const id = await salvarInsumo(db("admin"), PID, RACAO, null, []);
    for (const uid of ["admin", "operador", "consulta"]) {
      await assertSucceeds(getDoc(doc(db(uid), `propriedades/${PID}/insumos/${id}`)));
    }
    await assertFails(getDoc(doc(db("estranho"), `propriedades/${PID}/insumos/${id}`)));
  });

  it("liga a uma vacina existente com dose e data de início", async () => {
    const vac = await salvarGrupo(db("admin"), PID, "vacinas", { nome: "Aftosa", ativo: true }, []);
    const id = await salvarInsumo(db("admin"), PID, { ...RACAO, nome: "Aftosa 50 doses", tipo: "VACINA", unidade: "dose", vacinaId: vac, doseMil: 1000 }, null, []);
    const gravado = await ler(`propriedades/${PID}/insumos/${id}`);
    expect(gravado?.doseMil).toBe(1000);
    expect(gravado?.vacinaDesde).toBeInstanceOf(Timestamp);
    // vacina inexistente ou sem dose
    const ref = doc(db("admin"), `propriedades/${PID}/insumos/x`);
    const base = { nome: "X", tipo: "VACINA", unidade: "dose", ativo: true, vacinaDesde: Timestamp.now() };
    await assertFails(setDoc(ref, { ...base, vacinaId: "nao-existe", doseMil: 1000 }));
    await assertFails(setDoc(ref, { ...base, vacinaId: vac, doseMil: 0 }));
    await assertFails(setDoc(ref, { ...base, vacinaId: vac, doseMil: 1000, vacinaDesde: null }));
    await assertFails(setDoc(ref, { ...base, vacinaId: null, doseMil: 1000 }));
  });

  it("recusa tipo, unidade ou campo desconhecido", async () => {
    const ref = doc(db("admin"), `propriedades/${PID}/insumos/x`);
    await assertFails(setDoc(ref, { ...RACAO, tipo: "COMIDA" }));
    await assertFails(setDoc(ref, { ...RACAO, unidade: "tonelada" }));
    await assertFails(setDoc(ref, { ...RACAO, preco: 10 }));
    await assertFails(setDoc(ref, { ...RACAO, minimoMil: 1.5 }));
  });
});

describe("entradas e saídas", () => {
  let insumoId: string;
  beforeEach(async () => {
    insumoId = await salvarInsumo(db("admin"), PID, RACAO, null, []);
  });

  it("operador registra entrada e saída; consulta não", async () => {
    await movimentar(db("operador"), { uid: "operador", insumoId });
    await movimentar(db("operador"), { uid: "operador", insumoId, tipo: "SAIDA", quantidadeMil: 25000, observacao: "Trato do lote 1" });
    await expect(movimentar(db("consulta"), { uid: "consulta", insumoId })).rejects.toThrow();
  });

  it("insumo precisa existir e quantidade é inteira e positiva", async () => {
    await expect(movimentar(db("operador"), { uid: "operador", insumoId: "nao-existe" })).rejects.toThrow();
    const ref = doc(db("operador"), `propriedades/${PID}/movimentosEstoque/${crypto.randomUUID()}`);
    const base = { insumoId, tipo: "SAIDA", data: "2026-11-03", criadoPor: "operador", criadoEm: serverTimestamp() };
    await assertFails(setDoc(ref, { ...base, quantidadeMil: 0 }));
    await assertFails(setDoc(ref, { ...base, quantidadeMil: 2.5 }));
    await assertFails(setDoc(ref, { ...base, quantidadeMil: 1000, tipo: "AJUSTE" }));
    await assertSucceeds(setDoc(ref, { ...base, quantidadeMil: 1000 }));
  });

  it("movimento não pode ser alterado; só o ADMIN exclui", async () => {
    const id = await movimentar(db("operador"), { uid: "operador", insumoId });
    const caminho = `propriedades/${PID}/movimentosEstoque/${id}`;
    await assertFails(updateDoc(doc(db("admin"), caminho), { quantidadeMil: 1000 }));
    await assertFails(excluirMovimento(db("operador"), PID, id, null));
    await assertSucceeds(excluirMovimento(db("admin"), PID, id, null));
    expect(await ler(caminho)).toBeUndefined();
  });

  it("compra com valor lança a despesa no financeiro, na categoria do insumo", async () => {
    const id = await movimentar(db("admin"), { uid: "admin", insumoId, valorCentavos: 125000 });
    const mov = await ler(`propriedades/${PID}/movimentosEstoque/${id}`);
    const lanc = await ler(`propriedades/${PID}/lancamentos/${mov?.lancamentoId}`);
    expect(lanc).toMatchObject({ categoria: "RACAO", valorCentavos: 125000, data: "2026-11-03", descricao: "Compra: Ração engorda (500 kg)" });
    // excluir a entrada leva a despesa junto
    await excluirMovimento(db("admin"), PID, id, mov!.lancamentoId as string);
    expect(await ler(`propriedades/${PID}/lancamentos/${mov?.lancamentoId}`)).toBeUndefined();
  });

  it("operador não consegue lançar valor (o financeiro é só do ADMIN)", async () => {
    await expect(movimentar(db("operador"), { uid: "operador", insumoId, valorCentavos: 125000 })).rejects.toThrow();
  });

  it("lancamentoId só vale se a despesa for gravada junto", async () => {
    const ref = doc(db("admin"), `propriedades/${PID}/movimentosEstoque/${crypto.randomUUID()}`);
    await assertFails(
      setDoc(ref, { insumoId, tipo: "ENTRADA", quantidadeMil: 1000, data: "2026-11-03", lancamentoId: "inventado", criadoPor: "admin", criadoEm: serverTimestamp() }),
    );
  });
});
