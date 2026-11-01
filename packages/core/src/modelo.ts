import type { SituacaoAnimal } from "./indicadores.js";

/** Tipos dos documentos do Firestore, compartilhados entre app e Functions. */
export type Perfil = "ADMIN" | "OPERADOR" | "CONSULTA";
export type EstadoPesagem = "RECEBIDA" | "VALIDA" | "REJEITADA" | "ANULADA";
export type MotivoRejeicao =
  | "ANIMAL_INEXISTENTE"
  | "ANIMAL_INATIVO"
  | "PESO_INVALIDO"
  | "DATA_INVALIDA"
  | "DATA_NO_FUTURO";

export const SITUACOES: readonly SituacaoAnimal[] = ["ATIVO", "VENDIDO", "MORTO", "TRANSFERIDO"];
export const PERFIS: readonly Perfil[] = ["ADMIN", "OPERADOR", "CONSULTA"];

/** Tolerância para relógio do celular adiantado. */
export const TOLERANCIA_FUTURO_MS = 10 * 60 * 1000;

export const caminhos = {
  propriedade: (pid: string) => `propriedades/${pid}`,
  membro: (pid: string, uid: string) => `propriedades/${pid}/membros/${uid}`,
  animais: (pid: string) => `propriedades/${pid}/animais`,
  animal: (pid: string, id: string) => `propriedades/${pid}/animais/${id}`,
  brinco: (pid: string, brinco: string) => `propriedades/${pid}/brincos/${brinco}`,
  pesagens: (pid: string) => `propriedades/${pid}/pesagens`,
  pesagem: (pid: string, id: string) => `propriedades/${pid}/pesagens/${id}`,
  categorias: (pid: string) => `propriedades/${pid}/categorias`,
  auditoria: (pid: string) => `propriedades/${pid}/auditoria`,
  contadorAnimais: (pid: string) => `propriedades/${pid}/contadores/animais`,
};
