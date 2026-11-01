import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { caminhos } from "@boicontrol/core";

export interface EntradaAuditoria {
  usuarioId: string;
  entidade: "animal" | "pesagem" | "categoria" | "membro" | "propriedade";
  registroId: string;
  acao: string;
  motivo?: string | null;
  antes?: Record<string, unknown> | null;
  depois?: Record<string, unknown> | null;
}

/** RF-17 / seção 9.2: trilha imutável, gravada na mesma transação da alteração. */
export function auditar(db: Firestore, tx: Transaction, pid: string, e: EntradaAuditoria): void {
  tx.create(db.collection(caminhos.auditoria(pid)).doc(), {
    usuarioId: e.usuarioId,
    entidade: e.entidade,
    registroId: e.registroId,
    acao: e.acao,
    motivo: e.motivo ?? null,
    antes: e.antes ?? null,
    depois: e.depois ?? null,
    em: FieldValue.serverTimestamp(),
  });
}
