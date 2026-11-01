import type { Firestore, Transaction } from "firebase-admin/firestore";
import { caminhos, type Perfil } from "@boicontrol/core";
import { ErroNegocio } from "./erros.js";

/** Confirma, dentro da transação, que o usuário é membro ativo com um dos perfis (RN-16). */
export async function exigirPerfil(
  db: Firestore,
  tx: Transaction,
  pid: string,
  uid: string | undefined,
  perfis: readonly Perfil[],
): Promise<void> {
  if (!uid) throw new ErroNegocio("NAO_AUTENTICADO", "Faça login para continuar.");
  const membro = await tx.get(db.doc(caminhos.membro(pid, uid)));
  const dados = membro.data();
  if (!dados || dados.ativo !== true || !perfis.includes(dados.perfil)) {
    throw new ErroNegocio("SEM_PERMISSAO", "Você não tem permissão para esta operação.");
  }
}

export function exigirTexto(valor: unknown, campo: string, max: number): string {
  if (typeof valor !== "string" || valor.trim() === "" || valor.length > max) {
    throw new ErroNegocio("ARGUMENTO_INVALIDO", `Campo "${campo}" inválido.`);
  }
  return valor.trim();
}
