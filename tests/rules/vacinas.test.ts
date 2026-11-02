import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, waitForPendingWrites } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarAnimal, lerVacinas, registrarPesagem, salvarGrupo } from "../../apps/web/src/operacoes";
import { criarAmbiente, dadosPesagem, dbDe, PID, semear } from "./ambiente";

let env: RulesTestEnvironment;
let animalId: string;
beforeAll(async () => {
  env = await criarAmbiente();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await semear(env);
  animalId = (await criarAnimal(db("admin"), PID, "admin", { brinco: "V1", categoriaId: "garrote", sexo: "M" })).id;
});
const db = (uid: string) => dbDe(env, uid);
const ler = async (caminho: string) => {
  let dados: Record<string, unknown> | undefined;
  await env.withSecurityRulesDisabled(async (ctx) => {
    dados = (await getDoc(doc(ctx.firestore(), caminho))).data();
  });
  return dados;
};
const pesagemRef = (uid: string) => doc(db(uid), `propriedades/${PID}/pesagens/${crypto.randomUUID()}`);

describe("cadastro de vacinas", () => {
  it("ADMIN cria, renomeia e desativa; operador e consulta não", async () => {
    const id = await salvarGrupo(db("admin"), PID, "vacinas", { nome: "Aftosa", ativo: true }, []);
    expect(id).toBe("aftosa");
    await assertSucceeds(salvarGrupo(db("admin"), PID, "vacinas", { id, nome: "Febre aftosa", ativo: false }, [id]));
    expect(await ler(`propriedades/${PID}/vacinas/${id}`)).toEqual({ nome: "Febre aftosa", ativo: false });
    await assertFails(salvarGrupo(db("operador"), PID, "vacinas", { nome: "Raiva", ativo: true }, []));
    await assertFails(salvarGrupo(db("consulta"), PID, "vacinas", { nome: "Raiva", ativo: true }, []));
  });
  it("todos os membros leem as vacinas", async () => {
    await salvarGrupo(db("admin"), PID, "vacinas", { nome: "Raiva", ativo: true }, []);
    for (const uid of ["admin", "operador", "consulta"]) {
      await assertSucceeds(getDoc(doc(db(uid), `propriedades/${PID}/vacinas/raiva`)));
    }
  });
  it("vacina não aceita campos extras nem nome vazio", async () => {
    await assertFails(setDoc(doc(db("admin"), `propriedades/${PID}/vacinas/x`), { nome: "X", ativo: true, dose: 2 }));
    await assertFails(setDoc(doc(db("admin"), `propriedades/${PID}/vacinas/x`), { nome: " ", ativo: true }));
  });
});

describe("vacinas na pesagem", () => {
  it("operador grava pesagem com várias vacinas", async () => {
    const banco = db("operador");
    const id = registrarPesagem(
      banco,
      {
        pid: PID,
        uid: "operador",
        animalId,
        pesoG: 300000,
        dataHora: new Date(),
        fuso: "America/Sao_Paulo",
        observacao: "",
        vacinas: ["aftosa", "raiva", "aftosa"],
      },
      (e) => {
        throw e;
      },
    );
    await waitForPendingWrites(banco);
    expect((await ler(`propriedades/${PID}/pesagens/${id}`))?.vacinas).toEqual(["aftosa", "raiva"]);
  });
  it("pesagem sem vacinas não grava o campo", async () => {
    const banco = db("operador");
    const id = registrarPesagem(
      banco,
      { pid: PID, uid: "operador", animalId, pesoG: 300000, dataHora: new Date(), fuso: "America/Sao_Paulo", observacao: "", vacinas: [] },
      (e) => {
        throw e;
      },
    );
    await waitForPendingWrites(banco);
    const p = await ler(`propriedades/${PID}/pesagens/${id}`);
    expect(p?.pesoG).toBe(300000);
    expect(p && "vacinas" in p).toBe(false);
  });
  it("regras: lista de 1 a 10 vacinas", async () => {
    await assertSucceeds(setDoc(pesagemRef("operador"), dadosPesagem("operador", animalId, { vacinas: ["aftosa"] })));
    await assertFails(setDoc(pesagemRef("operador"), dadosPesagem("operador", animalId, { vacinas: [] })));
    await assertFails(setDoc(pesagemRef("operador"), dadosPesagem("operador", animalId, { vacinas: "aftosa" })));
    const onze = Array.from({ length: 11 }, (_, i) => `v${i}`);
    await assertFails(setDoc(pesagemRef("operador"), dadosPesagem("operador", animalId, { vacinas: onze })));
  });
  it("o app recusa mais de 10 vacinas antes de gravar", () => {
    expect(() => lerVacinas(Array.from({ length: 11 }, (_, i) => `v${i}`))).toThrow(/no máximo 10/);
    expect(lerVacinas(undefined)).toEqual([]);
  });
  it("vacinas não podem ser trocadas depois pela correção", async () => {
    const ref = pesagemRef("operador");
    await assertSucceeds(setDoc(ref, dadosPesagem("operador", animalId, { vacinas: ["aftosa"] })));
    await assertFails(updateDoc(doc(db("admin"), ref.path), { vacinas: ["raiva"] }));
  });
});
