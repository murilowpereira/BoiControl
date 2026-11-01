import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import {
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { criarAnimal } from "../../apps/web/src/operacoes";
import { criarAmbiente, dadosPesagem, dbDe, OUTRA, PID, semear } from "./ambiente";

let env: RulesTestEnvironment;
let animalId: string;
const UUID = "0b8a3c1e-6f2d-4c47-9a5e-1d2f3a4b5c6d";

beforeAll(async () => {
  env = await criarAmbiente();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await semear(env);
  animalId = (await criarAnimal(db("admin"), PID, "admin", { brinco: "A1", categoriaId: "garrote", sexo: "M" })).id;
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `propriedades/${PID}/pesagens/${UUID}`), dadosPesagem("operador", animalId, { criadoEm: Timestamp.now() }));
    await setDoc(doc(ctx.firestore(), `propriedades/${PID}/auditoria/r1`), { acao: "X" });
  });
});

const db = (uid: string | null) => dbDe(env, uid);
const novoId = () => crypto.randomUUID();
const pesagemRef = (uid: string, id = novoId()) => doc(db(uid), `propriedades/${PID}/pesagens/${id}`);

describe("CA-14: usuário sem vínculo não lê nem altera dados da propriedade", () => {
  it("anônimo não lê", async () => {
    await assertFails(getDoc(doc(db(null), `propriedades/${PID}/animais/${animalId}`)));
  });
  it("membro de outra propriedade não lê nem cria pesagem", async () => {
    await assertFails(getDoc(doc(db("estranho"), `propriedades/${PID}/animais/${animalId}`)));
    await assertFails(getDoc(doc(db("estranho"), `propriedades/${PID}/pesagens/${UUID}`)));
    await assertFails(setDoc(pesagemRef("estranho"), dadosPesagem("estranho", animalId)));
    await assertFails(
      criarAnimal(db("estranho"), PID, "estranho", { brinco: "Z1", categoriaId: "garrote", sexo: "M" }),
    );
  });
  it("membro inativo não lê nem cria", async () => {
    await assertFails(getDoc(doc(db("inativo"), `propriedades/${PID}`)));
    await assertFails(setDoc(pesagemRef("inativo"), dadosPesagem("inativo", animalId)));
  });
  it("vínculo em outra propriedade não dá acesso a esta", async () => {
    await assertFails(getDoc(doc(db("admin"), `propriedades/${OUTRA}`)));
  });
});

describe("leitura por perfil", () => {
  it.each(["admin", "operador", "consulta"])("%s lê animais, pesagens e membros", async (uid) => {
    await assertSucceeds(getDoc(doc(db(uid), `propriedades/${PID}/animais/${animalId}`)));
    await assertSucceeds(getDoc(doc(db(uid), `propriedades/${PID}/pesagens/${UUID}`)));
    await assertSucceeds(getDoc(doc(db(uid), `propriedades/${PID}/membros/${uid}`)));
  });
  it("só ADMIN lê auditoria", async () => {
    await assertSucceeds(getDoc(doc(db("admin"), `propriedades/${PID}/auditoria/r1`)));
    await assertFails(getDoc(doc(db("operador"), `propriedades/${PID}/auditoria/r1`)));
    await assertFails(getDoc(doc(db("consulta"), `propriedades/${PID}/auditoria/r1`)));
  });
});

describe("descoberta das propriedades do usuário (GET /me)", () => {
  it("usuário lista os próprios vínculos, mas não os de outros", async () => {
    const q = (uid: string, alvo = uid) => query(collectionGroup(db(uid), "membros"), where("uid", "==", alvo));
    await assertSucceeds(getDocs(q("operador")));
    await assertSucceeds(getDocs(q("estranho")));
    await assertFails(getDocs(q("estranho", "admin")));
  });
});

describe("criação de pesagem (RF-07, RF-14)", () => {
  it("OPERADOR e ADMIN criam pesagem válida", async () => {
    await assertSucceeds(setDoc(pesagemRef("operador"), dadosPesagem("operador", animalId)));
    await assertSucceeds(setDoc(pesagemRef("admin"), dadosPesagem("admin", animalId)));
  });
  it("observação é opcional", async () => {
    const { observacao: _, ...semObs } = dadosPesagem("operador", animalId);
    await assertSucceeds(setDoc(pesagemRef("operador"), semObs));
  });
  it("aceita pesagem de animal já inativado (chegou atrasada do offline; a tela sinaliza)", async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore(), `propriedades/${PID}/animais/${animalId}`), { situacao: "VENDIDO" }),
    );
    await assertSucceeds(setDoc(pesagemRef("operador"), dadosPesagem("operador", animalId)));
  });
  it("CONSULTA não cria", async () => {
    await assertFails(setDoc(pesagemRef("consulta"), dadosPesagem("consulta", animalId)));
  });
  it.each([
    ["já anulada", { estado: "ANULADA" }],
    ["versão diferente de zero", { versao: 3 }],
    ["campo calculado", { gmdKgDia: 1 }],
    ["peso fracionário (inteiro em gramas)", { pesoG: 356.5 }],
    ["peso zero (CA-03)", { pesoG: 0 }],
    ["peso negativo (CA-03)", { pesoG: -1000 }],
    ["peso acima do máximo", { pesoG: 5_000_000 }],
    ["peso com mais de duas casas em kg", { pesoG: 356_005 }],
    ["animal inexistente", { animalId: "nao-existe" }],
    ["criadoEm escolhido pelo cliente", { criadoEm: Timestamp.fromDate(new Date("2020-01-01")) }],
  ])("recusa: %s", async (_, extra) => {
    await assertFails(setDoc(pesagemRef("operador"), dadosPesagem("operador", animalId, extra)));
  });
  it("não aceita registrar em nome de outro usuário", async () => {
    await assertFails(setDoc(pesagemRef("operador"), dadosPesagem("admin", animalId)));
  });
  it("exige UUID como ID do documento", async () => {
    await assertFails(setDoc(pesagemRef("operador", "qualquer"), dadosPesagem("operador", animalId)));
  });
});

describe("RN-06 / RN-13: pesagem é histórica", () => {
  it("ninguém apaga pesagem", async () => {
    await assertFails(deleteDoc(doc(db("admin"), `propriedades/${PID}/pesagens/${UUID}`)));
  });
  it("OPERADOR não altera pesagem", async () => {
    await assertFails(updateDoc(doc(db("operador"), `propriedades/${PID}/pesagens/${UUID}`), { pesoG: 300000 }));
  });
  it("reenvio do mesmo UUID não sobrescreve pesagem existente", async () => {
    await assertFails(setDoc(pesagemRef("operador", UUID), dadosPesagem("operador", animalId)));
  });
});

describe("categorias e propriedade", () => {
  it("ADMIN cria categoria; OPERADOR não", async () => {
    await assertSucceeds(setDoc(doc(db("admin"), `propriedades/${PID}/categorias/c1`), { nome: "Novilha", ativo: true }));
    await assertFails(setDoc(doc(db("operador"), `propriedades/${PID}/categorias/c2`), { nome: "Boi", ativo: true }));
  });
  it("RF-02: ADMIN edita o nome, mas não campos fora da lista", async () => {
    await assertSucceeds(updateDoc(doc(db("admin"), `propriedades/${PID}`), { nome: "Fazenda Nova" }));
    await assertFails(updateDoc(doc(db("admin"), `propriedades/${PID}`), { donoId: "x" }));
    await assertFails(updateDoc(doc(db("operador"), `propriedades/${PID}`), { nome: "Fazenda Nova" }));
  });
  it("ninguém cria membros pelo app", async () => {
    await assertFails(setDoc(doc(db("admin"), `propriedades/${PID}/membros/novo`), { uid: "novo", perfil: "ADMIN", ativo: true }));
  });
});
