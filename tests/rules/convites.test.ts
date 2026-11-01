import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  aceitarConvite,
  alterarMembro,
  cancelarConvite,
  convidarPessoa,
  renomearPropriedade,
} from "../../apps/web/src/operacoes";
import { criarAmbiente, dbDe, OUTRA, PID, semear } from "./ambiente";

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
/** Usuário que entrou com o Google: e-mail verificado no token. */
const google = (uid: string, email: string, verificado = true) =>
  env.authenticatedContext(uid, { email, email_verified: verificado }).firestore();
const usuario = (uid: string, email: string) => ({ uid, email, emailVerified: true });

describe("nome da fazenda", () => {
  it("ADMIN renomeia; operador não", async () => {
    await assertSucceeds(renomearPropriedade(db("admin"), PID, "Fazenda Santa Rita"));
    await assertFails(renomearPropriedade(db("operador"), PID, "Outra"));
  });
  it("não aceita nome vazio", async () => {
    await expect(renomearPropriedade(db("admin"), PID, "  ")).rejects.toMatchObject({ codigo: "NOME_OBRIGATORIO" });
    await assertFails(updateDoc(doc(db("admin"), `propriedades/${PID}`), { nome: "" }));
  });
});

describe("convite e primeiro acesso", () => {
  it("convidado entra com o Google e vira membro com o perfil do convite", async () => {
    await convidarPessoa(db("admin"), PID, "admin", { email: "Joao@Gmail.com", nome: "João", perfil: "OPERADOR" });
    const pid = await aceitarConvite(google("joao", "joao@gmail.com"), usuario("joao", "joao@gmail.com"));
    expect(pid).toBe(PID);
    await env.withSecurityRulesDisabled(async (ctx) => {
      const m = await getDoc(doc(ctx.firestore(), `propriedades/${PID}/membros/joao`));
      expect(m.data()).toMatchObject({ uid: "joao", perfil: "OPERADOR", ativo: true, email: "joao@gmail.com" });
      expect((await getDoc(doc(ctx.firestore(), `propriedades/${PID}/convites/joao@gmail.com`))).exists()).toBe(false);
    });
    // Já com acesso, lê os dados da fazenda.
    await assertSucceeds(getDoc(doc(google("joao", "joao@gmail.com"), `propriedades/${PID}`)));
  });

  it("sem convite, nada acontece", async () => {
    expect(await aceitarConvite(google("x", "x@gmail.com"), usuario("x", "x@gmail.com"))).toBeNull();
  });

  it("só ADMIN convida e vê convites", async () => {
    await assertFails(convidarPessoa(db("operador"), PID, "operador", { email: "a@gmail.com", nome: "A", perfil: "ADMIN" }));
    await assertFails(convidarPessoa(db("estranho"), PID, "estranho", { email: "a@gmail.com", nome: "A", perfil: "ADMIN" }));
    await convidarPessoa(db("admin"), PID, "admin", { email: "a@gmail.com", nome: "A", perfil: "CONSULTA" });
    await assertFails(getDoc(doc(db("operador"), `propriedades/${PID}/convites/a@gmail.com`)));
    await assertSucceeds(cancelarConvite(db("admin"), PID, "a@gmail.com"));
  });

  describe("gravações forjadas", () => {
    beforeEach(async () => {
      await convidarPessoa(db("admin"), PID, "admin", { email: "joao@gmail.com", nome: "João", perfil: "CONSULTA" });
    });
    const vinculo = (uid: string, extra: Record<string, unknown> = {}) => ({
      uid,
      nome: "João",
      email: "joao@gmail.com",
      perfil: "CONSULTA",
      ativo: true,
      ...extra,
    });
    async function aceitarForjado(fs: ReturnType<typeof google>, uid: string, extra: Record<string, unknown> = {}, apagar = true) {
      const lote = writeBatch(fs);
      lote.set(doc(fs, `propriedades/${PID}/membros/${uid}`), vinculo(uid, extra));
      if (apagar) lote.delete(doc(fs, `propriedades/${PID}/convites/joao@gmail.com`));
      return lote.commit();
    }

    it("convidado não escolhe um perfil maior que o do convite", async () => {
      await assertFails(aceitarForjado(google("joao", "joao@gmail.com"), "joao", { perfil: "ADMIN" }));
    });
    it("outra pessoa não usa o convite de João", async () => {
      await assertFails(aceitarForjado(google("maria", "maria@gmail.com"), "maria", { uid: "maria" }));
    });
    it("e-mail não verificado não aceita convite", async () => {
      await assertFails(aceitarForjado(google("joao", "joao@gmail.com", false), "joao"));
    });
    it("aceitar sem consumir o convite é recusado", async () => {
      await assertFails(aceitarForjado(google("joao", "joao@gmail.com"), "joao", {}, false));
    });
    it("ninguém cria vínculo sem convite", async () => {
      const fs = google("maria", "maria@gmail.com");
      await assertFails(
        setDoc(doc(fs, `propriedades/${PID}/membros/maria`), { uid: "maria", nome: "M", email: "maria@gmail.com", perfil: "ADMIN", ativo: true }),
      );
      await assertFails(
        setDoc(doc(db("estranho"), `propriedades/${PID}/membros/estranho`), { uid: "estranho", nome: "E", email: "e@x.com", perfil: "ADMIN", ativo: true }),
      );
    });
    it("convite de outra fazenda não dá acesso a esta", async () => {
      await convidarPessoa(db("estranho"), OUTRA, "estranho", { email: "maria@gmail.com", nome: "Maria", perfil: "ADMIN" });
      const fs = google("maria", "maria@gmail.com");
      const lote = writeBatch(fs);
      lote.set(doc(fs, `propriedades/${PID}/membros/maria`), { uid: "maria", nome: "Maria", email: "maria@gmail.com", perfil: "ADMIN", ativo: true });
      lote.delete(doc(fs, `propriedades/${OUTRA}/convites/maria@gmail.com`));
      await assertFails(lote.commit());
    });
    it("convite precisa vir do próprio ADMIN, com data do servidor", async () => {
      await assertFails(
        setDoc(doc(db("admin"), `propriedades/${PID}/convites/b@gmail.com`), {
          email: "b@gmail.com",
          nome: "B",
          perfil: "ADMIN",
          convidadoPor: "outro",
          convidadoEm: serverTimestamp(),
        }),
      );
      await assertFails(
        setDoc(doc(db("admin"), `propriedades/${PID}/convites/B@gmail.com`), {
          email: "B@gmail.com",
          nome: "B",
          perfil: "ADMIN",
          convidadoPor: "admin",
          convidadoEm: serverTimestamp(),
        }),
      );
    });
    it("convidado só apaga o próprio convite ao aceitar", async () => {
      await assertFails(deleteDoc(doc(google("joao", "joao@gmail.com"), `propriedades/${PID}/convites/joao@gmail.com`)));
    });
  });
});

describe("gestão de pessoas pelo ADMIN", () => {
  it("ADMIN muda perfil e tira o acesso de outra pessoa", async () => {
    await assertSucceeds(alterarMembro(db("admin"), PID, "operador", { perfil: "CONSULTA" }));
    await assertSucceeds(alterarMembro(db("admin"), PID, "consulta", { ativo: false }));
    await assertFails(getDoc(doc(db("consulta"), `propriedades/${PID}`)));
    await assertSucceeds(alterarMembro(db("admin"), PID, "consulta", { ativo: true }));
  });
  it("ADMIN não altera a si mesmo (não fica sem administrador)", async () => {
    await assertFails(alterarMembro(db("admin"), PID, "admin", { perfil: "CONSULTA" }));
    await assertFails(alterarMembro(db("admin"), PID, "admin", { ativo: false }));
  });
  it("não ADMIN não altera ninguém, nem o próprio perfil", async () => {
    await assertFails(alterarMembro(db("operador"), PID, "operador", { perfil: "ADMIN" }));
    await assertFails(alterarMembro(db("operador"), PID, "consulta", { ativo: false }));
    await assertFails(alterarMembro(db("estranho"), PID, "operador", { ativo: false }));
  });
  it("só perfil e ativo podem mudar, e ninguém apaga vínculo", async () => {
    await assertFails(updateDoc(doc(db("admin"), `propriedades/${PID}/membros/operador`), { uid: "admin" }));
    await assertFails(updateDoc(doc(db("admin"), `propriedades/${PID}/membros/operador`), { perfil: "DONO" }));
    await assertFails(deleteDoc(doc(db("admin"), `propriedades/${PID}/membros/operador`)));
  });
});
