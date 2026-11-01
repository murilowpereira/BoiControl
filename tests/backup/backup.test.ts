/** CA-16: a restauração recupera exatamente os dados do backup. */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { exportarTudo, importarTudo } from "../../scripts/lib/backup.ts";

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Rode via npm run test:backup (usa o emulador).");
const PROJETO = "demo-boicontrol";
if (!getApps().length) initializeApp({ projectId: PROJETO });
const db = getFirestore();

async function limpar() {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJETO}/databases/(default)/documents`, {
    method: "DELETE",
  });
}

describe("backup e restauração", () => {
  it("exporta tudo, inclusive subcoleções e tipos, e restaura igual", async () => {
    await limpar();
    const data = new Timestamp(1_791_000_000, 123_000_000);
    await db.doc("propriedades/f1").set({ nome: "Fazenda", fuso: "America/Sao_Paulo" });
    await db.doc("propriedades/f1/animais/a1").set({ brinco: "A1", codigoNumero: 1, situacaoDesde: data, nome: null, tags: ["x", 2] });
    await db.doc("propriedades/f1/pesagens/p1").set({ animalId: "a1", pesoG: 356000, dataHoraPesagem: data, ref: db.doc("propriedades/f1/animais/a1") });
    await db.doc("propriedades/f1/auditoria/pesagem_p1_v1").set({ antes: { pesoG: 365000, dataHoraPesagem: data }, depois: { pesoG: 356000 } });
    // Documento só com subcoleção (pai "vazio").
    await db.doc("propriedades/f2/membros/u1").set({ uid: "u1", perfil: "ADMIN", ativo: true });

    const backup = await exportarTudo(db, PROJETO);
    expect(backup.totalDocumentos).toBe(5);
    const json = JSON.parse(JSON.stringify(backup));

    await limpar();
    expect((await db.doc("propriedades/f1/pesagens/p1").get()).exists).toBe(false);

    expect(await importarTudo(db, json)).toBe(5);
    const p1 = (await db.doc("propriedades/f1/pesagens/p1").get()).data()!;
    expect(p1.pesoG).toBe(356000);
    expect(p1.dataHoraPesagem.isEqual(data)).toBe(true);
    expect(p1.ref.path).toBe("propriedades/f1/animais/a1");
    expect((await db.doc("propriedades/f1/animais/a1").get()).data()).toMatchObject({ nome: null, tags: ["x", 2] });
    expect((await db.doc("propriedades/f2/membros/u1").get()).data()).toEqual({ uid: "u1", perfil: "ADMIN", ativo: true });

    const segundo = await exportarTudo(db, PROJETO);
    expect(segundo.documentos).toEqual(backup.documentos);
  });

  it("recusa arquivo incompleto", async () => {
    await expect(
      importarTudo(db, { formato: "boicontrol-backup", versao: 1, geradoEm: "", projeto: "", totalDocumentos: 3, documentos: [] }),
    ).rejects.toThrow("incompleto");
  });
});
