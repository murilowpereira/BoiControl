import { FieldValue, Timestamp, type DocumentReference, type Firestore, type Transaction } from "firebase-admin/firestore";
import {
  caminhos,
  calcularSerie,
  pesoGValido,
  resumirAnimal,
  TOLERANCIA_FUTURO_MS,
  type MotivoRejeicao,
  type PesagemBase,
} from "@boicontrol/core";
import { auditar } from "./auditoria.js";
import { exigirPerfil, exigirTexto } from "./acesso.js";
import { ErroNegocio } from "./erros.js";

const FUSO_PADRAO = "America/Sao_Paulo";

type DadosPesagem = {
  animalId: string;
  pesoG: number;
  dataHoraPesagem: Timestamp;
  criadoEm: Timestamp | null;
  estado: string;
  variacaoG?: number | null;
  diasPeriodo?: number | null;
  gmdKgDia?: number | null;
};

function validarPesagem(
  p: Pick<DadosPesagem, "pesoG" | "dataHoraPesagem">,
  animal: FirebaseFirestore.DocumentData | undefined,
  agora: Date,
): MotivoRejeicao | null {
  if (!animal) return "ANIMAL_INEXISTENTE";
  if (animal.situacao !== "ATIVO") return "ANIMAL_INATIVO";
  if (!pesoGValido(p.pesoG)) return "PESO_INVALIDO";
  if (!(p.dataHoraPesagem instanceof Timestamp)) return "DATA_INVALIDA";
  if (p.dataHoraPesagem.toMillis() > agora.getTime() + TOLERANCIA_FUTURO_MS) return "DATA_NO_FUTURO";
  return null;
}

async function lerFuso(db: Firestore, tx: Transaction, pid: string): Promise<string> {
  const prop = await tx.get(db.doc(caminhos.propriedade(pid)));
  const fuso = prop.get("fuso");
  return typeof fuso === "string" && fuso ? fuso : FUSO_PADRAO;
}

/**
 * Recalcula variação e GMD de todas as pesagens válidas do animal e o resumo dele.
 * `alteracoes` sobrepõe pesagens que a transação ainda vai gravar (lidas antes, escritas aqui).
 * Deve ser chamada depois de todas as leituras da transação, exceto as que ela própria faz.
 */
async function lerSerieValida(
  db: Firestore,
  tx: Transaction,
  pid: string,
  animalId: string,
): Promise<Map<string, { ref: DocumentReference; dados: DadosPesagem }>> {
  const q = db.collection(caminhos.pesagens(pid)).where("animalId", "==", animalId).where("estado", "==", "VALIDA");
  const snap = await tx.get(q);
  const mapa = new Map<string, { ref: DocumentReference; dados: DadosPesagem }>();
  for (const d of snap.docs) mapa.set(d.id, { ref: d.ref, dados: d.data() as DadosPesagem });
  return mapa;
}

function gravarSerie(
  db: Firestore,
  tx: Transaction,
  pid: string,
  animalId: string,
  fuso: string,
  serieAtual: Map<string, { ref: DocumentReference; dados: DadosPesagem }>,
  extras: Record<string, Record<string, unknown>> = {},
): void {
  const base: PesagemBase[] = [...serieAtual.entries()].map(([id, { dados }]) => ({
    id,
    pesoG: dados.pesoG,
    dataHoraPesagem: dados.dataHoraPesagem.toDate(),
    criadoEm: (dados.criadoEm ?? dados.dataHoraPesagem).toDate(),
  }));
  const serie = calcularSerie(base, fuso);
  for (const s of serie) {
    const { ref, dados } = serieAtual.get(s.id)!;
    const extra = extras[s.id];
    const mudou =
      dados.variacaoG !== s.variacaoG || dados.diasPeriodo !== s.diasPeriodo || dados.gmdKgDia !== s.gmdKgDia;
    if (mudou || extra) {
      tx.update(ref, { variacaoG: s.variacaoG, diasPeriodo: s.diasPeriodo, gmdKgDia: s.gmdKgDia, ...(extra as FirebaseFirestore.UpdateData<DadosPesagem>) });
    }
  }
  for (const [id, extra] of Object.entries(extras)) {
    if (!serieAtual.has(id)) tx.update(db.doc(caminhos.pesagem(pid, id)), extra as FirebaseFirestore.UpdateData<DadosPesagem>);
  }
  const r = resumirAnimal(serie);
  tx.update(db.doc(caminhos.animal(pid, animalId)), {
    resumo: {
      pesoAtualG: r.pesoAtualG,
      dataUltimaPesagem: r.dataUltimaPesagem ? Timestamp.fromDate(r.dataUltimaPesagem) : null,
      gmdUltimoKgDia: r.gmdUltimoKgDia,
      totalPesagens: r.totalPesagens,
    },
  });
}

export type ResultadoProcessamento = "VALIDA" | "REJEITADA" | "IGNORADA";

/**
 * Processa uma pesagem recém-criada pelo app (seção 3 do design).
 * Idempotente: só age se o estado ainda for RECEBIDA.
 */
export async function processarPesagem(
  db: Firestore,
  pid: string,
  pesagemId: string,
  agora: () => Date = () => new Date(),
): Promise<ResultadoProcessamento> {
  return db.runTransaction(async (tx) => {
    const ref = db.doc(caminhos.pesagem(pid, pesagemId));
    const snap = await tx.get(ref);
    const p = snap.data() as DadosPesagem | undefined;
    if (!p || p.estado !== "RECEBIDA") return "IGNORADA";

    const animalSnap = typeof p.animalId === "string" && p.animalId ? await tx.get(db.doc(caminhos.animal(pid, p.animalId))) : null;
    const motivo = validarPesagem(p, animalSnap?.data(), agora());
    const processadoEm = FieldValue.serverTimestamp();

    if (motivo) {
      tx.update(ref, { estado: "REJEITADA", motivo, processadoEm });
      return "REJEITADA";
    }

    const fuso = await lerFuso(db, tx, pid);
    const serie = await lerSerieValida(db, tx, pid, p.animalId);
    serie.set(pesagemId, { ref, dados: p });
    gravarSerie(db, tx, pid, p.animalId, fuso, serie, {
      [pesagemId]: { estado: "VALIDA", motivo: null, processadoEm },
    });
    return "VALIDA";
  });
}

export interface PedidoCorrecao {
  pid: string;
  pesagemId: string;
  motivo: string;
  pesoG?: number;
  dataHoraPesagem?: string;
  anular?: boolean;
}

/**
 * RF-09 / RN-11: correção ou anulação por ADMIN, com motivo obrigatório e auditoria
 * com valores anteriores e novos. Serve também para resolver pesagens REJEITADAS.
 */
export async function corrigirPesagem(db: Firestore, uid: string | undefined, pedido: PedidoCorrecao, agora = new Date()) {
  const motivo = exigirTexto(pedido.motivo, "motivo", 500);
  return db.runTransaction(async (tx) => {
    await exigirPerfil(db, tx, pedido.pid, uid, ["ADMIN"]);
    const ref = db.doc(caminhos.pesagem(pedido.pid, pedido.pesagemId));
    const snap = await tx.get(ref);
    const p = snap.data() as DadosPesagem | undefined;
    if (!p) throw new ErroNegocio("NAO_ENCONTRADO", "Pesagem não encontrada.");
    if (p.estado === "ANULADA" || p.estado === "RECEBIDA") {
      throw new ErroNegocio("ARGUMENTO_INVALIDO", "Esta pesagem não pode ser corrigida agora.");
    }

    const animalSnap = await tx.get(db.doc(caminhos.animal(pedido.pid, p.animalId)));
    const fuso = await lerFuso(db, tx, pedido.pid);
    const serie = await lerSerieValida(db, tx, pedido.pid, p.animalId);

    const antes = { estado: p.estado, pesoG: p.pesoG, dataHoraPesagem: p.dataHoraPesagem.toDate().toISOString() };
    let novo: Record<string, unknown>;

    if (pedido.anular) {
      novo = { estado: "ANULADA", motivo: null, motivoCorrecao: motivo };
      serie.delete(pedido.pesagemId);
    } else {
      const pesoG = pedido.pesoG ?? p.pesoG;
      let dataHoraPesagem = p.dataHoraPesagem;
      if (pedido.dataHoraPesagem !== undefined) {
        const d = new Date(pedido.dataHoraPesagem);
        if (Number.isNaN(d.getTime())) throw new ErroNegocio("ARGUMENTO_INVALIDO", "Data inválida.");
        dataHoraPesagem = Timestamp.fromDate(d);
      }
      const rejeicao = validarPesagem({ pesoG, dataHoraPesagem }, animalSnap.data(), agora);
      if (rejeicao) throw new ErroNegocio("ARGUMENTO_INVALIDO", `Correção inválida: ${rejeicao}.`);
      novo = { estado: "VALIDA", motivo: null, pesoG, dataHoraPesagem, motivoCorrecao: motivo };
      serie.set(pedido.pesagemId, { ref, dados: { ...p, pesoG, dataHoraPesagem } });
    }

    gravarSerie(db, tx, pedido.pid, p.animalId, fuso, serie, {
      [pedido.pesagemId]: { ...novo, corrigidoPor: uid, corrigidoEm: FieldValue.serverTimestamp() },
    });
    auditar(db, tx, pedido.pid, {
      usuarioId: uid!,
      entidade: "pesagem",
      registroId: pedido.pesagemId,
      acao: pedido.anular ? "ANULAR_PESAGEM" : "CORRIGIR_PESAGEM",
      motivo,
      antes,
      depois: {
        estado: novo.estado,
        pesoG: novo.pesoG ?? p.pesoG,
        dataHoraPesagem: ((novo.dataHoraPesagem as Timestamp | undefined) ?? p.dataHoraPesagem).toDate().toISOString(),
      },
    });
    return { estado: novo.estado as string };
  });
}
