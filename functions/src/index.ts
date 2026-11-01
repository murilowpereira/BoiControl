import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import * as animais from "./dominio/animais.js";
import * as pesagens from "./dominio/pesagens.js";
import { ErroNegocio, type CodigoErro } from "./dominio/erros.js";

initializeApp();
const db = getFirestore();

setGlobalOptions({ region: "southamerica-east1", maxInstances: 5 });

const CODIGOS_HTTP: Record<CodigoErro, ConstructorParameters<typeof HttpsError>[0]> = {
  NAO_AUTENTICADO: "unauthenticated",
  SEM_PERMISSAO: "permission-denied",
  ARGUMENTO_INVALIDO: "invalid-argument",
  NAO_ENCONTRADO: "not-found",
  BRINCO_DUPLICADO: "already-exists",
  CATEGORIA_INVALIDA: "failed-precondition",
};

/** Converte erros de negócio em respostas compreensíveis, sem expor detalhes internos. */
function chamavel<T>(nome: string, fn: (req: CallableRequest<Record<string, unknown>>) => Promise<T>) {
  return onCall<Record<string, unknown>>({ enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true" }, async (req) => {
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof ErroNegocio) throw new HttpsError(CODIGOS_HTTP[e.codigo], e.message, { codigo: e.codigo });
      logger.error(`${nome} falhou`, { erro: e instanceof Error ? e.message : String(e) });
      throw new HttpsError("internal", "Não foi possível concluir a operação. Tente novamente.");
    }
  });
}

const texto = (v: unknown) => (typeof v === "string" ? v : "");

export const aoCriarPesagem = onDocumentCreated(
  { document: "propriedades/{pid}/pesagens/{pesagemId}", retry: true },
  async (evento) => {
    const { pid, pesagemId } = evento.params;
    const resultado = await pesagens.processarPesagem(db, pid, pesagemId);
    logger.info("pesagem processada", { pid, pesagemId, resultado });
  },
);

export const criarAnimal = chamavel("criarAnimal", (req) =>
  animais.criarAnimal(db, req.auth?.uid, texto(req.data.pid), req.data),
);

export const editarAnimal = chamavel("editarAnimal", (req) =>
  animais.editarAnimal(db, req.auth?.uid, texto(req.data.pid), texto(req.data.animalId), req.data),
);

export const alterarSituacaoAnimal = chamavel("alterarSituacaoAnimal", (req) =>
  animais.alterarSituacaoAnimal(db, req.auth?.uid, texto(req.data.pid), texto(req.data.animalId), req.data.situacao, req.data.motivo),
);

export const corrigirPesagem = chamavel("corrigirPesagem", (req) =>
  pesagens.corrigirPesagem(db, req.auth?.uid, {
    pid: texto(req.data.pid),
    pesagemId: texto(req.data.pesagemId),
    motivo: texto(req.data.motivo),
    pesoG: typeof req.data.pesoG === "number" ? req.data.pesoG : undefined,
    dataHoraPesagem: typeof req.data.dataHoraPesagem === "string" ? req.data.dataHoraPesagem : undefined,
    anular: req.data.anular === true,
  }),
);
