/**
 * Pesagens que o servidor recusou enquanto o app estava aberto (RF-16).
 * Ficam guardadas no aparelho até o usuário tentar de novo ou descartar,
 * para que uma falha nunca apague o registro sem aviso (RN-14).
 */
import { useSyncExternalStore } from "react";

export interface PesagemRecusada {
  id: string;
  animalId: string;
  brinco: string;
  pesoG: number;
  dataHora: string;
  observacao: string;
  vacinas?: string[];
  recusadaEm: string;
}

const CHAVE = "boicontrol:pesagensRecusadas";
const ouvintes = new Set<() => void>();
let cache: PesagemRecusada[] = ler();

function ler(): PesagemRecusada[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? "[]") as PesagemRecusada[];
  } catch {
    return [];
  }
}

function gravar(lista: PesagemRecusada[]) {
  cache = lista;
  try {
    localStorage.setItem(CHAVE, JSON.stringify(lista));
  } catch {
    /* sem armazenamento: a lista vale só enquanto o app estiver aberto */
  }
  ouvintes.forEach((o) => o());
}

export const recusadas = {
  adicionar: (r: PesagemRecusada) => gravar([...cache.filter((x) => x.id !== r.id), r]),
  remover: (id: string) => gravar(cache.filter((x) => x.id !== id)),
  listar: (): readonly PesagemRecusada[] => cache,
};

export function useRecusadas(): PesagemRecusada[] {
  return useSyncExternalStore(
    (o) => {
      ouvintes.add(o);
      return () => ouvintes.delete(o);
    },
    () => cache,
  );
}
