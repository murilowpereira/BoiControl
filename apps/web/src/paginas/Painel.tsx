import { Link } from "react-router";
import { calcularIndicadores, formatarPesoKg } from "@boicontrol/core";
import { useDados } from "../dados";
import { SeloEstado } from "../componentes/SeloEstado";

/** RF-10: ativos, sem pesagem, peso médio conhecido, últimas pesagens e fila offline. */
export function Painel() {
  const { animais, pesagens } = useDados();
  const ind = calcularIndicadores(animais);
  const porId = new Map(animais.map((a) => [a.id, a]));
  const ultimas = [...pesagens]
    .sort((a, b) => b.dataHoraPesagem.toMillis() - a.dataHoraPesagem.toMillis())
    .slice(0, 8);
  const pendentes = pesagens.filter((p) => p.pendente).length;
  const comErro = pesagens.filter((p) => p.estado === "REJEITADA").length;

  return (
    <section>
      <div className="indicadores">
        <div className="indicador">
          <span>Animais ativos</span>
          <strong>{ind.ativos}</strong>
        </div>
        <div className="indicador">
          <span>Peso médio conhecido</span>
          <strong>{formatarPesoKg(ind.pesoMedioG)}</strong>
          <small>{ind.comPesagem} com pesagem</small>
        </div>
        <div className={`indicador ${ind.semPesagem ? "alerta" : ""}`}>
          <span>Sem pesagem</span>
          <strong>{ind.semPesagem}</strong>
        </div>
        <div className={`indicador ${pendentes ? "alerta" : ""}`}>
          <span>Não sincronizadas</span>
          <strong>{pendentes}</strong>
          {comErro > 0 && <small className="erro">{comErro} com erro</small>}
        </div>
      </div>

      <Link to="/pesar" className="botao primario grande">
        Registrar pesagem
      </Link>

      <h2>Últimas pesagens</h2>
      {ultimas.length === 0 ? (
        <p className="vazio">Nenhuma pesagem registrada ainda.</p>
      ) : (
        <ul className="lista">
          {ultimas.map((p) => {
            const a = porId.get(p.animalId);
            return (
              <li key={p.id}>
                <Link to={`/animais/${p.animalId}`}>
                  <div>
                    <strong>{a ? a.brinco : "Animal removido"}</strong>
                    <small>{p.dataHoraPesagem.toDate().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</small>
                  </div>
                  <div className="direita">
                    <span>{formatarPesoKg(p.pesoG)}</span>
                    <SeloEstado pesagem={p} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
