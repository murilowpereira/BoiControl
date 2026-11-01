import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { ErroOperacao } from "./operacoes";

const env = import.meta.env;
const usarEmuladores = env.VITE_USAR_EMULADORES === "true";

export const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || "demo-key",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID || "demo-boicontrol",
  appId: env.VITE_FIREBASE_APP_ID,
});

// App Check com reCAPTCHA v3, disponível no plano Spark.
if (!usarEmuladores && env.VITE_APPCHECK_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(env.VITE_APPCHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth = getAuth(app);

/** Cache persistente no IndexedDB: consulta offline e fila de pesagens (RF-13, RF-14). */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (usarEmuladores) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

/** Mensagem compreensível para falhas de gravação (RF-16), sem detalhes internos. */
export function mensagemDeErro(e: unknown): string {
  if (e instanceof ErroOperacao) return e.message;
  const code = (e as { code?: string })?.code;
  if (!navigator.onLine || code === "unavailable" || code === "failed-precondition") {
    return "Sem conexão. Esta operação precisa de internet.";
  }
  if (code === "permission-denied") return "Você não tem permissão para esta operação.";
  if (code === "aborted") return "Outra pessoa alterou este registro ao mesmo tempo. Tente novamente.";
  return "Não foi possível concluir. Tente novamente.";
}
