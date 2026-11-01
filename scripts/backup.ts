/**
 * Gera um backup completo do Firestore em JSON (plano Spark: sem export gerenciado).
 * Uso: GOOGLE_APPLICATION_CREDENTIALS=chave.json npx tsx scripts/backup.ts --projeto <id> --saida backup.json
 * Roda todo dia pelo GitHub Actions (.github/workflows/backup.yml).
 */
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { exportarTudo } from "./lib/backup.ts";

const { values } = parseArgs({ options: { projeto: { type: "string" }, saida: { type: "string" } } });
if (!values.projeto || !values.saida) throw new Error("Informe --projeto e --saida");

initializeApp({ projectId: values.projeto });
const backup = await exportarTudo(getFirestore(), values.projeto);
await writeFile(values.saida, JSON.stringify(backup));
console.log(`Backup de ${values.projeto}: ${backup.totalDocumentos} documentos em ${values.saida}`);
