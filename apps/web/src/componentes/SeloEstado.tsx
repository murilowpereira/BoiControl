import type { Pesagem } from "../dados";
import { estadoExibido, ROTULO_ESTADO, ROTULO_MOTIVO } from "../estado";

export function SeloEstado({ pesagem }: { pesagem: Pesagem }) {
  const e = estadoExibido(pesagem.estado, pesagem.pendente);
  return (
    <span className={`selo selo-${e.toLowerCase()}`} title={pesagem.motivo ? ROTULO_MOTIVO[pesagem.motivo] : undefined}>
      {ROTULO_ESTADO[e]}
      {e === "ERRO" && pesagem.motivo ? `: ${ROTULO_MOTIVO[pesagem.motivo]}` : ""}
    </span>
  );
}
