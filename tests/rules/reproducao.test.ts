import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc, waitForPendingWrites } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  criarAnimal,
  excluirReproducao,
  registrarDiagnostico,
  registrarPartoSemBezerro,
  registrarServico,
  type RegistroReproducao,
} from "../../apps/web/src/operacoes";
import { criarAmbiente, dbDe, PID, semear } from "./ambiente";

let env: RulesTestEnvironment;
let vacaId: string;
let garroteId: string;
const HOJE = "2026-11-04";
beforeAll(async () => {
  env = await criarAmbiente();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await semear(env);
  vacaId = (await criarAnimal(db("admin"), PID, "admin", { brinco: "VACA1", categoriaId: "garrote", sexo: "F" })).id;
  garroteId = (await criarAnimal(db("admin"), PID, "admin", { brinco: "G1", categoriaId: "garrote", sexo: "M" })).id;
});
const db = (uid: string) => dbDe(env, uid);
const falhar = (e: unknown) => {
  throw e;
};
const ler = async (caminho: string) => {
  let dados: Record<string, unknown> | undefined;
  await env.withSecurityRulesDisabled(async (ctx) => {
    dados = (await getDoc(doc(ctx.firestore(), caminho))).data();
  });
  return dados;
};
const caminho = (id: string) => `propriedades/${PID}/reproducoes/${id}`;

async function servico(uid = "operador", dataServico = "2026-01-10") {
  const banco = db(uid);
  const id = registrarServico(banco, PID, uid, { femeaId: vacaId, tipo: "IA", dataServico, reprodutor: "Nelore 123" }, HOJE, falhar);
  await waitForPendingWrites(banco);
  return { id, registro: (await ler(caminho(id))) as unknown as RegistroReproducao };
}

function bruto(uid: string, extra: Record<string, unknown> = {}) {
  return {
    femeaId: vacaId,
    tipo: "MONTA",
    dataServico: "2026-01-10",
    reprodutor: null,
    observacao: null,
    diagnostico: null,
    dataDiagnostico: null,
    dataParto: null,
    bezerroId: null,
    criadoPor: uid,
    criadoEm: serverTimestamp(),
    ...extra,
  };
}

describe("cobertura e inseminação", () => {
  it("operador registra; consulta não", async () => {
    const { registro } = await servico("operador");
    expect(registro).toMatchObject({ femeaId: vacaId, tipo: "IA", reprodutor: "Nelore 123", diagnostico: null, criadoPor: "operador" });
    await assertFails(setDoc(doc(db("consulta"), caminho(crypto.randomUUID())), bruto("consulta")));
    await assertSucceeds(getDoc(doc(db("consulta"), caminho(crypto.randomUUID()))));
  });
  it("só em fêmea, com ID UUID e sem parto já preenchido", async () => {
    await assertFails(setDoc(doc(db("admin"), caminho(crypto.randomUUID())), bruto("admin", { femeaId: garroteId })));
    await assertFails(setDoc(doc(db("admin"), caminho("abc")), bruto("admin")));
    await assertFails(
      setDoc(doc(db("admin"), caminho(crypto.randomUUID())), bruto("admin", { diagnostico: "PRENHE", dataDiagnostico: "2026-02-20", dataParto: "2026-10-20" })),
    );
    await assertFails(setDoc(doc(db("admin"), caminho(crypto.randomUUID())), bruto("admin", { tipo: "TE" })));
    await assertFails(setDoc(doc(db("admin"), caminho(crypto.randomUUID())), bruto("admin", { extra: 1 })));
  });
  it("o app recusa data futura antes de gravar", () => {
    expect(() =>
      registrarServico(db("admin"), PID, "admin", { femeaId: vacaId, tipo: "MONTA", dataServico: "2026-12-01" }, HOJE, falhar),
    ).toThrow(/futuro/);
  });
});

describe("diagnóstico", () => {
  it("operador marca prenhe e pode corrigir para vazia", async () => {
    const { id, registro } = await servico();
    const banco = db("operador");
    registrarDiagnostico(banco, PID, "operador", { ...registro, id }, "PRENHE", "2026-02-20", HOJE, falhar);
    await waitForPendingWrites(banco);
    expect(await ler(caminho(id))).toMatchObject({ diagnostico: "PRENHE", dataDiagnostico: "2026-02-20", atualizadoPor: "operador" });
    registrarDiagnostico(banco, PID, "operador", { ...registro, id }, "VAZIA", "2026-02-21", HOJE, falhar);
    await waitForPendingWrites(banco);
    expect((await ler(caminho(id)))?.diagnostico).toBe("VAZIA");
  });
  it("regras recusam diagnóstico antes da cobertura ou sem data", async () => {
    const { id } = await servico();
    const at = { atualizadoPor: "admin", atualizadoEm: serverTimestamp() };
    await assertFails(updateDoc(doc(db("admin"), caminho(id)), { diagnostico: "PRENHE", dataDiagnostico: "2026-01-01", ...at }));
    await assertFails(updateDoc(doc(db("admin"), caminho(id)), { diagnostico: "PRENHE", ...at }));
    await assertFails(updateDoc(doc(db("admin"), caminho(id)), { femeaId: garroteId, ...at }));
  });
});

describe("parto e bezerro", () => {
  it("ADMIN cadastra o bezerro ligado à mãe e ao parto, numa gravação só", async () => {
    const { id } = await servico();
    const bezerro = await criarAnimal(
      db("admin"),
      PID,
      "admin",
      { brinco: "B1", categoriaId: "garrote", sexo: "M", dataNascimento: "2026-10-20", maeId: vacaId },
      { reproducaoId: id, dataParto: "2026-10-20", hoje: HOJE },
    );
    expect(await ler(`propriedades/${PID}/animais/${bezerro.id}`)).toMatchObject({ maeId: vacaId, dataNascimento: "2026-10-20" });
    expect(await ler(caminho(id))).toMatchObject({ diagnostico: "PRENHE", dataDiagnostico: "2026-10-20", dataParto: "2026-10-20", bezerroId: bezerro.id });
  });
  it("não liga bezerro de outra mãe nem troca o bezerro depois", async () => {
    const { id } = await servico();
    const at = { atualizadoPor: "admin", atualizadoEm: serverTimestamp() };
    const parto = { diagnostico: "PRENHE", dataDiagnostico: "2026-02-20", dataParto: "2026-10-20", ...at };
    await assertFails(updateDoc(doc(db("admin"), caminho(id)), { ...parto, bezerroId: garroteId }));
    const b = await criarAnimal(db("admin"), PID, "admin", { brinco: "B2", categoriaId: "garrote", sexo: "F", maeId: vacaId }, { reproducaoId: id, dataParto: "2026-10-20", hoje: HOJE });
    const outro = await criarAnimal(db("admin"), PID, "admin", { brinco: "B3", categoriaId: "garrote", sexo: "F", maeId: vacaId });
    expect((await ler(caminho(id)))?.bezerroId).toBe(b.id);
    await assertFails(updateDoc(doc(db("admin"), caminho(id)), { bezerroId: outro.id, ...at }));
  });
  it("mãe precisa ser fêmea cadastrada", async () => {
    await expect(criarAnimal(db("admin"), PID, "admin", { brinco: "B4", categoriaId: "garrote", sexo: "M", maeId: garroteId })).rejects.toThrow(/fêmea/);
  });
  it("operador registra parto sem bezerro; bezerro só com o ADMIN", async () => {
    const { id, registro } = await servico();
    await expect(
      criarAnimal(db("operador"), PID, "operador", { brinco: "B5", categoriaId: "garrote", sexo: "M", maeId: vacaId }, { reproducaoId: id, dataParto: "2026-10-20", hoje: HOJE }),
    ).rejects.toBeTruthy();
    const banco = db("operador");
    registrarPartoSemBezerro(banco, PID, "operador", { ...registro, id }, "2026-10-20", HOJE, "Natimorto", falhar);
    await waitForPendingWrites(banco);
    expect(await ler(caminho(id))).toMatchObject({ dataParto: "2026-10-20", diagnostico: "PRENHE", bezerroId: null, observacao: "Natimorto" });
  });
  it("vazia não pode parir", async () => {
    const { id } = await servico();
    const at = { atualizadoPor: "admin", atualizadoEm: serverTimestamp() };
    await assertFails(updateDoc(doc(db("admin"), caminho(id)), { diagnostico: "VAZIA", dataDiagnostico: "2026-02-20", dataParto: "2026-10-20", ...at }));
  });
});

describe("exclusão", () => {
  it("só ADMIN apaga, e não se houver bezerro ligado", async () => {
    const a = await servico();
    await assertFails(deleteDoc(doc(db("operador"), caminho(a.id))));
    await assertSucceeds(excluirReproducao(db("admin"), PID, a.id));
    const b = await servico();
    await criarAnimal(db("admin"), PID, "admin", { brinco: "B6", categoriaId: "garrote", sexo: "M", maeId: vacaId }, { reproducaoId: b.id, dataParto: "2026-10-20", hoje: HOJE });
    await assertFails(excluirReproducao(db("admin"), PID, b.id));
  });
});

describe("maeId no animal", () => {
  it("não muda depois do cadastro", async () => {
    const b = await criarAnimal(db("admin"), PID, "admin", { brinco: "B7", categoriaId: "garrote", sexo: "M", maeId: vacaId });
    await assertFails(updateDoc(doc(db("admin"), `propriedades/${PID}/animais/${b.id}`), { maeId: null, versao: 1, atualizadoPor: "admin", atualizadoEm: serverTimestamp() }));
  });
});
