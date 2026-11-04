/**
 * Cadastro de animal sem internet (gravação em lote enviada depois), contra as
 * regras reais no emulador: as mesmas garantias do cadastro com internet
 * (brinco único, código sequencial, auditoria) valem quando a fila chega.
 */
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { disableNetwork, doc, enableNetwork, getDoc, setDoc, waitForPendingWrites } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarAnimal, criarAnimalSemInternet, idAuditoria, type ContextoSemInternet } from "../../apps/web/src/operacoes";
import { criarAmbiente, dadosPesagem, dbDe, PID, semear } from "./ambiente";

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

const admin = () => dbDe(env, "admin");
const ctx = (ultimoCodigo = 0, brincos: string[] = []): ContextoSemInternet => ({
  ultimoCodigo,
  brincosEmUso: new Set(brincos),
  categoriasAtivas: new Set(["garrote"]),
  lotesAtivos: new Set(),
});

async function ler(caminho: string) {
  let dados: Record<string, unknown> | undefined;
  await env.withSecurityRulesDisabled(async (c) => {
    dados = (await getDoc(doc(c.firestore(), caminho))).data();
  });
  return dados;
}

describe("criarAnimalSemInternet", () => {
  it("a gravação em lote passa nas regras: código, brinco, auditoria e valor de compra", async () => {
    const r = criarAnimalSemInternet(admin(), PID, "admin", { brinco: "of-1", categoriaId: "garrote", sexo: "F", compra: { centavos: 285000, data: "2026-11-01" } }, ctx());
    await assertSucceeds(r.enviado);
    expect(r.codigoNumero).toBe(1);
    expect(await ler(`propriedades/${PID}/animais/${r.id}`)).toMatchObject({ brinco: "OF-1", codigoNumero: 1, versao: 0, situacao: "ATIVO" });
    expect(await ler(`propriedades/${PID}/brincos/OF-1`)).toEqual({ animalId: r.id });
    expect(await ler(`propriedades/${PID}/contadores/animais`)).toEqual({ ultimo: 1 });
    expect(await ler(`propriedades/${PID}/auditoria/${idAuditoria("animal", r.id, 0)}`)).toMatchObject({ acao: "CRIAR_ANIMAL" });
    expect(await ler(`propriedades/${PID}/valoresAnimais/${r.id}`)).toMatchObject({ compraCentavos: 285000 });
  });

  it("confere no aparelho brinco já usado, categoria inativa e mãe (só com internet)", () => {
    const db = admin();
    expect(() => criarAnimalSemInternet(db, PID, "admin", { brinco: " a1 ", categoriaId: "garrote", sexo: "M" }, ctx(1, ["A1"]))).toThrow(
      expect.objectContaining({ codigo: "BRINCO_DUPLICADO" }),
    );
    expect(() => criarAnimalSemInternet(db, PID, "admin", { brinco: "A2", categoriaId: "antiga", sexo: "M" }, ctx())).toThrow(
      expect.objectContaining({ codigo: "CATEGORIA_INVALIDA" }),
    );
    expect(() => criarAnimalSemInternet(db, PID, "admin", { brinco: "A3", categoriaId: "garrote", sexo: "M", maeId: "x" }, ctx())).toThrow(
      expect.objectContaining({ codigo: "NAO_PERMITIDO" }),
    );
  });

  it("código desatualizado (outro aparelho cadastrou antes) é recusado; o reenvio pela transação usa o próximo código e o mesmo ID", async () => {
    await criarAnimal(admin(), PID, "admin", { brinco: "OUTRO", categoriaId: "garrote", sexo: "M" });
    const r = criarAnimalSemInternet(admin(), PID, "admin", { brinco: "B1", categoriaId: "garrote", sexo: "M" }, ctx(0));
    await assertFails(r.enviado);
    expect(await ler(`propriedades/${PID}/brincos/B1`)).toBeUndefined();
    const de2 = await criarAnimal(admin(), PID, "admin", { brinco: "B1", categoriaId: "garrote", sexo: "M", id: r.id });
    expect(de2).toEqual({ id: r.id, codigoNumero: 2 });
  });

  it("brinco usado por outro aparelho no meio tempo é recusado, e o reenvio avisa BRINCO_DUPLICADO", async () => {
    await criarAnimal(admin(), PID, "admin", { brinco: "C1", categoriaId: "garrote", sexo: "M" });
    const r = criarAnimalSemInternet(admin(), PID, "admin", { brinco: "C1", categoriaId: "garrote", sexo: "M" }, ctx(1));
    await assertFails(r.enviado);
    await expect(criarAnimal(admin(), PID, "admin", { brinco: "C1", categoriaId: "garrote", sexo: "M", id: r.id })).rejects.toMatchObject({
      codigo: "BRINCO_DUPLICADO",
    });
    const comOutro = await criarAnimal(admin(), PID, "admin", { brinco: "C2", categoriaId: "garrote", sexo: "M", id: r.id });
    expect(comOutro.id).toBe(r.id);
  });

  it("reenviar um cadastro que já chegou não duplica nada", async () => {
    const r = criarAnimalSemInternet(admin(), PID, "admin", { brinco: "D1", categoriaId: "garrote", sexo: "M" }, ctx());
    await r.enviado;
    const de2 = await criarAnimal(admin(), PID, "admin", { brinco: "D1", categoriaId: "garrote", sexo: "M", id: r.id });
    expect(de2).toEqual({ id: r.id, codigoNumero: 1 });
    expect(await ler(`propriedades/${PID}/contadores/animais`)).toEqual({ ultimo: 1 });
  });

  it("sem rede de verdade: cadastro, segundo cadastro e pesagem ficam na fila e chegam na ordem quando a rede volta", async () => {
    const db = admin();
    await disableNetwork(db);
    const a = criarAnimalSemInternet(db, PID, "admin", { brinco: "E1", categoriaId: "garrote", sexo: "M" }, ctx(0));
    const b = criarAnimalSemInternet(db, PID, "admin", { brinco: "E2", categoriaId: "garrote", sexo: "F" }, ctx(1, ["E1"]));
    const pesagem = setDoc(doc(db, `propriedades/${PID}/pesagens/${crypto.randomUUID()}`), dadosPesagem("admin", a.id));
    // Offline, o animal já aparece no cache do próprio aparelho.
    expect((await getDoc(doc(db, `propriedades/${PID}/animais/${a.id}`))).get("brinco")).toBe("E1");
    await enableNetwork(db);
    await Promise.all([assertSucceeds(a.enviado), assertSucceeds(b.enviado), assertSucceeds(pesagem)]);
    await waitForPendingWrites(db);
    expect(await ler(`propriedades/${PID}/contadores/animais`)).toEqual({ ultimo: 2 });
    expect(await ler(`propriedades/${PID}/animais/${b.id}`)).toMatchObject({ codigoNumero: 2, brinco: "E2" });
  });

  it("OPERADOR não cadastra nem sem internet (o servidor recusa)", async () => {
    const r = criarAnimalSemInternet(dbDe(env, "operador"), PID, "operador", { brinco: "F1", categoriaId: "garrote", sexo: "M" }, ctx());
    await assertFails(r.enviado);
  });
});
