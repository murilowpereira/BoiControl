/**
 * Cria (ou reaproveita) um usuário e o vincula a uma propriedade com um perfil.
 * Também desativa um vínculo existente com --desativar (conta inativa não acessa: RF-01).
 *
 * Uso: GOOGLE_APPLICATION_CREDENTIALS=chave.json npx tsx scripts/adicionar-membro.ts \
 *        --projeto <id> --propriedade <id> --email pessoa@exemplo.com --senha 'senha-inicial' \
 *        --nome "Nome" --perfil OPERADOR
 *      Sem --senha, a pessoa entra com "Entrar com Google" usando esse e-mail.
 *      ... --email pessoa@exemplo.com --desativar
 */
import { parseArgs } from "node:util";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const PERFIS = ["ADMIN", "OPERADOR", "CONSULTA"];
const { values: a } = parseArgs({
  options: {
    projeto: { type: "string" },
    propriedade: { type: "string" },
    email: { type: "string" },
    senha: { type: "string" },
    nome: { type: "string" },
    perfil: { type: "string", default: "OPERADOR" },
    desativar: { type: "boolean", default: false },
  },
});
for (const k of ["projeto", "propriedade", "email"] as const) if (!a[k]) throw new Error(`Informe --${k}`);
if (!PERFIS.includes(a.perfil!)) throw new Error(`--perfil deve ser ${PERFIS.join(", ")}`);

initializeApp({ projectId: a.projeto });
const auth = getAuth();
const db = getFirestore();
const membros = db.collection(`propriedades/${a.propriedade}/membros`);
if (!(await db.doc(`propriedades/${a.propriedade}`).get()).exists) throw new Error("Propriedade não encontrada.");

if (a.desativar) {
  const u = await auth.getUserByEmail(a.email!);
  await membros.doc(u.uid).update({ ativo: false });
  await auth.updateUser(u.uid, { disabled: true });
  await auth.revokeRefreshTokens(u.uid);
  console.log(`${a.email} desativado em ${a.propriedade}.`);
  process.exit(0);
}

let usuario = await auth.getUserByEmail(a.email!).catch(() => null);
if (!usuario) {
  if (a.senha !== undefined && a.senha.length < 8) throw new Error("A --senha precisa ter pelo menos 8 caracteres.");
  usuario = await auth.createUser({
    email: a.email!,
    ...(a.senha ? { password: a.senha } : {}),
    displayName: a.nome,
    emailVerified: !a.senha,
  });
}
await membros.doc(usuario.uid).set({ uid: usuario.uid, nome: a.nome ?? usuario.displayName ?? a.email, email: a.email, perfil: a.perfil, ativo: true });
console.log(`${a.email} vinculado a ${a.propriedade} como ${a.perfil}.`);
