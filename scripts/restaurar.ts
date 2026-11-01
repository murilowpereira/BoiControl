/**
 * Restaura um backup gerado por scripts/backup.ts.
 * Faça o teste de restauração em homologação antes (CA-16), nunca direto em produção.
 * Uso: GOOGLE_APPLICATION_CREDENTIALS=chave.json npx tsx scripts/restaurar.ts --projeto <id> --arquivo backup.json --confirmar
 */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { importarTudo, type ArquivoBackup } from "./lib/backup.ts";

const { values } = parseArgs({
  options: { projeto: { type: "string" }, arquivo: { type: "string" }, confirmar: { type: "boolean", default: false } },
});
if (!values.projeto || !values.arquivo) throw new Error("Informe --projeto e --arquivo");

const backup = JSON.parse(await readFile(values.arquivo, "utf8")) as ArquivoBackup;
console.log(`Backup de ${backup.projeto} gerado em ${backup.geradoEm}: ${backup.totalDocumentos} documentos.`);
if (!values.confirmar) {
  console.log(`Nada foi gravado. Para restaurar em ${values.projeto}, rode de novo com --confirmar.`);
  process.exit(0);
}
initializeApp({ projectId: values.projeto });
const n = await importarTudo(getFirestore(), backup);
console.log(`Restaurados ${n} documentos em ${values.projeto}.`);
