import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { caminhos, normalizarBrinco, SITUACOES } from "@boicontrol/core";
import type { SituacaoAnimal } from "@boicontrol/core";
import { auditar } from "./auditoria.js";
import { exigirPerfil, exigirTexto } from "./acesso.js";
import { ErroNegocio } from "./erros.js";

const SEXOS = ["M", "F"] as const;
type Sexo = (typeof SEXOS)[number];

export interface DadosAnimal {
  brinco: string;
  categoriaId: string;
  sexo: Sexo;
  nome?: string | null;
  dataNascimento?: string | null;
  observacao?: string | null;
}

function lerBrinco(valor: unknown): string {
  const r = normalizarBrinco(typeof valor === "string" ? valor : "");
  if (!r.ok) throw new ErroNegocio("ARGUMENTO_INVALIDO", "Brinco inválido. Use letras, números ou hífen.");
  return r.brinco;
}

function lerSexo(valor: unknown): Sexo {
  if (!SEXOS.includes(valor as Sexo)) throw new ErroNegocio("ARGUMENTO_INVALIDO", "Sexo deve ser M ou F.");
  return valor as Sexo;
}

function opcional(valor: unknown, campo: string, max: number): string | null {
  if (valor === undefined || valor === null || valor === "") return null;
  return exigirTexto(valor, campo, max);
}

function lerData(valor: unknown): string | null {
  if (valor === undefined || valor === null || valor === "") return null;
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor) || Number.isNaN(Date.parse(valor))) {
    throw new ErroNegocio("ARGUMENTO_INVALIDO", "Data de nascimento inválida.");
  }
  return valor;
}

function formatarCodigo(n: number): string {
  return `BC-${String(n).padStart(4, "0")}`;
}

/** RF-03 / RN-01 / RN-02: cria o animal com código interno e brinco único na mesma transação. */
export async function criarAnimal(db: Firestore, uid: string | undefined, pid: string, entrada: Partial<DadosAnimal>) {
  const brinco = lerBrinco(entrada.brinco);
  const sexo = lerSexo(entrada.sexo);
  const categoriaId = exigirTexto(entrada.categoriaId, "categoria", 64);
  const nome = opcional(entrada.nome, "nome", 80);
  const observacao = opcional(entrada.observacao, "observação", 500);
  const dataNascimento = lerData(entrada.dataNascimento);

  return db.runTransaction(async (tx) => {
    await exigirPerfil(db, tx, pid, uid, ["ADMIN"]);
    const brincoRef = db.doc(caminhos.brinco(pid, brinco));
    const contadorRef = db.doc(caminhos.contadorAnimais(pid));
    const [brincoSnap, categoriaSnap, contadorSnap] = await Promise.all([
      tx.get(brincoRef),
      tx.get(db.doc(`${caminhos.categorias(pid)}/${categoriaId}`)),
      tx.get(contadorRef),
    ]);
    if (brincoSnap.exists) throw new ErroNegocio("BRINCO_DUPLICADO", `Já existe um animal com o brinco ${brinco}.`);
    if (!categoriaSnap.exists || categoriaSnap.get("ativo") !== true) {
      throw new ErroNegocio("CATEGORIA_INVALIDA", "Categoria inexistente ou inativa.");
    }

    const numero = ((contadorSnap.get("ultimo") as number | undefined) ?? 0) + 1;
    const animalRef = db.collection(caminhos.animais(pid)).doc();
    const animal = {
      codigoInterno: formatarCodigo(numero),
      brinco,
      categoriaId,
      sexo,
      nome,
      dataNascimento,
      observacao,
      situacao: "ATIVO" as SituacaoAnimal,
      resumo: { pesoAtualG: null, dataUltimaPesagem: null, gmdUltimoKgDia: null, totalPesagens: 0 },
      criadoPor: uid,
      criadoEm: FieldValue.serverTimestamp(),
    };
    tx.set(contadorRef, { ultimo: numero });
    tx.create(brincoRef, { animalId: animalRef.id });
    tx.create(animalRef, animal);
    auditar(db, tx, pid, {
      usuarioId: uid!,
      entidade: "animal",
      registroId: animalRef.id,
      acao: "CRIAR_ANIMAL",
      depois: { codigoInterno: animal.codigoInterno, brinco, categoriaId, sexo },
    });
    return { id: animalRef.id, codigoInterno: animal.codigoInterno };
  });
}

/** RF-04: edita dados cadastrais; código interno nunca muda; troca de brinco mantém unicidade. */
export async function editarAnimal(
  db: Firestore,
  uid: string | undefined,
  pid: string,
  animalId: string,
  entrada: Partial<DadosAnimal>,
) {
  return db.runTransaction(async (tx) => {
    await exigirPerfil(db, tx, pid, uid, ["ADMIN"]);
    const animalRef = db.doc(caminhos.animal(pid, animalId));
    const snap = await tx.get(animalRef);
    const atual = snap.data();
    if (!atual) throw new ErroNegocio("NAO_ENCONTRADO", "Animal não encontrado.");

    const mudancas: Record<string, unknown> = {};
    if (entrada.brinco !== undefined) {
      const brinco = lerBrinco(entrada.brinco);
      if (brinco !== atual.brinco) {
        const novoRef = db.doc(caminhos.brinco(pid, brinco));
        if ((await tx.get(novoRef)).exists) {
          throw new ErroNegocio("BRINCO_DUPLICADO", `Já existe um animal com o brinco ${brinco}.`);
        }
        mudancas.brinco = brinco;
      }
    }
    if (entrada.categoriaId !== undefined && entrada.categoriaId !== atual.categoriaId) {
      const categoriaId = exigirTexto(entrada.categoriaId, "categoria", 64);
      const cat = await tx.get(db.doc(`${caminhos.categorias(pid)}/${categoriaId}`));
      if (!cat.exists || cat.get("ativo") !== true) {
        throw new ErroNegocio("CATEGORIA_INVALIDA", "Categoria inexistente ou inativa.");
      }
      mudancas.categoriaId = categoriaId;
    }
    if (entrada.sexo !== undefined && entrada.sexo !== atual.sexo) mudancas.sexo = lerSexo(entrada.sexo);
    if (entrada.nome !== undefined) mudancas.nome = opcional(entrada.nome, "nome", 80);
    if (entrada.observacao !== undefined) mudancas.observacao = opcional(entrada.observacao, "observação", 500);
    if (entrada.dataNascimento !== undefined) mudancas.dataNascimento = lerData(entrada.dataNascimento);

    for (const k of Object.keys(mudancas)) if (mudancas[k] === atual[k]) delete mudancas[k];
    if (Object.keys(mudancas).length === 0) return { alterado: false };

    if (mudancas.brinco) {
      tx.delete(db.doc(caminhos.brinco(pid, atual.brinco)));
      tx.create(db.doc(caminhos.brinco(pid, mudancas.brinco as string)), { animalId });
    }
    tx.update(animalRef, { ...mudancas, atualizadoPor: uid, atualizadoEm: FieldValue.serverTimestamp() });
    auditar(db, tx, pid, {
      usuarioId: uid!,
      entidade: "animal",
      registroId: animalId,
      acao: "EDITAR_ANIMAL",
      antes: Object.fromEntries(Object.keys(mudancas).map((k) => [k, atual[k] ?? null])),
      depois: mudancas,
    });
    return { alterado: true };
  });
}

/** RF-05 / RN-03: muda a situação sem apagar histórico. Inativo continua consultável. */
export async function alterarSituacaoAnimal(
  db: Firestore,
  uid: string | undefined,
  pid: string,
  animalId: string,
  situacao: unknown,
  motivo: unknown,
) {
  if (!SITUACOES.includes(situacao as SituacaoAnimal)) {
    throw new ErroNegocio("ARGUMENTO_INVALIDO", "Situação inválida.");
  }
  const motivoTexto = exigirTexto(motivo, "motivo", 500);
  return db.runTransaction(async (tx) => {
    await exigirPerfil(db, tx, pid, uid, ["ADMIN"]);
    const ref = db.doc(caminhos.animal(pid, animalId));
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ErroNegocio("NAO_ENCONTRADO", "Animal não encontrado.");
    const anterior = snap.get("situacao");
    if (anterior === situacao) return { alterado: false };
    tx.update(ref, { situacao, atualizadoPor: uid, atualizadoEm: FieldValue.serverTimestamp() });
    auditar(db, tx, pid, {
      usuarioId: uid!,
      entidade: "animal",
      registroId: animalId,
      acao: "ALTERAR_SITUACAO",
      motivo: motivoTexto,
      antes: { situacao: anterior },
      depois: { situacao },
    });
    return { alterado: true };
  });
}
