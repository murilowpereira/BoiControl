/**
 * Implantação inicial (spec 3: pode haver um único ADMIN): cria a propriedade,
 * o usuário administrador no Auth, o vínculo e as categorias iniciais.
 *
 * Emulador:  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *            npx tsx scripts/criar-propriedade.ts --projeto demo-boicontrol ...
 * Produção:  GOOGLE_APPLICATION_CREDENTIALS=chave.json npx tsx scripts/criar-propriedade.ts --projeto <id> ...
 *
 * Opções: --projeto --id --nome --email --senha --nomeAdmin [--categorias "Bezerro,Garrote,Boi,Vaca,Novilha"]
 */
import { parseArgs } from "node:util";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const { values: a } = parseArgs({
  options: {
    projeto: { type: "string" },
    id: { type: "string" },
    nome: { type: "string" },
    email: { type: "string" },
    senha: { type: "string" },
    nomeAdmin: { type: "string", default: "Administrador" },
    fuso: { type: "string", default: "America/Sao_Paulo" },
    categorias: { type: "string", default: "Bezerro,Garrote,Boi,Novilha,Vaca" },
  },
});

for (const k of ["projeto", "id", "nome", "email", "senha"] as const) {
  if (!a[k]) throw new Error(`Informe --${k}`);
}

initializeApp({ projectId: a.projeto });
const auth = getAuth();
const db = getFirestore();

const usuario = await auth.getUserByEmail(a.email!).catch(() =>
  auth.createUser({ email: a.email!, password: a.senha!, displayName: a.nomeAdmin }),
);

const pid = a.id!;
const lote = db.batch();
lote.set(db.doc(`propriedades/${pid}`), { nome: a.nome, fuso: a.fuso, configuracoes: {}, criadoEm: FieldValue.serverTimestamp() }, { merge: true });
lote.set(db.doc(`propriedades/${pid}/membros/${usuario.uid}`), {
  uid: usuario.uid,
  nome: a.nomeAdmin,
  email: a.email,
  perfil: "ADMIN",
  ativo: true,
});
for (const nome of a.categorias!.split(",").map((s) => s.trim()).filter(Boolean)) {
  const id = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  lote.set(db.doc(`propriedades/${pid}/categorias/${id}`), { nome, ativo: true }, { merge: true });
}
await lote.commit();
console.log(`Propriedade ${pid} pronta. ADMIN: ${a.email} (uid ${usuario.uid}).`);
