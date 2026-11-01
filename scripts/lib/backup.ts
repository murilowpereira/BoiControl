/**
 * Backup e restauração do Firestore sem recursos pagos (plano Spark).
 * Percorre todas as coleções e subcoleções e gera um JSON que preserva os
 * tipos do Firestore (data/hora, referência, bytes). RF-18 / CA-16.
 */
import {
  DocumentReference,
  GeoPoint,
  Timestamp,
  type CollectionReference,
  type DocumentData,
  type Firestore,
} from "firebase-admin/firestore";

export interface DocumentoBackup {
  caminho: string;
  dados: unknown;
}

export interface ArquivoBackup {
  formato: "boicontrol-backup";
  versao: 1;
  geradoEm: string;
  projeto: string;
  totalDocumentos: number;
  documentos: DocumentoBackup[];
}

function codificar(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (v instanceof Timestamp) return { __tipo: "timestamp", segundos: v.seconds, nanos: v.nanoseconds };
  if (v instanceof DocumentReference) return { __tipo: "referencia", caminho: v.path };
  if (v instanceof GeoPoint) return { __tipo: "geoponto", lat: v.latitude, lng: v.longitude };
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return { __tipo: "bytes", base64: Buffer.from(v).toString("base64") };
  if (Array.isArray(v)) return v.map(codificar);
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, codificar(x)]));
}

function decodificar(db: Firestore, v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => decodificar(db, x));
  const o = v as Record<string, unknown>;
  switch (o.__tipo) {
    case "timestamp":
      return new Timestamp(o.segundos as number, o.nanos as number);
    case "referencia":
      return db.doc(o.caminho as string);
    case "geoponto":
      return new GeoPoint(o.lat as number, o.lng as number);
    case "bytes":
      return Buffer.from(o.base64 as string, "base64");
  }
  return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, decodificar(db, x)]));
}

async function percorrer(colecoes: CollectionReference[], saida: DocumentoBackup[]): Promise<void> {
  for (const col of colecoes) {
    // listDocuments inclui documentos "vazios" que só existem como pais de subcoleções.
    for (const ref of await col.listDocuments()) {
      const snap = await ref.get();
      if (snap.exists) saida.push({ caminho: ref.path, dados: codificar(snap.data()) });
      await percorrer(await ref.listCollections(), saida);
    }
  }
}

export async function exportarTudo(db: Firestore, projeto: string): Promise<ArquivoBackup> {
  const documentos: DocumentoBackup[] = [];
  await percorrer(await db.listCollections(), documentos);
  documentos.sort((a, b) => a.caminho.localeCompare(b.caminho));
  return {
    formato: "boicontrol-backup",
    versao: 1,
    geradoEm: new Date().toISOString(),
    projeto,
    totalDocumentos: documentos.length,
    documentos,
  };
}

/** Grava todos os documentos do backup. Sobrescreve documentos de mesmo caminho. */
export async function importarTudo(db: Firestore, backup: ArquivoBackup): Promise<number> {
  if (backup.formato !== "boicontrol-backup" || backup.versao !== 1) throw new Error("Arquivo de backup não reconhecido.");
  if (backup.documentos.length !== backup.totalDocumentos) throw new Error("Backup incompleto: total de documentos não confere.");
  const escritor = db.bulkWriter();
  for (const d of backup.documentos) escritor.set(db.doc(d.caminho), decodificar(db, d.dados) as DocumentData);
  await escritor.close();
  return backup.documentos.length;
}
