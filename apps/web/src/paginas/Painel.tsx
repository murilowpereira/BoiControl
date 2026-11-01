import { Link } from "react-router";
import { calcularIndicadores, formatarPesoKg } from "@boicontrol/core";
import { useDados } from "../dados";
import { SeloEstado } from "../componentes/SeloEstado";
import { recusadas, useRecusadas } from "../recusadas";
import { registrarPesagem } from "../operacoes";
import { db } from "../firebase";

/** RF-10: ativos, sem pesagem, peso médio conhecido, últimas pesagens e fila offline. */
export function Painel() {
  const { animais, pesagens, vinculo, usuario, fuso } = useDados();
  const listaRecusadas = useRecusadas();
  const ind = calcularIndicadores(animais);
  const porId = new Map(animais.map((a) => [a.id, a]));
  const ultimas = [...pesagens]
    .sort((a, b) => b.dataHoraPesagem.toMillis() - a.dataHoraPesagem.toMillis())
    .slice(0, 8);
  const pendentes = pesagens.filter((p) => p.pendente).length;

  function tentarDeNovo(id: string) {
    const r = listaRecusadas.find((x) => x.id === id);
    if (!r || !vinculo || !usuario) return;
    recusadas.remover(id);
    registrarPesagem(
      db,
      { pid: vinculo.propriedadeId, uid: usuario.uid, animalId: r.animalId, pesoG: r.pesoG, dataHora: new Date(r.dataHora), fuso, observacao: r.observacao },
      () => recusadas.adicionar({ ...r, recusadaEm: new Date().toISOString() }),
    );
  }

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
          {listaRecusadas.length > 0 && <small className="erro">{listaRecusadas.length} recusada(s)</small>}
        </div>
      </div>

      {listaRecusadas.length > 0 && (
        <div className="cartao recusadas" role="alert">
          <strong>Pesagens recusadas pelo servidor</strong>
          <p>Elas continuam guardadas neste aparelho. Tente de novo ou descarte depois de conferir.</p>
          <ul className="lista">
            {listaRecusadas.map((r) => (
              <li key={r.id} className="linha-recusada">
                <span>
                  {r.brinco}: {formatarPesoKg(r.pesoG)} em {new Date(r.dataHora).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </span>
                <span className="acoes">
                  <button onClick={() => tentarDeNovo(r.id)}>Tentar de novo</button>
                  <button
                    className="link"
                    onClick={() => window.confirm("Descartar esta pesagem? Ela não poderá ser recuperada.") && recusadas.remover(r.id)}
                  >
                    Descartar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
                    <SeloEstado pesagem={p} animal={a} />
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
