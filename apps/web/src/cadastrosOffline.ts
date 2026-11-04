/**
 * Cadastros de animal feitos sem internet.
 *
 * O Firestore guarda a gravação no aparelho e a envia sozinho quando a internet
 * volta. O que ele não faz é avisar quando o servidor recusa depois que o app
 * foi fechado: o animal some do cache sem aviso. Por isso cada cadastro feito
 * sem internet fica também aqui (no localStorage) até o servidor confirmar.
 *
 * Quando o servidor recusa (outro aparelho usou o mesmo código interno ou o
 * mesmo brinco no meio tempo), o app tenta de novo com internet, pela
 * transação, mantendo o mesmo ID. Só um brinco repetido de verdade volta para
 * o usuário decidir (trocar o brinco ou descartar). As pesagens feitas para o
 * animal enquanto ele esperava ficam guardadas junto e são reenviadas com ele,
 * com o mesmo ID (reenviar não duplica).
 */
import { useSyncExternalStore } from "react";
import { doc, getDocFromServer, waitForPendingWrites, type Firestore } from "firebase/firestore";
import { caminhos } from "@boicontrol/core";
import { criarAnimal, criarAnimalSemInternet, ErroOperacao, registrarPesagem, type ContextoSemInternet, type DadosAnimal } from "./operacoes";
import { recusadas, type PesagemRecusada } from "./recusadas";

export type EstadoCadastro = "AGUARDANDO" | "RECUSADO";

export interface CadastroOffline {
  id: string;
  pid: string;
  dados: Omit<DadosAnimal, "id" | "maeId">;
  codigoNumero: number;
  feitoEm: string;
  estado: EstadoCadastro;
  /** Por que o servidor não aceitou (só quando RECUSADO). */
  motivo?: string;
  /** Pesagens do animal feitas antes de o cadastro chegar ao servidor. */
  pesagens: PesagemRecusada[];
}

const CHAVE = "boicontrol:cadastrosOffline";
const ouvintes = new Set<() => void>();
let cache: CadastroOffline[] = ler();
/** Cadastros que este aparelho está conferindo agora (evita tratar duas vezes). */
const emConferencia = new Set<string>();

function ler(): CadastroOffline[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? "[]") as CadastroOffline[];
  } catch {
    return [];
  }
}

function gravar(lista: CadastroOffline[]) {
  cache = lista;
  try {
    localStorage.setItem(CHAVE, JSON.stringify(lista));
  } catch {
    /* sem armazenamento: a lista vale só enquanto o app estiver aberto */
  }
  ouvintes.forEach((o) => o());
}

const buscar = (id: string) => cache.find((c) => c.id === id);
const trocar = (id: string, mudar: (c: CadastroOffline) => CadastroOffline) =>
  gravar(cache.map((c) => (c.id === id ? mudar(c) : c)));
const remover = (id: string) => gravar(cache.filter((c) => c.id !== id));

export function useCadastrosOffline(): CadastroOffline[] {
  return useSyncExternalStore(
    (o) => {
      ouvintes.add(o);
      return () => ouvintes.delete(o);
    },
    () => cache,
  );
}

/** O animal foi cadastrado sem internet e o servidor ainda não aceitou. */
export const aguardaCadastro = (animalId: string) => buscar(animalId) !== undefined;

/**
 * Guarda uma pesagem feita para um animal que ainda não chegou ao servidor.
 * Devolve true quando a pesagem passa a ser deste cadastro: se o servidor
 * recusar a pesagem porque o animal ainda não existe, ela é reenviada junto
 * com o animal, e não vai para a lista de pesagens recusadas.
 */
export function anexarPesagem(p: PesagemRecusada): boolean {
  if (!buscar(p.animalId)) return false;
  trocar(p.animalId, (c) => ({ ...c, pesagens: [...c.pesagens.filter((x) => x.id !== p.id), p] }));
  return true;
}

/** Pesagem recusada: se for de um animal ainda esperando, o cadastro cuida dela. */
export function aoRecusarPesagem(p: PesagemRecusada) {
  if (!anexarPesagem(p)) recusadas.adicionar(p);
}

function mensagem(e: unknown): string {
  if (e instanceof ErroOperacao) return e.message;
  return "O servidor não aceitou o cadastro.";
}

/** Reenvia as pesagens guardadas, com o mesmo ID, depois que o animal chegou. */
function reenviarPesagens(db: Firestore, uid: string, c: CadastroOffline, brinco: string, fuso: string) {
  const daqui = recusadas.listar().filter((r) => r.animalId === c.id);
  const todas = new Map([...c.pesagens, ...daqui].map((p) => [p.id, { ...p, brinco }]));
  for (const p of todas.values()) {
    recusadas.remover(p.id);
    registrarPesagem(
      db,
      { id: p.id, pid: c.pid, uid, animalId: c.id, pesoG: p.pesoG, dataHora: new Date(p.dataHora), fuso, observacao: p.observacao, vacinas: p.vacinas },
      () => recusadas.adicionar({ ...p, recusadaEm: new Date().toISOString() }),
    );
  }
}

/**
 * Confere com o servidor um cadastro que não foi confirmado: se o animal já
 * está lá, encerra; senão, tenta de novo pela transação (código interno atual,
 * mesmo ID). Se nem assim passar, marca como recusado para o usuário decidir.
 * Sem internet, não faz nada (tenta de novo na próxima vez).
 */
async function conferir(db: Firestore, uid: string, id: string, fuso: string, novoBrinco?: string) {
  const c = buscar(id);
  if (!c || emConferencia.has(id)) return;
  emConferencia.add(id);
  try {
    const dados = novoBrinco ? { ...c.dados, brinco: novoBrinco } : c.dados;
    try {
      await criarAnimal(db, c.pid, uid, { ...dados, id });
    } catch (e) {
      if (!(e instanceof ErroOperacao)) {
        // Sem internet ou servidor fora: fica aguardando. Recusa das regras vira RECUSADO.
        const codigo = (e as { code?: string }).code;
        if (codigo === "unavailable" || codigo === "failed-precondition" || !navigator.onLine) return;
      }
      trocar(id, (x) => ({ ...x, estado: "RECUSADO", motivo: mensagem(e) }));
      return;
    }
    remover(id);
    reenviarPesagens(db, uid, c, dados.brinco, fuso);
  } finally {
    emConferencia.delete(id);
  }
}

/**
 * Cadastra sem esperar o servidor. Devolve na hora, com o código interno que o
 * animal deve receber; a confirmação (ou a nova tentativa) acontece sozinha.
 */
export function cadastrarSemInternet(
  db: Firestore,
  pid: string,
  uid: string,
  fuso: string,
  dados: Omit<DadosAnimal, "id" | "maeId">,
  ctx: ContextoSemInternet,
): { id: string; codigoNumero: number } {
  const id = crypto.randomUUID();
  // Guarda antes de gravar: se o app fechar no meio, o cadastro não se perde.
  const r = criarAnimalSemInternet(db, pid, uid, { ...dados, id }, ctx);
  gravar([
    ...cache,
    { id, pid, dados, codigoNumero: r.codigoNumero, feitoEm: new Date().toISOString(), estado: "AGUARDANDO", pesagens: [] },
  ]);
  emConferencia.add(id);
  r.enviado.then(
    () => {
      emConferencia.delete(id);
      remover(id);
    },
    () => {
      emConferencia.delete(id);
      void conferir(db, uid, id, fuso);
    },
  );
  return { id, codigoNumero: r.codigoNumero };
}

/**
 * Ao abrir o app com internet: espera a fila do Firestore esvaziar e confere
 * os cadastros de sessões anteriores, cuja resposta do servidor se perdeu
 * quando o app foi fechado.
 */
export async function conferirPendentes(db: Firestore, pid: string, uid: string, fuso: string) {
  if (!cache.some((c) => c.pid === pid && c.estado === "AGUARDANDO")) return;
  await waitForPendingWrites(db);
  for (const c of cache.filter((x) => x.pid === pid && x.estado === "AGUARDANDO")) {
    if (emConferencia.has(c.id)) continue;
    try {
      const snap = await getDocFromServer(doc(db, caminhos.animal(pid, c.id)));
      if (snap.exists()) {
        remover(c.id);
        continue;
      }
    } catch {
      return; // sem internet: confere da próxima vez
    }
    await conferir(db, uid, c.id, fuso);
  }
}

/** Recusado por brinco repetido: o usuário escolhe outro e o app reenvia (precisa de internet). */
export async function reenviarComBrinco(db: Firestore, uid: string, id: string, brinco: string, fuso: string) {
  const c = buscar(id);
  if (!c) return;
  trocar(id, (x) => ({ ...x, estado: "AGUARDANDO", motivo: undefined }));
  await conferir(db, uid, id, fuso, brinco);
  const depois = buscar(id);
  if (depois?.estado === "RECUSADO") throw new ErroOperacao("BRINCO_DUPLICADO", depois.motivo ?? "O servidor não aceitou o cadastro.");
  if (depois) throw new ErroOperacao("NAO_PERMITIDO", "Sem internet. Tente de novo quando a conexão voltar.");
}

/** Descarta o cadastro recusado e as pesagens que estavam esperando por ele. */
export function descartarCadastro(id: string) {
  remover(id);
}
