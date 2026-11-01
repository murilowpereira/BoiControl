import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

const env = import.meta.env;
const usarEmuladores = env.VITE_USAR_EMULADORES === "true";

export const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || "demo-key",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID || "demo-boicontrol",
  appId: env.VITE_FIREBASE_APP_ID,
});

if (!usarEmuladores && env.VITE_APPCHECK_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(env.VITE_APPCHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth = getAuth(app);

/** Cache persistente no IndexedDB: consulta offline e fila de pesagens (RF-13, RF-14). */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const functions = getFunctions(app, "southamerica-east1");

if (usarEmuladores) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

export const chamar = {
  criarAnimal: httpsCallable<Record<string, unknown>, { id: string; codigoInterno: string }>(functions, "criarAnimal"),
  editarAnimal: httpsCallable<Record<string, unknown>, { alterado: boolean }>(functions, "editarAnimal"),
  alterarSituacaoAnimal: httpsCallable<Record<string, unknown>, { alterado: boolean }>(functions, "alterarSituacaoAnimal"),
  corrigirPesagem: httpsCallable<Record<string, unknown>, { estado: string }>(functions, "corrigirPesagem"),
};

/** Mensagem compreensível para erros de funções chamáveis (RF-16). */
export function mensagemDeErro(e: unknown): string {
  const err = e as { code?: string; message?: string };
  if (!navigator.onLine || err?.code === "functions/unavailable") {
    return "Sem conexão. Esta operação precisa de internet.";
  }
  if (err?.code?.startsWith("functions/") && err.code !== "functions/internal" && err.message) {
    return err.message.replace(/\s*\[\d+\]$/, "");
  }
  return "Não foi possível concluir. Tente novamente.";
}
