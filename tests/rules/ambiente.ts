import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";

export const PID = "fazenda-1";
export const OUTRA = "fazenda-2";

export async function criarAmbiente(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: "demo-boicontrol",
    firestore: { rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8") },
  });
}

/** Propriedade com um membro de cada perfil, um inativo e um de outra propriedade. */
export async function semear(env: RulesTestEnvironment) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const membro = (pid: string, uid: string, perfil: string, ativo = true) =>
      setDoc(doc(db, `propriedades/${pid}/membros/${uid}`), { uid, perfil, ativo });
    await setDoc(doc(db, `propriedades/${PID}`), { nome: "Fazenda Boa Vista", fuso: "America/Sao_Paulo", configuracoes: {} });
    await setDoc(doc(db, `propriedades/${OUTRA}`), { nome: "Outra", configuracoes: {} });
    await membro(PID, "admin", "ADMIN");
    await membro(PID, "operador", "OPERADOR");
    await membro(PID, "consulta", "CONSULTA");
    await membro(PID, "inativo", "ADMIN", false);
    await membro(OUTRA, "estranho", "ADMIN");
    await setDoc(doc(db, `propriedades/${PID}/categorias/garrote`), { nome: "Garrote", ativo: true });
    await setDoc(doc(db, `propriedades/${PID}/categorias/antiga`), { nome: "Antiga", ativo: false });
  });
}

export const dbDe = (env: RulesTestEnvironment, uid: string | null) =>
  uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();

export function dadosPesagem(uid: string, animalId: string, extra: Record<string, unknown> = {}) {
  return {
    animalId,
    pesoG: 356000,
    dataHoraPesagem: Timestamp.fromDate(new Date("2026-10-28T09:15:00-03:00")),
    fuso: "America/Sao_Paulo",
    observacao: "Pesagem de rotina",
    estado: "VALIDA",
    versao: 0,
    criadoPor: uid,
    criadoEm: serverTimestamp(),
    ...extra,
  };
}
