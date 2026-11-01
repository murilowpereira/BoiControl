import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collectionGroup, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const PID = "fazenda-1";
const OUTRA = "fazenda-2";
const UUID = "0b8a3c1e-6f2d-4c47-9a5e-1d2f3a4b5c6d";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-boicontrol",
    firestore: { rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8") },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `propriedades/${PID}`), { nome: "Fazenda Boa Vista", configuracoes: {} });
    await setDoc(doc(db, `propriedades/${OUTRA}`), { nome: "Outra", configuracoes: {} });
    await setDoc(doc(db, `propriedades/${PID}/membros/admin`), { perfil: "ADMIN", ativo: true });
    await setDoc(doc(db, `propriedades/${PID}/membros/operador`), { perfil: "OPERADOR", ativo: true });
    await setDoc(doc(db, `propriedades/${PID}/membros/consulta`), { perfil: "CONSULTA", ativo: true });
    await setDoc(doc(db, `propriedades/${PID}/membros/inativo`), { perfil: "ADMIN", ativo: false });
    await setDoc(doc(db, `propriedades/${OUTRA}/membros/estranho`), { perfil: "ADMIN", ativo: true });
    await setDoc(doc(db, `propriedades/${PID}/animais/boi-1`), { brinco: "A1", situacao: "ATIVO" });
    await setDoc(doc(db, `propriedades/${PID}/pesagens/${UUID}`), { animalId: "boi-1", pesoG: 300000, estado: "VALIDA" });
    await setDoc(doc(db, `propriedades/${PID}/auditoria/r1`), { acao: "CRIAR" });
  });
});

const db = (uid: string | null) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());

function pesagem(uid: string, extra: Record<string, unknown> = {}) {
  return {
    animalId: "boi-1",
    pesoG: 356000,
    dataHoraPesagem: Timestamp.fromDate(new Date("2026-10-28T09:15:00-03:00")),
    fuso: "America/Sao_Paulo",
    observacao: "Pesagem de rotina",
    estado: "RECEBIDA",
    criadoPor: uid,
    criadoEm: serverTimestamp(),
    ...extra,
  };
}

const novoId = () => crypto.randomUUID();

describe("CA-14: usuário sem vínculo não lê nem altera dados da propriedade", () => {
  it("anônimo não lê", async () => {
    await assertFails(getDoc(doc(db(null), `propriedades/${PID}/animais/boi-1`)));
  });
  it("membro de outra propriedade não lê nem cria pesagem", async () => {
    await assertFails(getDoc(doc(db("estranho"), `propriedades/${PID}/animais/boi-1`)));
    await assertFails(getDoc(doc(db("estranho"), `propriedades/${PID}/pesagens/${UUID}`)));
    await assertFails(setDoc(doc(db("estranho"), `propriedades/${PID}/pesagens/${novoId()}`), pesagem("estranho")));
  });
  it("membro inativo não lê nem cria", async () => {
    await assertFails(getDoc(doc(db("inativo"), `propriedades/${PID}`)));
    await assertFails(setDoc(doc(db("inativo"), `propriedades/${PID}/pesagens/${novoId()}`), pesagem("inativo")));
  });
});

describe("leitura por perfil", () => {
  it.each(["admin", "operador", "consulta"])("%s lê animais, pesagens e membros", async (uid) => {
    await assertSucceeds(getDoc(doc(db(uid), `propriedades/${PID}/animais/boi-1`)));
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
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `propriedades/${PID}/membros/operador`), { uid: "operador", perfil: "OPERADOR", ativo: true });
      await setDoc(doc(ctx.firestore(), `propriedades/${PID}/membros/admin`), { uid: "admin", perfil: "ADMIN", ativo: true });
    });
    const q = (uid: string) => query(collectionGroup(db(uid), "membros"), where("uid", "==", uid));
    await assertSucceeds(getDocs(q("operador")));
    await assertSucceeds(getDocs(q("estranho")));
    await assertFails(getDocs(query(collectionGroup(db("estranho"), "membros"), where("uid", "==", "admin"))));
  });
});

describe("criação de pesagem (RF-07, RF-14)", () => {
  it("OPERADOR e ADMIN criam pesagem válida", async () => {
    await assertSucceeds(setDoc(doc(db("operador"), `propriedades/${PID}/pesagens/${novoId()}`), pesagem("operador")));
    await assertSucceeds(setDoc(doc(db("admin"), `propriedades/${PID}/pesagens/${novoId()}`), pesagem("admin")));
  });
  it("observação é opcional", async () => {
    const { observacao: _, ...semObs } = pesagem("operador");
    await assertSucceeds(setDoc(doc(db("operador"), `propriedades/${PID}/pesagens/${novoId()}`), semObs));
  });
  it("CONSULTA não cria", async () => {
    await assertFails(setDoc(doc(db("consulta"), `propriedades/${PID}/pesagens/${novoId()}`), pesagem("consulta")));
  });
  it("não aceita estado diferente de RECEBIDA", async () => {
    await assertFails(
      setDoc(doc(db("operador"), `propriedades/${PID}/pesagens/${novoId()}`), pesagem("operador", { estado: "VALIDA" })),
    );
  });
  it("não aceita registrar em nome de outro usuário", async () => {
    await assertFails(setDoc(doc(db("operador"), `propriedades/${PID}/pesagens/${novoId()}`), pesagem("admin")));
  });
  it("não aceita campos calculados pelo servidor", async () => {
    await assertFails(
      setDoc(doc(db("operador"), `propriedades/${PID}/pesagens/${novoId()}`), pesagem("operador", { gmdKgDia: 1 })),
    );
  });
  it("não aceita peso fracionário (o peso é inteiro em gramas)", async () => {
    await assertFails(
      setDoc(doc(db("operador"), `propriedades/${PID}/pesagens/${novoId()}`), pesagem("operador", { pesoG: 356.5 })),
    );
  });
  it("não aceita criadoEm escolhido pelo cliente", async () => {
    await assertFails(
      setDoc(
        doc(db("operador"), `propriedades/${PID}/pesagens/${novoId()}`),
        pesagem("operador", { criadoEm: Timestamp.fromDate(new Date("2020-01-01")) }),
      ),
    );
  });
  it("exige UUID como ID do documento", async () => {
    await assertFails(setDoc(doc(db("operador"), `propriedades/${PID}/pesagens/qualquer`), pesagem("operador")));
  });
});

describe("RN-06/RF-09: pesagem é histórica; cliente não altera nem apaga", () => {
  it.each(["admin", "operador"])("%s não altera nem apaga", async (uid) => {
    await assertFails(updateDoc(doc(db(uid), `propriedades/${PID}/pesagens/${UUID}`), { pesoG: 1 }));
    await assertFails(deleteDoc(doc(db(uid), `propriedades/${PID}/pesagens/${UUID}`)));
  });
  it("reenvio do mesmo UUID não sobrescreve pesagem existente (RN-13)", async () => {
    await assertFails(setDoc(doc(db("operador"), `propriedades/${PID}/pesagens/${UUID}`), pesagem("operador")));
  });
});

describe("dados mantidos só pelo servidor", () => {
  it("ninguém escreve animais, brincos, membros, contadores ou auditoria pelo app", async () => {
    const admin = db("admin");
    await assertFails(setDoc(doc(admin, `propriedades/${PID}/animais/boi-2`), { brinco: "B2", situacao: "ATIVO" }));
    await assertFails(updateDoc(doc(admin, `propriedades/${PID}/animais/boi-1`), { situacao: "VENDIDO" }));
    await assertFails(setDoc(doc(admin, `propriedades/${PID}/brincos/B2`), { animalId: "boi-2" }));
    await assertFails(setDoc(doc(admin, `propriedades/${PID}/membros/novo`), { perfil: "ADMIN", ativo: true }));
    await assertFails(setDoc(doc(admin, `propriedades/${PID}/contadores/animais`), { proximo: 1 }));
    await assertFails(setDoc(doc(admin, `propriedades/${PID}/auditoria/r2`), { acao: "X" }));
  });
});

describe("categorias e propriedade", () => {
  it("ADMIN cria e edita categoria", async () => {
    await assertSucceeds(setDoc(doc(db("admin"), `propriedades/${PID}/categorias/c1`), { nome: "Garrote", ativo: true }));
  });
  it("OPERADOR não cria categoria", async () => {
    await assertFails(setDoc(doc(db("operador"), `propriedades/${PID}/categorias/c1`), { nome: "Garrote", ativo: true }));
  });
  it("RF-02: ADMIN edita o nome, mas não campos fora da lista", async () => {
    await assertSucceeds(updateDoc(doc(db("admin"), `propriedades/${PID}`), { nome: "Fazenda Nova" }));
    await assertFails(updateDoc(doc(db("admin"), `propriedades/${PID}`), { donoId: "x" }));
    await assertFails(updateDoc(doc(db("operador"), `propriedades/${PID}`), { nome: "Fazenda Nova" }));
  });
});
