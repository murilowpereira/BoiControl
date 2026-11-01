import { doc, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import { caminhos } from "@boicontrol/core";
import { db } from "./firebase";

export interface NovaPesagem {
  pid: string;
  uid: string;
  animalId: string;
  pesoG: number;
  dataHora: Date;
  fuso: string;
  observacao: string;
}

/**
 * RF-07 / RF-14: grava a pesagem com UUID gerado no aparelho. Não espera o servidor:
 * offline, a promessa só resolve na sincronização, mas o registro já está no cache
 * persistente e aparece como pendente. Retorna o id para a interface.
 */
export function registrarPesagem(p: NovaPesagem, aoFalhar: (e: unknown) => void): string {
  const id = crypto.randomUUID();
  setDoc(doc(db, caminhos.pesagem(p.pid, id)), {
    animalId: p.animalId,
    pesoG: p.pesoG,
    dataHoraPesagem: Timestamp.fromDate(p.dataHora),
    fuso: p.fuso,
    observacao: p.observacao.trim() || null,
    estado: "RECEBIDA",
    criadoPor: p.uid,
    criadoEm: serverTimestamp(),
  }).catch(aoFalhar);
  return id;
}

/** Valor para <input type="datetime-local"> no horário local do aparelho. */
export function paraInputLocal(d: Date): string {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}
