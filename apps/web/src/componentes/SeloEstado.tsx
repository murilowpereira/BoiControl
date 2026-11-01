import type { Animal, Pesagem } from "../dados";
import { alertasDaPesagem, estadoExibido, ROTULO_ALERTA, ROTULO_ESTADO } from "../estado";

export function SeloEstado({ pesagem, animal }: { pesagem: Pesagem; animal?: Animal }) {
  const e = estadoExibido(pesagem.estado, pesagem.pendente);
  const alertas = alertasDaPesagem(
    {
      estado: pesagem.estado,
      dataHoraPesagem: pesagem.dataHoraPesagem.toDate(),
      criadoEm: pesagem.criadoEm?.toDate() ?? null,
    },
    animal ? { situacao: animal.situacao, situacaoDesde: animal.situacaoDesde?.toDate() ?? null } : undefined,
  );
  return (
    <span className="selos">
      <span className={`selo selo-${e.toLowerCase()}`}>{ROTULO_ESTADO[e]}</span>
      {alertas.map((a) => (
        <span key={a} className="selo selo-alerta">
          {ROTULO_ALERTA[a]}
        </span>
      ))}
    </span>
  );
}
