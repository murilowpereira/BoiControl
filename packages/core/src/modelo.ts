import type { SituacaoAnimal } from "./indicadores.js";

/** Tipos dos documentos do Firestore, compartilhados entre app e Functions. */
export type Perfil = "ADMIN" | "OPERADOR" | "CONSULTA";
export type EstadoPesagem = "VALIDA" | "ANULADA";

export const SITUACOES: readonly SituacaoAnimal[] = ["ATIVO", "VENDIDO", "MORTO", "TRANSFERIDO"];
export const PERFIS: readonly Perfil[] = ["ADMIN", "OPERADOR", "CONSULTA"];

/** Código interno exibido (RN-01): BC-0001. */
export function formatarCodigo(codigoNumero: number): string {
  return `BC-${String(codigoNumero).padStart(4, "0")}`;
}

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
